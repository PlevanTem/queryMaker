/**
 * build-corpus-usage-dashboard.js
 *
 * Aggregates every corpus-direct production run (v7–v13) and the corpus topic
 * pools, then emits a single self-contained HTML dashboard analysing:
 *   1. Corpus topic consumption — how much of the topic pool has been used,
 *      per-L2 depletion, reuse pressure, hot topics.
 *   2. Query distribution — by run / platform / L1 scene / complexity / length.
 *   3. Persona distribution — the 5 corpus personas across platforms & scenes.
 *
 * Usage: node scripts/build-corpus-usage-dashboard.js
 * Output: data/output/corpus_usage_dashboard.html
 */

const fs = require("fs");
const path = require("path");
const { RUN_DIRS, loadRuns } = require("./lib/corpus-runs");

const ROOT = process.cwd();

// ── load corpus pools ────────────────────────────────────────────────────────
function loadPool(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const byL2 = new Map();      // l2key -> Set(topic)
  const allTopics = new Set();
  for (const [l2, val] of Object.entries(raw)) {
    const topics = Array.isArray(val.topics) ? val.topics : [];
    const set = new Set(topics);
    byL2.set(l2, set);
    topics.forEach((t) => allTopics.add(t));
  }
  return { byL2, allTopics };
}

// ── aggregation ──────────────────────────────────────────────────────────────
function inc(map, key, by = 1) { map.set(key, (map.get(key) || 0) + by); }

function aggregate(rows, pools) {
  const platforms = ["web", "mobile"];
  const out = { platforms: {}, byVersion: new Map(), personaByL1: new Map() };

  for (const p of platforms) {
    out.platforms[p] = {
      total: 0,
      topicCount: new Map(),                 // topic -> uses
      l2Used: new Map(),                     // l2key -> Map(topic -> uses)
      l1Count: new Map(),
      complexity: new Map(),
      persona: new Map(),
      words: [],
    };
  }

  for (const r of rows) {
    const a = out.platforms[r.platform];
    if (!a) continue;
    a.total++;
    inc(a.topicCount, r.topic);
    if (!a.l2Used.has(r.l2key)) a.l2Used.set(r.l2key, new Map());
    inc(a.l2Used.get(r.l2key), r.topic);
    inc(a.l1Count, r.l1);
    inc(a.complexity, r.complexity);
    inc(a.persona, r.persona);
    a.words.push(r.words);

    inc(out.byVersion, `${r.version}|${r.platform}`);
    if (!out.personaByL1.has(r.persona)) out.personaByL1.set(r.persona, new Map());
    inc(out.personaByL1.get(r.persona), r.l1);
  }

  // consumption metrics per platform
  for (const p of platforms) {
    const a = out.platforms[p];
    const pool = p === "web" ? pools.web : pools.mobile;
    const poolTopics = pool.allTopics;

    let inPoolDistinct = 0, offPoolDistinct = 0, inPoolUses = 0, offPoolUses = 0;
    const reuse = { 1: 0, 2: 0, 3: 0, 4: 0, "5+": 0 };
    for (const [topic, n] of a.topicCount) {
      if (poolTopics.has(topic)) {
        inPoolDistinct++; inPoolUses += n;
        const b = n >= 5 ? "5+" : String(n);
        reuse[b]++;
      } else {
        offPoolDistinct++; offPoolUses += n;
      }
    }
    a.consumption = {
      poolSize: poolTopics.size,
      poolL2Count: pool.byL2.size,
      inPoolDistinct,
      offPoolDistinct,
      inPoolUses,
      offPoolUses,
      coverage: poolTopics.size ? inPoolDistinct / poolTopics.size : 0,
      reuse,
      avgReuse: inPoolDistinct ? inPoolUses / inPoolDistinct : 0,
    };

    // per-L2 depletion (pool L2 keys are authoritative)
    const perL2 = [];
    for (const [l2key, poolSet] of pool.byL2) {
      const used = a.l2Used.get(l2key) || new Map();
      let distinct = 0, uses = 0;
      for (const [topic, n] of used) {
        if (poolSet.has(topic)) { distinct++; uses += n; }
      }
      perL2.push({
        l2key,
        poolSize: poolSet.size,
        distinct,
        uses,
        coverage: poolSet.size ? distinct / poolSet.size : 0,
      });
    }
    perL2.sort((x, y) => y.uses - x.uses);
    a.perL2 = perL2;

    // top reused in-pool topics
    a.topReused = [...a.topicCount]
      .filter(([t]) => poolTopics.has(t))
      .sort((x, y) => y[1] - x[1])
      .slice(0, 20);
  }
  return out;
}

// ── HTML helpers ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x) => (x * 100).toFixed(1) + "%";

function barRows(entries, { max, color = "#38bdf8", fmt = (v) => v } = {}) {
  const mx = max || Math.max(1, ...entries.map((e) => e[1]));
  return entries.map(([label, val]) => `
    <div class="row">
      <span class="lbl" title="${esc(label)}">${esc(label)}</span>
      <div class="track"><div class="fill" style="width:${(val / mx * 100).toFixed(1)}%;background:${color}"></div></div>
      <span class="val">${fmt(val)}</span>
    </div>`).join("");
}

function wordHistogram(words) {
  const buckets = [
    ["<40", (w) => w < 40], ["40-49", (w) => w >= 40 && w < 50],
    ["50-59", (w) => w >= 50 && w < 60], ["60-69", (w) => w >= 60 && w < 70],
    ["70-79", (w) => w >= 70 && w < 80], ["80-89", (w) => w >= 80 && w < 90],
    ["90-99", (w) => w >= 90 && w < 100], ["100+", (w) => w >= 100],
  ];
  return buckets.map(([label, fn]) => [label, words.filter(fn).length]);
}

// ── render ───────────────────────────────────────────────────────────────────
function render(agg, pools) {
  const P = agg.platforms;
  const totalAll = P.web.total + P.mobile.total;
  const versions = ["v7", "v8", "v9", "v10", "v11", "v12", "v13", "v14"];

  const card = (label, value, sub = "") =>
    `<div class="card"><div class="card-v">${value}</div><div class="card-l">${esc(label)}</div>${sub ? `<div class="card-s">${esc(sub)}</div>` : ""}</div>`;

  // consumption section per platform
  function consumptionBlock(p) {
    const a = P[p];
    const c = a.consumption;
    const reuseEntries = Object.entries(c.reuse).map(([k, v]) => [k + "×", v]);
    const accent = p === "web" ? "#38bdf8" : "#a78bfa";
    const perL2Rows = a.perL2.map((r) => `
      <tr>
        <td class="l2">${esc(r.l2key)}</td>
        <td class="num">${r.poolSize}</td>
        <td class="num">${r.distinct}</td>
        <td>
          <div class="minibar"><div class="minibar-f" style="width:${(r.coverage * 100).toFixed(1)}%;background:${accent}"></div></div>
          <span class="minibar-t">${pct(r.coverage)}</span>
        </td>
        <td class="num">${r.uses}</td>
      </tr>`).join("");
    const topRows = a.topReused.map(([t, n], i) => `
      <tr><td class="num dim">${i + 1}</td><td class="topic">${esc(t)}</td><td class="num">${n}</td></tr>`).join("");
    return `
    <div class="platform-block">
      <h3><span class="pdot" style="background:${accent}"></span>${p.toUpperCase()} &mdash; ${a.total.toLocaleString()} queries</h3>
      <div class="cards">
        ${card("Pool topics", c.poolSize.toLocaleString(), `${c.poolL2Count} L2 scenes`)}
        ${card("Distinct used", c.inPoolDistinct.toLocaleString(), "in-pool")}
        ${card("Pool coverage", pct(c.coverage), `${c.inPoolDistinct}/${c.poolSize}`)}
        ${card("Avg reuse", c.avgReuse.toFixed(2) + "×", "per used topic")}
        ${card("Off-pool topics", c.offPoolDistinct.toLocaleString(), `${c.offPoolUses} uses (legacy)`)}
      </div>
      <div class="two-col">
        <div class="panel">
          <div class="panel-t">Reuse pressure &mdash; in-pool topics by times used</div>
          ${barRows(reuseEntries, { color: accent })}
        </div>
        <div class="panel">
          <div class="panel-t">Top 20 most-reused topics</div>
          <div class="scroll">
          <table class="tight"><thead><tr><th>#</th><th>Topic</th><th>Uses</th></tr></thead><tbody>${topRows}</tbody></table>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-t">Per-L2 consumption &mdash; pool depletion by scene (sorted by uses)</div>
        <div class="scroll tall">
        <table><thead><tr><th>L2 scene</th><th>Pool</th><th>Used</th><th>Coverage</th><th>Total uses</th></tr></thead>
        <tbody>${perL2Rows}</tbody></table>
        </div>
      </div>
    </div>`;
  }

  // query distribution
  const versionRows = versions.map((v) => {
    const w = agg.byVersion.get(`${v}|web`) || 0;
    const m = agg.byVersion.get(`${v}|mobile`) || 0;
    return [v, w + m, w, m];
  });
  const maxVer = Math.max(1, ...versionRows.map((r) => r[1]));
  const versionBars = versionRows.map(([v, t, w, m]) => `
    <div class="row">
      <span class="lbl">${v}</span>
      <div class="track stacked">
        <div class="fill" style="width:${(w / maxVer * 100).toFixed(1)}%;background:#38bdf8" title="web ${w}"></div>
        <div class="fill" style="width:${(m / maxVer * 100).toFixed(1)}%;background:#a78bfa" title="mobile ${m}"></div>
      </div>
      <span class="val">${t.toLocaleString()}</span>
    </div>`).join("");

  function l1Block(p) {
    const a = P[p];
    const accent = p === "web" ? "#38bdf8" : "#a78bfa";
    const entries = [...a.l1Count].sort((x, y) => y[1] - x[1]);
    return `<div class="panel"><div class="panel-t">${p.toUpperCase()} &mdash; queries by L1 scene</div>${barRows(entries, { color: accent })}</div>`;
  }
  function complexityBlock(p) {
    const a = P[p];
    const accent = p === "web" ? "#38bdf8" : "#a78bfa";
    const entries = [...a.complexity].sort((x, y) => y[1] - x[1]);
    return `<div class="panel"><div class="panel-t">${p.toUpperCase()} &mdash; target complexity</div>${barRows(entries, { color: accent })}</div>`;
  }
  function wordBlock(p) {
    const a = P[p];
    const accent = p === "web" ? "#38bdf8" : "#a78bfa";
    const hist = wordHistogram(a.words);
    const avg = a.words.length ? a.words.reduce((s, x) => s + x, 0) / a.words.length : 0;
    return `<div class="panel"><div class="panel-t">${p.toUpperCase()} &mdash; word-count distribution (avg ${avg.toFixed(0)})</div>${barRows(hist, { color: accent })}</div>`;
  }

  // persona
  const personaOrder = ["operator", "planner", "maker", "founder_like", "curator"];
  const personaColors = {
    operator: "#38bdf8", planner: "#a78bfa", maker: "#34d399",
    founder_like: "#fbbf24", curator: "#f472b6",
  };
  const personaTotals = personaOrder
    .map((id) => [id, (P.web.persona.get(id) || 0) + (P.mobile.persona.get(id) || 0)])
    .filter((e) => e[1] > 0);
  const allPersonas = [...new Set([...P.web.persona.keys(), ...P.mobile.persona.keys()])];
  const extraPersonas = allPersonas.filter((id) => !personaOrder.includes(id));
  for (const id of extraPersonas) {
    personaTotals.push([id, (P.web.persona.get(id) || 0) + (P.mobile.persona.get(id) || 0)]);
  }
  const personaTotalBars = personaTotals.map(([id, n]) => {
    const mx = Math.max(...personaTotals.map((e) => e[1]));
    return `<div class="row">
      <span class="lbl">${esc(id)}</span>
      <div class="track"><div class="fill" style="width:${(n / mx * 100).toFixed(1)}%;background:${personaColors[id] || "#94a3b8"}"></div></div>
      <span class="val">${n.toLocaleString()}</span>
    </div>`;
  }).join("");

  function personaPlatformBlock(p) {
    const a = P[p];
    const accent = p === "web" ? "#38bdf8" : "#a78bfa";
    const entries = personaTotals.map(([id]) => [id, a.persona.get(id) || 0]).filter((e) => e[1] > 0);
    return `<div class="panel"><div class="panel-t">${p.toUpperCase()} &mdash; persona mix</div>${barRows(entries, { color: accent })}</div>`;
  }

  // persona × L1 heat table
  const allL1 = [...new Set([...P.web.l1Count.keys(), ...P.mobile.l1Count.keys()])]
    .sort((x, y) => {
      const tx = (P.web.l1Count.get(x) || 0) + (P.mobile.l1Count.get(x) || 0);
      const ty = (P.web.l1Count.get(y) || 0) + (P.mobile.l1Count.get(y) || 0);
      return ty - tx;
    });
  const heatPersonas = personaTotals.map((e) => e[0]);
  let heatMax = 1;
  for (const l1 of allL1) for (const pid of heatPersonas) {
    heatMax = Math.max(heatMax, agg.personaByL1.get(pid)?.get(l1) || 0);
  }
  const heatHead = `<tr><th>L1 scene</th>${heatPersonas.map((p) => `<th class="num">${esc(p)}</th>`).join("")}</tr>`;
  const heatBody = allL1.map((l1) => {
    const cells = heatPersonas.map((pid) => {
      const n = agg.personaByL1.get(pid)?.get(l1) || 0;
      const a = n / heatMax;
      const bg = n === 0 ? "transparent" : `rgba(56,189,248,${(0.12 + a * 0.78).toFixed(3)})`;
      return `<td class="num heat" style="background:${bg}">${n || ""}</td>`;
    }).join("");
    return `<tr><td class="l2">${esc(l1)}</td>${cells}</tr>`;
  }).join("");

  const now = new Date().toISOString().replace("T", " ").slice(0, 16);

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Corpus Usage &amp; Distribution Dashboard</title>
<style>
  :root{--bg:#0f172a;--surface:#1e293b;--surface2:#293548;--border:#334155;--text:#f1f5f9;--muted:#94a3b8}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.55}
  h1{font-size:23px;font-weight:700;padding:26px 32px 2px}
  .subtitle{color:var(--muted);padding:0 32px 22px;font-size:13px}
  h2{font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;
     padding:26px 32px 14px;border-top:1px solid var(--border);margin-top:10px}
  h3{font-size:15px;font-weight:600;padding:18px 0 12px;display:flex;align-items:center;gap:9px}
  .pdot{width:11px;height:11px;border-radius:50%;display:inline-block}
  .wrap{padding:0 32px 36px}
  .cards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 18px;min-width:140px;flex:1}
  .card-v{font-size:24px;font-weight:700}
  .card-l{font-size:12px;color:var(--muted);margin-top:3px}
  .card-s{font-size:11px;color:var(--muted);opacity:.75;margin-top:2px}
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:14px}
  .panel-t{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media(max-width:880px){.two-col{grid-template-columns:1fr}}
  .row{display:flex;align-items:center;gap:10px;margin:5px 0}
  .lbl{width:170px;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}
  .track{flex:1;height:14px;background:var(--surface2);border-radius:4px;overflow:hidden;display:flex}
  .track.stacked{background:var(--surface2)}
  .fill{height:100%;border-radius:0}
  .val{width:62px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted);flex-shrink:0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:var(--surface2);padding:8px 10px;text-align:left;font-size:11px;color:var(--muted);
     text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0}
  td{padding:7px 10px;border-top:1px solid var(--border);vertical-align:middle}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  td.dim{color:var(--muted)}
  td.l2{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  td.topic{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  td.heat{text-align:center;font-variant-numeric:tabular-nums}
  .scroll{max-height:340px;overflow:auto;border-radius:8px;border:1px solid var(--border)}
  .scroll.tall{max-height:520px}
  /* keep the first (label) column readable when a wide table scrolls sideways */
  .scroll th:first-child,.scroll td:first-child{position:sticky;left:0}
  .scroll thead th:first-child{z-index:2}
  .scroll tbody td:first-child{background:var(--surface)}
  table.tight td,table.tight th{padding:6px 9px}
  .minibar{display:inline-block;width:74px;height:8px;background:var(--surface2);border-radius:3px;
     overflow:hidden;vertical-align:middle;margin-right:7px}
  .minibar-f{height:100%}
  .minibar-t{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
  .legend{display:flex;gap:16px;padding:0 32px 14px;font-size:12px;color:var(--muted)}
  .legend span{display:flex;align-items:center;gap:6px}
  .sw{width:11px;height:11px;border-radius:3px;display:inline-block}
  .footer{padding:18px 32px 30px;color:var(--muted);font-size:11px}
</style>
</head>
<body>
  <h1>Corpus Usage &amp; Distribution Dashboard</h1>
  <div class="subtitle">Corpus-direct production line &mdash; runs ${versions[0]} through ${versions[versions.length - 1]} &middot; ${totalAll.toLocaleString()} successful queries &middot; generated ${now}</div>
  <div class="legend">
    <span><i class="sw" style="background:#38bdf8"></i>web</span>
    <span><i class="sw" style="background:#a78bfa"></i>mobile</span>
  </div>

  <div class="wrap">
    <div class="cards">
      ${card("Total queries", totalAll.toLocaleString(), `${versions[0]}–${versions[versions.length - 1]}, errors excluded`)}
      ${card("Web queries", P.web.total.toLocaleString())}
      ${card("Mobile queries", P.mobile.total.toLocaleString())}
      ${card("Runs covered", String(RUN_DIRS.length), "smoke runs excluded")}
      ${card("Web pool coverage", pct(P.web.consumption.coverage), `${P.web.consumption.inPoolDistinct}/${P.web.consumption.poolSize} topics`)}
      ${card("Mobile pool coverage", pct(P.mobile.consumption.coverage), `${P.mobile.consumption.inPoolDistinct}/${P.mobile.consumption.poolSize} topics`)}
    </div>
  </div>

  <h2>1 · Corpus Topic Consumption</h2>
  <div class="wrap">
    ${consumptionBlock("web")}
    ${consumptionBlock("mobile")}
  </div>

  <h2>2 · Query Distribution</h2>
  <div class="wrap">
    <div class="panel">
      <div class="panel-t">Queries per run (web + mobile stacked)</div>
      ${versionBars}
    </div>
    <div class="two-col">
      ${l1Block("web")}
      ${l1Block("mobile")}
    </div>
    <div class="two-col">
      ${complexityBlock("web")}
      ${complexityBlock("mobile")}
    </div>
    <div class="two-col">
      ${wordBlock("web")}
      ${wordBlock("mobile")}
    </div>
  </div>

  <h2>3 · Persona Distribution</h2>
  <div class="wrap">
    <div class="two-col">
      <div class="panel"><div class="panel-t">Persona totals (all platforms)</div>${personaTotalBars}</div>
      <div class="panel">
        <div class="panel-t">Persona split by platform</div>
        ${personaPlatformBlock("web")}
        ${personaPlatformBlock("mobile")}
      </div>
    </div>
    <div class="panel">
      <div class="panel-t">Persona &times; L1 scene &mdash; query counts (heat-shaded)</div>
      <div class="scroll tall">
      <table><thead>${heatHead}</thead><tbody>${heatBody}</tbody></table>
      </div>
    </div>
  </div>

  <div class="footer">
    Topic pool snapshot: web ${pools.web.allTopics.size.toLocaleString()} topics / ${pools.web.byL2.size} L2 &middot;
    mobile ${pools.mobile.allTopics.size.toLocaleString()} topics / ${pools.mobile.byL2.size} L2.
    Off-pool topics are legacy topics from earlier runs no longer present in the current corpus pool.
    Coverage = distinct in-pool topics used &divide; pool size.
  </div>
</body>
</html>`;
}

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log("┌─ build-corpus-usage-dashboard ──────────────────────────────");
  console.log("│ loading corpus-direct runs v7–v13:");
  const rows = loadRuns();
  console.log(`│ total successful queries: ${rows.length}`);

  const pools = {
    web: loadPool("scripts/corpus_data_web.json"),
    mobile: loadPool("scripts/corpus_data.json"),
  };
  console.log(`│ pools: web ${pools.web.allTopics.size} topics / ${pools.web.byL2.size} L2, mobile ${pools.mobile.allTopics.size} topics / ${pools.mobile.byL2.size} L2`);

  const agg = aggregate(rows, pools);
  const html = render(agg, pools);

  const outPath = path.join(ROOT, "data/output/corpus_usage_dashboard.html");
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`│ web coverage   : ${pct(agg.platforms.web.consumption.coverage)}`);
  console.log(`│ mobile coverage: ${pct(agg.platforms.mobile.consumption.coverage)}`);
  console.log(`└ dashboard → ${path.relative(ROOT, outPath)}`);
}

main();
