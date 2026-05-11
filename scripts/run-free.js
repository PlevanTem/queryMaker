#!/usr/bin/env node
/**
 * scripts/run-free.js
 *
 * LLM 自由生成流水线的一键入口，按顺序执行以下 4 步：
 *
 *   Step 1  build-plan    构建生成计划（build-free200-plan.js）
 *   Step 2  generate      LLM 批量生成 query（batch-generate-queries.js）
 *   Step 3  score         质量评分（score-queries.js）
 *   Step 4  report        生成可视化 HTML 报告（generate-analysis-report.js）
 *  [Step 5] export-csv    （可选）导出带前缀的 CSV（export-queries-csv.js）
 *
 * 任意步骤失败时立即退出并标明是哪步，已完成的步骤不会重跑（除非传 --no-resume）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 用法
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   # 最简（全部用默认值）
 *   node scripts/run-free.js
 *
 *   # 指定输出目录 + 全量重跑
 *   node scripts/run-free.js --output-dir data/output/runs/free200_v2 --no-resume
 *
 *   # 完整参数示例
 *   node scripts/run-free.js \
 *     --output-dir    data/output/runs/free200_v2 \
 *     --persona-scope scene \
 *     --concurrency   3 \
 *     --no-resume \
 *     --title         "free200 v2 · 2026-05" \
 *     --export-csv \
 *     --csv-prefix    "Generate a plain HTML optimized for mobile devices."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 参数说明
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  流程控制
 *   --output-dir   <dir>   生成产物目录（默认 data/output/runs/free200_llm）
 *   --no-resume            强制全量重跑 Step 2；不传则 Step 2 从断点续跑
 *   --skip-plan            跳过 Step 1，直接使用已有的 generation_plan.free200.jsonl
 *   --skip-score           跳过 Step 3（调试用，报告数据会缺失）
 *   --skip-report          跳过 Step 4
 *   --export-csv           启用 Step 5，导出 CSV（默认关闭）
 *
 *  Persona 策略（Step 1）
 *   --persona-scope <mode>
 *       scene [默认]  同一场景内所有 task 共享一个 persona（省钱、一致性好）
 *       task          每条 task 独立生成 persona（更多样，耗时耗钱）
 *
 *  LLM 参数（Step 2）
 *   --concurrency   <n>    并发数（默认 3）
 *   --model         <id>   模型 ID（默认 claude-sonnet-4-6）
 *   --transport     <t>    claude-cli | anthropic | openai（默认 claude-cli）
 *   --max-retries   <n>    单条失败重试次数（默认 2）
 *
 *  报告参数（Step 4）
 *   --title         <str>  报告标题（默认自动生成）
 *   --meta          <str>  报告副标题（默认自动生成）
 *
 *  CSV 导出参数（Step 5，需配合 --export-csv）
 *   --csv-prefix    <str>  每条 query 前缀（默认 "Generate a plain HTML optimized for mobile devices."）
 *   --csv-output    <path> CSV 输出路径（默认 <output-dir>/export_prompts.csv）
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 产物文件（均在 --output-dir 下）
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   raw_queries.jsonl      LLM 生成的原始 query 记录
 *   scored_queries.jsonl   附加质量评分后的记录
 *   analysis_report.html   交互式可视化报告（含 persona 卡片）
 *   export_prompts.csv     （--export-csv 时）带前缀的 prompt 列表
 *   plan.json              本次运行的 plan 快照
 *   stats.json             生成统计（耗时、字数分布等）
 *   errors.json            失败条目（仅有失败时才生成）
 *   config.json            运行配置（API key 已脱敏）
 */

"use strict";

const path        = require("path");
const fs          = require("fs");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

// ─── 参数解析 ─────────────────────────────────────────────────────────────────

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

const args = parseArgs(process.argv.slice(2));

const OUTPUT_DIR    = path.resolve(ROOT, args["output-dir"] || "data/output/runs/free200_llm");
const PLAN_PATH     = path.join(ROOT, "data/intermediate/generation_plan.free200.jsonl");
const RAW_PATH      = path.join(OUTPUT_DIR, "raw_queries.jsonl");
const SCORED_PATH   = path.join(OUTPUT_DIR, "scored_queries.jsonl");
const REPORT_PATH   = path.join(OUTPUT_DIR, "analysis_report.html");
const CSV_PATH      = args["csv-output"] ? path.resolve(ROOT, args["csv-output"]) : path.join(OUTPUT_DIR, "export_prompts.csv");

const PERSONA_SCOPE = args["persona-scope"] || "scene";
const CONCURRENCY   = args["concurrency"]   || "3";
const MODEL         = args["model"]         || "claude-sonnet-4-6";
const TRANSPORT     = args["transport"]     || "claude-cli";
const MAX_RETRIES   = args["max-retries"]   || "2";
const NO_RESUME     = args["no-resume"]     ? "--no-resume" : "";
const SKIP_PLAN     = !!args["skip-plan"];
const SKIP_SCORE    = !!args["skip-score"];
const SKIP_REPORT   = !!args["skip-report"];
const EXPORT_CSV    = !!args["export-csv"];
const CSV_PREFIX    = args["csv-prefix"]    || "Generate a plain HTML optimized for mobile devices.";

const runLabel = path.basename(OUTPUT_DIR);
const TITLE = args["title"] || `${runLabel} · LLM自由生成`;
const META  = args["meta"]  || `200 queries · ${MODEL} · ${new Date().toISOString().slice(0, 10)}`;

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m", BOLD = "\x1b[1m", GREEN = "\x1b[32m",
      YELLOW = "\x1b[33m", RED = "\x1b[31m", CYAN = "\x1b[36m", DIM = "\x1b[2m";

function log(msg)  { console.log(`${CYAN}[run-free]${RESET} ${msg}`); }
function ok(msg)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function skip(msg) { console.log(`${YELLOW}⊘ skip${RESET}  ${msg}`); }
function fail(step, err) {
  console.error(`\n${RED}${BOLD}✗ Step ${step} failed${RESET}`);
  console.error(err.message || err);
  process.exit(1);
}

function run(step, label, cmd) {
  log(`${BOLD}Step ${step}${RESET} — ${label}`);
  log(`${DIM}$ ${cmd}${RESET}`);
  const t = Date.now();
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    ok(`Step ${step} done (${((Date.now() - t) / 1000).toFixed(1)}s)\n`);
  } catch (e) {
    fail(step, e);
  }
}

// ─── 入口 ─────────────────────────────────────────────────────────────────────

log(`output-dir:    ${OUTPUT_DIR}`);
log(`persona-scope: ${PERSONA_SCOPE}`);
log(`concurrency:   ${CONCURRENCY}  model: ${MODEL}  transport: ${TRANSPORT}`);
log(`steps: plan=${!SKIP_PLAN} generate=true score=${!SKIP_SCORE} report=${!SKIP_REPORT} csv=${EXPORT_CSV}\n`);

// Step 1 — build plan
if (SKIP_PLAN) {
  skip("Step 1 — build plan (--skip-plan)");
  if (!fs.existsSync(PLAN_PATH)) {
    console.error(`${RED}[ERROR]${RESET} --skip-plan 但 plan 文件不存在: ${PLAN_PATH}`);
    process.exit(1);
  }
} else {
  run(1, "build plan",
    `node scripts/build-free200-plan.js --persona-scope ${PERSONA_SCOPE}`);
}

// Step 2 — LLM generate
run(2, "LLM batch generate",
  [
    "node scripts/batch-generate-queries.js",
    `--plan        "${PLAN_PATH}"`,
    `--output-dir  "${OUTPUT_DIR}"`,
    `--concurrency ${CONCURRENCY}`,
    `--model       ${MODEL}`,
    `--transport   ${TRANSPORT}`,
    `--max-retries ${MAX_RETRIES}`,
    NO_RESUME,
  ].filter(Boolean).join(" "));

// Step 3 — score
if (SKIP_SCORE) {
  skip("Step 3 — score (--skip-score)");
} else {
  run(3, "quality score",
    `node scripts/score-queries.js --input ${RAW_PATH} --output ${SCORED_PATH}`);
}

// Step 4 — report
if (SKIP_REPORT) {
  skip("Step 4 — report (--skip-report)");
} else {
  const inputForReport = fs.existsSync(SCORED_PATH) ? SCORED_PATH : RAW_PATH;
  run(4, "analysis report",
    `node scripts/generate-analysis-report.js --input "${inputForReport}" --output "${REPORT_PATH}" --title "${TITLE}" --meta "${META}"`);
}

// Step 5 — export CSV (opt-in)
if (EXPORT_CSV) {
  run(5, "export CSV",
    `node scripts/export-queries-csv.js --input "${RAW_PATH}" --output "${CSV_PATH}" --prefix "${CSV_PREFIX}"`);
} else {
  skip("Step 5 — export CSV (pass --export-csv to enable)");
}

log(`${GREEN}${BOLD}All steps done.${RESET}`);
log(`report  → ${REPORT_PATH}`);
if (EXPORT_CSV) log(`csv     → ${CSV_PATH}`);
