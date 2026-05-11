// 从 data/input/场景覆盖.xlsx 随机抽 5 个二级场景，使用本机 Claude Code CLI 真 LLM 跑生成
// 通过子进程调用 `claude -p --bare`，绕过 packyapi-cc 网关对非 CLI 客户端的拦截
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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
  // 让 claude CLI 能在 packy 网关上鉴权
  if (process.env.PACKY_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.PACKY_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = process.env.PACKY_API_KEY;
  }
})();

const {
  parseRequirementsFromWorkbook,
  buildSeedPlan,
  buildPersonaSynthesisPrompt,
  buildQueryPromptFromPersona,
  buildPersonaSpec,
  ensureDir,
  writeJsonl,
  writeJson,
} = require("../mvp/query_factory_v2");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "data/input/场景覆盖.xlsx");
const OUT_SUBDIR = process.env.OUTPUT_SUBDIR || "sample5_cli";
const OUT_DIR = path.join(ROOT, "data/output", OUT_SUBDIR);
ensureDir(OUT_DIR);

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const CONCURRENCY = Number(process.env.LLM_CONCURRENCY || 2);
const SAMPLE_N = Number(process.env.SAMPLE_N || 5);
const PER_CALL_TIMEOUT_MS = Number(process.env.PER_CALL_TIMEOUT_MS || 180000);

function pickRandom(arr, n, seed) {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// 调用本机 claude CLI 一次，返回纯文本响应
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function callClaudeOnce(prompt, { systemPrompt, model = MODEL, label = "" } = {}) {
  return new Promise((resolve, reject) => {
    // stdin 投递 prompt，避免命令行引号/换行转义；system 指令拼到 prompt 头部
    const args = [
      "-p",
      "--bare",
      "--tools",
      "",
      "--no-session-persistence",
      "--input-format",
      "text",
      "--output-format",
      "text",
      "--model",
      model,
    ];
    const finalPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;

    const isWin = process.platform === "win32";
    const cmd = isWin ? "claude.cmd" : "claude";

    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWin,
      env: process.env,
      windowsHide: true,
    });

    child.stdin.on("error", () => {});
    try {
      child.stdin.write(finalPrompt);
      child.stdin.end();
    } catch (e) {
      // 忽略，等 close 事件给出真正错误
    }

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`[${label}] 超时 ${PER_CALL_TIMEOUT_MS}ms`));
    }, PER_CALL_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(`[${label}] claude 退出码=${code}\nSTDERR:\n${stderr}`);
        err.code = code;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES || 2);

function isRetriableError(err) {
  const msg = `${err && err.message ? err.message : ""}\n${err && err.stderr ? err.stderr : ""}`;
  if (/超时/.test(msg)) return true;
  if (/退出码=1\b/.test(msg)) return true; // claude CLI 在 packy 网关 503/超时时多以非零退出
  if (/\b(503|502|504|429|408)\b/.test(msg)) return true;
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up/i.test(msg)) return true;
  if (/服务不可用|访问被拒绝|model_not_found|distributor|暂时|重试|rate ?limit/i.test(msg)) return true;
  return false;
}

async function callClaude(prompt, opts = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await callClaudeOnce(prompt, opts);
    } catch (e) {
      lastError = e;
      if (attempt >= MAX_RETRIES || !isRetriableError(e)) {
        throw e;
      }
      const backoff = Math.round(2000 * Math.pow(2, attempt) + Math.random() * 800);
      console.log(`      ↻ [${opts.label || ""}] 第 ${attempt + 1} 次失败 → ${backoff}ms 后重试 (${(e.message || "").split("\n")[0]})`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

function extractJsonBlock(text) {
  const t = String(text || "");
  // 优先匹配 ```json ...``` 围栏
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  // 否则取首个平衡的大括号
  const start = t.indexOf("{");
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return t.slice(start);
}

function tryParsePersonaJson(text, fallback) {
  try {
    const parsed = JSON.parse(extractJsonBlock(text));
    return {
      persona_id: String(parsed.persona_id || fallback.persona_id),
      persona_title: String(parsed.persona_title || fallback.persona_title),
      persona_description: String(parsed.persona_description || fallback.persona_description),
      persona_style_hint: String(parsed.persona_style_hint || fallback.persona_style_hint),
      user_goal: String(parsed.user_goal || fallback.user_goal),
      domain_familiarity: String(parsed.domain_familiarity || fallback.domain_familiarity),
      persona_source: String(parsed.persona_source || "llm_persona_synthesis"),
      _raw_llm_text: text,
    };
  } catch (e) {
    return {
      ...fallback,
      persona_source: "llm_persona_synthesis_parse_failed",
      _raw_llm_text: text,
      _parse_error: e.message,
    };
  }
}

async function processTask(task, idx, total) {
  const personaPrompt = buildPersonaSynthesisPrompt(task);
  const t0 = Date.now();
  console.log(`  [${idx + 1}/${total}] ${task.query_id}  persona ...`);
  const personaText = await callClaude(personaPrompt, {
    systemPrompt: "You are a persona synthesis assistant. Output strict JSON only, no prose, no code fences. Respect the schema in the user message.",
    label: `${task.query_id}#persona`,
  });
  const fallback = buildPersonaSpec(task);
  const personaSpec = tryParsePersonaJson(personaText, fallback);
  const t1 = Date.now();

  console.log(
    `      → persona ok (${((t1 - t0) / 1000).toFixed(1)}s) ${personaSpec.persona_source === "llm_persona_synthesis" ? "✅" : "⚠️ parse-fallback"}: ${personaSpec.persona_title}`,
  );

  const queryPrompt = buildQueryPromptFromPersona(task, personaSpec);
  console.log(`  [${idx + 1}/${total}] ${task.query_id}  query  ...`);
  const queryText = await callClaude(queryPrompt, {
    systemPrompt: "You are roleplaying as a real end-user typing a UI request to an AI coding assistant. Output only the user's message. No JSON. No meta commentary. English only.",
    label: `${task.query_id}#query`,
  });
  const t2 = Date.now();
  console.log(`      → query ok  (${((t2 - t1) / 1000).toFixed(1)}s)`);

  return {
    id: task.query_id,
    scene_id: task.scene_id,
    l1_scene: task.l1_scene,
    l2_scene_label: task.l2_scene_label,
    l2_scene_examples: task.l2_scene_examples,
    application_type: task.application_type,
    product_type: task.product_type,
    target_complexity: task.target_complexity,
    design_style: task.design_style,
    created_at: new Date().toISOString(),
    generator_mode: "claude-code-cli-subprocess",
    llm_model: MODEL,
    persona_id: personaSpec.persona_id,
    persona_title: personaSpec.persona_title,
    persona_source: personaSpec.persona_source,
    persona_spec: personaSpec,
    persona_prompt_text: personaPrompt,
    query_prompt_text: queryPrompt,
    query_text: queryText,
    timings_ms: { persona_ms: t1 - t0, query_ms: t2 - t1, total_ms: t2 - t0 },
  };
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i, items.length);
      } catch (e) {
        console.log(`  ❌ task #${i + 1} 失败：${e.message.split("\n")[0]}`);
        results[i] = { __error: true, task: items[i], error: e.message };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  console.log(`[1] 解析 ${path.relative(ROOT, INPUT)} ...`);
  const fullSpec = parseRequirementsFromWorkbook(INPUT);
  console.log("    总场景数:", fullSpec.total_scenarios);

  const seed = Number(process.env.SAMPLE_SEED || (Date.now() & 0xffff));
  console.log(`[2] 随机抽 ${SAMPLE_N} 个二级场景（seed=${seed}）...`);
  const picked = pickRandom(fullSpec.scenarios, SAMPLE_N, seed).map((sc) => ({
    ...sc,
    target_count: 1,
  }));
  picked.forEach((sc, i) => {
    console.log(`    [${i + 1}] ${sc.id}  ${sc.l1_scene} / ${sc.l2_scene_label}`);
  });

  const sampledSpec = { ...fullSpec, total_scenarios: picked.length, scenarios: picked };

  console.log("[3] 构建生成计划 ...");
  const plan = buildSeedPlan(sampledSpec, {});
  console.log(`    任务数: ${plan.tasks.length}（每个场景 × 3 复杂度）`);
  writeJson(path.join(OUT_DIR, "plan.json"), plan);

  console.log(`\n[4] 真实 LLM 调用：claude CLI 子进程，concurrency=${CONCURRENCY}，model=${MODEL}`);
  const tStart = Date.now();
  const rows = await runWithConcurrency(plan.tasks, processTask, CONCURRENCY);
  const ok = rows.filter((r) => r && !r.__error);
  const fail = rows.filter((r) => r && r.__error);
  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`\n[5] 完成 ${ok.length}/${rows.length}（耗时 ${elapsed}s）`);

  const outJsonl = path.join(OUT_DIR, "raw_queries.sample5.cli.jsonl");
  writeJsonl(outJsonl, ok);
  if (fail.length) {
    fs.writeFileSync(path.join(OUT_DIR, "errors.json"), JSON.stringify(fail, null, 2), "utf8");
  }
  console.log("    输出 →", path.relative(ROOT, outJsonl));

  console.log("\n========== 生成结果一览 ==========");
  ok.forEach((r, i) => {
    console.log(`\n#${i + 1}  ${r.id}  [${r.target_complexity}]  ${r.l1_scene} / ${r.l2_scene_label}`);
    console.log(`  app=${r.application_type}  product=${r.product_type}  style=${r.design_style}`);
    console.log(`  persona: ${r.persona_title}`);
    console.log("  query:");
    console.log("    " + (r.query_text || "(空)").replace(/\n/g, "\n    "));
  });
})().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
