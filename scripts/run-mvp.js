const path = require("path");
const {
  parseArgs,
  autoDetectWorkbook,
  parseRequirementsFromWorkbook,
  buildSeedPlan,
  generateQueryRecords,
  scoreQueryRecords,
  importIntoDatabase,
  buildDashboardAssets,
  writeJson,
  writeJsonl,
} = require("../mvp/query_factory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = args.input ? path.resolve(rootDir, args.input) : autoDetectWorkbook(rootDir);
  const scenarioSpecPath = path.resolve(rootDir, "data/intermediate/scenario_spec.v2.json");
  const generationPlanPath = path.resolve(rootDir, "data/intermediate/generation_plan.v2.jsonl");
  const rawQueriesPath = path.resolve(rootDir, "data/output/raw_queries.v2.jsonl");
  const scoredQueriesPath = path.resolve(rootDir, "data/output/scored_queries.v2.jsonl");
  const dbPath = path.resolve(rootDir, "data/db/queries_v2.sqlite");
  const reportsDir = path.resolve(rootDir, "data/reports_v2");

  const spec = parseRequirementsFromWorkbook(inputPath);
  writeJson(scenarioSpecPath, spec);

  const plan = buildSeedPlan(spec, {
    minSeed: args["min-seed"],
    maxSeed: args["max-seed"],
    initialFraction: args["initial-fraction"],
  });
  writeJsonl(generationPlanPath, plan.tasks);

  const generated = await generateQueryRecords(plan, { mode: args.mode || "persona-fallback" });
  writeJsonl(rawQueriesPath, generated);

  const scored = scoreQueryRecords(generated);
  writeJsonl(scoredQueriesPath, scored);

  await importIntoDatabase({
    dbPath,
    requirementsSpec: spec,
    queries: scored,
    mode: args.mode || "persona-fallback",
  });

  const assets = await buildDashboardAssets(dbPath, reportsDir);

  console.log(`V2 链路已跑通，场景数：${spec.total_scenarios}`);
  console.log(`首轮生成任务：${plan.total_tasks}`);
  console.log(`数据库：${dbPath}`);
  console.log(`Dashboard：${assets.dashboardPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
