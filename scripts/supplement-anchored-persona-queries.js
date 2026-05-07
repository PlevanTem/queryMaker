const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  readJsonl,
  writeJsonl,
  supplementAnchoredPersonaQueries,
  ensureDir,
} = require("../mvp/query_factory");

const COMPLEXITY_ZH = { vague: "简", medium: "中", complex: "难" };

function writeProcessArtifacts(rootDir, processDir, rows) {
  const abs = path.resolve(rootDir, processDir);
  ensureDir(abs);
  const lines = [
    "# anchored_persona 补充 query（仅第二步 LLM）",
    "",
    "每条目录：`persona_spec.json`（与锚点相同）、`query_prompt.txt`、`query_output.txt`、`full.json`。`persona_prompt.txt` 为锚点合成 prompt 审计快照（本次未再调 persona）。",
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
    fs.writeFileSync(path.join(sub, "query_prompt.txt"), row.query_prompt_text || "", "utf8");
    fs.writeFileSync(path.join(sub, "query_output.txt"), row.query_text || "", "utf8");
    if (row.persona_spec) {
      fs.writeFileSync(path.join(sub, "persona_spec.json"), `${JSON.stringify(row.persona_spec, null, 2)}\n`, "utf8");
    }
    fs.writeFileSync(path.join(sub, "full.json"), `${JSON.stringify(row, null, 2)}\n`, "utf8");
    lines.push(`- **${label}**（${zh} / ${c}，锚点 \`${row.persona_anchor_query_id}\`）→ \`${path.join(processDir, label)}\``);
  });
  fs.writeFileSync(path.join(abs, "README.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = path.resolve(rootDir, args.input || "data/output/raw_queries.trial_3c.jsonl");
  const outputPath = path.resolve(rootDir, args.output || "data/output/raw_queries.trial_3c.supplement.jsonl");
  const combinedPath = path.resolve(
    rootDir,
    args["combined-output"] || "data/output/raw_queries.trial_3c.all.jsonl",
  );
  const mode = args.mode || "llm-openai";

  const anchorRows = readJsonl(inputPath);
  if (!anchorRows.length) {
    throw new Error(`输入为空：${inputPath}`);
  }

  const genOptions = { mode };
  if (args.concurrency !== undefined && args.concurrency !== true) {
    genOptions.llm = { ...genOptions.llm, concurrency: Number(args.concurrency) };
  }

  console.log("--- 锚点记录（将复用 persona_spec）---");
  anchorRows.forEach((r, i) => {
    const zh = COMPLEXITY_ZH[r.target_complexity] || "";
    console.log(
      `  [${i + 1}] ${r.id} 已有难度=${r.target_complexity}${zh ? `（${zh}）` : ""} persona=${r.persona_spec?.persona_id || "?"}`,
    );
  });
  console.log("--- 将为每条补齐其余两档 target_complexity（仅 query LLM）---");

  const supplementRows = await supplementAnchoredPersonaQueries(anchorRows, genOptions);
  writeJsonl(outputPath, supplementRows);

  if (args["skip-combined"] !== true) {
    writeJsonl(combinedPath, [...anchorRows, ...supplementRows]);
  }

  const processDir = args["process-dir"] || args.processDir;
  if (processDir) {
    writeProcessArtifacts(rootDir, processDir, supplementRows);
  }

  console.log(`补充生成：${supplementRows.length} 条`);
  console.log(`仅 supplement：${outputPath}`);
  if (args["skip-combined"] !== true) {
    console.log(`锚点+补充合并：${combinedPath}（共 ${anchorRows.length + supplementRows.length} 条）`);
  }
  if (processDir) {
    console.log(`过程目录：${path.resolve(rootDir, processDir)}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
