/**
 * retry-failed-corpus.js
 *
 * Re-run the LLM call for any row in <dir>/queries.jsonl that has a non-empty
 * `error` field. Reads task params from the matching <dir>/plan.jsonl entry.
 * Replaces only the failed rows in queries.jsonl; OK rows are untouched.
 * Then rebuilds the xlsx.
 *
 * Usage:
 *   node scripts/retry-failed-corpus.js --dir data/output/corpus_run_v7_web_500
 *   node scripts/retry-failed-corpus.js --dir <dir> --concurrency 4 --max-retries 3
 */

const fs   = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const {
  parseArgs,
  cleanText,
  buildCorpusDirectQueryPrompt,
  normalizeQueryOutput,
  mapWithConcurrency,
} = require("../mvp/query_factory_v2");

const { applyPackyEnv, callClaudeCli, CLI_MODEL } = require("./lib/claude-cli");
applyPackyEnv();

const QUERY_SYSTEM =
  "You are roleplaying as a real end-user typing a UI request to an AI coding assistant. " +
  "Output only the user's message. No JSON. No meta commentary. English only.";

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(process.cwd(), args.dir || "");
  if (!dir || !fs.existsSync(dir)) throw new Error(`需要 --dir <path>，目标不存在：${dir}`);
  const concurrency = Number(args.concurrency || 4);
  const maxRetries = Number(args["max-retries"] || 3);

  const qPath = path.join(dir, "queries.jsonl");
  const pPath = path.join(dir, "plan.jsonl");
  if (!fs.existsSync(qPath)) throw new Error(`找不到 ${qPath}`);
  if (!fs.existsSync(pPath)) throw new Error(`找不到 ${pPath}（需要原始 plan 来重建 task）`);

  const rows = fs.readFileSync(qPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const tasks = fs.readFileSync(pPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const tasksById = new Map(tasks.map((t) => [t.query_id, t]));

  const failed = rows.filter((r) => r.error);
  console.log(`📦 ${rows.length} rows · ${failed.length} failed · concurrency=${concurrency} · max-retries=${maxRetries}`);
  if (failed.length === 0) { console.log("✅ Nothing to retry"); return; }

  let okN = 0, stillFailN = 0;
  const tStart = Date.now();

  await mapWithConcurrency(failed, concurrency, async (oldRow) => {
    const task = tasksById.get(oldRow.id);
    if (!task) {
      stillFailN++;
      console.log(`  ✗ ${oldRow.id} — no plan entry, skip`);
      return;
    }
    const promptText = buildCorpusDirectQueryPrompt(task);
    const t0 = Date.now();
    let queryText = "";
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const raw = await callClaudeCli(promptText, {
          systemPrompt: QUERY_SYSTEM,
          label: `${task.query_id}#retry${attempt + 1}`,
          maxRetries: 1,
        });
        queryText = normalizeQueryOutput(raw);
        if (queryText) break;
      } catch (e) {
        lastErr = e;
      }
      // small backoff between attempts
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }

    const dt = Date.now() - t0;
    if (queryText) {
      okN++;
      // mutate the row in-place
      const idx = rows.findIndex((r) => r.id === oldRow.id);
      if (idx >= 0) {
        rows[idx] = {
          ...rows[idx],
          query_text: queryText,
          query_prompt_text: promptText,
          word_count: wordCount(queryText),
          duration_ms: dt,
          generator_mode: "corpus-direct (retry)",
          llm_model: CLI_MODEL,
          created_at: new Date().toISOString(),
          error: null,
        };
      }
      console.log(`  ✓ [${String(okN + stillFailN).padStart(3)}/${failed.length}] ${task.query_id} (${wordCount(queryText)}w, ${dt}ms)`);
    } else {
      stillFailN++;
      const errStr = lastErr ? lastErr.message.split("\n")[0].slice(0, 80) : "no output";
      console.log(`  ✗ [${String(okN + stillFailN).padStart(3)}/${failed.length}] ${task.query_id} ERR ${errStr}`);
    }
  });

  // Persist
  fs.writeFileSync(qPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`\n✅ Retry: ${okN} recovered / ${stillFailN} still failed (${((Date.now() - tStart) / 1000).toFixed(1)}s)`);
  console.log(`📝 ${path.relative(process.cwd(), qPath)} updated`);

  // Rebuild xlsx
  try {
    const xlsxPath = path.join(dir, "queries.xlsx");
    const sheetRows = rows.map((r, i) => ({
      "#": i + 1,
      id: r.id,
      platform: r.platform || "",
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
      if (wb.Sheets.queries) { delete wb.Sheets.queries; wb.SheetNames = wb.SheetNames.filter((n) => n !== "queries"); }
    } else { wb = XLSX.utils.book_new(); }
    XLSX.utils.book_append_sheet(wb, ws, "queries");
    wb.SheetNames = ["queries", ...wb.SheetNames.filter((n) => n !== "queries")];
    XLSX.writeFile(wb, xlsxPath);
    console.log(`📊 ${path.relative(process.cwd(), xlsxPath)} rebuilt`);
  } catch (e) {
    if (e.code === "EBUSY") console.log(`⚠️  xlsx 被占用，跳过 rebuild`);
    else throw e;
  }
}

main().catch((e) => { console.error("\n❌", e.message); process.exit(1); });
