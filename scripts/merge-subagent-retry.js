/**
 * merge-subagent-retry.js
 *
 * Merge subagent-generated query_text back into queries.jsonl, replacing the
 * error stub rows with successful rows. Updates word_count, clears error,
 * marks generator_mode='subagent-retry' for traceability.
 *
 * Usage:
 *   node scripts/merge-subagent-retry.js
 */

const fs   = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const TEMP_DIR = "data/output/_retry_subagent";
const TARGETS = [
  { prefix: "mobile", dir: "data/output/corpus_run_v7_mobile_500" },
  { prefix: "web",    dir: "data/output/corpus_run_v7_web_500" },
];

function loadAllOutputs(prefix) {
  const map = new Map();
  const found = [];
  const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(prefix + "_b") && f.endsWith("_out.json"));
  for (const f of files.sort()) {
    const arr = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, f), "utf8"));
    found.push(`${f}=${arr.length}`);
    for (const r of arr) {
      if (r.id && r.query_text) map.set(r.id, r.query_text.trim());
    }
  }
  return { map, found };
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
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
  try {
    XLSX.writeFile(wb, xlsxPath);
    return true;
  } catch (e) {
    console.log(`  ⚠️  xlsx error: ${e.message}`);
    return false;
  }
}

function main() {
  for (const target of TARGETS) {
    const jsonlPath = path.join(target.dir, "queries.jsonl");
    const xlsxPath  = path.join(target.dir, "queries.xlsx");
    if (!fs.existsSync(jsonlPath)) continue;

    const rows = fs.readFileSync(jsonlPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const { map, found } = loadAllOutputs(target.prefix);
    console.log(`\n[${target.prefix}] outputs:`, found.join(", "));
    console.log(`  available retries: ${map.size}`);

    let recovered = 0, stillErrored = 0;
    const updated = rows.map((r) => {
      if (!r.error) return r;
      const newText = map.get(r.id);
      if (!newText) { stillErrored++; return r; }
      recovered++;
      return {
        ...r,
        query_text: newText,
        word_count: wordCount(newText),
        duration_ms: 0,
        error: null,
        generator_mode: "subagent-retry",
        retry_via: "claude-code-subagent",
      };
    });
    console.log(`  recovered: ${recovered}, still errored: ${stillErrored}`);

    fs.writeFileSync(jsonlPath, updated.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    console.log(`  📝 ${jsonlPath}`);
    if (rebuildXlsx(updated, xlsxPath)) console.log(`  📊 ${xlsxPath}`);
  }
  console.log("\n✅ Done");
}

main();
