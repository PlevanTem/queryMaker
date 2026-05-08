/**
 * One-shot script: score + build dashboard for a specific run dir.
 * Usage: node scripts/_build-run-dashboard.js <run-dir>
 * Example: node scripts/_build-run-dashboard.js data/output/runs/batch_200
 */
"use strict";
const path = require("path");
const fs = require("fs");

const runDir = process.argv[2] || "data/output/runs/batch_200";
const rawPath = path.join(runDir, "raw_queries.jsonl");
if (!fs.existsSync(rawPath)) {
  console.error("raw_queries.jsonl not found in", runDir);
  process.exit(1);
}

// Load factory internals
const factory = require("../mvp/query_factory_v2.js");
const { scoreQueryRecords, readJsonl, writeJson } = factory;

// These are not exported — extract via a wrapper approach inside the same module context
// by temporarily adding them to module.exports at load time (monkey-patch free approach).
// We re-read source, append exports, write to a sibling temp file in mvp/ so require()
// can resolve all relative paths correctly, then delete it.
const srcPath = path.resolve(__dirname, "../mvp/query_factory_v2.js");
const tmpPath = path.resolve(__dirname, "../mvp/_dashboard_tmp.js");
const src = fs.readFileSync(srcPath, "utf8");
fs.writeFileSync(
  tmpPath,
  src + "\nmodule.exports.buildSummary = buildSummary;\nmodule.exports.buildDashboardHtml = buildDashboardHtml;\n",
  "utf8"
);
let buildSummary, buildDashboardHtml;
try {
  const tmp = require(tmpPath);
  buildSummary = tmp.buildSummary;
  buildDashboardHtml = tmp.buildDashboardHtml;
} finally {
  fs.unlinkSync(tmpPath);
}

const raw = readJsonl(rawPath);
const scored = scoreQueryRecords(raw);

const scoredPath = path.join(runDir, "scored_queries.jsonl");
fs.writeFileSync(scoredPath, scored.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

const summary = buildSummary(scored);
const html = buildDashboardHtml({ queries: scored, summary });

const summaryPath = path.join(runDir, "summary.json");
const dashPath = path.join(runDir, "dashboard.html");
writeJson(summaryPath, summary);
fs.writeFileSync(dashPath, html, "utf8");

console.log(`[done] ${scored.length} queries  avg_quality=${summary.average_quality}`);
console.log(`       → ${dashPath}`);
console.log(`       → ${summaryPath}`);
console.log("\nby_product_type:", JSON.stringify(summary.by_product_type));
console.log("by_target_complexity:", JSON.stringify(summary.by_target_complexity));
console.log("target_vs_actual sample:", Object.entries(summary.target_complexity_vs_actual_complexity).slice(0, 6).map(([k,v])=>`${k}: ${v}`).join(", "));
