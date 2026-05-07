/**
 * 从 scenario_spec 中选取若干「一级场景」（每个 L1 取 spec 中首次出现的 scene 行），
 * 为每个 scene 生成 seed plan：固定 3 条 = vague / medium / complex（简中难）。
 * 随后调用 llm-openai 生成 persona + query。
 *
 * 用法：
 *   node scripts/plan-and-generate-7l1-scenes.js
 *   node scripts/plan-and-generate-7l1-scenes.js --skip-llm   # 只写 plan 不调模型
 */
const path = require("path");
const {
  parseArgs,
  readJson,
  writeJsonl,
  buildSeedPlan,
  generateQueryRecords,
  ensureDir,
} = require("../mvp/query_factory");

/** 排除的一级场景（例如已在 trial_3c 用过） */
const EXCLUDE_L1 = new Set(["深度研究展示"]);

/** 最多选取多少个不同的一级场景（每个 L1 取第一个出现的 scenario） */
const MAX_L1 = 7;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const specPath = path.resolve(rootDir, args.input || "data/intermediate/scenario_spec.v2.json");
  const planPath = path.resolve(rootDir, args["plan-output"] || "data/intermediate/generation_plan.7l1.jsonl");
  const outPath = path.resolve(rootDir, args.output || "data/output/raw_queries.7l1.jsonl");
  const mode = args.mode || "llm-openai";
  const skipLlm = args["skip-llm"] === true;

  const spec = readJson(specPath);
  const seenL1 = new Set();
  const scenarios = [];
  for (const s of spec.scenarios || []) {
    if (!s?.l1_scene || EXCLUDE_L1.has(s.l1_scene)) {
      continue;
    }
    if (seenL1.has(s.l1_scene)) {
      continue;
    }
    seenL1.add(s.l1_scene);
    scenarios.push(s);
    if (scenarios.length >= MAX_L1) {
      break;
    }
  }

  if (scenarios.length < MAX_L1) {
    throw new Error(`仅筛到 ${scenarios.length} 个一级场景，需要 ${MAX_L1} 个。请检查 scenario_spec 或调整 EXCLUDE_L1。`);
  }

  const filteredSpec = {
    ...spec,
    total_scenarios: scenarios.length,
    scenarios,
  };

  const plan = buildSeedPlan(filteredSpec, {
    minSeed: 3,
    maxSeed: 3,
    initialFraction: 0.01,
  });

  ensureDir(path.dirname(planPath));
  writeJsonl(planPath, plan.tasks);

  console.log("--- 已选 7 个一级场景（每场景 3 档 vague/medium/complex）---");
  plan.tasks.forEach((t, i) => {
    console.log(`  [${i + 1}] ${t.query_id}  L1=${t.l1_scene}  L2=${t.l2_scene_label}  xc=${t.target_complexity}  app=${t.application_type}`);
  });
  console.log(`plan 条数：${plan.total_tasks}  写入：${planPath}`);

  if (skipLlm) {
    console.log("已跳过 LLM（--skip-llm）。");
    return;
  }

  const genOptions = { mode };
  if (args.concurrency !== undefined && args.concurrency !== true) {
    genOptions.llm = { ...genOptions.llm, concurrency: Number(args.concurrency) };
  }

  const rows = await generateQueryRecords({ tasks: plan.tasks }, genOptions);
  ensureDir(path.dirname(outPath));
  writeJsonl(outPath, rows);
  console.log(`已生成 query：${rows.length} 条  写入：${outPath}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
