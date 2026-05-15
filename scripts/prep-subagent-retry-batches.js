/**
 * prep-subagent-retry-batches.js
 *
 * For each finished run dir, find failed rows (r.error truthy), look up the
 * matching task in plan.jsonl, generate the FULL corpus-direct prompt for it
 * via buildCorpusDirectQueryPrompt, and save into batches under
 * data/output/_retry_subagent/<prefix>_b<NN>_in.json so subagents can ingest.
 *
 * Each input batch is a JSON array of { id, prompt }.
 * Subagent task = run each prompt and write { id, query_text } per item.
 *
 * Usage:  node scripts/prep-subagent-retry-batches.js [--batch 25]
 */

const fs   = require("fs");
const path = require("path");

const { buildCorpusDirectQueryPrompt, parseArgs } = require("../mvp/query_factory_v2");

const TARGETS = [
  { prefix: "mobile", dir: "data/output/corpus_run_v7_mobile_500" },
  { prefix: "web",    dir: "data/output/corpus_run_v7_web_500" },
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const BATCH = Number(args.batch || 25);
  const outDir = "data/output/_retry_subagent";
  fs.mkdirSync(outDir, { recursive: true });

  for (const target of TARGETS) {
    const planPath = path.join(target.dir, "plan.jsonl");
    const queriesPath = path.join(target.dir, "queries.jsonl");
    if (!fs.existsSync(planPath) || !fs.existsSync(queriesPath)) {
      console.log(`⚠️  skip ${target.prefix}: missing plan/queries`);
      continue;
    }
    const tasks = fs.readFileSync(planPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const rows  = fs.readFileSync(queriesPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const failedIds = new Set(rows.filter((r) => r.error).map((r) => r.id));
    const failedTasks = tasks.filter((t) => failedIds.has(t.query_id));

    if (failedTasks.length === 0) {
      console.log(`[${target.prefix}] no failed rows, nothing to prep`);
      continue;
    }

    console.log(`[${target.prefix}] ${failedTasks.length} failed tasks → ${Math.ceil(failedTasks.length / BATCH)} batches of ${BATCH}`);

    for (let i = 0; i < failedTasks.length; i += BATCH) {
      const slice = failedTasks.slice(i, i + BATCH);
      const batchId = `${target.prefix}_b${String(Math.floor(i / BATCH) + 1).padStart(2, "0")}`;
      const items = slice.map((task) => ({
        id: task.query_id,
        prompt: buildCorpusDirectQueryPrompt(task),
      }));
      const fp = path.join(outDir, `${batchId}_in.json`);
      fs.writeFileSync(fp, JSON.stringify(items, null, 2), "utf8");
      console.log(`  wrote ${batchId}: ${items.length} items → ${fp}`);
    }
  }
  console.log("\n✅ Done. Now spawn subagents to read each *_in.json and write *_out.json");
}

main();
