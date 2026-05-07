const path = require("path");
const {
  parseArgs,
  readJsonl,
  writeJsonl,
  scoreQueryRecords,
} = require("../mvp/query_factory");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = path.resolve(rootDir, args.input || "data/output/raw_queries.v2.jsonl");
  const outputPath = path.resolve(rootDir, args.output || "data/output/scored_queries.v2.jsonl");

  const rows = readJsonl(inputPath);
  const scored = scoreQueryRecords(rows);
  writeJsonl(outputPath, scored);

  console.log(`已完成质量评分：${scored.length} 条`);
  console.log(`输出文件：${outputPath}`);
}

main();
