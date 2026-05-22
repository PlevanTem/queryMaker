/**
 * analyze-corpus-capacity.js — corpus pool capacity & expansion-gap analysis.
 *
 * Aggregates every corpus-direct run (v7+) and both topic pools, then computes
 * per-L2 consumption pressure and the gap to a flat per-L2 target. The result
 * feeds expand-corpus.js, which generates the missing topics.
 *
 * Why this exists: the topic pool is partitioned per L2 scene. Cumulative
 * query demand on each L2 has exceeded its local topic count, forcing reuse
 * even while other L2s still have spare topics. This script quantifies that.
 *
 * Usage:
 *   node scripts/analyze-corpus-capacity.js              # flat target 60/L2
 *   node scripts/analyze-corpus-capacity.js --target 80
 *
 * Output:
 *   data/state/corpus_capacity_report.json   (machine-readable, feeds expand-corpus.js)
 *   console table
 */

const fs = require("fs");
const path = require("path");
const { loadRuns } = require("./lib/corpus-runs");

const ROOT = process.cwd();

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const POOL_FILES = {
  web: "scripts/corpus_data_web.json",
  mobile: "scripts/corpus_data.json",
};

function loadPool(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const byL2 = new Map();
  for (const [l2, val] of Object.entries(raw)) {
    byL2.set(l2, {
      l2full: val.l2full || l2,
      topics: Array.isArray(val.topics) ? val.topics : [],
    });
  }
  return byL2;
}

function main() {
  const target = Number(arg("target", 60));
  console.log("┌─ analyze-corpus-capacity ───────────────────────────────────");
  console.log(`│ flat target: ${target} topics / L2`);
  console.log("│ loading corpus-direct runs:");
  const rows = loadRuns();

  const report = { generated_at: new Date().toISOString(), target_per_l2: target, platforms: {} };

  for (const platform of ["web", "mobile"]) {
    const pool = loadPool(POOL_FILES[platform]);
    const platformRows = rows.filter((r) => r.platform === platform);

    // cumulative queries + distinct in-pool topics used, per L2
    const usedByL2 = new Map();   // l2key -> Map(topic -> count)
    for (const r of platformRows) {
      if (!usedByL2.has(r.l2key)) usedByL2.set(r.l2key, new Map());
      const m = usedByL2.get(r.l2key);
      m.set(r.topic, (m.get(r.topic) || 0) + 1);
    }

    const l2Report = [];
    let curTopics = 0, totalGap = 0;
    for (const [l2key, cell] of pool) {
      const poolSet = new Set(cell.topics);
      const poolSize = poolSet.size;
      curTopics += poolSize;
      const used = usedByL2.get(l2key) || new Map();
      let cumQueries = 0, distinctUsed = 0;
      for (const [topic, n] of used) {
        cumQueries += n;
        if (poolSet.has(topic)) distinctUsed++;
      }
      const gap = Math.max(0, target - poolSize);
      totalGap += gap;
      l2Report.push({
        l2key,
        l2full: cell.l2full,
        poolSize,
        cumQueries,
        distinctUsed,
        reuseAvg: distinctUsed ? +(cumQueries / distinctUsed).toFixed(2) : 0,
        gap,
      });
    }
    l2Report.sort((a, b) => b.reuseAvg - a.reuseAvg);

    report.platforms[platform] = {
      pool_file: POOL_FILES[platform],
      l2_count: pool.size,
      current_topics: curTopics,
      target_topics: pool.size * target,
      total_gap: totalGap,
      l2: l2Report,
    };

    // console summary
    const overSub = l2Report.filter((x) => x.cumQueries > x.poolSize).length;
    console.log(`│`);
    console.log(`│ ${platform.toUpperCase()}  ${pool.size} L2 · ${curTopics} topics → target ${pool.size * target} · gap +${totalGap}`);
    console.log(`│   L2 over-subscribed (cumulative queries > pool): ${overSub}/${pool.size}`);
    console.log(`│   top reuse-pressure L2s:`);
    for (const x of l2Report.slice(0, 6)) {
      console.log(
        `│     ${x.l2key.slice(0, 26).padEnd(27)} pool=${String(x.poolSize).padStart(3)}  q=${String(x.cumQueries).padStart(4)}  reuse=${x.reuseAvg.toFixed(2)}×  gap=+${x.gap}`,
      );
    }
  }

  const outPath = path.join(ROOT, "data/state/corpus_capacity_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log("│");
  console.log(`└ report → ${path.relative(ROOT, outPath)}`);
}

main();
