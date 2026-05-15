/**
 * merge-haiku-translations.js
 *
 * Merge translations produced by Haiku subagents (in data/output/_translate_haiku/<batch>_out.json)
 * back into the corresponding queries.jsonl, then rebuild queries.xlsx.
 *
 * Usage:
 *   node scripts/merge-haiku-translations.js
 */

const fs   = require("fs");
const path = require("path");
const XLSX = require("xlsx");

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const TEMP_DIR = arg("temp-dir") || "data/output/_translate_haiku";
const TARGET_DIR_OVERRIDE = arg("target-dir");

// Three modes:
//   (1) --target-dir <path> → single run dir, accept ALL *_out.json
//   (2) TEMP_DIR is INSIDE a run dir (matches data/output/<run>/_translate_in)
//       → auto-derive target_dir as the parent
//   (3) Default — legacy retry mapping (mobile/web v7 dirs)
function autoDetectTargets() {
  if (TARGET_DIR_OVERRIDE) return [{ prefix: "*", dir: TARGET_DIR_OVERRIDE }];
  // mode 2: temp_dir is inside a run dir
  const parent = path.dirname(TEMP_DIR);
  if (fs.existsSync(path.join(parent, "queries.jsonl"))) {
    return [{ prefix: "*", dir: parent }];
  }
  // mode 3: legacy
  const baseTargets = [
    { match: /^mobile2?_/, dir: "data/output/corpus_run_v7_mobile_500" },
    { match: /^web2?_/,    dir: "data/output/corpus_run_v7_web_500" },
  ];
  const files = fs.existsSync(TEMP_DIR) ? fs.readdirSync(TEMP_DIR) : [];
  const seenPrefixes = new Set();
  for (const f of files) {
    const m = f.match(/^([a-z0-9]+)_b\d+_out\.json$/i);
    if (m) seenPrefixes.add(m[1]);
  }
  const targets = [];
  for (const prefix of seenPrefixes) {
    const base = baseTargets.find((t) => t.match.test(prefix + "_"));
    if (base) targets.push({ prefix, dir: base.dir });
  }
  return targets;
}
const TARGETS = autoDetectTargets();

function loadAllOutputs(prefix) {
  const map = new Map();
  const all = fs.readdirSync(TEMP_DIR).filter((f) => f.endsWith("_out.json"));
  const files = prefix === "*" ? all : all.filter((f) => f.startsWith(prefix + "_b"));
  let foundBatches = [];
  for (const f of files.sort()) {
    const arr = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, f), "utf8"));
    foundBatches.push(`${f}=${arr.length}`);
    for (const r of arr) {
      if (r.id && r.query_text_zh) map.set(r.id, r.query_text_zh);
    }
  }
  return { map, foundBatches };
}

function rebuildXlsx(rows, xlsxPath, hasScore) {
  const sheetRows = rows.map((r, i) => {
    const base = {
      "#": i + 1,
      id: r.id,
      l1_scene: r.l1_scene,
      l2_scene_label: r.l2_scene_label,
      corpus_topic: r.corpus_topic,
      corpus_persona_id: r.corpus_persona_id || "",
      target_complexity: r.target_complexity,
      word_count: r.word_count,
      duration_ms: r.duration_ms,
    };
    if (hasScore && r.quality_score != null) base.quality_score = r.quality_score;
    if (hasScore && r.quality_pass != null) base.quality_pass = r.quality_pass;
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
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function main() {
  for (const target of TARGETS) {
    const jsonlPath = path.join(target.dir, "queries.jsonl");
    const xlsxPath  = path.join(target.dir, "queries.xlsx");
    if (!fs.existsSync(jsonlPath)) {
      console.log(`⚠️  ${jsonlPath} not found, skip`);
      continue;
    }
    const rows = fs.readFileSync(jsonlPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const { map, foundBatches } = loadAllOutputs(target.prefix);
    console.log(`\n[${target.prefix}] batches loaded:`, foundBatches.join(", "));
    console.log(`  total translations available: ${map.size}`);

    let merged = 0, skipped = 0, missing = 0;
    const updated = rows.map((r) => {
      if (r.error) { skipped++; return r; }
      const zh = map.get(r.id);
      if (!zh) { missing++; return r; }
      merged++;
      return { ...r, query_text_zh: zh };
    });
    console.log(`  merged: ${merged}, skipped (errored rows): ${skipped}, missing translation: ${missing}`);

    fs.writeFileSync(jsonlPath, updated.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    console.log(`  📝 wrote ${jsonlPath}`);

    const hasScore = updated.some((r) => r.quality_score != null);
    const result = rebuildXlsx(updated, xlsxPath, hasScore);
    if (result.ok) console.log(`  📊 wrote ${xlsxPath}`);
    else           console.log(`  ⚠️  xlsx error: ${result.error}`);
  }
  console.log("\n✅ Done");
}

main();
