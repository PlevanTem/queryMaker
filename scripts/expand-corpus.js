/**
 * expand-corpus.js — no-API corpus pool expansion (Claude Code subagent path).
 *
 * Grows the per-L2 topic pools to a flat target, using the same no-API
 * subagent-swarm path as run-corpus.js --prep-only (no external API).
 *
 *   Phase 1  --prep-only : read data/state/corpus_capacity_report.json, build
 *                          per-L2 topic-generation prompts, batch them into
 *                          _expand_in/<platform>_b<NN>_in.json
 *   Phase 2  (subagents) : Claude Code spawns subagents, one per batch, each
 *                          writes <platform>_b<NN>_out.json
 *   Phase 3  --merge     : merge new topics into corpus_data_web.json /
 *                          corpus_data.json, deduped, capped at target
 *
 * CRITICAL design point: every expansion prompt embeds the FULL list of the
 * L2's existing topics and demands the new topics be a genuinely different
 * sub-niche from each — no paraphrases, no minor variations. In-scene
 * differentiation is enforced at generation time; merge only does exact dedup.
 *
 * Usage:
 *   node scripts/analyze-corpus-capacity.js            # run this first
 *   node scripts/expand-corpus.js --prep-only          # → batches
 *   ... spawn subagents to fill _out.json ...
 *   node scripts/expand-corpus.js --merge              # → pools grown
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data/output/corpus_pool_expansion");
const IN_DIR = path.join(OUT_DIR, "_expand_in");
const REPORT_PATH = path.join(ROOT, "data/state/corpus_capacity_report.json");

const POOL_FILES = {
  web: "scripts/corpus_data_web.json",
  mobile: "scripts/corpus_data.json",
};
const PLATFORM_DESC = {
  web: "web site/app (desktop-first or responsive, used with mouse + keyboard)",
  mobile: "mobile H5 app (mobile-first, single-screen-per-tap, used on a phone)",
};

function flag(name) { return process.argv.includes("--" + name); }
function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9一-鿿]+/g, " ").trim(); }

// ── expansion prompt ─────────────────────────────────────────────────────────
function buildExpansionPrompt(platform, l2key, l2full, existingTopics, need) {
  const list = existingTopics.length
    ? existingTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(none yet)";
  return [
    `## Goal`,
    `Generate ${need} NEW ${PLATFORM_DESC[platform]} product/site topics for the scene below.`,
    ``,
    `## Scene`,
    `${l2full}`,
    `(L2 key: ${l2key})`,
    ``,
    `## Existing topics already in this scene (${existingTopics.length}) — your new topics MUST differ from EVERY one`,
    list,
    ``,
    `## Hard requirements`,
    `1. Output a JSON array of EXACTLY ${need} new topic strings, in English.`,
    `2. Each topic = a concrete, buildable product/site idea, 4-12 words. Not a generic feature name.`,
    `3. CRITICAL — in-scene differentiation: every new topic must be a genuinely different`,
    `   sub-niche or use-case from EVERY existing topic listed above. Do NOT produce`,
    `   paraphrases, synonyms, renamings, or minor variations. Example: if "freelance`,
    `   invoice tracker" already exists, do NOT emit "invoice management tool for`,
    `   freelancers". If an idea overlaps in concept with any existing topic, discard it`,
    `   and find a different angle (different audience, sub-domain, mechanic, or context).`,
    `4. The ${need} new topics must also be clearly distinct from each other.`,
    `5. Stay strictly within the scene — every topic must clearly belong to: ${l2full}`,
    `6. Lean ${platform}-native: ${platform === "web"
        ? 'e.g. "open-source contributor leaderboard site", not a phone-only idea'
        : 'e.g. "pocket habit-streak tracker", not a desktop multi-pane tool'}.`,
    `7. Output pure JSON — a single array of strings. No markdown fences, no commentary.`,
    ``,
    `Return ONLY the JSON array of ${need} strings.`,
  ].join("\n");
}

// ── phase 1: prep ────────────────────────────────────────────────────────────
function prep() {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error("capacity report missing — run: node scripts/analyze-corpus-capacity.js");
  }
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  const batchSize = Number(arg("batch", 6));
  ensureDir(IN_DIR);

  console.log("┌─ expand-corpus --prep-only ─────────────────────────────────");
  console.log(`│ target ${report.target_per_l2}/L2 · ${batchSize} L2 per batch`);

  let grandTopics = 0, grandBatches = 0;
  const manifest = [];
  for (const platform of ["web", "mobile"]) {
    const pf = report.platforms[platform];
    if (!pf) continue;
    const pool = JSON.parse(fs.readFileSync(path.join(ROOT, POOL_FILES[platform]), "utf8"));
    const needCells = pf.l2.filter((x) => x.gap > 0);

    let batchN = 0;
    for (let i = 0; i < needCells.length; i += batchSize) {
      batchN += 1;
      const slice = needCells.slice(i, i + batchSize);
      const items = slice.map((cell) => {
        const poolCell = pool[cell.l2key] || { topics: [] };
        const existing = poolCell.topics || [];
        grandTopics += cell.gap;
        return {
          platform,
          l2key: cell.l2key,
          l2full: cell.l2full,
          need: cell.gap,
          existing_count: existing.length,
          prompt: buildExpansionPrompt(platform, cell.l2key, cell.l2full, existing, cell.gap),
        };
      });
      const fp = path.join(IN_DIR, `${platform}_b${String(batchN).padStart(2, "0")}_in.json`);
      fs.writeFileSync(fp, JSON.stringify(items, null, 2) + "\n", "utf8");
      manifest.push(path.basename(fp));
    }
    grandBatches += batchN;
    console.log(`│ ${platform.padEnd(7)} ${needCells.length} L2 need topics → ${batchN} batches`);
  }
  console.log(`│ total: ${grandBatches} batches · ${grandTopics} new topics to generate`);
  console.log(`└ batches → ${path.relative(ROOT, IN_DIR)}`);
  console.log(`  next: spawn one subagent per *_in.json, each writes *_out.json`);
  console.log(`        then: node scripts/expand-corpus.js --merge`);
}

// ── phase 3: merge ───────────────────────────────────────────────────────────
function merge() {
  if (!fs.existsSync(IN_DIR)) throw new Error(`no batch dir: ${IN_DIR}`);
  const report = fs.existsSync(REPORT_PATH) ? JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")) : null;
  const target = Number(arg("target", report ? report.target_per_l2 : 60));

  const outFiles = fs.readdirSync(IN_DIR).filter((f) => f.endsWith("_out.json")).sort();
  if (outFiles.length === 0) throw new Error("no *_out.json found — subagents have not run yet");

  // collect: platform -> l2key -> [new topics]
  const collected = { web: new Map(), mobile: new Map() };
  for (const f of outFiles) {
    let arr;
    try { arr = JSON.parse(fs.readFileSync(path.join(IN_DIR, f), "utf8")); }
    catch (e) { console.log(`  ⚠ skip ${f}: ${e.message}`); continue; }
    for (const item of arr) {
      if (!item || !item.platform || !item.l2key || !Array.isArray(item.topics)) continue;
      const m = collected[item.platform];
      if (!m) continue;
      if (!m.has(item.l2key)) m.set(item.l2key, []);
      m.get(item.l2key).push(...item.topics.filter((t) => typeof t === "string" && t.trim()));
    }
  }

  console.log("┌─ expand-corpus --merge ─────────────────────────────────────");
  for (const platform of ["web", "mobile"]) {
    const m = collected[platform];
    if (!m || m.size === 0) { console.log(`│ ${platform}: nothing to merge`); continue; }
    const poolPath = path.join(ROOT, POOL_FILES[platform]);
    const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));

    let added = 0, dropped = 0, cells = 0;
    for (const [l2key, fresh] of m) {
      const cell = pool[l2key];
      if (!cell) { console.log(`│ ⚠ ${platform} L2 not in pool: ${l2key}`); continue; }
      cell.topics = cell.topics || [];
      const seen = new Set(cell.topics.map(norm));
      for (const t of fresh) {
        const tt = t.trim();
        if (cell.topics.length >= target) break;
        if (seen.has(norm(tt))) { dropped++; continue; }   // exact / normalized dup
        cell.topics.push(tt);
        seen.add(norm(tt));
        added++;
      }
      cells++;
    }
    fs.writeFileSync(poolPath, JSON.stringify(pool, null, 2) + "\n", "utf8");
    const total = Object.values(pool).reduce((s, c) => s + (c.topics ? c.topics.length : 0), 0);
    console.log(`│ ${platform.padEnd(7)} ${cells} L2 updated · +${added} topics · ${dropped} dups dropped · pool now ${total}`);
    console.log(`│         → ${POOL_FILES[platform]}`);
  }
  console.log(`└ done — re-run analyze-corpus-capacity.js to confirm gaps closed`);
}

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  if (flag("merge")) return merge();
  return prep();   // default
}

main();
