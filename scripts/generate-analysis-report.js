#!/usr/bin/env node
/**
 * scripts/generate-analysis-report.js
 *
 * Reusable skill: read a scored-queries JSONL → generate a self-contained,
 * interactive HTML analysis report with charts + query browser + filters.
 *
 * Usage:
 *   node scripts/generate-analysis-report.js \
 *     --input  data/output/runs/<batch>/scored_queries.jsonl \
 *     --output data/output/runs/<batch>/analysis_report.html \
 *     [--title  "My Batch · 2026-05"]   \
 *     [--meta   "200 queries · claude-sonnet-4-6"]
 *
 * The output HTML is fully self-contained (Chart.js via CDN; all data inline).
 * No Node.js dependencies beyond the standard library.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      args[key] = (next && !next.startsWith("--")) ? (i++, next) : true;
    }
  }
  return args;
}

// ─── Stats computation ───────────────────────────────────────────────────────

function wordCount(text) {
  return (text || "").split(/\s+/).filter(Boolean).length;
}

function computeStats(scored) {
  const total = scored.length;
  const passArr  = scored.filter(q => q.quality_pass);
  const failArr  = scored.filter(q => !q.quality_pass);
  const pass = passArr.length;
  const fail = failArr.length;
  const passRate = total > 0 ? (pass / total * 100).toFixed(1) : "0.0";
  const avgScore = total > 0
    ? (scored.reduce((s, q) => s + (q.quality_score || 0), 0) / total).toFixed(2)
    : "0.00";

  // Persona fallbacks
  const personaFails = scored.filter(
    q => q.persona_source === "fallback" || q.generator_mode === "persona-fallback"
  ).length;

  // By target_complexity
  const complexities = ["vague", "medium", "complex"];
  const byComplexity = {};
  complexities.forEach(c => (byComplexity[c] = { pass: 0, fail: 0, scores: [], wcs: [] }));
  scored.forEach(q => {
    const c = q.target_complexity || "unknown";
    if (!byComplexity[c]) byComplexity[c] = { pass: 0, fail: 0, scores: [], wcs: [] };
    const wc = wordCount(q.query_text);
    q.quality_pass ? byComplexity[c].pass++ : byComplexity[c].fail++;
    byComplexity[c].scores.push(q.quality_score || 0);
    byComplexity[c].wcs.push(wc);
  });
  Object.values(byComplexity).forEach(d => {
    d.avg = d.scores.length
      ? (d.scores.reduce((s, v) => s + v, 0) / d.scores.length).toFixed(2)
      : "—";
    const ws = d.wcs.slice().sort((a, b) => a - b);
    d.wcMin = ws[0] ?? "—";
    d.wcMax = ws[ws.length - 1] ?? "—";
    d.wcP50 = ws[Math.floor(ws.length / 2)] ?? "—";
    d.total = d.pass + d.fail;
    d.passRate = d.total > 0 ? (d.pass / d.total * 100).toFixed(1) : "0.0";
  });

  // By design_style
  const byDesignStyle = {};
  scored.forEach(q => {
    const ds = q.design_style || "none";
    if (!byDesignStyle[ds]) byDesignStyle[ds] = { pass: 0, fail: 0 };
    q.quality_pass ? byDesignStyle[ds].pass++ : byDesignStyle[ds].fail++;
  });

  // By L1 scene
  const byL1 = {};
  scored.forEach(q => {
    const l1 = q.l1_scene || "unknown";
    if (!byL1[l1]) byL1[l1] = { pass: 0, fail: 0 };
    q.quality_pass ? byL1[l1].pass++ : byL1[l1].fail++;
  });

  // Score distribution — 9 buckets: 1.0–1.5, 1.5–2.0, …, 4.5–5.0 (step 0.5)
  const BUCKET_STEP = 0.5;
  const BUCKET_MIN  = 1.0;
  const BUCKET_MAX  = 5.0;
  const N_BUCKETS   = Math.round((BUCKET_MAX - BUCKET_MIN) / BUCKET_STEP);
  const scoreBuckets = Array(N_BUCKETS).fill(0);
  scored.forEach(q => {
    const b = Math.min(N_BUCKETS - 1, Math.floor(((q.quality_score || BUCKET_MIN) - BUCKET_MIN) / BUCKET_STEP));
    scoreBuckets[Math.max(0, b)]++;
  });
  const scoreBucketLabels = Array.from({ length: N_BUCKETS }, (_, i) => {
    const lo = (BUCKET_MIN + i * BUCKET_STEP).toFixed(1);
    const hi = (BUCKET_MIN + (i + 1) * BUCKET_STEP).toFixed(1);
    return `${lo}–${hi}`;
  });

  // Word count distribution — buckets of 25 words
  const WC_BUCKET = 25;
  const allWCs = scored.map(q => wordCount(q.query_text));
  const maxWC  = Math.max(...allWCs, 0);
  const nWCB   = Math.ceil(maxWC / WC_BUCKET) + 1;
  const wcBPass = Array(nWCB).fill(0);
  const wcBFail = Array(nWCB).fill(0);
  scored.forEach(q => {
    const wc = wordCount(q.query_text);
    const b  = Math.floor(wc / WC_BUCKET);
    q.quality_pass ? wcBPass[b]++ : wcBFail[b]++;
  });
  const wcBLabels = Array.from({ length: nWCB }, (_, i) => `${i * WC_BUCKET}–${(i + 1) * WC_BUCKET - 1}`);

  // Unique values for filter dropdowns
  const designStyles = [...new Set(scored.map(q => q.design_style || "none"))].sort();
  const l1Scenes     = [...new Set(scored.map(q => q.l1_scene || "unknown"))].sort();

  return {
    total, pass, fail, passRate, avgScore, personaFails,
    byComplexity, byDesignStyle, byL1,
    scoreBuckets, scoreBucketLabels,
    wcBPass, wcBFail, wcBLabels,
    designStyles, l1Scenes,
    failArr,
  };
}

// ─── HTML generation ─────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildComplexityRows(byComplexity) {
  const order = ["vague", "medium", "complex"];
  const badges = { vague: "badge-v", medium: "badge-m", complex: "badge-c" };
  return order.map(c => {
    const d = byComplexity[c];
    if (!d || d.total === 0) return "";
    const rateColor = d.passRate === "100.0" ? "var(--pass)" : parseFloat(d.passRate) > 80 ? "var(--warn2)" : "var(--fail)";
    const avgColor  = parseFloat(d.avg) >= 4.0 ? "var(--pass)" : parseFloat(d.avg) >= 2.8 ? "var(--warn2)" : "var(--fail)";
    const failColor = d.fail > 0 ? "var(--fail)" : "var(--text2)";
    const barColor  = d.passRate === "100.0" ? "var(--pass)" : "var(--warn2)";
    return `
      <tr>
        <td><span class="badge ${badges[c] || ""}">${esc(c)}</span></td>
        <td>${d.total}</td>
        <td>${d.pass}</td>
        <td style="color:${failColor}">${d.fail}</td>
        <td style="color:${rateColor}">${d.passRate}%</td>
        <td style="color:${avgColor}">${d.avg}</td>
        <td style="font-size:12px;color:var(--text2)">${d.wcMin}–${d.wcMax} 词 &nbsp;<span style="color:var(--text2);opacity:.6">p50=${d.wcP50}</span></td>
        <td><div class="pass-bar"><div class="pass-bar-fill" style="width:${d.passRate}%;background:${barColor}"></div></div></td>
      </tr>`;
  }).join("");
}

function buildDiagnosisHTML(stats) {
  if (stats.fail === 0) {
    return `
    <div class="reco" style="border-left-color:var(--pass)">
      <h3 style="color:var(--pass)">✓ 全部通过质检（失败 0 条）</h3>
      <div style="font-size:13px;color:var(--text2);margin-top:6px">
        当前批次 ${stats.total} 条 query 均通过质量门槛（≥ 2.8 分）。平均分 <strong style="color:var(--pass)">${stats.avgScore}</strong>，无需修复。
      </div>
    </div>`;
  }
  // Dynamic failure diagnosis
  const failByC = {};
  Object.entries(stats.byComplexity).forEach(([c, d]) => {
    if (d.fail > 0) failByC[c] = d;
  });
  const lines = Object.entries(failByC).map(([c, d]) =>
    `<li><span><strong>${d.fail} 条 ${c}</strong>（共 ${d.total} 条，失败率 ${(d.fail/d.total*100).toFixed(0)}%），平均分 ${d.avg}，词数 ${d.wcMin}–${d.wcMax}。</span></li>`
  ).join("\n");
  return `
    <div class="diagnosis">
      <h3>⚠ ${stats.fail} 条未通过的核心情况</h3>
      <ul>${lines}</ul>
    </div>`;
}

function buildRecommendationsHTML(stats) {
  if (stats.fail === 0) return "";
  return `
  <section>
    <h2>改进建议</h2>
    <div class="reco">
      <h3>针对 ${stats.fail} 条失败的修复方向</h3>
      <div class="reco-list">
        <div class="reco-item">
          <div class="reco-num">1</div>
          <div class="reco-text"><strong>检查失败条目的词数分布</strong>：若失败集中在 vague（词数 &lt; 20），考虑强化 vague prompt 的最低信息密度约束——要求至少一句场景动机 + 一句粗粒度目标。</div>
        </div>
        <div class="reco-item">
          <div class="reco-num">2</div>
          <div class="reco-text"><strong>重跑失败条目</strong>：batch-generate 脚本支持 resume，删除对应 <code>query_id</code> 对应的输出后重跑即可，无需全量重新生成。</div>
        </div>
        <div class="reco-item">
          <div class="reco-num">3</div>
          <div class="reco-text"><strong>调整评分器阈值</strong>：若业务上可接受更低门槛，可将 pass threshold 从 2.8 调低为 2.4；在 <code>scoreQueryRecord()</code> 的 quality_pass 判断处修改。</div>
        </div>
      </div>
    </div>
  </section>`;
}

function buildHTML(scored, stats, opts = {}) {
  const title   = esc(opts.title || "Query Analysis Report");
  const meta    = esc(opts.meta  || `${stats.total} 条 · ${new Date().toISOString().slice(0, 10)}`);
  const now     = new Date().toISOString().slice(0, 10);

  // Serialize data for inline embedding (used by browser JS)
  const dataJson = JSON.stringify(scored);

  // Chart config objects as JSON strings
  const scoreBucketsJson   = JSON.stringify(stats.scoreBuckets);
  const scoreBuckLabelJson = JSON.stringify(stats.scoreBucketLabels);
  const wcPassJson         = JSON.stringify(stats.wcBPass);
  const wcFailJson         = JSON.stringify(stats.wcBFail);
  const wcLabelsJson       = JSON.stringify(stats.wcBLabels);
  const designStylesJson   = JSON.stringify(stats.designStyles);
  const l1ScenesJson       = JSON.stringify(stats.l1Scenes);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root {
  --bg:#0f1117; --surface:#1a1d27; --surface2:#22263a; --border:#2e3350;
  --accent:#6c63ff; --accent2:#00d4aa; --warn:#ff6b6b; --warn2:#ffa940;
  --text:#e8eaf6; --text2:#9da3c4; --pass:#36d399; --fail:#ff6b6b;
  --radius:12px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6}
.page{max-width:1300px;margin:0 auto;padding:32px 24px 80px}
header{margin-bottom:40px;border-bottom:1px solid var(--border);padding-bottom:24px}
header h1{font-size:24px;font-weight:700;letter-spacing:-.3px}
header .meta{color:var(--text2);font-size:13px;margin-top:6px}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:.5px;margin-left:8px}
.tag-llm{background:#6c63ff33;color:var(--accent)} .tag-claude{background:#00d4aa22;color:var(--accent2)}
section{margin-bottom:40px}
h2{font-size:16px;font-weight:700;margin-bottom:16px;color:var(--text);display:flex;align-items:center;gap:8px}
h2::before{content:'';display:block;width:3px;height:16px;background:var(--accent);border-radius:2px}
h3{font-size:13px;font-weight:600;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}

/* Cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:16px;margin-bottom:32px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 22px}
.card .val{font-size:32px;font-weight:800;line-height:1;margin-bottom:4px}
.card .lbl{font-size:12px;color:var(--text2)}
.card.green .val{color:var(--pass)} .card.red .val{color:var(--fail)}
.card.purple .val{color:var(--accent)} .card.teal .val{color:var(--accent2)} .card.orange .val{color:var(--warn2)}

/* Grids */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:900px){.grid-2,.grid-3{grid-template-columns:1fr}}
.chart-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px}
.chart-box canvas{max-height:280px}

/* Complexity table */
.comp-table{width:100%;border-collapse:collapse}
.comp-table th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)}
.comp-table td{padding:12px 14px;border-bottom:1px solid var(--border)}
.comp-table tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge-v{background:#6c63ff22;color:var(--accent)} .badge-m{background:#ffa94022;color:var(--warn2)} .badge-c{background:#ff6b6b22;color:var(--fail)}
.pass-bar{height:6px;background:var(--border);border-radius:3px;overflow:hidden}
.pass-bar-fill{height:100%;border-radius:3px}

/* Diagnosis / Reco */
.diagnosis{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--warn);border-radius:var(--radius);padding:20px 24px}
.diagnosis h3{color:var(--warn2);margin-bottom:14px}
.diagnosis ul{list-style:none;display:flex;flex-direction:column;gap:10px}
.diagnosis li{display:flex;gap:10px;font-size:13px}
.diagnosis li::before{content:'▸';color:var(--warn2);flex-shrink:0;margin-top:1px}
.reco{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent2);border-radius:var(--radius);padding:20px 24px}
.reco h3{color:var(--accent2);margin-bottom:14px}
.reco-list{display:flex;flex-direction:column;gap:12px}
.reco-item{display:flex;gap:12px}
.reco-num{width:22px;height:22px;background:var(--accent2);color:#000;border-radius:50%;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.reco-text{font-size:13px;color:var(--text)} .reco-text strong{color:var(--accent2)} .reco-text code{font-family:monospace;font-size:12px;background:var(--surface2);padding:1px 5px;border-radius:3px;color:var(--accent2)}

/* Design style cells */
.ds-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.ds-cell{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px}
.ds-cell .ds-name{font-size:12px;font-weight:600;margin-bottom:6px}
.ds-cell .ds-stats{font-size:11px;color:var(--text2);margin-bottom:6px}
.ds-mini-bar{height:4px;background:var(--border);border-radius:2px;overflow:hidden}
.ds-mini-fill{height:100%;border-radius:2px}

/* L1 bars */
.l1-list{display:flex;flex-direction:column;gap:10px}
.l1-row{display:flex;align-items:center;gap:12px}
.l1-name{width:140px;font-size:12px;flex-shrink:0}
.l1-bar-wrap{flex:1;height:20px;background:var(--border);border-radius:4px;overflow:hidden;display:flex}
.l1-bar-pass{background:var(--pass);height:100%} .l1-bar-fail{background:var(--fail);height:100%}
.l1-nums{font-size:11px;color:var(--text2);width:80px;text-align:right;flex-shrink:0}

/* Scoring methodology */
.scoring-wrap{display:flex;flex-direction:column;gap:20px}
.formula-bar{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;display:flex;align-items:center;gap:0;flex-wrap:wrap}
.formula-term{display:flex;flex-direction:column;align-items:center;padding:10px 20px}
.formula-term .coeff{font-size:22px;font-weight:800}
.formula-term .dim-name{font-size:11px;color:var(--text2);margin-top:2px;text-transform:uppercase;letter-spacing:.5px}
.formula-term.auth .coeff{color:var(--accent)} .formula-term.spec .coeff{color:var(--accent2)} .formula-term.div .coeff{color:var(--warn2)}
.formula-op{font-size:20px;color:var(--text2);padding:0 4px;align-self:center}
.formula-eq{font-size:13px;color:var(--text2);padding:0 12px;align-self:center}
.formula-result{font-size:13px;padding:6px 14px;border-radius:6px;border:1px solid var(--border);align-self:center;margin-left:8px}
.formula-result .thresh{font-weight:700;color:var(--pass)} .formula-result .thresh-fail{font-weight:700;color:var(--fail)}
.dim-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:900px){.dim-cards{grid-template-columns:1fr}}
.dim-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.dim-card-header{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.dim-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.dim-title{font-size:14px;font-weight:700}
.dim-weight{font-size:11px;color:var(--text2);margin-left:auto;background:var(--surface2);padding:2px 8px;border-radius:10px}
.rubric-block{margin-bottom:12px}
.rubric-block:last-child{margin-bottom:0}
.rubric-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;color:var(--text2)}
.rubric-rows{display:flex;flex-direction:column;gap:4px}
.rubric-row{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2)}
.rubric-row .pt{width:28px;flex-shrink:0;font-weight:700;font-size:11px;text-align:right;padding-top:1px}
.rubric-row .pt.pos{color:var(--pass)} .rubric-row .pt.neg{color:var(--fail)}
.rubric-row .desc{flex:1;line-height:1.5}
.rubric-row code{font-family:monospace;font-size:11px;background:var(--surface2);padding:1px 5px;border-radius:3px;color:var(--accent2)}
.infer-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px}
.infer-table{width:100%;border-collapse:collapse;margin-top:10px}
.infer-table th{text-align:left;padding:8px 12px;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)}
.infer-table td{padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;vertical-align:top}
.infer-table tr:last-child td{border-bottom:none}
.infer-note{font-size:12px;color:var(--text2);margin-top:10px}
.infer-note strong{color:var(--warn2)}

/* ── Query Browser ─────────────────────────────────────────────────────────── */
.browser-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
.browser-search{flex:1;min-width:200px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 14px;color:var(--text);font-size:13px;outline:none}
.browser-search:focus{border-color:var(--accent)}
.filter-group{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.filter-label{font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
.filter-pill{padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
.filter-pill:hover{border-color:var(--accent);color:var(--text)}
.filter-pill.active{background:var(--accent);border-color:var(--accent);color:#fff}
.filter-pill.active-pass{background:var(--pass);border-color:var(--pass);color:#000}
.filter-pill.active-fail{background:var(--fail);border-color:var(--fail);color:#fff}
.filter-select{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-size:12px;outline:none;cursor:pointer}
.filter-select:focus{border-color:var(--accent)}
.browser-count{font-size:12px;color:var(--text2);white-space:nowrap}
.sort-select{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);font-size:12px;outline:none;cursor:pointer}

/* Query table */
.q-table-wrap{overflow-x:auto}
.q-table{width:100%;border-collapse:collapse;font-size:12px}
.q-table th{text-align:left;padding:9px 10px;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:2;white-space:nowrap;cursor:pointer;user-select:none}
.q-table th:hover{color:var(--text)}
.q-table th.sorted-asc::after{content:' ▲'}
.q-table th.sorted-desc::after{content:' ▼'}
.q-table td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.q-table tr:hover td{background:var(--surface)}
.q-table tr.expanded td{background:var(--surface2)}
.q-preview{color:var(--text2);max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.q-full{display:none;color:var(--text);white-space:pre-wrap;word-break:break-word;max-width:480px;font-size:12px;line-height:1.6;cursor:pointer;margin-top:4px}
tr.expanded .q-preview{display:none}
tr.expanded .q-full{display:block}
.score-pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
.score-high{background:#36d39922;color:var(--pass)}
.score-mid{background:#ffa94022;color:var(--warn2)}
.score-low{background:#ff6b6b22;color:var(--fail)}
.pass-dot{display:inline-block;width:8px;height:8px;border-radius:50%}
.pass-dot.pass{background:var(--pass)} .pass-dot.fail{background:var(--fail)}
.wc-chip{display:inline-block;padding:2px 7px;background:var(--surface2);border-radius:10px;font-size:11px;color:var(--text2)}
.ds-chip{display:inline-block;padding:2px 7px;background:var(--surface2);border-radius:10px;font-size:11px}
.mono{font-family:monospace;font-size:11px;color:var(--accent2)}

/* Pagination */
.pagination{display:flex;align-items:center;gap:10px;margin-top:16px;flex-wrap:wrap}
.page-btn{padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);font-size:12px;cursor:pointer}
.page-btn:hover:not(:disabled){border-color:var(--accent);color:var(--text)}
.page-btn:disabled{opacity:.35;cursor:default}
.page-info{font-size:12px;color:var(--text2)}
.page-size-select{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text2);font-size:12px}

/* Misc chips */
.complexity-chip{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.chip-vague{background:#6c63ff22;color:var(--accent)}
.chip-medium{background:#ffa94022;color:var(--warn2)}
.chip-complex{background:#ff6b6b22;color:var(--fail)}
.chip-unknown{background:var(--surface2);color:var(--text2)}

/* Persona badge & expanded card */
.persona-badge{font-size:10px;color:var(--accent2);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:480px;font-style:italic;opacity:.85}
.persona-card{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:10px}
.persona-card-title{font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:8px}
.persona-card-row{display:flex;gap:8px;margin-bottom:5px;font-size:12px;line-height:1.5}
.persona-card-label{color:var(--text2);width:64px;flex-shrink:0;font-size:11px;font-weight:600}
.persona-card-val{color:var(--text);flex:1}
.persona-fam{padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700}
.fam-low{background:#ff6b6b22;color:var(--fail)}.fam-medium{background:#ffa94022;color:var(--warn2)}.fam-high{background:#36d39922;color:var(--pass)}
</style>
</head>
<body>
<div class="page">

<header>
  <h1>${title}
    <span class="tag tag-llm">Real LLM</span>
    <span class="tag tag-claude">claude-sonnet-4-6</span>
  </h1>
  <div class="meta">${meta} · 报告生成于 ${now}</div>
</header>

<!-- KPI Cards -->
<section>
  <div class="cards">
    <div class="card purple"><div class="val">${stats.total}</div><div class="lbl">总生成条数</div></div>
    <div class="card green"><div class="val">${stats.pass}</div><div class="lbl">通过质检</div></div>
    <div class="card red"><div class="val">${stats.fail}</div><div class="lbl">未通过质检</div></div>
    <div class="card teal"><div class="val">${stats.avgScore}</div><div class="lbl">平均质量分</div></div>
    <div class="card orange"><div class="val">${stats.passRate}%</div><div class="lbl">通过率</div></div>
    <div class="card purple"><div class="val">${stats.personaFails}</div><div class="lbl">persona 失败 / fallback</div></div>
  </div>
</section>

<!-- Scoring methodology -->
<section>
  <h2>评分方式与细则</h2>
  <div class="scoring-wrap">
    <div class="formula-bar">
      <div class="formula-term auth">
        <div class="coeff">Authenticity × 0.4</div>
        <div class="dim-name">真实感 · 权重 40%</div>
      </div>
      <div class="formula-op">+</div>
      <div class="formula-term spec">
        <div class="coeff">Specificity × 0.4</div>
        <div class="dim-name">准确性 · 权重 40%</div>
      </div>
      <div class="formula-op">+</div>
      <div class="formula-term div">
        <div class="coeff">Diversity × 0.2</div>
        <div class="dim-name">多样性 · 权重 20%</div>
      </div>
      <div class="formula-eq">=</div>
      <div class="formula-result">
        质量分 1.0 – 5.0<br>
        通过：<span class="thresh">≥ 2.8</span> &nbsp; 不通过：<span class="thresh-fail">&lt; 2.8</span>
      </div>
    </div>

    <div class="dim-cards">
      <div class="dim-card">
        <div class="dim-card-header">
          <div class="dim-dot" style="background:var(--accent)"></div>
          <div class="dim-title" style="color:var(--accent)">Authenticity（真实感）</div>
          <div class="dim-weight">× 0.4</div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.6">
          衡量 query 是否具有真实用户的语气、动机和视角。起始分 <strong style="color:var(--text)">1</strong>，累加，上限 5。
        </div>
        <div class="rubric-block">
          <div class="rubric-label">全复杂度通用</div>
          <div class="rubric-rows">
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">含第一人称 <code>I / my / we / our</code></div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">含动机词 <code>need to / want to / because / trying to / help me…</code></div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">存在 persona_title（LLM 生成角色 → 确保语气来源于具体人物）</div></div>
          </div>
        </div>
        <div class="rubric-block" style="margin-top:10px">
          <div class="rubric-label">词数门槛（按复杂度）</div>
          <div class="rubric-rows">
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc"><span class="badge badge-v">vague</span> 词数 ≥ 5（不惩罚短文本）</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc"><span class="badge badge-m">medium</span> / <span class="badge badge-c">complex</span> 词数 ≥ 20</div></div>
          </div>
        </div>
      </div>

      <div class="dim-card">
        <div class="dim-card-header">
          <div class="dim-dot" style="background:var(--accent2)"></div>
          <div class="dim-title" style="color:var(--accent2)">Specificity（准确性）</div>
          <div class="dim-weight">× 0.4</div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.6">
          衡量 query 是否符合其目标复杂度的信息密度定义。<strong style="color:var(--warn2)">三种复杂度使用独立规则。</strong>起始分 <strong style="color:var(--text)">1</strong>，累加，上限 5。
        </div>
        <div class="rubric-block">
          <div class="rubric-label"><span class="badge badge-v">vague</span> — 1–2 短句，系统需大量推断</div>
          <div class="rubric-rows">
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">含 app 类型词（<code>app / dashboard / tracker / tool…</code>）或 application_type 有值</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">无尾问句（陈述句结束）</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">无 sign-off（<code>thanks / regards…</code>）</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">词数 5–40（符合"1–2 short sentences"定义）</div></div>
            <div class="rubric-row"><div class="pt neg">−1</div><div class="desc">UI 组件词 ≥ 3（过度细化，应升级复杂度）</div></div>
          </div>
        </div>
        <div class="rubric-block" style="margin-top:12px">
          <div class="rubric-label"><span class="badge badge-m">medium</span> / <span class="badge badge-c">complex</span></div>
          <div class="rubric-rows">
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">UI 组件词 ≥ 1（<code>card / filter / chart / modal / sidebar…</code>）</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">UI 组件词 ≥ 3</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">推断复杂度 ≠ vague</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">多句结构：含 <code>, : ;</code> 且 ≥ 2 个实质句子</div></div>
          </div>
        </div>
      </div>

      <div class="dim-card">
        <div class="dim-card-header">
          <div class="dim-dot" style="background:var(--warn2)"></div>
          <div class="dim-title" style="color:var(--warn2)">Diversity（多样性）</div>
          <div class="dim-weight">× 0.2</div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.6">
          衡量当前 query 在同场景内是否差异化。起始分 <strong style="color:var(--text)">1</strong>，累加，上限 5。
        </div>
        <div class="rubric-block">
          <div class="rubric-label">全复杂度通用</div>
          <div class="rubric-rows">
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">design_style 字段有值</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">application_type 有值且非"通用…"</div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">与同场景 peer Jaccard 三元组相似度 <strong>&lt; 0.55</strong></div></div>
            <div class="rubric-row"><div class="pt pos">+1</div><div class="desc">Jaccard 相似度 <strong>&lt; 0.30</strong>（显著差异）</div></div>
          </div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text2);background:var(--surface2);border-radius:8px;padding:10px 12px;line-height:1.6">
          peer_similarity 字段存于产物 JSONL，取同 scene_id 所有 peer 中最大 trigram Jaccard 值。
        </div>
      </div>
    </div>

    <div class="infer-box">
      <h3>complexity_level 推断逻辑（scorer 事后回判，与 target_complexity 独立）</h3>
      <table class="infer-table">
        <thead><tr><th>推断结果</th><th>触发条件</th><th>说明</th></tr></thead>
        <tbody>
          <tr>
            <td><span class="badge badge-c">complex</span></td>
            <td>词数 ≥ 70，或含结构化列表 <code>key requirements: / 1.</code>，或交互词 ≥ 5</td>
            <td style="color:var(--text2)">高密度，通常有编号/模块/多个交互约束</td>
          </tr>
          <tr>
            <td><span class="badge badge-m">medium</span></td>
            <td>词数 ≥ 28，或交互词 ≥ 2（且不满足 complex）</td>
            <td style="color:var(--text2)">含 1–2 个具体约束或 UI 细节</td>
          </tr>
          <tr>
            <td><span class="badge badge-v">vague</span></td>
            <td>其余情况</td>
            <td style="color:var(--text2)">高层意图，系统需大量推断</td>
          </tr>
        </tbody>
      </table>
      <div class="infer-note">
        <strong>注意：</strong>complexity_level 是事后回判，<strong>不影响</strong> quality_score 计算（质量分基于 target_complexity 规则）。两者对比可检验"计划复杂度"与"实际输出复杂度"是否对齐。
      </div>
    </div>
  </div>
</section>

<!-- Charts: Score distribution + Complexity -->
<section>
  <h2>分数分布 &amp; 复杂度拆解</h2>
  <div class="grid-2">
    <div class="chart-box">
      <h3>质量分直方图</h3>
      <canvas id="scoreHist"></canvas>
    </div>
    <div class="chart-box">
      <h3>各复杂度 通过 / 失败</h3>
      <canvas id="compChart"></canvas>
    </div>
  </div>
</section>

<!-- Diagnosis -->
<section>
  <h2>质检结果诊断</h2>
  ${buildDiagnosisHTML(stats)}
</section>

<!-- Complexity detail table -->
<section>
  <h2>复杂度详细对比</h2>
  <div class="chart-box">
    <table class="comp-table">
      <thead>
        <tr><th>复杂度</th><th>总计</th><th>通过</th><th>失败</th><th>通过率</th><th>平均分</th><th>词数范围 (p50)</th><th>通过率条</th></tr>
      </thead>
      <tbody>
        ${buildComplexityRows(stats.byComplexity)}
      </tbody>
    </table>
  </div>
</section>

<!-- Word count distribution -->
<section>
  <h2>词数分布分析</h2>
  <div class="chart-box">
    <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;color:var(--text2);margin-bottom:12px">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--pass);margin-right:4px"></span>通过 (pass)</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--fail);margin-right:4px"></span>失败 (fail)</span>
    </div>
    <canvas id="wcChart" style="max-height:220px"></canvas>
  </div>
</section>

<!-- Design style breakdown -->
<section>
  <h2>Design Style 通过率</h2>
  <div class="ds-grid" id="dsGrid"></div>
</section>

<!-- L1 scene breakdown -->
<section>
  <h2>L1 场景分布</h2>
  <div class="chart-box">
    <div class="l1-list" id="l1List"></div>
  </div>
</section>

<!-- ── Query Browser ───────────────────────────────────────────────────────── -->
<section>
  <h2>全量 Query 浏览器</h2>
  <div class="chart-box" style="padding:20px">

    <!-- Toolbar -->
    <div class="browser-toolbar">
      <input class="browser-search" id="qSearch" placeholder="搜索 query 文本 / 场景 / 应用类型…" oninput="applyFilters()">

      <div class="filter-group">
        <span class="filter-label">复杂度</span>
        <button class="filter-pill active" data-ftype="complexity" data-fval="all" onclick="togglePill(this)">全部</button>
        <button class="filter-pill" data-ftype="complexity" data-fval="vague" onclick="togglePill(this)">Vague</button>
        <button class="filter-pill" data-ftype="complexity" data-fval="medium" onclick="togglePill(this)">Medium</button>
        <button class="filter-pill" data-ftype="complexity" data-fval="complex" onclick="togglePill(this)">Complex</button>
      </div>

      <div class="filter-group">
        <span class="filter-label">质检</span>
        <button class="filter-pill active" data-ftype="pass" data-fval="all" onclick="togglePill(this)">全部</button>
        <button class="filter-pill" data-ftype="pass" data-fval="pass" onclick="togglePill(this)">通过</button>
        <button class="filter-pill" data-ftype="pass" data-fval="fail" onclick="togglePill(this)">失败</button>
      </div>

      <div class="filter-group">
        <span class="filter-label">Design Style</span>
        <select class="filter-select" id="dsFilter" onchange="applyFilters()">
          <option value="">全部</option>
        </select>
      </div>

      <div class="filter-group">
        <span class="filter-label">L1 场景</span>
        <select class="filter-select" id="l1Filter" onchange="applyFilters()">
          <option value="">全部</option>
        </select>
      </div>

      <div class="filter-group">
        <span class="filter-label">排序</span>
        <select class="sort-select" id="sortSelect" onchange="applyFilters()">
          <option value="default">默认（序号）</option>
          <option value="score-desc">分数 ↓</option>
          <option value="score-asc">分数 ↑</option>
          <option value="wc-desc">词数 ↓</option>
          <option value="wc-asc">词数 ↑</option>
          <option value="scene">L2 场景</option>
        </select>
      </div>

      <span class="browser-count" id="qCount">共 ${stats.total} 条</span>
    </div>

    <!-- Table -->
    <div class="q-table-wrap">
      <table class="q-table">
        <thead>
          <tr>
            <th style="width:36px">#</th>
            <th style="min-width:100px">ID</th>
            <th style="min-width:90px">L1 场景</th>
            <th style="min-width:120px">L2 / 场景标签</th>
            <th style="min-width:100px">应用类型</th>
            <th style="width:80px">Design</th>
            <th style="width:70px">复杂度</th>
            <th style="width:50px">词数</th>
            <th style="width:64px">分数</th>
            <th style="width:40px">✓</th>
            <th>Query（点击展开）</th>
          </tr>
        </thead>
        <tbody id="qTableBody"></tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button class="page-btn" id="prevBtn" onclick="changePage(-1)" disabled>← 上一页</button>
      <span class="page-info" id="pageInfo"></span>
      <button class="page-btn" id="nextBtn" onclick="changePage(1)">下一页 →</button>
      <span style="font-size:12px;color:var(--text2)">每页</span>
      <select class="page-size-select" id="pageSizeSelect" onchange="applyFilters()">
        <option value="25">25</option>
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="200">全部</option>
      </select>
    </div>
  </div>
</section>

${buildRecommendationsHTML(stats)}

</div><!-- /page -->

<script>
// ─── Embedded data ────────────────────────────────────────────────────────────
const SCORED = ${dataJson};

// ─── Filter state ─────────────────────────────────────────────────────────────
const filters = { complexity: "all", pass: "all" };
let currentPage = 1;
let filteredData = SCORED.slice();

function wc(text) { return (text||"").split(/\\s+/).filter(Boolean).length; }

function scoreClass(s) {
  if (s >= 4.0) return "score-high";
  if (s >= 2.8) return "score-mid";
  return "score-low";
}

function chipClass(c) {
  const m = { vague:"chip-vague", medium:"chip-medium", complex:"chip-complex" };
  return m[c] || "chip-unknown";
}

// Populate dropdowns
(function(){
  const dsEl  = document.getElementById("dsFilter");
  const l1El  = document.getElementById("l1Filter");
  const dsList = ${designStylesJson};
  const l1List = ${l1ScenesJson};
  dsList.forEach(d => { const o = document.createElement("option"); o.value=d; o.textContent=d; dsEl.appendChild(o); });
  l1List.forEach(l => { const o = document.createElement("option"); o.value=l; o.textContent=l; l1El.appendChild(o); });
})();

function togglePill(el) {
  const ftype = el.dataset.ftype;
  document.querySelectorAll(\`[data-ftype="\${ftype}"]\`).forEach(p => {
    p.classList.remove("active","active-pass","active-fail");
  });
  const fval = el.dataset.fval;
  el.classList.add(fval === "pass" ? "active-pass" : fval === "fail" ? "active-fail" : "active");
  filters[ftype] = fval;
  currentPage = 1;
  applyFilters();
}

function applyFilters() {
  const search = document.getElementById("qSearch").value.trim().toLowerCase();
  const ds     = document.getElementById("dsFilter").value;
  const l1     = document.getElementById("l1Filter").value;
  const sort   = document.getElementById("sortSelect").value;

  filteredData = SCORED.filter(q => {
    if (filters.complexity !== "all" && q.target_complexity !== filters.complexity) return false;
    if (filters.pass === "pass" && !q.quality_pass) return false;
    if (filters.pass === "fail" && q.quality_pass) return false;
    if (ds && (q.design_style||"none") !== ds) return false;
    if (l1 && (q.l1_scene||"") !== l1) return false;
    if (search) {
      const hay = [(q.query_text||""), (q.l2_scene_label||""), (q.application_type||""), (q.l1_scene||""), (q.id||"")].join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  if (sort === "score-desc") filteredData.sort((a,b)=>b.quality_score-a.quality_score);
  else if (sort === "score-asc") filteredData.sort((a,b)=>a.quality_score-b.quality_score);
  else if (sort === "wc-desc") filteredData.sort((a,b)=>wc(b.query_text)-wc(a.query_text));
  else if (sort === "wc-asc") filteredData.sort((a,b)=>wc(a.query_text)-wc(b.query_text));
  else if (sort === "scene") filteredData.sort((a,b)=>(a.l2_scene_label||"").localeCompare(b.l2_scene_label||""));

  currentPage = Math.min(currentPage, Math.ceil(filteredData.length / pageSize()) || 1);
  renderTable();
}

function pageSize() { return Number(document.getElementById("pageSizeSelect").value) || 25; }

function renderTable() {
  const ps    = pageSize();
  const total = filteredData.length;
  const pages = Math.ceil(total / ps) || 1;
  const start = (currentPage - 1) * ps;
  const slice = filteredData.slice(start, start + ps);

  document.getElementById("qCount").textContent = \`显示 \${total} / \${SCORED.length} 条\`;
  document.getElementById("pageInfo").textContent = \`第 \${currentPage} / \${pages} 页\`;
  document.getElementById("prevBtn").disabled = currentPage <= 1;
  document.getElementById("nextBtn").disabled = currentPage >= pages;

  const tbody = document.getElementById("qTableBody");
  tbody.innerHTML = "";
  slice.forEach((q, idx) => {
    const rowIdx = start + idx + 1;
    const w = wc(q.query_text);
    const sc = q.quality_score || 0;
    const preview = (q.query_text||"").slice(0,90).replace(/\\n/g," ") + ((q.query_text||"").length > 90 ? "…" : "");
    const full    = (q.query_text||"").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const dsColor = { Dark:"#6c63ff", Glassmorphism:"#00d4aa", Vibrant:"#ff6b6b", Minimalism:"#c3c9f0",
      Material:"#ffa940", Neumorphism:"#36d399", Luxury:"#f5a623", Cyberpunk:"#ff4ecd", none:"#555" };
    const dsc = dsColor[q.design_style] || "#888";
    const tr = document.createElement("tr");
    tr.dataset.idx = rowIdx;
    tr.onclick = function(e){ if(e.target.tagName==="A") return; this.classList.toggle("expanded"); };
    tr.innerHTML = \`
      <td style="color:var(--text2)">\${rowIdx}</td>
      <td class="mono">\${(q.id||"").slice(0,22)}</td>
      <td style="font-size:11px;color:var(--text2)">\${q.l1_scene||"—"}</td>
      <td style="font-size:11px">\${q.l2_scene_label||q.scene_id||"—"}</td>
      <td style="font-size:11px;color:var(--text2)">\${q.application_type||"—"}</td>
      <td><span class="ds-chip" style="color:\${dsc}">\${q.design_style||"none"}</span></td>
      <td><span class="complexity-chip \${chipClass(q.target_complexity)}">\${q.target_complexity||"?"}</span></td>
      <td><span class="wc-chip">\${w}</span></td>
      <td><span class="score-pill \${scoreClass(sc)}">\${sc}</span></td>
      <td><span class="pass-dot \${q.quality_pass?"pass":"fail"}" title="\${q.quality_pass?"通过":"失败"}"></span></td>
      <td>
        <div class="persona-badge">\${(q.persona_title||"").replace(/</g,"&lt;")}</div>
        <div class="q-preview">\${preview}</div>
        <div class="q-full">\${buildPersonaCard(q)}\${full}</div>
      </td>\`;
    tbody.appendChild(tr);
  });
}

function changePage(delta) {
  const ps = pageSize();
  const pages = Math.ceil(filteredData.length / ps) || 1;
  currentPage = Math.max(1, Math.min(pages, currentPage + delta));
  renderTable();
}

// ─── Persona card builder (used in expanded row) ──────────────────────────────
function buildPersonaCard(q) {
  const spec = q.persona_spec || {};
  function e(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  const famCls = { low:'fam-low', medium:'fam-medium', high:'fam-high' };
  let h = '<div class="persona-card">';
  h += '<div class="persona-card-title">' + e(q.persona_title||'—') + '</div>';
  if (spec.persona_description) h += '<div class="persona-card-row"><div class="persona-card-label">描述</div><div class="persona-card-val">' + e(spec.persona_description) + '</div></div>';
  if (spec.user_goal)           h += '<div class="persona-card-row"><div class="persona-card-label">目标</div><div class="persona-card-val">' + e(spec.user_goal) + '</div></div>';
  if (spec.persona_style_hint)  h += '<div class="persona-card-row"><div class="persona-card-label">表达风格</div><div class="persona-card-val">' + e(spec.persona_style_hint) + '</div></div>';
  if (spec.domain_familiarity)  h += '<div class="persona-card-row"><div class="persona-card-label">熟悉度</div><div class="persona-card-val"><span class="persona-fam ' + (famCls[spec.domain_familiarity]||'') + '">' + spec.domain_familiarity + '</span></div></div>';
  return h + '</div>';
}

// Initial render
applyFilters();

// ─── Score histogram ──────────────────────────────────────────────────────────
(function(){
  const buckets = ${scoreBucketsJson};
  const labels  = ${scoreBuckLabelJson};
  const colors  = buckets.map((_, i) => {
    const lo = 1.0 + i * 0.5;
    return lo < 2.8 ? "#ff6b6b99" : lo < 4.0 ? "#ffa94099" : "#36d39999";
  });
  new Chart(document.getElementById("scoreHist"), {
    type: "bar",
    data: { labels, datasets: [{ data: buckets, backgroundColor: colors, borderRadius: 4, label: "条数" }] },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9da3c4", maxRotation: 45 }, grid: { color: "#2e3350" } },
        y: { ticks: { color: "#9da3c4", stepSize: 1 }, grid: { color: "#2e3350" } }
      },
      animation: { duration: 600 }
    }
  });
})();

// ─── Complexity bar chart ─────────────────────────────────────────────────────
(function(){
  const byC = {};
  SCORED.forEach(q => {
    const c = q.target_complexity || "unknown";
    if (!byC[c]) byC[c] = { pass: 0, fail: 0 };
    q.quality_pass ? byC[c].pass++ : byC[c].fail++;
  });
  const labels = Object.keys(byC);
  const passD  = labels.map(l => byC[l].pass);
  const failD  = labels.map(l => byC[l].fail);
  new Chart(document.getElementById("compChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "通过", data: passD, backgroundColor: "#36d39988", borderRadius: 4, stack: "s" },
        { label: "失败", data: failD, backgroundColor: "#ff6b6b99", borderRadius: 4, stack: "s" }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: "#9da3c4" } } },
      scales: {
        x: { stacked: true, ticks: { color: "#9da3c4" }, grid: { color: "#2e3350" } },
        y: { stacked: true, ticks: { color: "#9da3c4" }, grid: { color: "#2e3350" } }
      },
      animation: { duration: 600 }
    }
  });
})();

// ─── Word count histogram ─────────────────────────────────────────────────────
(function(){
  const passB = ${wcPassJson};
  const failB = ${wcFailJson};
  const labels = ${wcLabelsJson};
  new Chart(document.getElementById("wcChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "通过", data: passB, backgroundColor: "#36d39988", borderRadius: 3 },
        { label: "失败", data: failB, backgroundColor: "#ff6b6b99", borderRadius: 3 }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: "#9da3c4" } } },
      scales: {
        x: { ticks: { color: "#9da3c4", maxRotation: 60, font:{size:10} }, grid: { color: "#2e3350" } },
        y: { ticks: { color: "#9da3c4" }, grid: { color: "#2e3350" } }
      },
      animation: { duration: 600 }
    }
  });
})();

// ─── Design style grid ────────────────────────────────────────────────────────
(function(){
  const dsMap = {};
  SCORED.forEach(q => {
    const ds = q.design_style || "none";
    if (!dsMap[ds]) dsMap[ds] = { pass:0, fail:0 };
    q.quality_pass ? dsMap[ds].pass++ : dsMap[ds].fail++;
  });
  const dsColors = { Dark:"#6c63ff", Glassmorphism:"#00d4aa", Vibrant:"#ff6b6b",
    Minimalism:"#c3c9f0", Material:"#ffa940", Neumorphism:"#36d399",
    Luxury:"#f5a623", Cyberpunk:"#ff4ecd", none:"#555" };
  const grid = document.getElementById("dsGrid");
  Object.entries(dsMap).sort((a,b) => (b[1].pass+b[1].fail) - (a[1].pass+a[1].fail)).forEach(([ds, d]) => {
    const total = d.pass + d.fail;
    const pct   = Math.round(d.pass / total * 100);
    const fillColor = d.fail > 0 ? (pct < 80 ? "#ff6b6b" : "#ffa940") : "#36d399";
    const cell = document.createElement("div");
    cell.className = "ds-cell" + (d.fail > 0 ? " has-fail" : "");
    cell.innerHTML = \`
      <div class="ds-name" style="color:\${dsColors[ds]||"#ccc"}">\${ds}</div>
      <div class="ds-stats">\${d.pass} 通过 · \${d.fail} 失败 · \${pct}%</div>
      <div class="ds-mini-bar"><div class="ds-mini-fill" style="width:\${pct}%;background:\${fillColor}"></div></div>\`;
    grid.appendChild(cell);
  });
})();

// ─── L1 bars ──────────────────────────────────────────────────────────────────
(function(){
  const byL1 = {};
  SCORED.forEach(q => {
    if (!byL1[q.l1_scene]) byL1[q.l1_scene] = { pass:0, fail:0 };
    q.quality_pass ? byL1[q.l1_scene].pass++ : byL1[q.l1_scene].fail++;
  });
  const list  = document.getElementById("l1List");
  const maxN  = Math.max(...Object.values(byL1).map(d => d.pass+d.fail));
  Object.entries(byL1).sort((a,b)=>(b[1].pass+b[1].fail)-(a[1].pass+a[1].fail)).forEach(([l1, d]) => {
    const pPct = d.pass/maxN*100, fPct = d.fail/maxN*100;
    const row = document.createElement("div");
    row.className = "l1-row";
    row.innerHTML = \`
      <div class="l1-name">\${l1}</div>
      <div class="l1-bar-wrap">
        <div class="l1-bar-pass" style="width:\${pPct}%" title="\${d.pass}通过"></div>
        <div class="l1-bar-fail" style="width:\${fPct}%" title="\${d.fail}失败"></div>
      </div>
      <div class="l1-nums">\${d.pass}✓ \${d.fail>0?"<span style='color:var(--fail)'>"+d.fail+"✗</span>":""}</div>\`;
    list.appendChild(row);
  });
})();
</script>
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    console.error("Usage: node scripts/generate-analysis-report.js --input <scored.jsonl> [--output <report.html>] [--title <title>] [--meta <meta>]");
    process.exit(1);
  }

  const inputPath  = path.resolve(args.input);
  const outputPath = path.resolve(
    args.output || inputPath.replace(/\.jsonl$/, "_report.html").replace("scored_queries", "analysis_report")
  );

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const raw    = fs.readFileSync(inputPath, "utf8").trim().split("\n").filter(Boolean);
  const scored = raw.map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { console.warn(`  ⚠ line ${i+1} parse error: ${e.message}`); return null; }
  }).filter(Boolean);

  console.log(`Loaded ${scored.length} records from ${inputPath}`);

  const stats = computeStats(scored);
  console.log(`Stats: total=${stats.total} pass=${stats.pass} fail=${stats.fail} passRate=${stats.passRate}% avg=${stats.avgScore}`);

  const batchName = path.basename(path.dirname(inputPath));
  const html = buildHTML(scored, stats, {
    title: args.title || `${batchName} · 质量分析报告`,
    meta:  args.meta  || `${stats.total} 条 · claude-cli transport · packy-cc gateway`,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`Report written: ${outputPath}`);
}

main();
