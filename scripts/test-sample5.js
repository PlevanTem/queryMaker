// 从 data/input/场景覆盖.xlsx 随机抽 5 个二级场景，跑一次 query 生成
// 优先尝试真实 LLM（mode: claude-code），失败则回退到 persona-fallback 模板模式
const fs = require("fs");
const path = require("path");

// 加载 .env.local（覆盖外部环境变量，与连通性测试脚本一致）
(function loadEnvLocal() {
  const p = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, i).trim()] = v;
  }
})();

const {
  parseRequirementsFromWorkbook,
  buildSeedPlan,
  generateQueryRecords,
  ensureDir,
  writeJsonl,
  writeJson,
} = require("../mvp/query_factory_v2");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "data/input/场景覆盖.xlsx");
const OUT_DIR = path.join(ROOT, "data/output/sample5");
ensureDir(OUT_DIR);

function pickRandom(arr, n, seed) {
  // 简单种子化随机
  let s = seed >>> 0;
  function rand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  }
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

(async () => {
  console.log("[1] 解析需求表 ...");
  const fullSpec = parseRequirementsFromWorkbook(INPUT);
  console.log("    总场景数:", fullSpec.total_scenarios);

  const seed = Number(process.env.SAMPLE_SEED || Date.now() & 0xffff);
  console.log("[2] 随机抽 5 个二级场景（seed=" + seed + "）...");
  const picked = pickRandom(fullSpec.scenarios, 5, seed).map((sc) => ({
    ...sc,
    target_count: 1, // 强制每个抽样场景只生成 1 条
  }));
  picked.forEach((sc, i) => {
    console.log(`    [${i + 1}] ${sc.id}  L1=${sc.l1_scene}  L2=${sc.l2_scene_label}`);
    console.log(`        examples=${(sc.l2_scene_examples || []).join(" / ") || "(无)"}`);
    console.log(`        candidate apps=${(sc.application_type_candidates || []).join(" / ")}`);
  });

  const sampledSpec = {
    ...fullSpec,
    total_scenarios: picked.length,
    scenarios: picked,
  };

  console.log("[3] 构建生成计划 ...");
  const plan = buildSeedPlan(sampledSpec, {});
  console.log("    任务数:", plan.tasks.length);
  plan.tasks.forEach((t, i) => {
    console.log(
      `    [${i + 1}] ${t.query_id}  app=${t.application_type}  product=${t.product_type}  complexity=${t.target_complexity}  style=${t.design_style}`,
    );
  });

  // 保存计划，方便复看
  writeJson(path.join(OUT_DIR, "plan.json"), plan);

  // —— 生成 ——
  let rows = [];
  let usedMode = null;
  let llmError = null;

  console.log("\n[4] 尝试 真实 LLM 模式：claude-code");
  try {
    rows = await generateQueryRecords(
      { tasks: plan.tasks },
      { mode: "claude-code", llm: { concurrency: 2 } },
    );
    usedMode = "claude-code";
    console.log("    ✅ LLM 生成成功，共 " + rows.length + " 条");
  } catch (e) {
    llmError = e;
    console.log("    ❌ LLM 失败：" + (e && e.message ? e.message.split("\n")[0] : e));
    console.log("    → 回退到 persona-fallback 模板模式");
    rows = await generateQueryRecords({ tasks: plan.tasks }, { mode: "persona-fallback" });
    usedMode = "persona-fallback";
    console.log("    ✅ 兜底成功，共 " + rows.length + " 条");
  }

  // 保存
  const outJsonl = path.join(OUT_DIR, "raw_queries.sample5.jsonl");
  writeJsonl(outJsonl, rows);
  console.log("\n[5] 输出 → " + path.relative(ROOT, outJsonl));

  // 控制台打印每条的核心信息
  console.log("\n========== 生成的 5 条 query ==========");
  rows.forEach((r, i) => {
    console.log("\n#" + (i + 1) + "  id=" + r.id);
    console.log("  L1/L2: " + r.l1_scene + " / " + r.l2_scene_label);
    console.log("  app: " + r.application_type + "  product: " + r.product_type);
    console.log("  complexity: " + r.target_complexity + "  style: " + r.design_style);
    console.log("  mode: " + r.generator_mode + (r.llm_model ? "  model: " + r.llm_model : ""));
    console.log("  persona: " + (r.persona_title || "?"));
    console.log("  query_text:");
    console.log("    " + (r.query_text || "(空)").replace(/\n/g, "\n    "));
  });

  console.log("\n=== 汇总 ===");
  console.log("使用模式: " + usedMode);
  if (llmError) {
    console.log("（LLM 失败原因: " + (llmError.message || llmError).toString().split("\n")[0] + ")");
  }
  console.log("产物: " + path.relative(ROOT, outJsonl));
})().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
