const path = require("path");
const {
  parseArgs,
  buildDashboardAssets,
} = require("../mvp/query_factory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const dbPath = path.resolve(rootDir, args.db || "data/db/queries_v2.sqlite");
  const outputDir = path.resolve(rootDir, args.output || "data/reports_v2");

  const result = await buildDashboardAssets(dbPath, outputDir);

  console.log(`已输出 dashboard：${result.dashboardPath}`);
  console.log(`已输出 summary：${result.summaryPath}`);
  console.log(`共加载 Query：${result.queries.length} 条`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
