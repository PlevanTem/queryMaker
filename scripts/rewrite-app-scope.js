/**
 * rewrite-app-scope.js — Batch-rewrite query_text in a run to use 0-1 app
 * scope words ("app", "tool") instead of single-page words ("page", "screen",
 * "view", "section", "module", "feature", "widget").
 *
 * Why: queries framed as "Build a XX page where..." cause downstream
 * generation to produce a single page rather than a complete mini-app.
 *
 * Usage:
 *   node scripts/rewrite-app-scope.js                                # default: data/output/corpus_run_v5_200
 *   node scripts/rewrite-app-scope.js --dir data/output/corpus_run_v6_200
 *   node scripts/rewrite-app-scope.js --dir data/output/corpus_run_v5_200 --no-clear-zh
 *
 * After this, run: node scripts/translate-queries.js --dir <same-dir>  to refresh zh.
 */

const path = require("path");
const fs   = require("fs");
const XLSX = require("xlsx");

const { parseArgs } = require("../mvp/query_factory_v2");

// ─── replacement rules ───────────────────────────────────────────────────────
// Order matters — drop size qualifiers BEFORE swapping the noun, otherwise
// "a little page" → "a little app" (still has "little"). Then swap noun.

const SIZE_QUALIFIER_RE = /\b(little|small|tiny|mini)\s+(?=(page|screen|view|section|module|feature|widget)\b)/gi;

// Primary "page-ish" nouns → "app"
const PAGE_NOUNS_RE = /\b(page|screen|view|section|module)\b/gi;
// "feature/widget" → "tool" (better fits a 0-1 standalone framing)
const TOOL_NOUNS_RE = /\b(feature|widget)\b/gi;

// Article fixups
const A_BEFORE_APP = /\ba\s+app\b/g;
const AN_BEFORE_TOOL = /\ban\s+tool\b/g;

function rewriteToAppScope(text) {
  if (!text) return text;
  let s = text;

  // Step 1: drop size qualifiers when applied to a page-ish noun
  s = s.replace(SIZE_QUALIFIER_RE, "");

  // Step 2: clean any leftover doubled space
  s = s.replace(/[ \t]+/g, " ");

  // Step 3: swap nouns
  s = s.replace(PAGE_NOUNS_RE, (m) => (m === m.toUpperCase() ? "APP" : m[0] === m[0].toUpperCase() ? "App" : "app"));
  s = s.replace(TOOL_NOUNS_RE, (m) => (m === m.toUpperCase() ? "TOOL" : m[0] === m[0].toUpperCase() ? "Tool" : "tool"));

  // Step 4: article fixups (a app → an app, an tool → a tool)
  s = s.replace(A_BEFORE_APP, "an app");
  s = s.replace(AN_BEFORE_TOOL, "a tool");

  return s.trim();
}

function rebuildXlsx(rows, xlsxPath) {
  const sheetRows = rows.map((r, i) => ({
    "#": i + 1,
    id: r.id,
    l1_scene: r.l1_scene,
    l2_scene_label: r.l2_scene_label,
    corpus_topic: r.corpus_topic,
    corpus_persona_id: r.corpus_persona_id || "",
    target_complexity: r.target_complexity,
    word_count: r.word_count,
    duration_ms: r.duration_ms,
    query_text: r.query_text,
    query_text_zh: r.query_text_zh || "",
    error: r.error || "",
  }));
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const headers = Object.keys(sheetRows[0] || {});
  ws["!cols"] = headers.map((h) => {
    if (h === "query_text" || h === "query_text_zh") return { wch: 60 };
    if (h === "corpus_topic" || h === "l2_scene_label" || h === "l1_scene") return { wch: 28 };
    if (h === "id") return { wch: 18 };
    return { wch: 14 };
  });

  let wb;
  if (fs.existsSync(xlsxPath)) {
    wb = XLSX.readFile(xlsxPath);
    if (wb.Sheets.queries) {
      delete wb.Sheets.queries;
      wb.SheetNames = wb.SheetNames.filter((n) => n !== "queries");
    }
  } else {
    wb = XLSX.utils.book_new();
  }
  XLSX.utils.book_append_sheet(wb, ws, "queries");
  wb.SheetNames = ["queries", ...wb.SheetNames.filter((n) => n !== "queries")];
  XLSX.writeFile(wb, xlsxPath);
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir  = path.resolve(process.cwd(), args.dir || "data/output/corpus_run_v5_200");
  const clearZh = args["no-clear-zh"] !== true; // default: clear zh so re-translation happens

  const jsonlPath = path.join(dir, "queries.jsonl");
  const xlsxPath  = path.join(dir, "queries.xlsx");
  if (!fs.existsSync(jsonlPath)) {
    throw new Error(`找不到 ${jsonlPath}`);
  }

  const rows = fs.readFileSync(jsonlPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  console.log(`📦 加载 ${rows.length} 条 from ${path.relative(process.cwd(), jsonlPath)}`);

  let changedCount = 0;
  let zhCleared = 0;
  let totalWordsBefore = 0, totalWordsAfter = 0;

  const updated = rows.map((r) => {
    const before = r.query_text || "";
    const after = rewriteToAppScope(before);
    if (after !== before) changedCount++;
    totalWordsBefore += wordCount(before);
    totalWordsAfter  += wordCount(after);
    const out = { ...r, query_text: after, word_count: wordCount(after) };
    if (clearZh && r.query_text_zh) {
      delete out.query_text_zh;
      zhCleared++;
    }
    return out;
  });

  fs.writeFileSync(
    jsonlPath,
    updated.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );
  console.log(`✏️  改写 ${changedCount}/${rows.length} 条`);
  console.log(`📊 平均词数: ${(totalWordsBefore/rows.length).toFixed(1)} → ${(totalWordsAfter/rows.length).toFixed(1)}`);
  if (clearZh) console.log(`🌐 清空 ${zhCleared} 条 query_text_zh（请跑 translate-queries.js 重译）`);

  console.log(`📝 已写回 ${path.relative(process.cwd(), jsonlPath)}`);
  try {
    rebuildXlsx(updated, xlsxPath);
    console.log(`📊 已重建 ${path.relative(process.cwd(), xlsxPath)}`);
  } catch (e) {
    if (e.code === "EBUSY") {
      console.log(`⚠️  xlsx 被占用（请关闭 Excel 后再跑 \`node scripts/rebuild-xlsx.js --dir <dir>\` 或重跑本脚本）：${path.relative(process.cwd(), xlsxPath)}`);
    } else {
      throw e;
    }
  }
}

main();
