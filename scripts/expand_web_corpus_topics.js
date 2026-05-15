/**
 * expand_web_corpus_topics.js
 *
 * Read scripts/corpus_data_web.json (74 L2 cells, each with 1-5 seed topics
 * from the matrix md), call claude CLI per L2 to expand to ~TARGET_TOPICS_PER_L2
 * topics each, write back. Idempotent: cells already at >=TARGET are skipped.
 *
 * Usage:
 *   node scripts/expand_web_corpus_topics.js
 *   node scripts/expand_web_corpus_topics.js --target 30 --concurrency 4
 *   node scripts/expand_web_corpus_topics.js --only "创作者 · 展示型"     # single cell
 */

const fs   = require("fs");
const path = require("path");

const { parseArgs, mapWithConcurrency } = require("../mvp/query_factory_v2");
const { applyPackyEnv, callClaudeCli } = require("./lib/claude-cli");

applyPackyEnv();

const SYSTEM = "You are a domain analyst building a corpus of realistic, varied UI scenes for the web. Output strict JSON only — a single array of plain English topic strings. No prose, no code fences, no commentary.";

function buildExpansionPrompt(l2Label, l2Full, seedTopics, n) {
  return [
    `## Goal`,
    `Generate ${n} additional, distinct, realistic web product/site topics for the scene below.`,
    "",
    `## Scene`,
    `${l2Full}`,
    `(L2 short key: ${l2Label})`,
    "",
    `## Existing seed topics (in Chinese, do NOT repeat)`,
    seedTopics.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    "",
    `## Output Requirements`,
    "1. Output a JSON array of EXACTLY " + n + " new topic strings, in English.",
    "2. Each topic = a concrete web product/site idea that fits this scene — NOT a generic feature name.",
    "3. Topics should span different sub-niches to maximise diversity. No two topics should be near-paraphrases.",
    "4. Each topic 4-12 words. Specific enough that a real designer/dev could build it.",
    "5. Format: pure JSON array, no markdown fences, no leading/trailing text.",
    `6. The topics describe real-world WEB sites/apps (desktop-first or responsive). Lean web-native (e.g. \"open-source contributor leaderboard site\" not \"mobile fitness ring tracker\").`,
    "7. Stay within the scene — every topic must clearly belong to: " + l2Full,
    "",
    "Return ONLY the JSON array.",
  ].join("\n");
}

function tryParseJsonArray(text) {
  let s = String(text || "").trim();
  // strip code fences if any
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // find first [ and last ]
  const start = s.indexOf("[");
  const end   = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON array found in output: " + s.slice(0, 200));
  }
  const sliced = s.slice(start, end + 1);
  return JSON.parse(sliced);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = Number(args.target || 30);
  const concurrency = Number(args.concurrency || 4);
  const only = args.only && args.only !== true ? String(args.only) : null;

  const corpusPath = path.resolve(process.cwd(), "scripts/corpus_data_web.json");
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

  const work = [];
  for (const [l2Label, cell] of Object.entries(corpus)) {
    if (only && l2Label !== only) continue;
    const cur = cell.topics?.length || 0;
    if (cur >= target) continue; // already enough
    const need = target - cur;
    work.push({ l2Label, cell, need });
  }

  console.log(`📦 ${Object.keys(corpus).length} cells loaded · ${work.length} need expansion · target ${target}/cell · concurrency ${concurrency}`);
  if (work.length === 0) {
    console.log("✅ All cells already at target. Nothing to do.");
    return;
  }

  let okN = 0, failN = 0;
  const results = await mapWithConcurrency(work, concurrency, async ({ l2Label, cell, need }) => {
    const t0 = Date.now();
    const prompt = buildExpansionPrompt(l2Label, cell.l2full, cell.topics, need);
    try {
      const raw = await callClaudeCli(prompt, { systemPrompt: SYSTEM, label: `expand:${l2Label.slice(0, 14)}`, maxRetries: 2 });
      const arr = tryParseJsonArray(raw);
      if (!Array.isArray(arr)) throw new Error("Output is not an array");
      // Dedupe vs existing topics (case-insensitive)
      const existing = new Set(cell.topics.map((t) => t.toLowerCase()));
      const fresh = arr.filter((t) => typeof t === "string" && t.trim() && !existing.has(t.trim().toLowerCase()))
                      .map((t) => t.trim());
      cell.topics = [...cell.topics, ...fresh].slice(0, target);
      const dt = Date.now() - t0;
      okN++;
      console.log(`  ✓ [${String(okN + failN).padStart(2)}/${work.length}] ${l2Label.padEnd(22)} +${fresh.length} (now ${cell.topics.length}) (${dt}ms)`);
      return { ok: true, l2Label, added: fresh.length };
    } catch (e) {
      failN++;
      console.log(`  ✗ [${String(okN + failN).padStart(2)}/${work.length}] ${l2Label.padEnd(22)} ERR ${e.message.split("\n")[0].slice(0, 80)}`);
      return { ok: false, l2Label, error: e.message };
    }
  });

  // Save
  fs.writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + "\n", "utf8");
  console.log(`\n✅ ${okN} ok / ${failN} fail`);
  console.log(`📝 Saved → ${path.relative(process.cwd(), corpusPath)}`);
  const totalTopics = Object.values(corpus).reduce((s, c) => s + c.topics.length, 0);
  const avgTopics = (totalTopics / Object.keys(corpus).length).toFixed(1);
  console.log(`📊 Total: ${Object.keys(corpus).length} cells · ${totalTopics} topics · avg ${avgTopics}/cell`);
}

main().catch((e) => {
  console.error("\n❌ Fatal:", e.message);
  process.exit(1);
});
