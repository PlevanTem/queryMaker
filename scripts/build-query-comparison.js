#!/usr/bin/env node
// scripts/build-query-comparison.js
//
// Render a side-by-side HTML comparison from N batch runs (each must have a JSONL
// produced by scripts/batch-generate-queries.js or a compatible generator).
//
// Usage A (by directory — easiest):
//   node scripts/build-query-comparison.js \
//        --run-dir data/output/runs/sample5_baseline \
//        --run-dir data/output/runs/sample5_fewshot \
//        --output  data/output/query_comparison.html
//
// Usage B (precise label/path/color/sub via pipe-separated specs):
//   node scripts/build-query-comparison.js \
//        --runs "label=① 模板|path=data/output/sample5/raw_queries.jsonl|color=#9aa4b2" \
//               "label=② LLM|path=data/output/sample5_cli/raw_queries.jsonl|color=#3b82f6" \
//        --output data/output/query_comparison.html
//
// Other flags:
//   --output <html>   Output HTML path (default data/output/query_comparison.html)
//   --title  <str>    Page title

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { COMPLEXITY_LEVELS, escapeHtml, readJsonl } = require("../mvp/query_factory_v2");
const { wordCount } = require("./lib/llm-batch");

const DEFAULT_COLORS = ["#9aa4b2", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function parseArgsMulti(argv) {
  const out = { runs: [], runDirs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--runs") {
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) out.runs.push(argv[++i]);
    } else if (t === "--run-dir") {
      const v = argv[++i];
      if (v) out.runDirs.push(v);
    } else if (t.startsWith("--")) {
      const k = t.slice(2);
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        out[k] = true;
      } else {
        out[k] = v;
        i += 1;
      }
    }
  }
  return out;
}

function parseRunSpec(spec, idx) {
  const obj = { color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] };
  for (const part of spec.split("|")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    obj[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  if (!obj.path) throw new Error(`run spec missing path=...: ${spec}`);
  if (!obj.label) obj.label = `Run ${idx + 1}`;
  if (!obj.sub) obj.sub = "";
  return obj;
}

function inferRunFromDir(dir, idx) {
  const preferred = path.join(dir, "raw_queries.jsonl");
  if (fs.existsSync(preferred)) {
    return { label: path.basename(dir), path: preferred, sub: "", color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] };
  }
  const list = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  if (!list.length) throw new Error(`run-dir ${dir} contains no .jsonl files`);
  return { label: path.basename(dir), path: path.join(dir, list[0]), sub: "", color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] };
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function renderQueryText(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .split(/\n/).map((line) => line || "&nbsp;").join("<br/>");
}

function leadFingerprint(s) {
  return String(s || "").trim().split(/[.!?\n]/)[0].slice(0, 60).toLowerCase();
}

function buildStatsForSet(rows) {
  const stat = {};
  for (const c of COMPLEXITY_LEVELS) {
    const rs = rows.filter((r) => r.target_complexity === c);
    const ws = rs.map((r) => wordCount(r.query_text));
    stat[c] = { n: rs.length, avg: avg(ws), min: rs.length ? Math.min(...ws) : 0, max: rs.length ? Math.max(...ws) : 0 };
  }
  stat.all = { n: rows.length, avg: avg(rows.map((r) => wordCount(r.query_text))) };
  const leads = rows.map((r) => leadFingerprint(r.query_text));
  stat.leadDiversity = { unique: new Set(leads).size, total: leads.length };
  stat.persona_llm_ok = rows.filter((r) => r.persona_source === "llm_persona_synthesis").length;
  return stat;
}

function renderStatsTable(datasets, stats) {
  const head = `<tr><th>complexity</th>${datasets.map((ds) =>
    `<th style="color:${ds.color}">${escapeHtml(ds.label)}<br/><span class="hint">${escapeHtml(ds.sub || "")}</span></th>`,
  ).join("")}</tr>`;
  const compRows = COMPLEXITY_LEVELS.map((c) => {
    const cells = datasets.map((ds) => {
      const v = stats[ds.key][c];
      return `<td>avg <b>${v.avg.toFixed(0)}</b>w &nbsp;<span class="hint">[${v.min}–${v.max}]&nbsp;n=${v.n}</span></td>`;
    }).join("");
    return `<tr><td><span class="badge ${c}">${c}</span></td>${cells}</tr>`;
  }).join("");
  const totalRow = `<tr><td><b>整体</b></td>${datasets.map((ds) => {
    const a = stats[ds.key].all;
    return `<td>avg <b>${a.avg.toFixed(0)}</b>w &nbsp;<span class="hint">n=${a.n}</span></td>`;
  }).join("")}</tr>`;
  const leadRow = `<tr><td>不同 query 首句指纹</td>${datasets.map((ds) => {
    const d = stats[ds.key].leadDiversity;
    const ratio = d.total ? (d.unique / d.total * 100).toFixed(0) : 0;
    return `<td><b>${d.unique}/${d.total}</b> 唯一 <span class="hint">(${ratio}%)</span></td>`;
  }).join("")}</tr>`;
  const personaRow = `<tr><td>persona JSON 解析成功</td>${datasets.map((ds) =>
    `<td><b>${stats[ds.key].persona_llm_ok}</b>/${stats[ds.key].all.n}</td>`,
  ).join("")}</tr>`;
  return `<table class="stats"><thead>${head}</thead><tbody>${compRows}${totalRow}${leadRow}${personaRow}</tbody></table>`;
}

function renderCard(id, datasets, byId) {
  const head = datasets.map((_, i) => byId[i][id]).find(Boolean);
  if (!head) return "";
  const c = head.target_complexity;
  const cols = datasets.map((ds, i) => {
    const r = byId[i][id];
    if (!r) return `<div class="col missing"><div class="col-h" style="--accent:${ds.color}"><div class="col-h-title">${escapeHtml(ds.label)}</div></div><div class="col-body"><em>(missing)</em></div></div>`;
    const personaIcon =
      r.persona_source === "llm_persona_synthesis" ? `<span class="ok" title="LLM persona JSON 解析成功">✅</span>`
      : r.persona_source === "deterministic_persona_fallback" ? `<span class="warn" title="模板生成 persona">📐</span>`
      : `<span class="warn" title="${escapeHtml(r.persona_source || "")}">⚠️</span>`;
    const w = wordCount(r.query_text);
    const desc = r.persona_spec && r.persona_spec.persona_description ? r.persona_spec.persona_description : "";
    return `<div class="col">
      <div class="col-h" style="--accent:${ds.color}">
        <div class="col-h-title">${escapeHtml(ds.label)}</div>
        <div class="col-h-meta"><span class="wc">${w}w</span> ${personaIcon}</div>
      </div>
      <div class="col-body">
        <div class="persona">
          <div class="persona-title">${escapeHtml(r.persona_title || "")}</div>
          ${desc ? `<div class="persona-desc">${escapeHtml(desc)}</div>` : ""}
        </div>
        <div class="query">${renderQueryText(r.query_text)}</div>
      </div>
    </div>`;
  }).join("");
  return `<section class="task" data-complexity="${c}">
    <header class="task-h">
      <div class="task-id">${escapeHtml(head.id)}</div>
      <div class="task-meta"><span class="badge ${c}">${c}</span>
        <span class="scene">${escapeHtml(head.l1_scene)} / ${escapeHtml(head.l2_scene_label)}</span>
        <span class="hint">app=${escapeHtml(head.application_type || "")} · product=${escapeHtml(head.product_type || "")}</span>
      </div>
    </header>
    <div class="cols" style="grid-template-columns:repeat(${datasets.length},1fr)">${cols}</div>
  </section>`;
}

function buildAutoSummary(datasets, stats) {
  const head = datasets.map((ds) => `<th style="color:${ds.color}">${escapeHtml(ds.label)}</th>`).join("");
  const rows = COMPLEXITY_LEVELS.map((c) => {
    const cells = datasets.map((ds) => `${stats[ds.key][c].avg.toFixed(0)}w`).map((x) => `<td>${x}</td>`).join("");
    return `<tr><td><span class="badge ${c}">${c}</span></td>${cells}</tr>`;
  }).join("");
  // Score = (complex - vague) / medium; larger is better separation across complexity levels.
  const scores = datasets.map((ds) => {
    const v = stats[ds.key].vague.avg;
    const m = stats[ds.key].medium.avg;
    const x = stats[ds.key].complex.avg;
    return m > 0 ? +((x - v) / m).toFixed(2) : 0;
  });
  const bestIdx = scores.indexOf(Math.max(...scores));
  const scoreLine = datasets.map((ds, i) => `<b style="color:${ds.color}">${escapeHtml(ds.label)} = ${scores[i]}</b>`).join(" · ");
  const bestNote = datasets.length > 1 ? ` → 当前最优：<b style="color:${datasets[bestIdx].color}">${escapeHtml(datasets[bestIdx].label)}</b>` : "";
  return `
<h3>跨复杂度梯度（avg words）</h3>
<table class="judge"><thead><tr><th>complexity</th>${head}</tr></thead><tbody>${rows}</tbody></table>
<p class="hint">区分度评分（complex 与 vague 的相对距离 ÷ medium 长度，越大越好）：${scoreLine}${bestNote}</p>`;
}

(function main() {
  const args = parseArgsMulti(process.argv.slice(2));

  const specs = [];
  args.runs.forEach((s) => specs.push(parseRunSpec(s, specs.length)));
  args.runDirs.forEach((d) => specs.push(inferRunFromDir(path.resolve(ROOT, d), specs.length)));

  if (!specs.length) {
    console.error("[FATAL] At least one --runs or --run-dir is required. See header for examples.");
    process.exit(2);
  }

  const datasets = specs.map((s, i) => ({
    key: `set_${i}`,
    label: s.label,
    sub: s.sub,
    color: s.color,
    rows: readJsonl(path.resolve(ROOT, s.path)),
    path: s.path,
  }));

  const stats = {};
  datasets.forEach((d) => { stats[d.key] = buildStatsForSet(d.rows); });

  // Use the largest dataset's order as the canonical task ordering.
  const longest = datasets.reduce((a, b) => (a.rows.length >= b.rows.length ? a : b));
  const orderIds = longest.rows.map((r) => r.id);
  const byId = datasets.map((d) => Object.fromEntries(d.rows.map((r) => [r.id, r])));

  const title = args.title || "Query 生成对比";
  const outputPath = path.resolve(ROOT, args.output || "data/output/query_comparison.html");

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;margin:0;background:#f5f7fa;color:#1f2937;line-height:1.55}
  header.page{background:#fff;border-bottom:1px solid #e5e7eb;padding:24px 36px}
  header.page h1{margin:0 0 6px;font-size:20px}
  header.page .sub{color:#6b7280;font-size:13px}
  main{padding:22px 36px 80px;max-width:1700px;margin:0 auto}
  h2{margin-top:32px;border-left:4px solid #3b82f6;padding-left:10px;font-size:18px}
  h3{font-size:14px;margin-top:20px}
  table.stats,table.judge{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  table.stats th,table.stats td,table.judge th,table.judge td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top}
  table.stats th,table.judge th{background:#f9fafb;text-align:left;font-weight:600}
  table.stats td:first-child,table.judge td:first-child{width:200px;font-weight:500;background:#fafbfc}
  .hint{color:#9ca3af;font-size:12px;font-weight:400}
  .badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;letter-spacing:.3px;text-transform:uppercase}
  .badge.vague{background:#fef3c7;color:#92400e}
  .badge.medium{background:#dbeafe;color:#1e40af}
  .badge.complex{background:#fce7f3;color:#9d174d}
  .ok{color:#10b981}.warn{color:#f59e0b}
  section.task{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:20px;overflow:hidden}
  .task-h{padding:12px 16px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .task-id{font-family:ui-monospace,monospace;font-size:13px;color:#4b5563;font-weight:600}
  .task-meta{display:flex;align-items:center;gap:10px;font-size:13px}
  .task-meta .scene{color:#111827;font-weight:500}
  .cols{display:grid;gap:0}
  .col{border-right:1px solid #f3f4f6;min-width:0}
  .col:last-child{border-right:none}
  .col-h{padding:8px 14px;border-bottom:2px solid var(--accent);display:flex;justify-content:space-between;align-items:center;background:#fafbfc;font-size:12px}
  .col-h-title{font-weight:600;color:var(--accent)}
  .col-h-meta .wc{background:#f3f4f6;padding:1px 6px;border-radius:4px;font-family:ui-monospace,monospace;font-size:11px;color:#4b5563;margin-right:4px}
  .col-body{padding:14px;font-size:13.5px}
  .persona{font-size:12px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px dashed #e5e7eb}
  .persona-title{font-weight:600;color:#374151}
  .persona-desc{color:#6b7280;margin-top:2px;line-height:1.4}
  .query{line-height:1.65;color:#1f2937;word-break:break-word}
  .query strong{color:#111827}
  .col.missing{background:#fafafa;color:#9ca3af}
  .legend{display:flex;gap:18px;margin:12px 0 0;font-size:12px;color:#6b7280;flex-wrap:wrap}
  .legend>div{display:flex;align-items:center;gap:6px}
  .legend .swatch{width:12px;height:12px;border-radius:3px}
  .controls{margin:14px 0 6px;font-size:13px}
  .controls button{background:#fff;border:1px solid #d1d5db;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;margin-right:6px}
  .controls button.active{background:#1f2937;color:#fff;border-color:#1f2937}
  @media (max-width:1100px){.cols{grid-template-columns:1fr !important}.col{border-right:none;border-bottom:1px solid #f3f4f6}}
</style></head><body>
<header class="page">
  <h1>${escapeHtml(title)}</h1>
  <div class="sub">生成时间：${new Date().toISOString()} · 共 ${datasets.length} 组数据 · 任务对齐 ${orderIds.length} 条</div>
  <div class="legend">
    ${datasets.map((ds) => `<div><span class="swatch" style="background:${ds.color}"></span><b>${escapeHtml(ds.label)}</b> <span class="hint">— ${escapeHtml(ds.path)}</span></div>`).join("")}
  </div>
</header>
<main>

<h2>📊 量化指标</h2>
${renderStatsTable(datasets, stats)}

<h2>🧪 自动评估</h2>
${buildAutoSummary(datasets, stats)}

<h2>🔍 逐条对比</h2>
<div class="controls">
  <span style="color:#6b7280">筛选复杂度：</span>
  <button class="active" data-filter="all">全部</button>
  ${COMPLEXITY_LEVELS.map((c) => `<button data-filter="${c}">${c}</button>`).join("")}
</div>
${orderIds.map((id) => renderCard(id, datasets, byId)).join("\n")}

</main>
<script>
  document.querySelectorAll('.controls button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.controls button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const f=btn.dataset.filter;
      document.querySelectorAll('section.task').forEach(s=>{ s.style.display=(f==='all'||s.dataset.complexity===f)?'':'none'; });
    });
  });
</script>
</body></html>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  console.log("写出 →", path.relative(ROOT, outputPath), `(${(html.length / 1024).toFixed(1)} KB)`);
  console.log("各组平均字数：");
  datasets.forEach((d) => {
    const s = stats[d.key];
    console.log(`  ${d.label.padEnd(24)} all=${s.all.avg.toFixed(0)}w  vague=${s.vague.avg.toFixed(0)}w  medium=${s.medium.avg.toFixed(0)}w  complex=${s.complex.avg.toFixed(0)}w  (n=${s.all.n})`);
  });
})();
