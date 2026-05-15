/**
 * prep-translate-batches.js
 *
 * Split a queries.jsonl into Haiku-subagent-friendly batches for in-Claude-Code
 * translation (no packy API needed). Skips rows that already have query_text_zh
 * or that have an error.
 *
 * Usage:
 *   node scripts/prep-translate-batches.js --dir data/output/<run_dir>
 *   node scripts/prep-translate-batches.js --dir data/output/<run_dir> --batch 50
 *
 * Output:
 *   <run_dir>/_translate_in/<run_dir_basename>_b<NN>_in.json    one per batch
 *
 * Then in Claude Code, spawn one Haiku subagent per *_in.json with this prompt
 * (or use scripts/README.md template). Subagents write *_out.json next to inputs.
 *
 * After subagents complete:
 *   node scripts/merge-haiku-translations.js \
 *     --temp-dir data/output/<run_dir>/_translate_in
 */

const fs   = require("fs");
const path = require("path");

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function main() {
  const dir = arg("dir");
  if (!dir) {
    console.error("ERR: --dir <path> required (e.g. --dir data/output/corpus_run_v8_mobile_500)");
    process.exit(1);
  }
  const BATCH = Number(arg("batch") || 50);
  const jsonlPath = path.join(dir, "queries.jsonl");
  if (!fs.existsSync(jsonlPath)) {
    console.error(`ERR: ${jsonlPath} not found`);
    process.exit(1);
  }
  const outDir = path.join(dir, "_translate_in");
  fs.mkdirSync(outDir, { recursive: true });

  const rows = fs.readFileSync(jsonlPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const need = rows.filter((r) => r.query_text && !r.error && !r.query_text_zh);
  if (need.length === 0) {
    console.log(`✅ all ${rows.length} rows already translated (or no successful queries to translate). Nothing to prep.`);
    return;
  }

  const prefix = path.basename(dir).replace(/[^a-z0-9_]/gi, "_") || "batch";
  let batchN = 0;
  for (let i = 0; i < need.length; i += BATCH) {
    batchN += 1;
    const slice = need.slice(i, i + BATCH);
    const items = slice.map((r) => ({ id: r.id, query_text: r.query_text }));
    const fp = path.join(outDir, `${prefix}_b${String(batchN).padStart(2, "0")}_in.json`);
    fs.writeFileSync(fp, JSON.stringify(items, null, 2) + "\n", "utf8");
    console.log(`  wrote ${path.basename(fp)} (${items.length} rows)`);
  }

  console.log(`\n📦 ${need.length} rows pending translation → ${batchN} batch file(s) in ${path.relative(process.cwd(), outDir)}`);
  console.log(`\nNext steps in Claude Code:`);
  console.log(`  1. Spawn ${batchN} Haiku subagents (model="haiku"), one per *_in.json,`);
  console.log(`     each translating to natural Simplified Chinese and writing *_out.json next to its input.`);
  console.log(`     (See README "No-API mode" for the canonical subagent prompt template.)`);
  console.log(`  2. After all subagents finish, run:`);
  console.log(`     node scripts/repair-haiku-json.js --dir ${path.relative(process.cwd(), outDir)}`);
  console.log(`     node scripts/merge-haiku-translations.js --temp-dir ${path.relative(process.cwd(), outDir)}`);
}

main();
