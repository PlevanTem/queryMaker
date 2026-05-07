const path = require("path");
const {
  parseArgs,
  readJson,
  writeJsonl,
  buildSeedPlan,
} = require("../mvp/query_factory");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = path.resolve(rootDir, args.input || "data/intermediate/scenario_spec.v2.json");
  const outputPath = path.resolve(rootDir, args.output || "data/intermediate/generation_plan.v2.jsonl");

  const spec = readJson(inputPath);
  const plan = buildSeedPlan(spec, {
    minSeed: args["min-seed"],
    maxSeed: args["max-seed"],
    initialFraction: args["initial-fraction"],
  });

  writeJsonl(outputPath, plan.tasks);

  console.log(`已生成首轮 seed plan：${plan.total_tasks} 条任务`);
  console.log(`输出文件：${outputPath}`);
}

main();
