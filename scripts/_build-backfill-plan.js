/**
 * Build a backfill plan for an existing run dir.
 * Usage:
 *   node scripts/_build-backfill-plan.js \
 *     --input data/input/场景覆盖.xlsx \
 *     --run-dir data/output/runs/batch_200 \
 *     --sample-n 34 --seed 59475 \
 *     --target-per-scene 6
 *
 * Writes <run-dir>/backfill_plan.jsonl and prints summary.
 */
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..");

const { parseArgs } = require("../mvp/query_factory_v2");
const { parseRequirementsFromWorkbook, buildBackfillPlan, readJsonl, writeJsonl } = require("../mvp/query_factory_v2");
const { pickRandom } = require("./lib/llm-batch");

const args = parseArgs(process.argv.slice(2));
const inputXlsx = path.resolve(ROOT, String(args.input || "data/input/场景覆盖.xlsx"));
const runDir = path.resolve(ROOT, String(args["run-dir"] || "data/output/runs/batch_200"));
const sampleN = Number(args["sample-n"] || 0);
const seed = Number(args.seed || 59475);
const targetPerScene = Number(args["target-per-scene"] || 6);

const rawPath = path.join(runDir, "raw_queries.jsonl");
if (!fs.existsSync(rawPath)) {
  console.error("[FATAL] raw_queries.jsonl not found in", runDir);
  process.exit(1);
}

const fullSpec = parseRequirementsFromWorkbook(inputXlsx);
const pickedScenes = sampleN > 0
  ? pickRandom(fullSpec.scenarios, sampleN, seed).map((sc) => ({ ...sc, target_count: targetPerScene }))
  : fullSpec.scenarios.map((sc) => ({ ...sc, target_count: targetPerScene }));
const spec = { ...fullSpec, scenarios: pickedScenes, total_scenarios: pickedScenes.length };

const existingRows = readJsonl(rawPath);
const plan = buildBackfillPlan(spec, existingRows, { minPerScene: targetPerScene });

const outPath = path.join(runDir, "backfill_plan.jsonl");
writeJsonl(outPath, plan.tasks);

console.log(`[done] backfill tasks: ${plan.total_tasks}`);
console.log(`       → ${outPath}`);
if (plan.tasks.length > 0) {
  const sample = plan.tasks.slice(0, 3).map((t) => `${t.query_id} ${t.target_complexity}`).join(", ");
  console.log("       sample:", sample, "...");
}
