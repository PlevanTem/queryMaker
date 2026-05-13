/**
 * run-corpus.js — Corpus-Direct production pipeline runner.
 *
 * 工作流：
 *   1. parseRequirementsFromWorkbook(xlsx)  → spec
 *   2. buildCorpusPlan(spec, corpus_data, {total, complexityMix})
 *        → 按 xlsx 场景配比分配 task 数；每 task 锚定一个 corpus_topic
 *   3. 对每个 task 调 buildCorpusDirectQueryPrompt → claude CLI（1 次 LLM 调用）
 *   4. scoreQueryRecord 评分 → 写 JSONL + plan.jsonl + summary.json
 *
 * 模型依赖：
 *   - claude CLI（本机 `claude.cmd`），走 packyapi CC 网关
 *   - 默认 model = claude-sonnet-4-6（可通过 ANTHROPIC_MODEL 覆盖）
 *
 * 用法：
 *   node scripts/run-corpus.js                                  # --total 200 默认，全 medium
 *   node scripts/run-corpus.js --total 500
 *   node scripts/run-corpus.js --total 200 --complexity-mix "vague,medium,medium"
 *   node scripts/run-corpus.js --total 200 --limit 10            # 只跑前10条（验证用）
 *   node scripts/run-corpus.js --total 200 --concurrency 4
 *   node scripts/run-corpus.js --total 5 --dry-run               # 不调 LLM，看 plan
 *   node scripts/run-corpus.js --out data/output/corpus_v1       # 自定义输出目录
 */

const path = require("path");
const fs   = require("fs");
const XLSX = require("xlsx");

const {
  parseArgs,
  ensureDir,
  writeJson,
  writeJsonl,
  cleanText,
  autoDetectWorkbook,
  parseRequirementsFromWorkbook,
  buildCorpusPlan,
  buildCorpusDirectQueryPrompt,
  scoreQueryRecord,
  normalizeQueryOutput,
  mapWithConcurrency,
  DEFAULT_CORPUS_COMPLEXITY_MIX,
} = require("../mvp/query_factory_v2");

const {
  applyPackyEnv,
  callClaudeCli,
  CLI_MODEL,
} = require("./lib/claude-cli");

applyPackyEnv();

const QUERY_SYSTEM =
  "You are roleplaying as a real end-user typing a UI request to an AI coding assistant. " +
  "Output only the user's message. No JSON. No meta commentary. English only.";

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function parseComplexityMix(raw) {
  if (!raw || raw === true) return DEFAULT_CORPUS_COMPLEXITY_MIX;
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const total = Number(args.total || 200);
  const complexityMix = parseComplexityMix(args["complexity-mix"]);
  const concurrency = Number(args.concurrency || 2);
  const isDryRun = args["dry-run"] === true;
  const doScore = args.score === true;          // default: off
  const noXlsx  = args["no-xlsx"] === true;     // default: write xlsx
  const limit =
    args.limit !== undefined && args.limit !== true ? Number(args.limit) : null;

  const rootDir = process.cwd();
  const inputPath = args.input
    ? path.resolve(rootDir, args.input)
    : autoDetectWorkbook(rootDir + path.sep + "data" + path.sep + "input") ||
      autoDetectWorkbook(rootDir);
  const outDir = path.resolve(rootDir, args.out || "data/output/corpus_run");
  ensureDir(outDir);

  console.log("┌─ run-corpus.js ────────────────────────────────────────────");
  console.log("│  mode         : corpus-direct (1× LLM call per task)");
  console.log(`│  model        : ${CLI_MODEL}`);
  console.log(`│  input xlsx   : ${path.relative(rootDir, inputPath)}`);
  console.log(`│  output dir   : ${path.relative(rootDir, outDir)}`);
  console.log(`│  total        : ${total}`);
  console.log(`│  complexity   : [${complexityMix.join(", ")}]`);
  console.log(`│  concurrency  : ${concurrency}`);
  console.log(`│  scoring      : ${doScore ? "on" : "off (default)"}`);
  console.log(`│  xlsx export  : ${noXlsx ? "off" : "on (default)"}`);
  console.log(`│  dry-run      : ${isDryRun}`);
  if (limit !== null) console.log(`│  limit        : ${limit}`);
  console.log("└────────────────────────────────────────────────────────────");

  // ── 1. Parse xlsx ─────────────────────────────────────────────────────────
  const spec = parseRequirementsFromWorkbook(inputPath);
  console.log(`\n[1/5] 解析场景：${spec.total_scenarios} 个 L2 场景`);

  // ── 2. Build corpus plan ──────────────────────────────────────────────────
  const corpusData = require("./corpus_data.json");
  const plan = buildCorpusPlan(spec, corpusData, { total, complexityMix });
  const planPath = path.join(outDir, "plan.jsonl");
  writeJsonl(planPath, plan.tasks);

  // L1 distribution snapshot
  const byL1 = {};
  plan.tasks.forEach((t) => (byL1[t.l1_scene] = (byL1[t.l1_scene] || 0) + 1));
  const l1Lines = Object.entries(byL1)
    .sort((a, b) => b[1] - a[1])
    .map(([l1, n]) => `      ${String(n).padStart(3)}  ${l1}`);
  console.log(`[2/5] 计划：${plan.total_tasks} 个 task → ${path.relative(rootDir, planPath)}`);
  console.log(`      L1 分布：`);
  console.log(l1Lines.join("\n"));

  // ── 3. Maybe limit ────────────────────────────────────────────────────────
  let tasks = plan.tasks;
  if (limit !== null) {
    tasks = tasks.slice(0, limit);
    console.log(`[3/5] --limit ${limit} → 仅执行前 ${tasks.length} 个`);
  } else {
    console.log(`[3/5] 执行全部 ${tasks.length} 个 task`);
  }

  // ── 4. Generate queries ──────────────────────────────────────────────────
  console.log(`\n[4/5] 生成 query（concurrency=${concurrency}${isDryRun ? ", DRY-RUN" : ""}）`);
  const tStart = Date.now();

  const rows = await mapWithConcurrency(tasks, concurrency, async (task, idx) => {
    const promptText = buildCorpusDirectQueryPrompt(task);
    const t0 = Date.now();
    let queryText;
    let error = null;
    if (isDryRun) {
      queryText = `[DRY-RUN] ${task.corpus_topic} — ${task.target_complexity}`;
    } else {
      try {
        const raw = await callClaudeCli(promptText, {
          systemPrompt: QUERY_SYSTEM,
          label: task.query_id,
        });
        queryText = normalizeQueryOutput(raw);
      } catch (e) {
        error = e.message.split("\n")[0];
        queryText = "";
      }
    }
    const dt = Date.now() - t0;

    let scored = null;
    if (!error && doScore) {
      scored = scoreQueryRecord({
        query_text: queryText,
        target_complexity: task.target_complexity,
        application_type: task.application_type,
        design_style: task.design_style,
        product_type: task.product_type,
      });
    }

    const status = error ? "✗" : "·";
    const topicShort = (task.corpus_topic || "").slice(0, 40);
    const errSuffix = error ? `  ERR: ${error.slice(0, 60)}` : "";
    const scoreSuffix = scored ? `q=${scored.quality_score} ` : "";
    console.log(
      `  ${status} [${String(idx + 1).padStart(3)}/${tasks.length}] ${task.l2_scene_label.padEnd(16)} | ${topicShort.padEnd(40)} → ${scoreSuffix}(${wordCount(queryText).toString().padStart(3)}w, ${dt}ms)${errSuffix}`,
    );

    return {
      id: task.query_id,
      scene_id: task.scene_id,
      l1_scene: task.l1_scene,
      l2_scene_label: task.l2_scene_label,
      corpus_topic: task.corpus_topic,
      application_type: task.application_type,
      product_type: task.product_type,
      target_complexity: task.target_complexity,
      design_style: task.design_style,
      query_text: queryText,
      query_prompt_text: promptText,
      word_count: wordCount(queryText),
      quality_score: scored ? scored.quality_score : null,
      quality_pass: scored ? scored.quality_pass : null,
      complexity_inferred: scored ? scored.complexity_level : null,
      duration_ms: dt,
      generator_mode: "corpus-direct",
      llm_model: isDryRun ? "(dry-run)" : CLI_MODEL,
      created_at: new Date().toISOString(),
      error,
    };
  });

  // ── 5. Persist + summary ─────────────────────────────────────────────────
  const outJsonl = path.join(outDir, "queries.jsonl");
  writeJsonl(outJsonl, rows);

  const successes = rows.filter((r) => !r.error);
  const failures = rows.filter((r) => r.error);
  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  const avgW =
    successes.length ? successes.reduce((s, r) => s + r.word_count, 0) / successes.length : 0;
  const scoredRows = successes.filter((r) => r.quality_score !== null);
  const avgQ = scoredRows.length
    ? scoredRows.reduce((s, r) => s + r.quality_score, 0) / scoredRows.length
    : null;
  const passN = scoredRows.filter((r) => r.quality_pass).length;

  const summary = {
    generated_at: new Date().toISOString(),
    model: CLI_MODEL,
    mode: "corpus-direct",
    dry_run: isDryRun,
    plan_total: plan.total_tasks,
    executed_total: rows.length,
    complexity_mix: complexityMix,
    successes: successes.length,
    failures: failures.length,
    scored: scoredRows.length,
    pass_count: avgQ === null ? null : passN,
    pass_rate: avgQ === null ? null : (scoredRows.length ? passN / scoredRows.length : 0),
    avg_quality_score: avgQ === null ? null : +avgQ.toFixed(2),
    avg_word_count: Math.round(avgW),
    l1_distribution: byL1,
    elapsed_sec: +elapsed,
  };
  writeJson(path.join(outDir, "summary.json"), summary);

  // ── XLSX export (default on) ─────────────────────────────────────────────
  let xlsxPath = null;
  if (!noXlsx) {
    xlsxPath = path.join(outDir, "queries.xlsx");
    const sheetRows = rows.map((r, i) => ({
      "#": i + 1,
      id: r.id,
      l1_scene: r.l1_scene,
      l2_scene_label: r.l2_scene_label,
      corpus_topic: r.corpus_topic,
      target_complexity: r.target_complexity,
      word_count: r.word_count,
      duration_ms: r.duration_ms,
      ...(doScore ? { quality_score: r.quality_score, quality_pass: r.quality_pass } : {}),
      query_text: r.query_text,
      error: r.error || "",
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    // set wider column for query_text
    const headers = Object.keys(sheetRows[0] || {});
    ws["!cols"] = headers.map((h) => {
      if (h === "query_text") return { wch: 80 };
      if (h === "corpus_topic" || h === "l2_scene_label" || h === "l1_scene") return { wch: 28 };
      if (h === "id") return { wch: 18 };
      return { wch: 14 };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "queries");

    // Summary sheet
    const summarySheet = XLSX.utils.json_to_sheet([
      { metric: "generated_at", value: summary.generated_at },
      { metric: "model", value: summary.model },
      { metric: "mode", value: summary.mode },
      { metric: "plan_total", value: summary.plan_total },
      { metric: "executed_total", value: summary.executed_total },
      { metric: "complexity_mix", value: summary.complexity_mix.join(",") },
      { metric: "successes", value: summary.successes },
      { metric: "failures", value: summary.failures },
      { metric: "avg_word_count", value: summary.avg_word_count },
      { metric: "avg_quality_score", value: summary.avg_quality_score === null ? "(scoring off)" : summary.avg_quality_score },
      { metric: "pass_rate", value: summary.pass_rate === null ? "(scoring off)" : summary.pass_rate },
      { metric: "elapsed_sec", value: summary.elapsed_sec },
    ]);
    summarySheet["!cols"] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, "summary");

    // L1 distribution sheet
    const l1Sheet = XLSX.utils.json_to_sheet(
      Object.entries(byL1).sort((a, b) => b[1] - a[1]).map(([l1, n]) => ({ l1_scene: l1, count: n })),
    );
    l1Sheet["!cols"] = [{ wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, l1Sheet, "l1_distribution");

    XLSX.writeFile(wb, xlsxPath);
  }

  console.log(`\n[5/5] ✅ ${successes.length}/${rows.length} ok, ${failures.length} fail (${elapsed}s)`);
  console.log(`      平均词数: ${Math.round(avgW)}` + (avgQ !== null ? ` | 平均质量分: ${avgQ.toFixed(2)} | 通过率: ${passN}/${scoredRows.length}` : ""));
  console.log(`      queries  → ${path.relative(rootDir, outJsonl)}`);
  console.log(`      summary  → ${path.relative(rootDir, path.join(outDir, "summary.json"))}`);
  if (xlsxPath) console.log(`      xlsx     → ${path.relative(rootDir, xlsxPath)}`);
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  process.exit(1);
});
