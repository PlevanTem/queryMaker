/**
 * translate-queries.js — Add zh translation column to a run's queries.jsonl + xlsx.
 *
 * Usage:
 *   node scripts/translate-queries.js                              # default: data/output/corpus_run
 *   node scripts/translate-queries.js --dir data/output/corpus_v1
 *   node scripts/translate-queries.js --concurrency 8
 */

const path = require("path");
const fs   = require("fs");
const XLSX = require("xlsx");

const {
  parseArgs,
  mapWithConcurrency,
} = require("../mvp/query_factory_v2");

const { applyPackyEnv, callClaudeCli } = require("./lib/claude-cli");
applyPackyEnv();

const SYSTEM =
  "You are a professional EN→ZH translator. Translate the given English UI development request into natural, idiomatic Simplified Chinese. " +
  "Preserve technical terms (e.g. 'masonry grid', 'bottom sheet', 'CTA') as needed but make the overall sentence read like a real Chinese user typing the request. " +
  "Output ONLY the Chinese translation. No notes, no romanization, no quotation marks, no English in parentheses.";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(process.cwd(), args.dir || "data/output/corpus_run");
  const concurrency = Number(args.concurrency || 6);

  const jsonlPath = path.join(dir, "queries.jsonl");
  const xlsxPath  = path.join(dir, "queries.xlsx");
  if (!fs.existsSync(jsonlPath)) {
    throw new Error(`找不到 ${jsonlPath}`);
  }

  const lines = fs.readFileSync(jsonlPath, "utf8").split("\n").filter(Boolean);
  const rows = lines.map((l) => JSON.parse(l));
  console.log(`📦 加载 ${rows.length} 条 from ${path.relative(process.cwd(), jsonlPath)}`);
  console.log(`🌐 翻译中（concurrency=${concurrency}）...\n`);

  const tStart = Date.now();
  let okN = 0;
  let failN = 0;

  const translated = await mapWithConcurrency(rows, concurrency, async (r, idx) => {
    if (!r.query_text || r.error) {
      return { ...r, query_text_zh: "" };
    }
    if (r.query_text_zh) {
      // Already translated — skip (idempotent re-runs)
      okN++;
      return r;
    }
    const t0 = Date.now();
    try {
      const zh = await callClaudeCli(r.query_text, { systemPrompt: SYSTEM, label: `t${idx}` });
      const dt = Date.now() - t0;
      okN++;
      console.log(`  ✓ [${String(idx + 1).padStart(3)}/${rows.length}] ${r.l2_scene_label.padEnd(16)} | ${(r.corpus_topic || "").slice(0, 36).padEnd(36)} (${dt}ms)`);
      return { ...r, query_text_zh: zh.trim() };
    } catch (e) {
      failN++;
      console.log(`  ✗ [${String(idx + 1).padStart(3)}/${rows.length}] ${r.l2_scene_label} ERR: ${e.message.split("\n")[0]}`);
      return { ...r, query_text_zh: "", translation_error: e.message.split("\n")[0] };
    }
  });

  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`\n✅ 翻译完成：${okN} ok / ${failN} fail / ${elapsed}s`);

  // Write back to jsonl
  fs.writeFileSync(
    jsonlPath,
    translated.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );
  console.log(`📝 已写回 ${path.relative(process.cwd(), jsonlPath)}`);

  // Rebuild xlsx with query_text_zh column inserted after query_text
  const sheetRows = translated.map((r, i) => {
    const base = {
      "#": i + 1,
      id: r.id,
      l1_scene: r.l1_scene,
      l2_scene_label: r.l2_scene_label,
      corpus_topic: r.corpus_topic,
      target_complexity: r.target_complexity,
      word_count: r.word_count,
      duration_ms: r.duration_ms,
    };
    if (r.quality_score !== undefined && r.quality_score !== null) base.quality_score = r.quality_score;
    if (r.quality_pass !== undefined && r.quality_pass !== null) base.quality_pass = r.quality_pass;
    base.query_text = r.query_text;
    base.query_text_zh = r.query_text_zh || "";
    base.error = r.error || "";
    return base;
  });

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const headers = Object.keys(sheetRows[0] || {});
  ws["!cols"] = headers.map((h) => {
    if (h === "query_text" || h === "query_text_zh") return { wch: 60 };
    if (h === "corpus_topic" || h === "l2_scene_label" || h === "l1_scene") return { wch: 28 };
    if (h === "id") return { wch: 18 };
    return { wch: 14 };
  });

  // Preserve other sheets if existing xlsx has them
  let wb;
  if (fs.existsSync(xlsxPath)) {
    wb = XLSX.readFile(xlsxPath);
    // remove existing queries sheet, then re-add
    if (wb.Sheets.queries) {
      delete wb.Sheets.queries;
      wb.SheetNames = wb.SheetNames.filter((n) => n !== "queries");
    }
  } else {
    wb = XLSX.utils.book_new();
  }
  // insert "queries" as the FIRST sheet
  XLSX.utils.book_append_sheet(wb, ws, "queries");
  // reorder so "queries" is first
  wb.SheetNames = ["queries", ...wb.SheetNames.filter((n) => n !== "queries")];

  try {
    XLSX.writeFile(wb, xlsxPath);
    console.log(`📊 已更新 ${path.relative(process.cwd(), xlsxPath)} （新增列 query_text_zh）`);
  } catch (e) {
    if (e.code === "EBUSY") {
      console.log(`⚠️  xlsx 被占用（请关闭 Excel 后重跑或单独 rebuild）：${path.relative(process.cwd(), xlsxPath)}`);
    } else {
      throw e;
    }
  }
}

main().catch((err) => {
  console.error("\n❌", err.message);
  process.exit(1);
});
