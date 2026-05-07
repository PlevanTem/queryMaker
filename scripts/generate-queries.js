const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  readJsonl,
  writeJsonl,
  generateQueryRecords,
  ensureDir,
} = require("../mvp/query_factory");

const COMPLEXITY_ZH = { vague: "简", medium: "中", complex: "难" };

function writeProcessArtifacts(rootDir, processDir, rows) {
  const abs = path.resolve(rootDir, processDir);
  ensureDir(abs);
  const lines = [
    "# 本批生成过程文件",
    "",
    "每条任务子目录内：`persona_prompt.txt`（persona 合成用用户侧 prompt）、`query_prompt.txt`（query 用）、`query_output.txt`（最终 query）、`persona_spec.json`（LLM 解析后 persona）、`full.json`（整行落盘）。",
    "",
  ];
  rows.forEach((row, i) => {
    const n = String(i + 1).padStart(2, "0");
    const c = row.target_complexity || "?";
    const zh = COMPLEXITY_ZH[c] || c;
    const label = `${n}_${c}_${row.id}`;
    const sub = path.join(abs, label);
    ensureDir(sub);
    if (row.persona_prompt_text) {
      fs.writeFileSync(path.join(sub, "persona_prompt.txt"), row.persona_prompt_text, "utf8");
    }
    if (row.query_prompt_text) {
      fs.writeFileSync(path.join(sub, "query_prompt.txt"), row.query_prompt_text, "utf8");
    }
    fs.writeFileSync(path.join(sub, "query_output.txt"), row.query_text || "", "utf8");
    if (row.persona_spec) {
      fs.writeFileSync(path.join(sub, "persona_spec.json"), `${JSON.stringify(row.persona_spec, null, 2)}\n`, "utf8");
    }
    fs.writeFileSync(path.join(sub, "full.json"), `${JSON.stringify(row, null, 2)}\n`, "utf8");
    lines.push(`- **${label}**（简中难: ${zh} / ${c}）→ \`${path.join(processDir, label)}\``);
  });
  fs.writeFileSync(path.join(abs, "README.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = path.resolve(rootDir, args.input || "data/intermediate/generation_plan.v2.jsonl");
  const outputPath = path.resolve(rootDir, args.output || "data/output/raw_queries.v2.jsonl");
  const mode = args.mode || "persona-fallback";

  let tasks = readJsonl(inputPath);
  const limitRaw = args.limit;
  if (limitRaw !== undefined && limitRaw !== true) {
    const n = Math.max(0, Number(limitRaw));
    tasks = tasks.slice(0, n);
  }

  const genOptions = { mode };
  if (args.concurrency !== undefined && args.concurrency !== true) {
    genOptions.llm = { ...genOptions.llm, concurrency: Number(args.concurrency) };
  }

  console.log("--- 本批任务预览 ---");
  tasks.forEach((t, i) => {
    const zh = COMPLEXITY_ZH[t.target_complexity] || "";
    console.log(
      `  [${i + 1}] ${t.query_id}  难度 target_complexity=${t.target_complexity}${zh ? `（${zh}）` : ""}  app=${t.application_type}`,
    );
  });
  console.log("-------------------");

  const rows = await generateQueryRecords({ tasks }, genOptions);
  writeJsonl(outputPath, rows);

  const processDir = args["process-dir"] || args.processDir;
  if (processDir) {
    writeProcessArtifacts(rootDir, processDir, rows);
  }

  console.log(`已生成 Query 记录：${rows.length} 条`);
  console.log(`生成模式：${mode}`);
  console.log(`输出文件：${outputPath}`);
  if (processDir) {
    console.log(`过程文件目录：${path.resolve(rootDir, processDir)}（含 README.md）`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
