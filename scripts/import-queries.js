const path = require("path");
const {
  parseArgs,
  readJson,
  readJsonl,
  importIntoDatabase,
} = require("../mvp/query_factory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const specPath = path.resolve(rootDir, args.spec || "data/intermediate/scenario_spec.v2.json");
  const inputPath = path.resolve(rootDir, args.input || "data/output/scored_queries.v2.jsonl");
  const dbPath = path.resolve(rootDir, args.db || "data/db/queries_v2.sqlite");

  const spec = readJson(specPath);
  const queries = readJsonl(inputPath);
  const result = await importIntoDatabase({
    dbPath,
    requirementsSpec: spec,
    queries,
    mode: args.mode || "persona-fallback",
  });

  console.log(`已导入数据库：${result.totalQueries} 条`);
  console.log(`数据库文件：${dbPath}`);
  console.log(`run_id：${result.runId}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
