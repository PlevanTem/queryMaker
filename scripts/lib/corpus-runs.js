/**
 * corpus-runs.js — single source of truth for the corpus-direct production line.
 *
 * Lists every corpus-direct run (v7+) and loads their query rows. Shared by
 * build-corpus-usage-dashboard.js and analyze-corpus-capacity.js so the run
 * list never drifts between the two.
 *
 * If a working-tree queries.jsonl has 0 usable rows (e.g. a failed re-run
 * overwrote it), loadRuns() transparently falls back to git HEAD.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();

// Corpus-direct runs in scope (smoke runs excluded). Append new runs here.
const RUN_DIRS = [
  { dir: "corpus_run_v7_web_500",     version: "v7",  platform: "web" },
  { dir: "corpus_run_v7_mobile_500",  version: "v7",  platform: "mobile" },
  { dir: "corpus_run_v8_web_500",     version: "v8",  platform: "web" },
  { dir: "corpus_run_v8_mobile_500",  version: "v8",  platform: "mobile" },
  { dir: "corpus_run_v9_web_300",     version: "v9",  platform: "web" },
  { dir: "corpus_run_v9_mobile_300",  version: "v9",  platform: "mobile" },
  { dir: "corpus_run_v10_web_500",    version: "v10", platform: "web" },
  { dir: "corpus_run_v10_mobile_500", version: "v10", platform: "mobile" },
  { dir: "corpus_run_v11_web_165",    version: "v11", platform: "web" },
  { dir: "corpus_run_v12_web_1000",   version: "v12", platform: "web" },
  { dir: "corpus_run_v13_mobile_500", version: "v13", platform: "mobile" },
  { dir: "corpus_run_v14_mobile_500", version: "v14", platform: "mobile" },
];

// Parse JSONL text into usable query rows (drops errored / empty rows).
function parseUsable(text, run) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.error || !r.query_text || !r.query_text.trim()) continue;
    out.push({
      version: run.version,
      platform: r.platform || run.platform,
      l1: r.l1_scene || "(unknown)",
      l2label: r.l2_scene_label || "(unknown)",
      l2key: r.corpus_l2_key || "(unknown)",
      topic: r.corpus_topic || "(unknown)",
      persona: r.corpus_persona_id || "(none)",
      complexity: r.target_complexity || "(unknown)",
      words: Number(r.word_count) || 0,
    });
  }
  return out;
}

// Load all corpus-direct query rows. Pass {quiet:true} to silence per-run logs.
function loadRuns({ quiet = false } = {}) {
  const rows = [];
  for (const run of RUN_DIRS) {
    const rel = `data/output/${run.dir}/queries.jsonl`;
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) {
      if (!quiet) console.warn(`  ⚠ skip missing: ${run.dir}`);
      continue;
    }
    let parsed = parseUsable(fs.readFileSync(fp, "utf8"), run);
    let source = "";
    if (parsed.length === 0) {
      try {
        const head = execSync(`git show HEAD:${rel}`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
        const fromGit = parseUsable(head, run);
        if (fromGit.length > 0) { parsed = fromGit; source = "  (restored from git HEAD)"; }
      } catch { /* no committed version available */ }
    }
    rows.push(...parsed);
    if (!quiet) {
      console.log(`  ${run.version.padEnd(4)} ${run.platform.padEnd(7)} ${String(parsed.length).padStart(5)}  ${run.dir}${source}`);
    }
  }
  return rows;
}

module.exports = { RUN_DIRS, parseUsable, loadRuns };
