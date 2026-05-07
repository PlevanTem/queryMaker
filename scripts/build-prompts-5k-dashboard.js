const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function topEntries(obj, limit = 12) {
  return Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function buildBars(title, entries) {
  if (!entries.length) {
    return `<section class="card"><h3>${escapeHtml(title)}</h3><div class="empty">暂无数据</div></section>`;
  }
  const max = entries[0][1] || 1;
  const rows = entries
    .map(
      ([label, value]) => `
        <div class="bar-row">
          <div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (value / max) * 100)}%"></div></div>
          <div class="bar-value">${value}</div>
        </div>`,
    )
    .join("");
  return `<section class="card"><h3>${escapeHtml(title)}</h3>${rows}</section>`;
}

function buildHtml({ summary, rows }) {
  const payload = JSON.stringify(rows);
  const chartSections = [
    buildBars("按一级场景 Top 12", topEntries(summary.by_l1_scene, 12)),
    buildBars("按二级场景 Top 12", topEntries(summary.by_l2_scene_label, 12)),
    buildBars("按产品形态分布", topEntries(summary.by_product_type, 12)),
    buildBars("按复杂度分布", topEntries(summary.by_target_complexity, 12)),
    buildBars("按风格分布", topEntries(summary.by_design_style, 12)),
    buildBars("按 L3 来源分布", topEntries(summary.by_application_type_source, 12)),
  ].join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>5K Prompts Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f5f7fb; color: #1b2430; }
    .page { max-width: 1600px; margin: 0 auto; padding: 24px; }
    .hero { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 20px; }
    .metric, .card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 6px rgba(12, 20, 33, 0.08); }
    .metric .label { color: #607086; font-size: 13px; }
    .metric .value { font-size: 28px; font-weight: 700; margin-top: 8px; }
    .subtle { color: #607086; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
    .filters { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
    select, input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d7deea; border-radius: 8px; background: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #eef2f7; text-align: left; vertical-align: top; }
    th { background: #f8fafc; color: #4e5d6c; position: sticky; top: 0; }
    .table-wrap { max-height: 70vh; overflow: auto; border-radius: 12px; }
    .bar-row { display: grid; grid-template-columns: 180px 1fr 52px; gap: 12px; align-items: center; margin: 10px 0; }
    .bar-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { background: #edf2f7; height: 10px; border-radius: 999px; overflow: hidden; }
    .bar-fill { background: linear-gradient(90deg, #4f46e5, #06b6d4); height: 100%; border-radius: 999px; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef4ff; color: #274690; font-size: 12px; margin-right: 6px; }
    .tag.alt { background: #ecfeff; color: #155e75; }
    .empty { color: #7a8797; }
    .hint { margin-bottom: 16px; }
    @media (max-width: 1200px) { .hero { grid-template-columns: repeat(2, 1fr); } .grid, .filters { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 720px) { .hero, .grid, .filters { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="page">
    <h1>5K Prompt Dashboard</h1>
    <div class="hint subtle">当前页面展示的是刚生成的扩展数据集，不是旧的 v2 dashboard。</div>
    <div class="hero">
      <div class="metric"><div class="label">总 Prompt 数</div><div class="value">${summary.total_prompts}</div></div>
      <div class="metric"><div class="label">唯一 Prompt 数</div><div class="value">${summary.unique_prompts}</div></div>
      <div class="metric"><div class="label">唯一率</div><div class="value">${(summary.unique_prompt_ratio * 100).toFixed(2)}%</div></div>
      <div class="metric"><div class="label">扩展后 L3 数</div><div class="value">${summary.expanded_l3_application_types}</div></div>
      <div class="metric"><div class="label">原始目标总数</div><div class="value">${summary.original_target_sum}</div></div>
    </div>
    <div class="grid">
      ${chartSections}
    </div>
    <section class="card">
      <h3>过滤器</h3>
      <div class="filters">
        <select id="filterL1"><option value="">全部一级场景</option></select>
        <select id="filterL2"><option value="">全部二级场景</option></select>
        <select id="filterApp"><option value="">全部 application_type</option></select>
        <select id="filterProduct"><option value="">全部产品形态</option></select>
        <select id="filterComplexity"><option value="">全部复杂度</option></select>
        <select id="filterSource"><option value="">全部 L3 来源</option></select>
      </div>
      <div class="filters" style="grid-template-columns: 2fr 1fr;">
        <input id="searchText" placeholder="搜索 query 文本、场景或 application_type">
        <select id="pageSize">
          <option value="50">每页 50 条</option>
          <option value="100" selected>每页 100 条</option>
          <option value="200">每页 200 条</option>
        </select>
      </div>
      <div class="subtle" id="resultMeta"></div>
    </section>
    <section class="card">
      <h3>Prompt 列表</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>场景</th>
              <th>L3 / 来源</th>
              <th>形态 / 复杂度 / 风格</th>
              <th>Prompt</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>
  </div>
  <script>
    const rows = ${payload};
    const filters = {
      l1: document.getElementById("filterL1"),
      l2: document.getElementById("filterL2"),
      app: document.getElementById("filterApp"),
      product: document.getElementById("filterProduct"),
      complexity: document.getElementById("filterComplexity"),
      source: document.getElementById("filterSource"),
      text: document.getElementById("searchText"),
      pageSize: document.getElementById("pageSize"),
    };
    const rowsEl = document.getElementById("rows");
    const metaEl = document.getElementById("resultMeta");

    function fillOptions(el, values) {
      values.sort((a, b) => String(a).localeCompare(String(b), "zh-CN")).forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        el.appendChild(option);
      });
    }

    fillOptions(filters.l1, [...new Set(rows.map((row) => row.l1_scene))]);
    fillOptions(filters.l2, [...new Set(rows.map((row) => row.l2_scene_label))]);
    fillOptions(filters.app, [...new Set(rows.map((row) => row.application_type))]);
    fillOptions(filters.product, [...new Set(rows.map((row) => row.product_type))]);
    fillOptions(filters.complexity, [...new Set(rows.map((row) => row.target_complexity))]);
    fillOptions(filters.source, [...new Set(rows.map((row) => row.application_type_source))]);

    function tag(text, alt) {
      return '<span class="tag' + (alt ? ' alt' : '') + '">' + text + '</span>';
    }

    function render() {
      const search = filters.text.value.trim().toLowerCase();
      const limit = Number(filters.pageSize.value || 100);
      const filtered = rows.filter((row) => {
        if (filters.l1.value && row.l1_scene !== filters.l1.value) return false;
        if (filters.l2.value && row.l2_scene_label !== filters.l2.value) return false;
        if (filters.app.value && row.application_type !== filters.app.value) return false;
        if (filters.product.value && row.product_type !== filters.product.value) return false;
        if (filters.complexity.value && row.target_complexity !== filters.complexity.value) return false;
        if (filters.source.value && row.application_type_source !== filters.source.value) return false;
        if (!search) return true;
        const haystack = [
          row.id,
          row.l1_scene,
          row.l2_scene_label,
          row.application_type,
          row.application_type_source,
          row.product_type,
          row.target_complexity,
          row.design_style || "",
          row.query_text,
        ].join(" ").toLowerCase();
        return haystack.includes(search);
      });

      const page = filtered.slice(0, limit);
      rowsEl.innerHTML = page.map((row) => \`
        <tr>
          <td>\${row.id}</td>
          <td>
            <div><strong>\${row.l1_scene}</strong></div>
            <div class="subtle">\${row.l2_scene_label}</div>
          </td>
          <td>
            <div>\${tag(row.application_type)}</div>
            <div style="margin-top:6px" class="subtle">\${row.application_type_source}</div>
          </td>
          <td>
            <div>\${tag(row.product_type, true)} \${tag(row.target_complexity)}</div>
            <div style="margin-top:6px" class="subtle">\${row.design_style || "未指定"}</div>
          </td>
          <td>\${row.query_text}</td>
        </tr>\`
      ).join("");

      metaEl.textContent = \`当前命中 \${filtered.length} 条，已展示前 \${page.length} 条\`;
    }

    Object.values(filters).forEach((el) => {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });

    render();
  </script>
</body>
</html>`;
}

function main() {
  const rootDir = process.cwd();
  const summaryPath = path.resolve(rootDir, "data/output/prompts_5k.extended.v1.summary.json");
  const jsonlPath = path.resolve(rootDir, "data/output/prompts_5k.extended.v1.jsonl");
  const outputDir = path.resolve(rootDir, "data/reports_5k");
  const outputPath = path.join(outputDir, "dashboard.html");

  const summary = readJson(summaryPath);
  const rows = readJsonl(jsonlPath);
  ensureDir(outputDir);
  fs.writeFileSync(outputPath, buildHtml({ summary, rows }), "utf8");
  console.log(outputPath);
}

main();
