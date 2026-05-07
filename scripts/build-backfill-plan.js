const path = require("path");
const {
  parseArgs,
  readJson,
  readJsonl,
  writeJsonl,
  queryRows,
  buildBackfillPlan,
} = require("../mvp/query_factory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const specPath = path.resolve(rootDir, args.spec || "data/intermediate/scenario_spec.v2.json");
  const outputPath = path.resolve(rootDir, args.output || "data/intermediate/backfill_plan.v2.jsonl");
  const dbPath = path.resolve(rootDir, args.db || "data/db/queries_v2.sqlite");
  const jsonlPath = args.queries ? path.resolve(rootDir, args.queries) : null;

  const spec = readJson(specPath);
  let existingQueries = [];

  if (jsonlPath) {
    existingQueries = readJsonl(jsonlPath);
  } else {
    existingQueries = await queryRows(
      dbPath,
      `SELECT id, scene_id, l1_scene, l2_scene_label, application_type, product_type, target_complexity FROM queries`,
    );
  }

  const plan = buildBackfillPlan(spec, existingQueries, {
    minPerScene: args["min-per-scene"],
  });

  writeJsonl(outputPath, plan.tasks);

  console.log(`已生成 backfill plan：${plan.total_tasks} 条任务`);
  console.log(`输出文件：${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
