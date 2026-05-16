#!/usr/bin/env node
/**
 * Compute lexical diversity + intra-dataset similarity for all 5 datasets.
 *
 * Metrics (each computed identically across all 5 datasets):
 *   - distinct-1 / distinct-2 / distinct-3   = unique n-grams / total n-grams (Li et al. 2016)
 *   - type-token ratio (TTR)                 = unique tokens / total tokens
 *   - opener bucket distribution + entropy   = first 3 tokens, bucketed
 *   - length quantiles                       = p10 / p50 / p90 / max
 *   - trigram Jaccard similarity             = pairwise within dataset; per-query max-peer + mean-peer
 *
 * Output: data/output/quality_report/lexical.json
 *
 * No external deps.
 */

const fs = require('fs');
const path = require('path');

const N = 100;
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'output', 'quality_report');
const OUT_PATH = path.join(OUT_DIR, 'lexical.json');

const DATASETS = [
  { slug: 'ui-queryMaker', label: 'ui-queryMaker (ours)',
    // v9 = latest pipeline (Stage 4 positive-framing + Layer-A state).
    path: 'data/output/corpus_run_v9_mobile_300/queries.jsonl', textKey: 'query_text' },
  { slug: 'websight',         label: 'WebSight v0.2',
    path: 'data/external/websight/samples.jsonl', textKey: 'text' },
  { slug: 'web2code',         label: 'Web2Code',
    path: 'data/external/web2code/samples.jsonl', textKey: 'text' },
  { slug: 'webgen-bench',     label: 'WebGen-Bench',
    path: 'data/external/webgen-bench/samples.jsonl', textKey: 'text' },
  { slug: 'mm-webgen-bench',  label: 'MM-WebGen-Bench',
    path: 'data/external/mm-webgen-bench/samples.jsonl', textKey: 'text' },
];

// ── helpers ────────────────────────────────────────────────────────────────
function stripFraming(text) { return text.replace(/^<image>\s*/i, '').trim(); }
function tokenize(text) { return text.toLowerCase().match(/[a-z0-9']+/g) || []; }

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

function distinctN(allTexts, n) {
  // Distinct-n across the whole dataset (Li et al. 2016 — sequence-level)
  const allN = [];
  for (const t of allTexts) allN.push(...ngrams(tokenize(t), n));
  if (allN.length === 0) return { distinct: 0, total: 0, ratio: 0 };
  const uniq = new Set(allN).size;
  return { distinct: uniq, total: allN.length, ratio: uniq / allN.length };
}

function ttr(allTexts) {
  const allTokens = [];
  for (const t of allTexts) allTokens.push(...tokenize(t));
  if (allTokens.length === 0) return 0;
  return new Set(allTokens).size / allTokens.length;
}

function openerBucket(text) {
  const t = stripFraming(text).trim();
  // First 1-3 leading words, normalized
  const m = t.match(/^([\W_]*)(\S+\s+\S+\s+\S+|\S+\s+\S+|\S+)/);
  if (!m) return '∅';
  const first3 = m[2].toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 3).join(' ');
  return first3 || '∅';
}

function openerDistribution(allTexts) {
  // Top-K openers + Shannon entropy on the top-K-bucketed distribution
  const counts = new Map();
  for (const t of allTexts) {
    const b = openerBucket(t);
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 10).map(([k, v]) => ({ opener: k, count: v, share: v / allTexts.length }));
  // Entropy (bits) over the full opener distribution
  const total = allTexts.length;
  let H = 0;
  for (const [, v] of counts) {
    const p = v / total;
    if (p > 0) H -= p * Math.log2(p);
  }
  return { top10: top, unique_openers: counts.size, entropy_bits: H };
}

function lengthStats(allTexts) {
  const lens = allTexts.map(t => tokenize(t).length).sort((a, b) => a - b);
  if (lens.length === 0) return { p10: 0, p50: 0, p90: 0, max: 0, mean: 0 };
  const q = p => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
  return {
    p10: q(0.10), p50: q(0.50), p90: q(0.90),
    max: lens[lens.length - 1],
    mean: lens.reduce((s, x) => s + x, 0) / lens.length,
  };
}

function trigramSet(text) {
  const toks = tokenize(text);
  return new Set(ngrams(toks, 3));
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function pairwiseSimilarityStats(allTexts) {
  const sets = allTexts.map(trigramSet);
  const n = sets.length;
  const maxPeer = new Array(n).fill(0);
  const sumPeer = new Array(n).fill(0);
  // pairwise upper triangle
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = jaccard(sets[i], sets[j]);
      if (s > maxPeer[i]) maxPeer[i] = s;
      if (s > maxPeer[j]) maxPeer[j] = s;
      sumPeer[i] += s;
      sumPeer[j] += s;
    }
  }
  const meanPeer = sumPeer.map(s => (n > 1 ? s / (n - 1) : 0));
  const mean = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
  const sortAsc = arr => [...arr].sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const mp = sortAsc(maxPeer);
  const mn = sortAsc(meanPeer);
  return {
    n_pairs: (n * (n - 1)) / 2,
    max_peer_mean: mean(maxPeer),
    max_peer_p50: q(mp, 0.5),
    max_peer_p90: q(mp, 0.9),
    max_peer_max: mp[mp.length - 1],
    mean_peer_mean: mean(meanPeer),
    mean_peer_p50: q(mn, 0.5),
  };
}

// ── load + process ─────────────────────────────────────────────────────────
const repoRoot = path.join(__dirname, '..', '..');
fs.mkdirSync(OUT_DIR, { recursive: true });

function loadJsonl(filePath, textKey, limit) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (out.length >= limit) break;
    try {
      const o = JSON.parse(line);
      const t = o[textKey];
      if (typeof t === 'string' && t.trim()) out.push(stripFraming(t));
    } catch (e) {}
  }
  return out;
}

const results = DATASETS.map(ds => {
  const full = path.join(repoRoot, ds.path);
  const texts = loadJsonl(full, ds.textKey, N);
  console.log(`[${ds.slug}] loaded ${texts.length}`);
  return {
    slug: ds.slug,
    label: ds.label,
    source_path: ds.path,
    n_samples: texts.length,
    distinct_1: distinctN(texts, 1),
    distinct_2: distinctN(texts, 2),
    distinct_3: distinctN(texts, 3),
    ttr: ttr(texts),
    opener: openerDistribution(texts),
    length: lengthStats(texts),
    similarity: pairwiseSimilarityStats(texts),
  };
});

const out = {
  computed_at: new Date().toISOString(),
  n_per_dataset: N,
  metric_definitions: {
    'distinct-N': 'unique n-grams across the dataset / total n-grams · higher = more lexically diverse · Li et al. 2016',
    ttr: 'type-token ratio · unique tokens / total tokens',
    opener: 'first 3 tokens (lowercased, stripped) bucketed · entropy in bits over the full distribution',
    length: 'word count per query · p10/p50/p90/max/mean',
    similarity: 'pairwise trigram Jaccard within the dataset · per-query max-peer + mean-peer aggregated',
  },
  datasets: Object.fromEntries(results.map(r => [r.slug, r])),
};
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
console.log(`\n→ ${OUT_PATH}`);

console.log('\n=== lexical summary ===');
console.table(results.map(r => ({
  dataset: r.label,
  'distinct-1': r.distinct_1.ratio.toFixed(3),
  'distinct-2': r.distinct_2.ratio.toFixed(3),
  'distinct-3': r.distinct_3.ratio.toFixed(3),
  ttr: r.ttr.toFixed(3),
  'opener-H bits': r.opener.entropy_bits.toFixed(2),
  '#openers': r.opener.unique_openers,
  'len p50': r.length.p50,
  'sim max-peer ̄': r.similarity.max_peer_mean.toFixed(3),
  'sim mean-peer ̄': r.similarity.mean_peer_mean.toFixed(3),
})));
console.log('\nTop-3 openers per dataset:');
results.forEach(r => {
  const top3 = r.opener.top10.slice(0, 3).map(o => `"${o.opener}" ${(o.share * 100).toFixed(0)}%`).join(' · ');
  console.log(`  [${r.slug}] ${top3}`);
});
