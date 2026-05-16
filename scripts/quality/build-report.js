#!/usr/bin/env node
/**
 * Build the rendered HTML section for the quality report by inlining the 3
 * JSON files into docs/index.html's #quality-report section.
 *
 * Reads:
 *   data/output/quality_report/fingerprint.json
 *   data/output/quality_report/lexical.json
 *   data/output/quality_report/projection_2d.json
 *
 * Writes:
 *   data/output/quality_report/report-fragment.html  (the full <section>...</section>)
 *   data/output/quality_report/scatter-styles.css    (the styles, separate so they go in <head>)
 *   data/output/quality_report/render.js             (the inline render script)
 *
 * docs/index.html injection is done in a follow-up step by the assistant.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const QR = path.join(ROOT, 'data', 'output', 'quality_report');

const fingerprint = JSON.parse(fs.readFileSync(path.join(QR, 'fingerprint.json'), 'utf8'));
const lexical     = JSON.parse(fs.readFileSync(path.join(QR, 'lexical.json'), 'utf8'));
// Chart C is now an intra-dataset spread test on ui-queryMaker only.
// Cross-dataset projection was removed — different datasets target different
// scenarios; clustering apart proved nothing about quality.
const ours = JSON.parse(fs.readFileSync(path.join(QR, 'tsne_ours.json'), 'utf8'));
console.log('Chart C source: tsne_ours.json · n =', ours.n_total);

const DATASET_COLORS = {
  'ui-queryMaker':    '#3fb950',
  'websight':         '#58a6ff',
  'web2code':         '#a371f7',
  'webgen-bench':     '#f59e0b',
  'mm-webgen-bench':  '#22d3ee',
};

// Color palettes for the 4 color modes on the intra-dataset scatter.
// L1: 22 distinct colors on dark background (#0d1117) — 12 mobile topic L1s
// + 10 web business-segment L1s. v9 mobile + web combined produces both
// taxonomies; missing entries used to fall through to gray.
const L1_COLORS = {
  // — mobile topic L1s (12) —
  '深度研究展示': '#3fb950', '交互方式': '#58a6ff', '实用工具': '#f59e0b',
  '教育学习':   '#a371f7', '办公效率': '#22d3ee', '健康管理': '#f97583',
  '出行助手':   '#fb923c', '美食探店': '#e879f9', '休闲游戏': '#84cc16',
  '多媒体处理': '#06b6d4', '新闻资讯': '#facc15', '购物消费': '#ec4899',
  // — web business-segment L1s (10), distinguishable from the mobile palette —
  '创作者':     '#ef4444',  // red
  '小微商户':   '#a3a324',  // olive
  '中大型企业': '#14b8a6',  // teal-dark
  '初创公司':   '#fb7185',  // coral
  '教育':       '#6366f1',  // indigo (vs mobile 教育学习 purple)
  '媒体':       '#34d399',  // mint (vs mobile 深度研究展示 deeper green)
  '文化':       '#d97706',  // dark amber (vs mobile 实用工具 brighter amber)
  '自由职业':   '#c084fc',  // light purple
  '开发者':     '#94a3b8',  // slate
  '个人用户':   '#be185d',  // deep rose
  '—': '#6e7681',
};
const PERSONA_COLORS = {
  maker:        '#f59e0b',
  planner:      '#22d3ee',
  curator:      '#a371f7',
  operator:     '#58a6ff',
  founder_like: '#f97583',
  '—':          '#6e7681',
};
const COMPLEXITY_COLORS = {
  vague:   '#6e7681',
  medium:  '#58a6ff',
  complex: '#f97583',
  '—':     '#444c56',
};
// Style: 12 styles + null. Use the same L1 palette for visual reuse.
const STYLE_COLORS = {
  Dark:          '#6e7681', Glassmorphism: '#58a6ff', Neumorphism: '#a371f7',
  Neubrutalism:  '#f97583', Minimalism:    '#e6edf3', Material:    '#3fb950',
  'Data-Dense':  '#facc15', Cyberpunk:     '#e879f9', Luxury:      '#fb923c',
  Vibrant:       '#22d3ee',
  '—': '#444c56',
};

const fragment = `
<!-- ── Quality Report (quantitative) ── -->
<section class="block" id="quality-report">
  <div class="section-eyebrow" data-i18n="qr.eyebrow">// QUALITY REPORT  ·  QUANTITATIVE  ·  vs 4 PUBLIC WEB-CODEGEN DATASETS</div>
  <h2 class="section-title" data-i18n="qr.title">Quantitative quality report — real numbers, identical metrics on all 5 datasets</h2>
  <p class="section-sub" data-i18n="qr.sub">
    Every number below is computed from <strong>real verbatim data</strong> — 100 samples per dataset, identical algorithm applied to all five. Code: <code>scripts/quality/*</code>. Raw output: <code>data/output/quality_report/*.json</code>. Charts A+B run as pure-regex / pure-counting Node scripts; chart C runs locally on <code>sentence-transformers/all-MiniLM-L6-v2</code> ONNX (90 MB, in <code>models/</code>) + van der Maaten's reference numpy t-SNE. <strong>Reproducible single-command pipeline</strong>; no LLM-as-judge, no API, no downstream training in scope.
  </p>

  <!-- ─── A · Surface signals (merged voice + lexical, 7 metrics) ─── -->
  <h3 style="font-size:18px;font-weight:600;margin:24px 0 12px;" data-i18n="qr.a.title">A · Surface signals <span style="font-weight:400;color:var(--muted);font-size:14px;">— voice + lexical · 7 metrics × 5 datasets</span></h3>

  <div class="qr-surface-wrap">
    <table class="cmp qr-surface-table">
      <thead><tr>
        <th>dataset</th>
        <th><code>jargon/q</code><br><span class="qr-dir-h">↓ user voice</span></th>
        <th><code>words p50</code><br><span class="qr-dir-h">context</span></th>
        <th><code>distinct-3</code><br><span class="qr-dir-h">↑ less template</span></th>
        <th><code>TTR</code><br><span class="qr-dir-h">↑ richer vocab</span></th>
        <th><code>#openers</code><br><span class="qr-dir-h">↑ variety /100</span></th>
        <th><code>top opener · share</code><br><span class="qr-dir-h">↓ less template</span></th>
        <th><code>max-peer sim</code><br><span class="qr-dir-h">↓ fewer dupes</span></th>
      </tr></thead>
      <tbody id="qr-surface-tbody"></tbody>
    </table>
  </div>

  <details class="qr-howto-details" open>
    <summary data-i18n="qr.a.howto.summary">📖 metric reference · what each column means</summary>
    <div class="qr-howto" data-i18n="qr.a.howto" style="margin:10px 0 0;">
      <dl class="qr-defs">
        <dt><code>jargon/q</code><span class="qr-dir">lower = ordinary-user voice</span></dt>
        <dd><strong>Voice (vocab).</strong> Mean dev-jargon hits per query (dashboard, modal, swipeable, CTA…). Real end users don't know these terms. <span class="qr-target">Our target: ~0.</span></dd>
        <dt><code>words p50</code><span class="qr-dir">context-only · ~80-150 ideal</span></dt>
        <dd><strong>Length.</strong> Median word count per query. Too short = info-thin / one-line command; too long = spec or design brief, not a user's natural ask.</dd>
        <dt><code>distinct-3</code><span class="qr-dir">higher = less templating</span></dt>
        <dd><strong>Lexical diversity.</strong> Unique trigrams ÷ total trigrams across the dataset (Li et al. 2016). 1.0 = every 3-word sequence is unique; lower = lots of repeated phrases.</dd>
        <dt><code>TTR</code><span class="qr-dir">higher = richer vocab</span></dt>
        <dd><strong>Vocab richness.</strong> Type-token ratio = unique words ÷ total words. Long texts naturally have lower TTR (words repeat).</dd>
        <dt><code>#openers</code><span class="qr-dir">higher = more variety · /100</span></dt>
        <dd><strong>Opener variety.</strong> Count of unique 3-word openers across 100 queries. Ceiling 100 (every query unique); WebGen-Bench at 4 = 100 queries use only 4 opening templates.</dd>
        <dt><code>top opener · share</code><span class="qr-dir">lower share = less template</span></dt>
        <dd><strong>Opener templating.</strong> The most common 3-word opener and its share. 76% = three out of four queries start with the same 3 words.</dd>
        <dt><code>max-peer sim</code><span class="qr-dir">lower = fewer near-dupes</span></dt>
        <dd><strong>Near-duplicate rate.</strong> For each query, its highest trigram-Jaccard similarity to any other peer; averaged across 100 queries.</dd>
      </dl>
    </div>
  </details>

  <!-- ─── B · Intra-dataset spread (ours only) ─── -->
  <h3 style="font-size:18px;font-weight:600;margin:32px 0 12px;" data-i18n="qr.b.title">B · Intra-dataset spread — <span style="font-weight:400;color:var(--muted);font-size:14px;">does our pre-defined requirements distribution actually surface in the queries?</span></h3>
  <p style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:14px;" data-i18n="qr.b.note">
    <strong>500 ui-queryMaker queries</strong> from <code>corpus_run_v7_mobile_500</code>, embedded with <code>sentence-transformers/all-MiniLM-L6-v2</code> (ONNX, local, 384-dim, mean-pool + L2-norm) → t-SNE 2D (perplexity 30, 1000 iter, van der Maaten's <a href="https://lvdmaaten.github.io/tsne/" target="_blank" rel="noopener">reference numpy implementation</a>). Click a color-mode button to recolor: <strong>L1</strong> (12 categories, Excel-defined topic structure) · <strong>persona</strong> (5 archetypes, who/how channel) · <strong>style</strong> · <strong>complexity</strong>. The proper test isn't "are we visually different from other datasets" — different datasets target different scenarios. The test is: <strong>do queries cluster meaningfully along the structural fields we set out to spread across?</strong> If yes → the prompt didn't collapse. Same intra-dataset shape inspection as Code Aesthetics (<a href="https://arxiv.org/html/2510.23272v1" target="_blank" rel="noopener">arXiv 2510.23272</a>).
  </p>

  <div class="qr-mode-toggle" id="qr-mode-toggle">
    <button data-mode="l1" class="qr-mode-btn qr-mode-active">L1 · 12 categories</button>
    <button data-mode="persona" class="qr-mode-btn">persona · 5</button>
    <button data-mode="style" class="qr-mode-btn">design_style</button>
    <button data-mode="complexity" class="qr-mode-btn">complexity · 3</button>
  </div>

  <div class="qr-scatter-wrap">
    <svg id="qr-scatter" viewBox="0 0 720 560" width="100%"></svg>
    <div class="qr-scatter-legend" id="qr-scatter-legend"></div>
  </div>
  <div id="qr-scatter-tooltip" class="qr-scatter-tooltip" hidden></div>

  <!-- ─── Honest summary ─── -->
  <div style="margin-top:24px;padding:16px 20px;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--green);border-radius:6px;font-size:13px;color:var(--muted);line-height:1.65;">
    <strong style="color:var(--text);" data-i18n="qr.summary.t">What the numbers actually show:</strong>
    <span data-i18n="qr.summary.b">
      <strong>Charts A + B (cross-dataset, lexical):</strong> ours leads on <strong>distinct-3 trigram diversity (0.76)</strong> and is the only dataset with non-trivial first-person voice <strong>(0.81%, ~4–5× the others)</strong>. WebGen-Bench has <strong>76% of openers starting with "please implement a"</strong> (opener entropy 1.11 bits, only 4 unique openers) — clear templating. Web2Code has the highest intra-dataset max-peer similarity <strong>(0.33)</strong> from the "Generate HTML…" template. MM-WebGen-Bench briefs average <strong>2,600 words</strong> (25× ours).
      <br><br>
      <strong>Chart C (intra-ours, semantic):</strong> our 500 queries spread across all <strong>12 L1 categories</strong> with each L1 forming a coherent cluster in MiniLM embedding space — the corpus channel's topic anchoring carries through to the semantic layer, not just the lexical layer. Switch the color mode to <em>persona</em> to see persona archetype distribution within each L1; switch to <em>complexity</em> to see complexity tiers.
      <br><br>
      <strong>What this proves and doesn't:</strong> measurable shape differences vs other web-codegen datasets <em>and</em> intra-dataset spread along our pre-defined requirements distribution. Cross-dataset 2D projection was intentionally removed — different datasets target different scenarios, so clustering apart proves nothing about quality. The "is ours better" question still needs downstream validation, honestly listed in §Limitations.
    </span>
  </div>
</section>

<style id="qr-styles">
/* Merged surface-signals table with inline mini-bars per cell */
.qr-surface-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.qr-surface-table { font-size: 11px; min-width: 720px; }
.qr-surface-table th { vertical-align: top; padding: 10px 8px !important; }
.qr-surface-table th code {
  color: var(--accent); background: var(--bg); padding: 1px 6px; border-radius: 3px;
  font-size: 10.5px; font-family: 'SFMono-Regular', monospace; text-transform: none;
  letter-spacing: 0; font-weight: 400;
}
.qr-surface-table .qr-dir-h {
  display: block; margin-top: 4px;
  font-size: 9.5px; color: var(--muted2); font-family: 'SFMono-Regular', monospace;
  letter-spacing: 0; text-transform: none; font-weight: 400;
}
.qr-mb-name { white-space: nowrap; padding: 8px 10px !important; }
.qr-mb-cell { padding: 6px 8px !important; vertical-align: middle; }
.qr-mb-bar  { height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
.qr-mb-fill { height: 100%; border-radius: 3px; opacity: 0.85; transition: width 0.2s ease; }
.qr-mb-val  { font-family: 'SFMono-Regular', monospace; font-size: 11px; color: var(--text); line-height: 1.3; }
.qr-mb-val code { background: transparent !important; padding: 0 !important; color: var(--muted); }
.qr-mb-val strong { color: var(--text); font-weight: 600; }
.qr-mode-toggle { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.qr-mode-toggle .qr-mode-btn {
  background: var(--surface); color: var(--muted); border: 1px solid var(--border);
  padding: 6px 14px; border-radius: 6px; font-size: 12px; font-family: 'SFMono-Regular',monospace;
  cursor: pointer; transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.qr-mode-toggle .qr-mode-btn:hover { color: var(--text); border-color: var(--border2); }
.qr-mode-toggle .qr-mode-btn.qr-mode-active { background: var(--accent-bg); color: var(--accent); border-color: var(--accent-bd); }
.qr-scatter-wrap { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.qr-scatter-legend { display: flex; flex-wrap: wrap; gap: 16px; padding-top: 12px; border-top: 1px dashed var(--border); margin-top: 8px; font-size: 12px; }
.qr-scatter-legend .qr-legend-item { display: flex; align-items: center; gap: 6px; }
.qr-scatter-legend .qr-legend-swatch { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.qr-scatter-tooltip {
  position: fixed; pointer-events: none; z-index: 1000;
  background: var(--bg); border: 1px solid var(--border2); border-radius: 6px;
  padding: 8px 10px; font-size: 11px; color: var(--text); max-width: 380px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  font-family: 'SFMono-Regular', monospace; line-height: 1.5;
}
details.qr-numbers > summary { cursor: pointer; color: var(--accent); font-size: 12px; padding: 4px 0; }
details.qr-numbers > summary:hover { text-decoration: underline; }
details.qr-howto-details { margin-top: 14px; }
details.qr-howto-details > summary {
  cursor: pointer; color: var(--accent); font-size: 12px;
  padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface);
  list-style: none; user-select: none;
}
details.qr-howto-details > summary::-webkit-details-marker { display: none; }
details.qr-howto-details > summary::before {
  content: '▶'; display: inline-block; margin-right: 8px; font-size: 10px;
  transition: transform 0.15s; color: var(--muted2);
}
details.qr-howto-details[open] > summary::before { transform: rotate(90deg); }
details.qr-howto-details > summary:hover { color: var(--accent); border-color: var(--accent-bd); }
.qr-howto {
  background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 14px 18px; margin: 0 0 16px 0; font-size: 12px;
}
.qr-howto-head {
  color: var(--text); margin-bottom: 12px; line-height: 1.5;
  border-bottom: 1px dashed var(--border); padding-bottom: 10px;
}
.qr-howto-head em { color: var(--accent); font-style: normal; }
.qr-defs { display: grid; grid-template-columns: 200px 1fr; gap: 8px 18px; color: var(--muted); line-height: 1.6; margin: 0; }
@media (max-width: 768px) { .qr-defs { grid-template-columns: 1fr; gap: 4px 0; }
  .qr-defs dt { margin-top: 8px; }
  .qr-defs dd { margin-bottom: 4px; padding-left: 8px; } }
.qr-defs dt { color: var(--text); display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.qr-defs dt code {
  background: var(--bg); padding: 2px 7px; border-radius: 3px;
  color: var(--accent); font-size: 11px;
}
.qr-defs dt .qr-dir {
  font-family: 'SFMono-Regular', monospace; font-size: 10px;
  color: var(--muted2); line-height: 1.3; font-weight: normal;
}
.qr-defs dd { margin: 0; }
.qr-defs dd strong { color: var(--text); font-weight: 600; }
.qr-defs dd em { color: var(--accent); font-style: normal; background: var(--accent-bg); padding: 0 4px; border-radius: 2px; font-family: 'SFMono-Regular', monospace; font-size: 11px; }
.qr-defs dd .qr-target { color: var(--green); font-weight: 500; }
</style>

<script id="qr-fp-data" type="application/json">${JSON.stringify(fingerprint)}</script>
<script id="qr-lex-data" type="application/json">${JSON.stringify(lexical)}</script>
<script id="qr-ours-data" type="application/json">${JSON.stringify(ours)}</script>

<script>
(function () {
  const COLORS = ${JSON.stringify(DATASET_COLORS)};
  const L1_COLORS = ${JSON.stringify(L1_COLORS)};
  const PERSONA_COLORS = ${JSON.stringify(PERSONA_COLORS)};
  const COMPLEXITY_COLORS = ${JSON.stringify(COMPLEXITY_COLORS)};
  const STYLE_COLORS = ${JSON.stringify(STYLE_COLORS)};
  const FALLBACK = '#6e7681';
  const FP   = JSON.parse(document.getElementById('qr-fp-data').textContent);
  const LEX  = JSON.parse(document.getElementById('qr-lex-data').textContent);
  const OURS = JSON.parse(document.getElementById('qr-ours-data').textContent);

  // ─── A · Surface signals · merged 8-metric table with inline mini-bars ─
  // Each metric extracts a number from FP and/or LEX, and (optionally) inline
  // text for the top-opener column. fillFrac maps value → bar width [0,1].
  const DSS = Object.keys(FP.datasets);

  const METRICS = [
    { key: 'jargon_per_q',     get: s => FP.datasets[s].axes.jargon_per_q,
      fmt: v => v.toFixed(2),                           fill: 'magnitude' },
    { key: 'words_p50',        get: s => FP.datasets[s].axes.median_words_per_q,
      fmt: v => String(Math.round(v)),                  fill: 'magnitude' },
    { key: 'distinct3',        get: s => LEX.datasets[s].distinct_3.ratio,
      fmt: v => v.toFixed(3),                           fill: 'magnitude' },
    { key: 'ttr',              get: s => LEX.datasets[s].ttr,
      fmt: v => v.toFixed(3),                           fill: 'magnitude' },
    { key: 'openers',          get: s => LEX.datasets[s].opener.unique_openers,
      fmt: v => String(v),                              fill: 'magnitude' },
    { key: 'top_opener_share', get: s => LEX.datasets[s].opener.top10[0].share,
      // The cell shows the opener string + share %, bar represents the share %.
      fmt: (v, s) => {
        const top = LEX.datasets[s].opener.top10[0];
        return '<code style="font-size:10px;">&quot;'+top.opener+'&quot;</code><br><strong>'+(top.share*100).toFixed(0)+'%</strong>';
      },
      fill: 'magnitude' },
    { key: 'max_peer_sim',     get: s => LEX.datasets[s].similarity.max_peer_mean,
      fmt: v => v.toFixed(3),                           fill: 'magnitude' },
  ];

  function renderSurface() {
    const tb = document.getElementById('qr-surface-tbody');
    if (!tb) return;
    // per-metric max for bar normalization
    const maxes = METRICS.map(m => Math.max(...DSS.map(s => m.get(s) || 0)) || 1);

    tb.innerHTML = DSS.map(s => {
      const ours = s === 'ui-queryMaker';
      const c = COLORS[s];
      const cells = METRICS.map((m, i) => {
        const v = m.get(s) || 0;
        const w = Math.min(100, (v / maxes[i]) * 100);
        const fmt = typeof m.fmt === 'function' ? m.fmt(v, s) : v;
        return ''
          + '<td class="qr-mb-cell">'
          +   '<div class="qr-mb-bar"><div class="qr-mb-fill" style="width:'+w.toFixed(1)+'%;background:'+c+';"></div></div>'
          +   '<div class="qr-mb-val">'+fmt+'</div>'
          + '</td>';
      }).join('');
      const tr = '<tr'+(ours?' style="background:#3fb95012;"':'')+'>';
      return tr
        + '<td class="qr-mb-name">'+(ours?'<strong style="color:var(--green)">★ ':'<strong>')+FP.datasets[s].label+'</strong></td>'
        + cells
        + '</tr>';
    }).join('');
  }

  // ─── C · Intra-dataset spread scatter (ours only) ──────────────
  const PALETTES = { l1: L1_COLORS, persona: PERSONA_COLORS, style: STYLE_COLORS, complexity: COMPLEXITY_COLORS };
  let currentMode = 'l1';

  function colorFor(p, mode) {
    const v = p[mode];
    const palette = PALETTES[mode];
    return (palette && palette[v]) || FALLBACK;
  }
  function categoryCounts(points, mode) {
    const c = new Map();
    for (const p of points) {
      const k = p[mode] || '—';
      c.set(k, (c.get(k) || 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }
  function escAttr(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  function renderScatter() {
    const svg = document.getElementById('qr-scatter');
    if (!svg || !OURS || !OURS.points) return;
    const W = 720, H = 560, PAD = 40;
    function xs(x){ return PAD + (x + 1) / 2 * (W - 2*PAD); }
    function ys(y){ return PAD + (1 - (y + 1) / 2) * (H - 2*PAD); }

    let out = '<rect x="'+PAD+'" y="'+PAD+'" width="'+(W-2*PAD)+'" height="'+(H-2*PAD)+'" fill="none" stroke="#30363d" stroke-width="0.5"/>';
    out += '<text x="'+(W/2)+'" y="'+(H-10)+'" text-anchor="middle" fill="#6e7681" font-size="10" font-family="SFMono-Regular,monospace">t-SNE dim 1 · MiniLM-L6 embedding space  ·  n=500 ui-queryMaker queries (v7 mobile)</text>';
    out += '<text x="14" y="'+(H/2)+'" text-anchor="middle" fill="#6e7681" font-size="10" font-family="SFMono-Regular,monospace" transform="rotate(-90 14 '+(H/2)+')">t-SNE dim 2</text>';

    let circles = '';
    for (const p of OURS.points) {
      const c = colorFor(p, currentMode);
      circles += '<circle cx="'+xs(p.x).toFixed(1)+'" cy="'+ys(p.y).toFixed(1)+'" r="3.2" fill="'+c+'" fill-opacity="0.78" stroke="#0d1117" stroke-width="0.4" data-l1="'+escAttr(p.l1)+'" data-l2="'+escAttr(p.l2)+'" data-persona="'+escAttr(p.persona)+'" data-style="'+escAttr(p.style)+'" data-complexity="'+escAttr(p.complexity)+'" data-t="'+escAttr(p.t)+'"/>';
    }
    out += circles;
    svg.innerHTML = out;

    // legend (counts per category for currentMode)
    const leg = document.getElementById('qr-scatter-legend');
    const counts = categoryCounts(OURS.points, currentMode);
    leg.innerHTML = counts.map(([k, n]) => {
      const c = (PALETTES[currentMode] && PALETTES[currentMode][k]) || FALLBACK;
      const pct = ((n / OURS.n_total) * 100).toFixed(1);
      return '<div class="qr-legend-item"><span class="qr-legend-swatch" style="background:'+c+'"></span><span>'+escAttr(k)+'  <span style="color:var(--muted2)">· '+n+' · '+pct+'%</span></span></div>';
    }).join('');

    // tooltip
    const tip = document.getElementById('qr-scatter-tooltip');
    svg.onmousemove = e => {
      const tgt = e.target;
      if (tgt && tgt.tagName === 'circle' && tgt.dataset.l1) {
        tip.hidden = false;
        tip.style.left = (e.clientX + 12) + 'px';
        tip.style.top  = (e.clientY + 12) + 'px';
        const d = tgt.dataset;
        const main = d[currentMode] || '—';
        const palette = PALETTES[currentMode];
        const c = (palette && palette[main]) || FALLBACK;
        tip.innerHTML =
          '<strong style="color:'+c+'">'+escAttr(main)+'</strong><br>' +
          '<span style="color:var(--muted)">L1:</span> '+escAttr(d.l1)+
          '  ·  <span style="color:var(--muted)">L2:</span> '+escAttr(d.l2)+'<br>' +
          '<span style="color:var(--muted)">persona:</span> '+escAttr(d.persona)+
          '  ·  <span style="color:var(--muted)">style:</span> '+escAttr(d.style)+
          '  ·  <span style="color:var(--muted)">complexity:</span> '+escAttr(d.complexity)+'<br>' +
          '<span style="color:var(--muted2)">'+escAttr(d.t)+'</span>';
      } else {
        tip.hidden = true;
      }
    };
    svg.onmouseleave = () => { tip.hidden = true; };
  }

  function wireToggle() {
    const tog = document.getElementById('qr-mode-toggle');
    if (!tog) return;
    tog.addEventListener('click', e => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      currentMode = btn.dataset.mode;
      for (const b of tog.querySelectorAll('button')) b.classList.toggle('qr-mode-active', b === btn);
      renderScatter();
    });
  }

  function tryRender() {
    if (!document.getElementById('qr-surface-tbody')) return false;
    renderSurface();
    renderScatter();
    wireToggle();
    return true;
  }
  if (!tryRender()) {
    document.addEventListener('DOMContentLoaded', tryRender);
  }
})();
</script>
`;

const outPath = path.join(QR, 'report-fragment.html');
fs.writeFileSync(outPath, fragment, 'utf8');
console.log(`Wrote ${(fragment.length / 1024).toFixed(1)} KB → ${outPath}`);
