const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseRequirementsFromWorkbook,
  buildSeedPlan,
  generateQueryRecords,
  scoreQueryRecords,
  importIntoDatabase,
  buildDashboardAssets,
} = require("../mvp/query_factory");

test("首个场景可以正确解析为 v2 scene schema", () => {
  const workbookPath = path.resolve(__dirname, "..", "data", "input", "场景覆盖.xlsx");
  const spec = parseRequirementsFromWorkbook(workbookPath);
  assert.ok(spec.total_scenarios > 0, "应当至少解析出一个场景");
  assert.equal(spec.version, "v2");

  const firstScenario = spec.scenarios[0];
  assert.equal(firstScenario.l1_scene, "深度研究展示");
  assert.equal(firstScenario.l2_scene_raw, "① 个人生活类（旅行回忆、年度相册、画作展示、宝宝成长）");
  assert.equal(firstScenario.l2_scene_label, "个人生活类");
  assert.deepEqual(firstScenario.l2_scene_examples, ["旅行回忆", "年度相册", "画作展示", "宝宝成长"]);
  assert.equal(firstScenario.target_count, 95);
  assert.ok(firstScenario.application_type_candidates.includes("旅行回忆应用"));
});

test("首个场景 seed plan 会显式覆盖三档 target_complexity", () => {
  const workbookPath = path.resolve(__dirname, "..", "data", "input", "场景覆盖.xlsx");
  const spec = parseRequirementsFromWorkbook(workbookPath);
  const firstScenario = spec.scenarios[0];
  const singleScenarioSpec = {
    ...spec,
    total_scenarios: 1,
    scenarios: [firstScenario],
  };

  const plan = buildSeedPlan(singleScenarioSpec, {
    minSeed: 3,
    maxSeed: 3,
    initialFraction: 0.1,
  });

  assert.equal(plan.tasks.length, 3, "首个场景应生成 3 条 seed 任务");
  assert.deepEqual(
    plan.tasks.map((task) => task.target_complexity),
    ["vague", "medium", "complex"],
  );
  assert.ok(plan.tasks.every((task) => task.application_type));
  assert.ok(plan.tasks.every((task) => task.persona_seed));
  assert.ok(plan.tasks.every((task) => task.l2_scene_label === "个人生活类"));
});

test("首个场景可以跑通 v2 persona-driven 主链路", async () => {
  const workbookPath = path.resolve(__dirname, "..", "data", "input", "场景覆盖.xlsx");
  const spec = parseRequirementsFromWorkbook(workbookPath);
  const firstScenario = spec.scenarios[0];
  const singleScenarioSpec = {
    ...spec,
    total_scenarios: 1,
    scenarios: [firstScenario],
  };

  const plan = buildSeedPlan(singleScenarioSpec, {
    minSeed: 3,
    maxSeed: 3,
    initialFraction: 0.1,
  });

  const generated = await generateQueryRecords(plan, { mode: "persona-fallback" });
  assert.equal(generated.length, 3);
  assert.ok(
    generated.every((row) => row.persona_spec && row.persona_title && row.persona_prompt_text && row.query_prompt_text),
    "每条记录都应包含 persona 和 prompt 快照",
  );
  assert.ok(
    generated.every((row) => row.query_text && !row.query_text.includes(firstScenario.l2_scene_raw)),
    "生成的 query 不应直接包含未清洗的 l2_scene_raw",
  );
  assert.ok(generated.every((row) => /[A-Za-z]/.test(row.query_text)), "query 应默认输出英文");
  assert.ok(generated.every((row) => !/[\u4e00-\u9fff]/.test(row.query_text)), "query 不应混入中文片段");
  assert.ok(generated.every((row) => row.application_type));
  assert.ok(generated.every((row) => row.target_complexity));
  const mediumRow = generated.find((row) => row.target_complexity === "medium");
  const complexRow = generated.find((row) => row.target_complexity === "complex");
  assert.ok(mediumRow && complexRow, "应存在 medium 和 complex 样本");
  assert.ok(complexRow.query_text.length > mediumRow.query_text.length, "complex 应显著长于 medium");
  assert.ok(/Key requirements:/i.test(complexRow.query_text), "complex 应包含结构化要求块");
  assert.ok(!/Key requirements:/i.test(mediumRow.query_text), "medium 不应升级成 complex 风格");

  const scored = scoreQueryRecords(generated);
  assert.equal(scored.length, 3);
  assert.ok(scored.every((row) => typeof row.quality_score === "number"));
  assert.ok(scored.every((row) => ["vague", "medium", "complex"].includes(row.target_complexity)));
  assert.ok(scored.every((row) => ["vague", "medium", "complex"].includes(row.complexity_level)));

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "query-factory-smoke-"));
  const dbPath = path.join(tempRoot, "queries_v2.sqlite");
  const reportsDir = path.join(tempRoot, "reports");

  await importIntoDatabase({
    dbPath,
    requirementsSpec: singleScenarioSpec,
    queries: scored,
    mode: "persona-fallback",
  });

  assert.ok(fs.existsSync(dbPath), "应生成 sqlite 文件");

  const assets = await buildDashboardAssets(dbPath, reportsDir);
  assert.equal(assets.queries.length, 3);
  assert.equal(assets.summary.total_queries, 3);
  assert.ok(assets.summary.by_application_type);
  assert.ok(assets.summary.by_target_complexity);
  assert.ok(assets.summary.target_complexity_vs_actual_complexity);
  assert.ok(fs.existsSync(assets.summaryPath), "应生成 summary.json");
  assert.ok(fs.existsSync(assets.dashboardPath), "应生成 dashboard.html");

  const dashboardHtml = fs.readFileSync(assets.dashboardPath, "utf8");
  assert.ok(dashboardHtml.includes("Query Factory Dashboard V2"));
  assert.ok(dashboardHtml.includes(firstScenario.l2_scene_label));
  assert.ok(dashboardHtml.includes("application_type"));

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
