#!/usr/bin/env node
/**
 * export-queries-csv.js
 *
 * 从 raw_queries.jsonl 或 scored_queries.jsonl 导出 query 列到 CSV，
 * 每条 query 前自动加一句前缀指令。
 *
 * 用法：
 *   node scripts/export-queries-csv.js
 *   node scripts/export-queries-csv.js --input data/output/runs/free200_llm/raw_queries.jsonl
 *   node scripts/export-queries-csv.js --input <file.jsonl> --output <file.csv> --prefix "Custom prefix."
 */

const fs   = require("fs");
const path = require("path");

const DEFAULT_PREFIX = "Generate a plain HTML optimized for mobile devices.";
const DEFAULT_INPUT  = "data/output/runs/free200_llm/raw_queries.jsonl";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) { args[key] = val; i++; }
      else args[key] = true;
    }
  }
  return args;
}

// RFC 4180 CSV cell: wrap in double quotes, escape inner double quotes
function csvCell(value) {
  const s = String(value ?? "").replace(/\r\n/g, " ").replace(/\n/g, " ").replace(/\r/g, " ");
  return '"' + s.replace(/"/g, '""') + '"';
}

function main() {
  const args      = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input || DEFAULT_INPUT);
  const prefix    = args.prefix || DEFAULT_PREFIX;

  if (!fs.existsSync(inputPath)) {
    console.error(`[ERROR] Input not found: ${inputPath}`);
    process.exit(1);
  }

  const defaultOut = inputPath.replace(/\.(jsonl)$/, "_prompts.csv").replace(/raw_queries|scored_queries/, "export");
  const outputPath = path.resolve(args.output || defaultOut);

  const lines = fs.readFileSync(inputPath, "utf8").trim().split("\n").filter(Boolean);
  const records = lines.map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { console.warn(`  ⚠ line ${i + 1} parse error, skipped`); return null; }
  }).filter(Boolean);

  const rows = [
    // header
    ["id", "prompt"].map(csvCell).join(","),
    // data
    ...records.map(r => {
      const prompt = prefix + " " + (r.query_text || "").trim();
      return [r.id || "", prompt].map(csvCell).join(",");
    }),
  ];

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rows.join("\n") + "\n", "utf8");

  console.log(`[export-queries-csv] ${records.length} rows → ${outputPath}`);
}

main();
