#!/usr/bin/env node
// scripts/batch-generate-queries.js
//
// Batch-generate persona-driven UI query records.
//
// Usage:
//   node scripts/batch-generate-queries.js \
//        --input data/input/场景覆盖.xlsx \
//        --output-dir data/output/runs/sample5 \
//        --sample-n 5 --seed 4073
//
//   node scripts/batch-generate-queries.js \
//        --plan data/intermediate/generation_plan.v2.jsonl \
//        --output-dir data/output/runs/full \
//        --concurrency 4
//
// Inputs (--input or --plan, exactly one):
//   --input  <xlsx>       Requirements workbook → parsed via parseRequirementsFromWorkbook + buildSeedPlan
//   --plan   <jsonl>      External generation plan
//
// Output:
//   --output-dir <dir>    Required (or auto-named data/output/runs/run_<ts>)
//
// Sampling (xlsx-only):
//   --sample-n  <int>           SAMPLE_N        Random N scenes; 0 = use all (default 0)
//   --seed      <int>           SAMPLE_SEED     RNG seed for reproducibility
//   --target-count-per-scene    -               Tasks per scene before complexity expansion (default 1)
//
// LLM:
//   --transport claude-cli|anthropic|openai   LLM_TRANSPORT  (default claude-cli)
//   --model     <id>                           ANTHROPIC_MODEL / PACKY_MODEL (default claude-sonnet-4-6)
//   --concurrency       <int>                  LLM_CONCURRENCY    (default 3)
//   --max-retries       <int>                  LLM_MAX_RETRIES    (default 2)
//   --per-call-timeout  <ms>                   PER_CALL_TIMEOUT_MS (default 180000)
//
// Behavior:
//   --no-resume                   Start fresh (default: resume from existing raw_queries.jsonl)
//   --generator-tag    <str>      Stamped onto each row's generator_mode field
//
// Output files (under --output-dir):
//   plan.json          Plan snapshot
//   raw_queries.jsonl  One JSON record per line (final order matches plan)
//   errors.json        Failed tasks (only written when there are failures)
//   stats.json         Aggregated counts and word-count statistics
//   config.json        Run metadata; API keys are masked
//
// Exit codes: 0 ok / 1 some failures / 2 bad args.

const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const { parseArgs } = require("../mvp/query_factory_v2");
const lib = require("./lib/llm-batch");

function intArg(v, def) {
  if (v === undefined || v === true) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function timestampSuffix() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

(async () => {
  lib.loadEnvForBatch(ROOT);

  const args = parseArgs(process.argv.slice(2));

  const inputXlsx = args.input ? path.resolve(ROOT, String(args.input)) : null;
  const planPath = args.plan ? path.resolve(ROOT, String(args.plan)) : null;
  if (!inputXlsx && !planPath) {
    console.error("[FATAL] Provide --input <xlsx> or --plan <jsonl>");
    process.exit(2);
  }
  if (inputXlsx && !fs.existsSync(inputXlsx)) {
    console.error("[FATAL] --input file not found:", inputXlsx);
    process.exit(2);
  }
  if (planPath && !fs.existsSync(planPath)) {
    console.error("[FATAL] --plan file not found:", planPath);
    process.exit(2);
  }

  const outputDir = args["output-dir"]
    ? path.resolve(ROOT, String(args["output-dir"]))
    : path.resolve(ROOT, "data/output/runs", `run_${timestampSuffix()}`);

  const txSpec = lib.autoTransportFromEnv({
    transport: args.transport || process.env.LLM_TRANSPORT,
    model: args.model || process.env.ANTHROPIC_MODEL || process.env.PACKY_MODEL,
    perCallTimeoutMs: intArg(args["per-call-timeout"], intArg(process.env.PER_CALL_TIMEOUT_MS, 180_000)),
  });

  const result = await lib.runBatch({
    rootDir: ROOT,
    inputXlsx, planPath,
    outputDir,
    sampleN: intArg(args["sample-n"], intArg(process.env.SAMPLE_N, 0)),
    seed: intArg(args.seed, intArg(process.env.SAMPLE_SEED, Date.now() & 0xffff)),
    targetCountPerScene: intArg(args["target-count-per-scene"], 1),
    transport: txSpec,
    concurrency: intArg(args.concurrency, intArg(process.env.LLM_CONCURRENCY, 3)),
    maxRetries: intArg(args["max-retries"], intArg(process.env.LLM_MAX_RETRIES, 2)),
    resume: !args["no-resume"],
    generatorTag: args["generator-tag"] || "claude-code-cli-subprocess",
    logger: console.log,
  });

  process.exit(result.fail.length ? 1 : 0);
})().catch((e) => {
  console.error("[FATAL]", e && e.stack ? e.stack : e);
  process.exit(1);
});
