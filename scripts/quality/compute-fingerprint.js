#!/usr/bin/env node
/**
 * Compute 3-axis "voice probes" for each of 5 datasets:
 *   - ui-queryMaker (this repo, first N=100 from v9 mobile)
 *   - websight, web2code, webgen-bench, mm-webgen-bench (from data/external/*)
 *
 * Three axes, each independently interpretable:
 *   - jargon_per_query        (vocab signal)     · lower = ordinary-user voice
 *   - median_words_per_query  (length signal)    · context-only
 *   - mean_sentence_words     (structure signal) · context-only
 *
 * The 4 earlier axes (first-person %, user-should/q, NEG/100, aesth/100) were
 * dropped — they were either easily faked, too specific to one template,
 * too crude to be defensible, or had no clean direction.
 *
 * Output: data/output/quality_report/fingerprint.json
 */

const fs = require('fs');
const path = require('path');

const N = 100;
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'output', 'quality_report');
const OUT_PATH = path.join(OUT_DIR, 'fingerprint.json');

// ─── Axes ─────────────────────────────────────────────────────────────────
// Mirror of the prompt-level jargon blacklist used in mvp/query_factory_v2.js
const JARGON_TERMS = [
  'dashboard', 'modal', 'swipeable', 'bottom sheet', 'scrollable card',
  'tag chip', 'GTD', 'CTA', 'dropdown', 'accordion', 'hamburger menu',
  'sidebar', 'navbar', 'tooltip', 'breadcrumb', 'placeholder',
  'auto-generate', 'auto-populate', 'wireframe',
];
const JARGON_RE = new RegExp('\\b(' + JARGON_TERMS.map(t => t.replace(/[-/]/g, '[\\-/]')).join('|') + ')\\b', 'gi');
function devJargonPerQ(text) {
  return (text.match(JARGON_RE) || []).length;
}

function meanSentenceWords(tokens, sentenceCount) {
  if (sentenceCount === 0) return tokens.length;
  return tokens.length / sentenceCount;
}

// ─── Text → tokens / sentences ────────────────────────────────────────────
function stripFraming(text) {
  return text.replace(/^<image>\s*/i, '').trim();
}
function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []);
}
function countSentences(text) {
  const m = text.match(/[.!?]+(?=\s|$)/g);
  return Math.max(1, (m ? m.length : 1));
}

// ─── Dataset loading ──────────────────────────────────────────────────────
function loadJsonl(filePath, textKey, limit) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (out.length >= limit) break;
    try {
      const o = JSON.parse(line);
      const t = typeof textKey === 'function' ? textKey(o) : o[textKey];
      if (typeof t === 'string' && t.trim()) out.push(stripFraming(t));
    } catch (e) { /* skip */ }
  }
  return out;
}

const DATASETS = [
  {
    slug: 'ui-queryMaker',
    label: 'ui-queryMaker (ours)',
    // v9 = latest pipeline (Stage 4 positive-framing + Layer-A state).
    path: 'data/output/corpus_run_v9_mobile_300/queries.jsonl',
    textKey: 'query_text',
  },
  { slug: 'websight',         label: 'WebSight v0.2',
    path: 'data/external/websight/samples.jsonl', textKey: 'text' },
  { slug: 'web2code',         label: 'Web2Code',
    path: 'data/external/web2code/samples.jsonl', textKey: 'text' },
  { slug: 'webgen-bench',     label: 'WebGen-Bench',
    path: 'data/external/webgen-bench/samples.jsonl', textKey: 'text' },
  { slug: 'mm-webgen-bench',  label: 'MM-WebGen-Bench',
    path: 'data/external/mm-webgen-bench/samples.jsonl', textKey: 'text' },
];

// ─── Aggregate ────────────────────────────────────────────────────────────
function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function compute(slug, label, sourcePath, texts) {
  const perQuery = texts.map(t => {
    const tokens = tokenize(t);
    const sentences = countSentences(t);
    return {
      jargon_per_q: devJargonPerQ(t),
      words: tokens.length,
      mean_sentence_words: meanSentenceWords(tokens, sentences),
    };
  });
  return {
    slug,
    label,
    source_path: sourcePath,
    n_samples: texts.length,
    axes: {
      jargon_per_q:        mean(perQuery.map(p => p.jargon_per_q)),
      median_words_per_q:  median(perQuery.map(p => p.words)),
      mean_words_per_q:    mean(perQuery.map(p => p.words)),
      mean_sentence_words: mean(perQuery.map(p => p.mean_sentence_words)),
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────
const repoRoot = path.join(__dirname, '..', '..');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = DATASETS.map(ds => {
  const full = path.join(repoRoot, ds.path);
  const texts = loadJsonl(full, ds.textKey, N);
  console.log(`[${ds.slug}] loaded ${texts.length} texts from ${ds.path}`);
  return compute(ds.slug, ds.label, ds.path, texts);
});

const out = {
  computed_at: new Date().toISOString(),
  n_per_dataset: N,
  axis_definitions: {
    jargon_per_q:        'mean occurrences per query of dev jargon (dashboard/modal/swipeable/CTA/...) — same blacklist as the prompt · lower = ordinary-user voice',
    median_words_per_q:  'median word count per query · context-only · too short = info-thin, too long = spec',
    mean_sentence_words: 'mean words per sentence · context-only · longer = run-on natural speech, shorter = staccato spec',
  },
  datasets: Object.fromEntries(results.map(r => [r.slug, r])),
};

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
console.log(`\n→ ${OUT_PATH}`);

console.log('\n=== voice probes summary ===');
console.table(results.map(r => ({
  dataset: r.label,
  'jargon/q': r.axes.jargon_per_q.toFixed(2),
  'words p50': r.axes.median_words_per_q,
  'words ̄': r.axes.mean_words_per_q.toFixed(0),
  'sent_len ̄': r.axes.mean_sentence_words.toFixed(1),
})));
