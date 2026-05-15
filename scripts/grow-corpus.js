/**
 * grow-corpus.js
 *
 * Expands the topic pool for low-coverage L2 categories by generating new UI app
 * topic ideas via Claude CLI. New topics are deduplicated (Jaccard similarity)
 * against the existing pool before being appended to corpus_data[_web].json.
 *
 * Usage:
 *   node scripts/grow-corpus.js [options]
 *
 * Options:
 *   --platform mobile|web    corpus file to expand (default: mobile)
 *   --threshold <n>          expand L2s with fewer than n fresh (unused) topics remaining (default: 10; 0 = only expand fully exhausted)
 *   --expand-by <n>          target new topics per L2 (default: 20)
 *   --only <l2key>           only expand this specific L2 key (exact match)
 *   --dry-run                print plan without calling Claude or writing files
 *   --no-usage-track         ignore usage state; rely solely on pool-size threshold
 *   --model <id>             override Claude model
 */

const fs   = require("fs");
const path = require("path");
const { applyPackyEnv, callClaudeCli, CLI_MODEL } = require("./lib/claude-cli");

applyPackyEnv(path.resolve(__dirname, ".."));

// ── CLI args ────────────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
function flag(name) { return process.argv.includes("--" + name); }

const PLATFORM       = arg("platform") || "mobile";
const THRESHOLD      = Number(arg("threshold") ?? 10);
const EXPAND_BY      = Number(arg("expand-by") ?? 20);
const ONLY_KEY       = arg("only") || null;
const DRY_RUN        = flag("dry-run");
const NO_USAGE_TRACK = flag("no-usage-track");
const MODEL          = arg("model") || CLI_MODEL;

const ROOT_DIR    = path.resolve(__dirname, "..");
const CORPUS_FILE = PLATFORM === "web"
  ? path.join(__dirname, "corpus_data_web.json")
  : path.join(__dirname, "corpus_data.json");
const USAGE_FILE  = path.join(ROOT_DIR, "data", "state", `corpus_usage_${PLATFORM}.json`);

// ── Similarity deduplication ─────────────────────────────────────────────────
function tokenize(text) {
  return new Set(String(text).toLowerCase().replace(/[^\w\s]/g, " ").trim().split(/\s+/).filter(Boolean));
}

function jaccard(setA, setB) {
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function tooSimilar(newTopic, existingTopics, threshold = 0.4) {
  const newTokens = tokenize(newTopic);
  return existingTopics.some((t) => jaccard(newTokens, tokenize(t)) > threshold);
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildExpansionPrompt(l2full, existingTopics, count) {
  return `You are helping expand a UI/UX query dataset. Your task is to generate ${count} new, creative, and distinct UI app topic ideas for the following category:

Category: ${l2full}

Existing topics (do NOT repeat or closely paraphrase any of these):
${existingTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Requirements:
- Each new topic is a 3-7 word English noun phrase (like the existing ones)
- Topics should be concrete, specific UI application ideas that fit the category
- Avoid repeating concepts already covered by the existing list
- Vary the topic types: different user roles, use cases, industries, and interaction patterns
- No numbering, no bullets, no explanations — just one topic per line

Output exactly ${count} new topic phrases, one per line:`;
}

// ── Parse Claude output ───────────────────────────────────────────────────────
function parseTopics(rawOutput) {
  return rawOutput
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length > 3 && line.length < 120 && /\w{2,}/.test(line));
}

// ── Load usage state ──────────────────────────────────────────────────────────
function loadUsage() {
  if (!fs.existsSync(USAGE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")).usage || {};
  } catch {
    return {};
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(CORPUS_FILE)) {
    console.error(`Corpus file not found: ${CORPUS_FILE}`);
    process.exit(1);
  }

  const corpus = JSON.parse(fs.readFileSync(CORPUS_FILE, "utf8"));
  const usage  = NO_USAGE_TRACK ? {} : loadUsage();
  const keys   = ONLY_KEY ? [ONLY_KEY] : Object.keys(corpus);

  // Determine which L2s need expansion
  const targets = keys
    .filter((k) => corpus[k])
    .map((k) => {
      const topics    = corpus[k].topics || [];
      const usedKeys  = NO_USAGE_TRACK ? 0 : Object.keys(usage[k] || {}).length;
      const poolSize  = topics.length;
      const freshLeft = poolSize - usedKeys;
      // Expand if: fewer than THRESHOLD fresh topics remain (0 = only expand fully exhausted)
      const needsExpansion = freshLeft <= THRESHOLD;
      return { k, topics, poolSize, usedKeys, freshLeft, needsExpansion };
    })
    .filter(({ needsExpansion }) => needsExpansion);

  if (targets.length === 0) {
    console.log(`No L2s need expansion (threshold=${THRESHOLD}, platform=${PLATFORM})`);
    return;
  }

  console.log(`\n[grow-corpus] platform=${PLATFORM}  expand-by=${EXPAND_BY}  model=${MODEL}`);
  console.log(`  ${targets.length} L2s targeted for expansion (threshold: fresh<${THRESHOLD}):`);
  for (const { k, poolSize, usedKeys, freshLeft } of targets) {
    console.log(`  · ${k}  (pool=${poolSize}, used=${usedKeys}, fresh=${freshLeft})`);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] No Claude calls or file writes.");
    return;
  }

  let totalAdded = 0;

  for (const { k, topics } of targets) {
    const l2full = corpus[k].l2full || k;
    console.log(`\n→ Expanding [${k}] (${topics.length} existing topics, target +${EXPAND_BY})`);

    let raw;
    try {
      raw = await callClaudeCli(buildExpansionPrompt(l2full, topics, EXPAND_BY + 5), {
        model: MODEL,
        label: k,
        timeoutMs: 60000,
      });
    } catch (e) {
      console.error(`  ✗ Claude call failed: ${e.message}`);
      continue;
    }

    const candidates = parseTopics(raw);
    const accepted = [];
    for (const t of candidates) {
      if (accepted.length >= EXPAND_BY) break;
      if (tooSimilar(t, [...topics, ...accepted])) {
        console.log(`  ~ skip (similar): ${t}`);
        continue;
      }
      accepted.push(t);
      console.log(`  + ${t}`);
    }

    if (accepted.length === 0) {
      console.log(`  ⚠️  no new topics accepted after dedup`);
      continue;
    }

    corpus[k].topics = [...topics, ...accepted];
    totalAdded += accepted.length;
    console.log(`  ✓ added ${accepted.length} topics → pool now ${corpus[k].topics.length}`);
  }

  if (totalAdded > 0) {
    fs.writeFileSync(CORPUS_FILE, JSON.stringify(corpus, null, 2) + "\n", "utf8");
    console.log(`\n📚 Saved ${CORPUS_FILE} (+${totalAdded} topics across ${targets.length} L2s)`);
  } else {
    console.log("\n⚠️  No new topics were added.");
  }

  console.log("\n✅ Done");
}

main().catch((e) => { console.error(e); process.exit(1); });
