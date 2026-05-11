// 给 sample5_cli_fewshot 的缺口任务补跑（基于 plan.json 与已有 JSONL 取差集）
// 复用 test-sample5-cli.js 的 callClaude / processTask 实现，故直接 require 它
const fs = require("fs");
const path = require("path");

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
  if (process.env.PACKY_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.PACKY_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = process.env.PACKY_API_KEY;
  }
})();

const ROOT = path.resolve(__dirname, "..");
const SUBDIR = process.env.OUTPUT_SUBDIR || "sample5_cli_fewshot";
const OUT_DIR = path.join(ROOT, "data/output", SUBDIR);
const OUT_JSONL = path.join(OUT_DIR, "raw_queries.sample5.cli.jsonl");
const PLAN_PATH = path.join(OUT_DIR, "plan.json");

if (!fs.existsSync(PLAN_PATH) || !fs.existsSync(OUT_JSONL)) {
  console.error("[FATAL] 找不到", PLAN_PATH, "或", OUT_JSONL);
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
const existingRows = fs.readFileSync(OUT_JSONL, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const existingIds = new Set(existingRows.map((r) => r.id));

const missingTasks = plan.tasks.filter((t) => !existingIds.has(t.query_id));
console.log(`[fill] plan 任务数=${plan.tasks.length}  已完成=${existingIds.size}  待补=${missingTasks.length}`);
if (!missingTasks.length) {
  console.log("没有待补任务，退出。");
  process.exit(0);
}
missingTasks.forEach((t, i) => console.log(`  待补 [${i + 1}] ${t.query_id} [${t.target_complexity}] ${t.l1_scene} / ${t.l2_scene_label}`));

// 复用 test-sample5-cli.js 内部的 processTask + 并发器；那里在 IIFE 自执行，直接 require 不行
// 所以这里复制一份精简版本，逻辑与 test-sample5-cli.js 保持一致
process.env.OUTPUT_SUBDIR = SUBDIR; // 让一切共享
const { spawn } = require("child_process");
const {
  buildPersonaSynthesisPrompt,
  buildQueryPromptFromPersona,
  buildPersonaSpec,
} = require("../mvp/query_factory_v2");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const PER_CALL_TIMEOUT_MS = Number(process.env.PER_CALL_TIMEOUT_MS || 180000);
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES || 2);
const CONCURRENCY = Number(process.env.LLM_CONCURRENCY || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function callClaudeOnce(prompt, { systemPrompt, label = "" } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--bare", "--tools", "", "--no-session-persistence",
      "--input-format", "text", "--output-format", "text", "--model", MODEL];
    const finalPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
    const isWin = process.platform === "win32";
    const cmd = isWin ? "claude.cmd" : "claude";
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], shell: isWin, env: process.env, windowsHide: true });
    child.stdin.on("error", () => {});
    try { child.stdin.write(finalPrompt); child.stdin.end(); } catch {}
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} ; reject(new Error(`[${label}] 超时 ${PER_CALL_TIMEOUT_MS}ms`)); }, PER_CALL_TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(`[${label}] claude 退出码=${code}\nSTDERR:\n${stderr}`);
        err.code = code; err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout.trim());
    });
  });
}
function isRetriable(err) {
  const m = `${err.message || ""}\n${err.stderr || ""}`;
  return /超时|退出码=1\b|\b(503|502|504|429|408)\b|timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|访问被拒绝|distributor|暂时|rate ?limit/i.test(m);
}
async function callClaude(prompt, opts) {
  let lastErr;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try { return await callClaudeOnce(prompt, opts); }
    catch (e) {
      lastErr = e;
      if (i >= MAX_RETRIES || !isRetriable(e)) throw e;
      const backoff = Math.round(2000 * Math.pow(2, i) + Math.random() * 800);
      console.log(`      ↻ [${opts.label}] 第 ${i + 1} 次失败 → ${backoff}ms 后重试 (${(e.message || "").split("\n")[0]})`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function extractJsonBlock(text) {
  const t = String(text || "");
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = t.indexOf("{");
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return t.slice(start);
}
function tryParsePersonaJson(text, fb) {
  try {
    const p = JSON.parse(extractJsonBlock(text));
    return {
      persona_id: String(p.persona_id || fb.persona_id),
      persona_title: String(p.persona_title || fb.persona_title),
      persona_description: String(p.persona_description || fb.persona_description),
      persona_style_hint: String(p.persona_style_hint || fb.persona_style_hint),
      user_goal: String(p.user_goal || fb.user_goal),
      domain_familiarity: String(p.domain_familiarity || fb.domain_familiarity),
      persona_source: String(p.persona_source || "llm_persona_synthesis"),
    };
  } catch (e) {
    return { ...fb, persona_source: "llm_persona_synthesis_parse_failed" };
  }
}

async function processTask(task, idx, total) {
  const t0 = Date.now();
  console.log(`  [${idx + 1}/${total}] ${task.query_id}  persona ...`);
  const personaPrompt = buildPersonaSynthesisPrompt(task);
  const personaText = await callClaude(personaPrompt, {
    systemPrompt: "You are a persona synthesis assistant. Output strict JSON only, no prose, no code fences.",
    label: `${task.query_id}#persona`,
  });
  const fb = buildPersonaSpec(task);
  const persona = tryParsePersonaJson(personaText, fb);
  const t1 = Date.now();
  console.log(`      → persona ok (${((t1 - t0) / 1000).toFixed(1)}s) ${persona.persona_source === "llm_persona_synthesis" ? "✅" : "⚠️"}: ${persona.persona_title}`);

  console.log(`  [${idx + 1}/${total}] ${task.query_id}  query  ...`);
  const queryPrompt = buildQueryPromptFromPersona(task, persona);
  const queryText = await callClaude(queryPrompt, {
    systemPrompt: "You are roleplaying as a real end-user typing a UI request. Output only the user's message. English only.",
    label: `${task.query_id}#query`,
  });
  const t2 = Date.now();
  console.log(`      → query ok  (${((t2 - t1) / 1000).toFixed(1)}s)`);

  return {
    id: task.query_id, scene_id: task.scene_id,
    l1_scene: task.l1_scene, l2_scene_label: task.l2_scene_label, l2_scene_examples: task.l2_scene_examples,
    application_type: task.application_type, product_type: task.product_type,
    target_complexity: task.target_complexity, design_style: task.design_style,
    created_at: new Date().toISOString(),
    generator_mode: "claude-code-cli-subprocess",
    llm_model: MODEL,
    persona_id: persona.persona_id, persona_title: persona.persona_title, persona_source: persona.persona_source,
    persona_spec: persona, persona_prompt_text: personaPrompt, query_prompt_text: queryPrompt,
    query_text: queryText,
    timings_ms: { persona_ms: t1 - t0, query_ms: t2 - t1, total_ms: t2 - t0 },
  };
}

async function pool(items, worker, n) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { out[i] = await worker(items[i], i, items.length); }
      catch (e) {
        console.log(`  ❌ ${items[i].query_id} 失败：${(e.message || "").split("\n")[0]}`);
        out[i] = { __error: true, task: items[i], error: e.message };
      }
    }
  }));
  return out;
}

(async () => {
  const tStart = Date.now();
  const results = await pool(missingTasks, processTask, CONCURRENCY);
  const ok = results.filter((r) => r && !r.__error);
  const fail = results.filter((r) => r && r.__error);
  console.log(`\n[fill] 完成 ${ok.length}/${results.length}，耗时 ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

  if (ok.length) {
    const merged = [...existingRows];
    // 用 plan 顺序合并
    const orderedIds = plan.tasks.map((t) => t.query_id);
    const allById = Object.fromEntries([...existingRows, ...ok].map((r) => [r.id, r]));
    const finalRows = orderedIds.map((id) => allById[id]).filter(Boolean);
    fs.writeFileSync(OUT_JSONL, finalRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    console.log(`[fill] 写回 → ${path.relative(ROOT, OUT_JSONL)} (现 ${finalRows.length} 条)`);
  }
  if (fail.length) {
    console.log(`[fill] 仍有 ${fail.length} 条失败：`, fail.map((r) => r.task && r.task.query_id));
  }
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });
