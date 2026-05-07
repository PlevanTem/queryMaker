const path = require("path");
const {
  parseArgs,
  autoDetectWorkbook,
  parseRequirementsFromWorkbook,
  writeJson,
} = require("../mvp/query_factory");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = args.input ? path.resolve(rootDir, args.input) : autoDetectWorkbook(rootDir);
  const outputPath = path.resolve(rootDir, args.output || "data/intermediate/scenario_spec.v2.json");

  const spec = parseRequirementsFromWorkbook(inputPath);
  writeJson(outputPath, spec);

  console.log(`已解析需求表：${spec.total_scenarios} 个场景`);
  console.log(`输出文件：${outputPath}`);
}

main();
