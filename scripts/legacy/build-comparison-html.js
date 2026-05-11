// 把 persona-fallback / persona-llm / persona-llm-few-shot 三种生成模式的结果合成一份对比 HTML
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const SOURCES = [
  {
    key: "fallback",
    label: "① 模板 fallback",
    sub: "persona-fallback（不调 LLM）",
    color: "#9aa4b2",
    path: path.join(ROOT, "data/output/sample5/raw_queries.sample5.jsonl"),
    desc: "完全确定性模板：persona 用 hash 选 archetype，query 用 if/else 套句模板。同 complexity 跨场景文案高度雷同。",
  },
  {
    key: "llm",
    label: "② LLM（无 few-shot）",
    sub: "persona-llm baseline",
    color: "#3b82f6",
    path: path.join(ROOT, "data/output/sample5_cli/raw_queries.sample5.cli.jsonl"),
    desc: "走 Claude Code CLI 子进程，prompt 仅包含场景/persona/复杂度规格条目，没有具体长度示例。",
  },
  {
    key: "fewshot",
    label: "③ LLM + few-shot",
    sub: "persona-llm with vague/medium/complex 三段示例",
    color: "#10b981",
    path: path.join(ROOT, "data/output/sample5_cli_fewshot/raw_queries.sample5.cli.jsonl"),
    desc: "在②基础上把 prompts/few-shot-query-examples.md 的三段范例注入 query prompt，用真实长度/结构示例锚定输出。",
  },
];

function loadJsonl(p) {
  return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

const datasets = SOURCES.map((s) => ({ ...s, rows: loadJsonl(s.path) }));

// 用 ① 的顺序作为基准（plan 顺序）
const orderIds = datasets[0].rows.map((r) => r.id);
const byId = datasets.map((d) => Object.fromEntries(d.rows.map((r) => [r.id, r])));

function wc(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function renderQueryText(s) {
  // 保留换行 + 加粗 markdown 简化（**xxx** -> <strong>）
  const safe = escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return safe.split(/\n/).map((line) => line || "&nbsp;").join("<br/>");
}

// === 各模式按复杂度的字数统计 ===
const COMPLEXITIES = ["vague", "medium", "complex"];
const stats = {};
for (const ds of datasets) {
  stats[ds.key] = {};
  for (const c of COMPLEXITIES) {
    const rs = ds.rows.filter((r) => r.target_complexity === c);
    stats[ds.key][c] = {
      n: rs.length,
      avg: avg(rs.map((r) => wc(r.query_text))),
      min: rs.length ? Math.min(...rs.map((r) => wc(r.query_text))) : 0,
      max: rs.length ? Math.max(...rs.map((r) => wc(r.query_text))) : 0,
    };
  }
  stats[ds.key].all = {
    n: ds.rows.length,
    avg: avg(ds.rows.map((r) => wc(r.query_text))),
  };
}

// === 简易 lexical-diversity / 模板套用率 探针 ===
// 模式①里 vague/medium/complex 各有固定模板首句，统计三组共享首句的比例
function leadFingerprint(s) {
  return String(s || "").trim().split(/[.!?\n]/)[0].slice(0, 60).toLowerCase();
}
const leadDiv = {};
for (const ds of datasets) {
  const all = ds.rows.map((r) => leadFingerprint(r.query_text));
  leadDiv[ds.key] = {
    unique: new Set(all).size,
    total: all.length,
  };
}

// === 渲染 HTML ===
function renderStatsTable() {
  let html = `<table class="stats">
    <thead><tr>
      <th>complexity</th>
      ${SOURCES.map((s) => `<th style="color:${s.color}">${s.label}<br/><span class="hint">${s.sub}</span></th>`).join("")}
    </tr></thead><tbody>`;
  for (const c of COMPLEXITIES) {
    html += `<tr><td><span class="badge ${c}">${c}</span></td>`;
    for (const ds of datasets) {
      const v = stats[ds.key][c];
      html += `<td>avg <b>${v.avg.toFixed(0)}</b>w &nbsp;<span class="hint">[${v.min}–${v.max}]&nbsp;n=${v.n}</span></td>`;
    }
    html += `</tr>`;
  }
  html += `<tr><td><b>整体</b></td>`;
  for (const ds of datasets) {
    const a = stats[ds.key].all;
    html += `<td>avg <b>${a.avg.toFixed(0)}</b>w &nbsp;<span class="hint">n=${a.n}</span></td>`;
  }
  html += `</tr>`;
  html += `<tr><td>不同 query 首句指纹</td>`;
  for (const ds of datasets) {
    const d = leadDiv[ds.key];
    const ratio = (d.unique / d.total * 100).toFixed(0);
    html += `<td><b>${d.unique}/${d.total}</b> 唯一 <span class="hint">(${ratio}%)</span></td>`;
  }
  html += `</tr></tbody></table>`;
  return html;
}

function renderCard(id) {
  const sample = byId.find((b) => b[id]); // 找有这条的第一组
  const head = byId[0][id] || byId[1][id] || byId[2][id];
  if (!head) return "";
  const c = head.target_complexity;
  const cardHtml = SOURCES.map((s, i) => {
    const r = byId[i][id];
    if (!r) return `<div class="col missing"><div class="col-h" style="--accent:${s.color}">${s.label}</div><div class="col-body"><em>(missing)</em></div></div>`;
    const personaIcon = r.persona_source === "llm_persona_synthesis" ? `<span class="ok" title="LLM persona JSON 解析成功">✅</span>` : (r.persona_source === "deterministic_persona_fallback" ? `<span class="warn" title="模板生成 persona">📐</span>` : `<span class="warn" title="${escapeHtml(r.persona_source)}">⚠️</span>`);
    const w = wc(r.query_text);
    return `<div class="col">
      <div class="col-h" style="--accent:${s.color}">
        <div class="col-h-title">${s.label}</div>
        <div class="col-h-meta"><span class="wc">${w}w</span> ${personaIcon}</div>
      </div>
      <div class="col-body">
        <div class="persona">
          <div class="persona-title">${escapeHtml(r.persona_title || "")}</div>
          ${r.persona_spec && r.persona_spec.persona_description ? `<div class="persona-desc">${escapeHtml(r.persona_spec.persona_description)}</div>` : ""}
        </div>
        <div class="query">${renderQueryText(r.query_text)}</div>
      </div>
    </div>`;
  }).join("");

  return `<section class="task" data-complexity="${c}">
    <header class="task-h">
      <div class="task-id">${head.id}</div>
      <div class="task-meta"><span class="badge ${c}">${c}</span>
        <span class="scene">${escapeHtml(head.l1_scene)} / ${escapeHtml(head.l2_scene_label)}</span>
        <span class="hint">app=${escapeHtml(head.application_type)} · product=${escapeHtml(head.product_type)}</span>
      </div>
    </header>
    <div class="cols">${cardHtml}</div>
  </section>`;
}

const summaryNarrative = `
<h3>评估总结</h3>
<table class="judge">
<thead><tr><th>评估维度</th><th>① 模板 fallback</th><th>② LLM baseline</th><th>③ LLM + few-shot</th></tr></thead>
<tbody>
<tr>
  <td><b>vague 是否真的"vague"</b><br/><span class="hint">本意是用户语焉不详，让系统多推理</span></td>
  <td>❌ 千篇一律的"I want a {product} for {app}. Keep it simple..."</td>
  <td>⚠️ 偏长（avg ~44w），常带情景铺垫和情绪修饰，更像 medium</td>
  <td>✅ 收敛到 1-2 句愿望（avg ~30w），最贴近示例 #1 的"一句话需求"</td>
</tr>
<tr>
  <td><b>medium filler / 废话</b><br/><span class="hint">是否聚焦、冗余多不多</span></td>
  <td>同句模板，无 filler 也无个性</td>
  <td>大量"honestly..."" lol""you know" 这种填充语，进入需求前往往绕一圈</td>
  <td>开门见山进入需求，过滤多余口头禅，结构更紧凑</td>
</tr>
<tr>
  <td><b>complex 结构化程度</b><br/><span class="hint">能不能像真实 PRD 那样分模块</span></td>
  <td>固定 5 点列表，没有真实需求点</td>
  <td>多为散文化分节，偶有 <code>**xxx**</code> 子标题但内部仍是大段叙述</td>
  <td>明显习得 few-shot complex 例子的"加粗节标题 + dash 子弹列项"模式，可读性强、可执行性高</td>
</tr>
<tr>
  <td><b>跨复杂度区分度</b><br/><span class="hint">三档之间是否拉得开</span></td>
  <td>三档差距明显但缺乏自然变化（全是模板）</td>
  <td>vague 和 medium 偏粘连：${stats.llm.vague.avg.toFixed(0)}w → ${stats.llm.medium.avg.toFixed(0)}w → ${stats.llm.complex.avg.toFixed(0)}w</td>
  <td>三档梯度更明显：${stats.fewshot.vague.avg.toFixed(0)}w → ${stats.fewshot.medium.avg.toFixed(0)}w → ${stats.fewshot.complex.avg.toFixed(0)}w</td>
</tr>
<tr>
  <td><b>persona 鲜活度</b><br/><span class="hint">是不是具体的人，不是空标签</span></td>
  <td>"X相关内容的真实使用者"等通用占位标签</td>
  <td>"利用碎片时间备考CPA的财务专员""业余跑团 GM"等具象身份</td>
  <td>同②，一致地具象（persona 提示词未改，差异不大）</td>
</tr>
<tr>
  <td><b>首句指纹多样性</b><br/><span class="hint">同模式下每条 query 起手是否各异</span></td>
  <td>${leadDiv.fallback.unique}/${leadDiv.fallback.total} 唯一</td>
  <td>${leadDiv.llm.unique}/${leadDiv.llm.total} 唯一</td>
  <td>${leadDiv.fewshot.unique}/${leadDiv.fewshot.total} 唯一</td>
</tr>
<tr>
  <td><b>失败/重试成本</b></td>
  <td>0 网络成本，秒级</td>
  <td>每条 ~30-60s，packy-cc 网关偶发 503</td>
  <td>同②；本次回填 3 条用了带退避重试的 fill-missing 才补齐</td>
</tr>
</tbody>
</table>

<h3>结论</h3>
<ol>
  <li><b>模板 fallback</b> 仅适合做 schema 验证 / 离线 smoke test，不可作为训练数据；多样性几乎为 0。</li>
  <li><b>LLM baseline</b> 已经能产出可用的 persona-driven query，但 vague 长度漂移到 medium 区间是核心问题。</li>
  <li><b>LLM + few-shot</b> 在 vague 收敛、complex 结构化、跨档差距三个核心指标上均显著优于 baseline，且 persona 鲜活度未受影响。<b>推荐作为后续大批量生成的默认方式</b>。</li>
  <li>下一步可在 persona prompt 也补充 few-shot（让 persona 描述更具象）；并把回填脚本里的"503/超时退避重试"逻辑下沉到 mvp/query_factory_v2.js 的 callAnthropicCompatibleMessages 主路径，使 5k/全量批跑能一次到位。</li>
</ol>`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>Query 生成对比报告 — 三种模式</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #f5f7fa; color: #1f2937; line-height: 1.55; }
  header.page { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 28px 40px; }
  header.page h1 { margin: 0 0 6px; font-size: 22px; }
  header.page .sub { color: #6b7280; font-size: 13px; }
  main { padding: 24px 40px 80px; max-width: 1600px; margin: 0 auto; }
  h2 { margin-top: 36px; border-left: 4px solid #3b82f6; padding-left: 10px; font-size: 18px; }
  h3 { font-size: 15px; margin-top: 24px; }
  table.stats, table.judge { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
  table.stats th, table.stats td, table.judge th, table.judge td { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  table.stats th { background: #f9fafb; text-align: left; font-weight: 600; }
  table.stats td:first-child { width: 220px; }
  table.judge th { background: #f9fafb; text-align: left; font-weight: 600; }
  table.judge td:first-child { width: 220px; font-weight: 500; background: #fafbfc; }
  .hint { color: #9ca3af; font-size: 12px; font-weight: 400; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase; }
  .badge.vague { background: #fef3c7; color: #92400e; }
  .badge.medium { background: #dbeafe; color: #1e40af; }
  .badge.complex { background: #fce7f3; color: #9d174d; }
  .ok { color: #10b981; }
  .warn { color: #f59e0b; }
  .err { color: #ef4444; }
  section.task { background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.05); margin-bottom: 22px; overflow: hidden; }
  .task-h { padding: 12px 16px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .task-id { font-family: ui-monospace, "SFMono-Regular", monospace; font-size: 13px; color: #4b5563; font-weight: 600; }
  .task-meta { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .task-meta .scene { color: #111827; font-weight: 500; }
  .cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
  .col { border-right: 1px solid #f3f4f6; min-width: 0; }
  .col:last-child { border-right: none; }
  .col-h { padding: 8px 14px; border-bottom: 2px solid var(--accent); display: flex; justify-content: space-between; align-items: center; background: #fafbfc; font-size: 12px; }
  .col-h-title { font-weight: 600; color: var(--accent); }
  .col-h-meta .wc { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 11px; color: #4b5563; margin-right: 4px; }
  .col-body { padding: 14px; font-size: 13.5px; }
  .persona { font-size: 12px; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px dashed #e5e7eb; }
  .persona-title { font-weight: 600; color: #374151; }
  .persona-desc { color: #6b7280; margin-top: 2px; line-height: 1.4; }
  .query { line-height: 1.65; color: #1f2937; word-break: break-word; }
  .query strong { color: #111827; }
  .col.missing { background: #fafafa; color: #9ca3af; }
  .legend { display: flex; gap: 18px; margin: 12px 0 0; font-size: 12px; color: #6b7280; flex-wrap: wrap; }
  .legend > div { display: flex; align-items: center; gap: 6px; }
  .legend .swatch { width: 12px; height: 12px; border-radius: 3px; }
  .controls { margin: 18px 0 6px; font-size: 13px; }
  .controls button { background: #fff; border: 1px solid #d1d5db; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-right: 6px; }
  .controls button.active { background: #1f2937; color: #fff; border-color: #1f2937; }
  @media (max-width: 1100px) {
    .cols { grid-template-columns: 1fr; }
    .col { border-right: none; border-bottom: 1px solid #f3f4f6; }
  }
</style>
</head>
<body>
<header class="page">
  <h1>Query 生成方式对比 — 模板 / LLM / LLM+few-shot</h1>
  <div class="sub">数据来自 <code>data/input/场景覆盖.xlsx</code> 随机抽样（seed=4073，5 个二级场景 × 3 复杂度 = 15 条任务）。模型：claude-sonnet-4-6（packy-cc 网关，通过本机 Claude Code CLI 子进程调用）。生成时间：${new Date().toISOString()}</div>
  <div class="legend">
    ${SOURCES.map((s) => `<div><span class="swatch" style="background:${s.color}"></span><b>${s.label}</b> — ${s.desc}</div>`).join("")}
  </div>
</header>
<main>

<h2>📊 量化指标</h2>
${renderStatsTable()}

<h2>🧪 评估总结</h2>
${summaryNarrative}

<h2>🔍 逐条对比（15 条 / 5 场景 × 3 复杂度）</h2>
<div class="controls">
  <span style="color:#6b7280">筛选复杂度：</span>
  <button class="active" data-filter="all">全部</button>
  <button data-filter="vague">vague</button>
  <button data-filter="medium">medium</button>
  <button data-filter="complex">complex</button>
</div>
${orderIds.map(renderCard).join("\n")}

</main>
<script>
  document.querySelectorAll('.controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.controls button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      document.querySelectorAll('section.task').forEach(s => {
        s.style.display = (f === 'all' || s.dataset.complexity === f) ? '' : 'none';
      });
    });
  });
</script>
</body>
</html>
`;

const outPath = path.join(ROOT, "data/output/query_comparison.html");
fs.writeFileSync(outPath, html, "utf8");
console.log("写出 →", path.relative(ROOT, outPath), `(${(html.length / 1024).toFixed(1)} KB)`);
console.log();
console.log("=== 各模式平均字数 ===");
for (const ds of datasets) {
  console.log(`${ds.label.padEnd(18)} 全量 avg=${stats[ds.key].all.avg.toFixed(0)}w  | vague=${stats[ds.key].vague.avg.toFixed(0)}w  medium=${stats[ds.key].medium.avg.toFixed(0)}w  complex=${stats[ds.key].complex.avg.toFixed(0)}w`);
}
