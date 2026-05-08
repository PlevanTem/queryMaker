// scripts/lib/llm-batch.js
//
// Reusable LLM batch generation core for the persona-driven query pipeline.
// Provides:
//   - LLM transports (claude-cli subprocess / anthropic HTTP / openai-compat HTTP)
//   - retry with exponential backoff on retriable errors
//   - persona-then-query two-step orchestration (uses prompts from mvp/query_factory_v2)
//   - bounded concurrency pool with resume support
//   - standardized run output: plan.json / raw_queries.jsonl / errors.json / stats.json / config.json
//
// Generic helpers (parseArgs, readJsonl, writeJsonl, ensureDir, ensureDirForFile,
// loadLocalEnv, escapeHtml, COMPLEXITY_LEVELS) are reused from mvp/query_factory_v2.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const factory = require("../../mvp/query_factory_v2");
const {
  COMPLEXITY_LEVELS,
  loadLocalEnv,
  parseRequirementsFromWorkbook,
  buildSeedPlan,
  buildPersonaSynthesisPrompt,
  buildQueryPromptFromPersona,
  buildPersonaSpec,
  ensureDir,
  ensureDirForFile,
  writeJson,
  readJsonl,
  writeJsonl,
} = factory;

// Retriable error patterns (network/gateway transient + claude CLI's non-zero exit codes)
const RETRIABLE_PATTERNS = [
  /超时|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|fetch failed/i,
  /退出码=1\b/,
  /\b(503|502|504|429|408|500)\b/,
  /服务不可用|访问被拒绝|model_not_found|distributor|暂时|重试|rate ?limit/i,
];

const TRANSPORT_KINDS = Object.freeze({
  CLAUDE_CLI: "claude-cli",
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
});

// Persona JSON system prompt + Query system prompt; users can override via env.
const SYSTEM_PROMPT_PERSONA =
  process.env.SYSTEM_PROMPT_PERSONA ||
  "You are a persona synthesis assistant. Output strict JSON only, no prose, no code fences. Respect the schema in the user message.";
const SYSTEM_PROMPT_QUERY =
  process.env.SYSTEM_PROMPT_QUERY ||
  "You are roleplaying as a real end-user typing a UI request to an AI coding assistant. Output only the user's message. No JSON. No meta commentary. English only.";

// ---------------------------------------------------------------
// env loader: force-read .env.local (overrides system env).
// Critical when running inside Claude Code, which sets ANTHROPIC_BASE_URL
// to api.anthropic.com in the process env, shadowing the packy gateway URL.
// After loading, remap PACKY_* → ANTHROPIC_* so both transport kinds work.
// ---------------------------------------------------------------
function loadEnvForBatch(rootDir) {
  const envPath = path.resolve(rootDir, ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      let value = match[2] || "";
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value; // force override — .env.local wins over system env
    }
  } else {
    loadLocalEnv(rootDir); // fallback: non-override load (for non-packy setups)
  }
  if (process.env.PACKY_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.PACKY_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = process.env.PACKY_API_KEY;
  }
}

// ---------------------------------------------------------------
// Append-only JSONL helper (per-row durability for resume).
// Read/full rewrite uses query_factory_v2's readJsonl/writeJsonl.
// ---------------------------------------------------------------
function appendJsonl(filePath, row) {
  ensureDirForFile(filePath);
  fs.appendFileSync(filePath, JSON.stringify(row) + "\n", "utf8");
}

// ---------------------------------------------------------------
// Retry
// ---------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetriableError(err) {
  const msg = `${err && err.message ? err.message : ""}\n${err && err.stderr ? err.stderr : ""}`;
  return RETRIABLE_PATTERNS.some((p) => p.test(msg));
}

async function withRetry(fn, { maxRetries = 2, label = "", logger = console.log } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastError = e;
      if (attempt >= maxRetries || !isRetriableError(e)) throw e;
      const backoff = Math.round(2000 * Math.pow(2, attempt) + Math.random() * 800);
      logger(`      ↻ [${label}] retry ${attempt + 1}/${maxRetries} in ${backoff}ms (${(e.message || "").split("\n")[0]})`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------
// Transport: shared HTTP wrapper to factor out timeout/abort/error handling.
// ---------------------------------------------------------------
async function postJsonWithTimeout({ url, headers, body, timeoutMs, label }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

function makeClaudeCliTransport({ model, perCallTimeoutMs = 180_000 }) {
  return function callClaudeCli(prompt, { systemPrompt, label = "" } = {}) {
    return new Promise((resolve, reject) => {
      const args = [
        "-p", "--bare", "--tools", "", "--no-session-persistence",
        "--input-format", "text", "--output-format", "text",
        "--model", model,
      ];
      const finalPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
      const isWin = process.platform === "win32";
      const cmd = isWin ? "claude.cmd" : "claude";
      const child = spawn(cmd, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: isWin, env: process.env, windowsHide: true,
      });
      child.stdin.on("error", (e) => console.error(`[warn][${label}] stdin: ${e.message}`));
      try {
        child.stdin.write(finalPrompt);
        child.stdin.end();
      } catch (e) {
        console.error(`[warn][${label}] stdin write: ${e.message}`);
      }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch (e) { console.error(`[warn][${label}] kill: ${e.message}`); }
        reject(new Error(`[${label}] 超时 ${perCallTimeoutMs}ms`));
      }, perCallTimeoutMs);
      child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
      child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const err = new Error(`[${label}] claude 退出码=${code}\nSTDERR:\n${stderr.slice(0, 600)}`);
          err.code = code;
          err.stderr = stderr;
          return reject(err);
        }
        resolve(stdout.trim());
      });
    });
  };
}

function makeAnthropicHttpTransport({ apiKey, baseUrl, model, perCallTimeoutMs = 180_000 }) {
  if (!apiKey) throw new Error("anthropic transport missing apiKey");
  const root = String(baseUrl || "https://api.anthropic.com").replace(/\/+$/, "").replace(/\/v1$/, "");
  // Include Claude Code CLI fingerprint headers so packy-cc gateway accepts the request.
  // These mirror what the official claude CLI binary sends on every call.
  const CLI_HEADERS = {
    "user-agent": "claude-cli/1.0.60 (external, cli)",
    "x-stainless-lang": "js",
    "x-stainless-package-version": "0.39.0",
    "x-stainless-runtime": "node",
    "x-app": "cli",
    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  return async function callAnthropic(prompt, { systemPrompt, label = "" } = {}) {
    const body = { model, max_tokens: 2048, messages: [{ role: "user", content: prompt }] };
    if (systemPrompt) body.system = systemPrompt;
    const json = await postJsonWithTimeout({
      url: `${root}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        ...CLI_HEADERS,
      },
      body, timeoutMs: perCallTimeoutMs, label,
    });
    return (json.content || []).map((b) => (b && b.type === "text" ? b.text : "")).join("").trim();
  };
}

function makeOpenAiHttpTransport({ apiKey, baseUrl, model, perCallTimeoutMs = 180_000 }) {
  if (!apiKey) throw new Error("openai transport missing apiKey");
  const root = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = root.endsWith("/v1") ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
  return async function callOpenAi(prompt, { systemPrompt, label = "" } = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });
    const json = await postJsonWithTimeout({
      url,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: { model, messages, max_tokens: 2048 },
      timeoutMs: perCallTimeoutMs, label,
    });
    const out = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return String(out || "").trim();
  };
}

const TRANSPORT_FACTORIES = {
  [TRANSPORT_KINDS.CLAUDE_CLI]: makeClaudeCliTransport,
  [TRANSPORT_KINDS.ANTHROPIC]: makeAnthropicHttpTransport,
  [TRANSPORT_KINDS.OPENAI]: makeOpenAiHttpTransport,
};

function resolveTransport(spec) {
  const factoryFn = TRANSPORT_FACTORIES[spec.kind];
  if (!factoryFn) throw new Error(`Unknown LLM transport: ${spec.kind}. Choose one of: ${Object.values(TRANSPORT_KINDS).join(", ")}`);
  return factoryFn(spec);
}

function autoTransportFromEnv(opts = {}) {
  const model = opts.model || process.env.ANTHROPIC_MODEL || process.env.PACKY_MODEL || "claude-sonnet-4-6";
  const perCallTimeoutMs = Number(opts.perCallTimeoutMs || process.env.PER_CALL_TIMEOUT_MS || 180_000);
  const kind = (opts.transport || process.env.LLM_TRANSPORT || TRANSPORT_KINDS.CLAUDE_CLI).toLowerCase();

  if (kind === TRANSPORT_KINDS.CLAUDE_CLI) {
    return { kind, model, perCallTimeoutMs };
  }
  if (kind === TRANSPORT_KINDS.ANTHROPIC) {
    return {
      kind, model, perCallTimeoutMs,
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.PACKY_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    };
  }
  if (kind === TRANSPORT_KINDS.OPENAI) {
    return {
      kind, model, perCallTimeoutMs,
      apiKey: process.env.OPENAI_API_KEY || process.env.PACKY_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || process.env.PACKY_BASE_URL || "https://api.openai.com/v1",
    };
  }
  throw new Error(`Unsupported transport: ${kind}. Choose one of: ${Object.values(TRANSPORT_KINDS).join(", ")}`);
}

// ---------------------------------------------------------------
// Persona JSON parsing (tolerant of code fences and trailing prose)
// ---------------------------------------------------------------
function extractJsonBlock(text) {
  const t = String(text || "");
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = t.indexOf("{");
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i += 1) {
    const c = t[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return t.slice(start);
}

// Escape unescaped ASCII double-quotes that appear inside JSON string values.
// LLMs occasionally emit bare " characters inside values (e.g. 整理"词语"的习惯)
// which break JSON.parse. This walks the token stream and escapes them.
function repairJsonQuotes(json) {
  let out = "";
  let i = 0;
  while (i < json.length) {
    const c = json[i];
    if (c === "\\") { out += c + (json[i + 1] || ""); i += 2; continue; }
    if (c !== '"') { out += c; i++; continue; }
    // Opening quote — copy string content until a legitimate closing quote.
    out += '"'; i++;
    while (i < json.length) {
      const sc = json[i];
      if (sc === "\\") { out += sc + (json[i + 1] || ""); i += 2; continue; }
      if (sc === '"') {
        // Is this quote closing the string? Closing quotes are followed by : , } ] or whitespace+those.
        const after = json.slice(i + 1).replace(/^[ \t\r\n]*/, "");
        if (!after || /^[,:\}\]]/.test(after)) {
          out += '"'; i++; break; // legitimate close
        }
        out += '\\"'; i++; // embedded quote — escape it
        continue;
      }
      out += sc; i++;
    }
  }
  return out;
}

function tryParsePersonaJson(text, fallback) {
  const raw = extractJsonBlock(text);
  for (const attempt of [raw, repairJsonQuotes(raw)]) {
    try {
      const p = JSON.parse(attempt);
      return {
        persona_id: String(p.persona_id || fallback.persona_id),
        persona_title: String(p.persona_title || fallback.persona_title),
        persona_description: String(p.persona_description || fallback.persona_description),
        persona_style_hint: String(p.persona_style_hint || fallback.persona_style_hint),
        user_goal: String(p.user_goal || fallback.user_goal),
        domain_familiarity: String(p.domain_familiarity || fallback.domain_familiarity),
        persona_source: String(p.persona_source || "llm_persona_synthesis"),
        _raw_llm_text: text,
      };
    } catch (_) { /* try next */ }
  }
  return {
    ...fallback,
    persona_source: "llm_persona_synthesis_parse_failed",
    _raw_llm_text: text,
  };
}

// ---------------------------------------------------------------
// Persona + query two-step pipeline
// ---------------------------------------------------------------
async function processOneTask(task, idx, total, ctx) {
  const { callLlm, maxRetries, logger, transport, generatorTag, personaCache } = ctx;
  const t0 = Date.now();

  // Share one LLM-synthesized persona across all tasks in the same group (same persona_seed).
  // First task with this seed triggers the LLM call and stores the Promise; others await it.
  const cacheKey = task.persona_seed || task.query_id;
  const isNew = !personaCache.has(cacheKey);
  if (isNew) {
    const personaPrompt = buildPersonaSynthesisPrompt(task);
    const promise = withRetry(
      () => callLlm(personaPrompt, { systemPrompt: SYSTEM_PROMPT_PERSONA, label: `${task.query_id}#persona` }),
      { maxRetries, label: `${task.query_id}#persona`, logger },
    ).then((text) => tryParsePersonaJson(text, buildPersonaSpec(task)));
    personaCache.set(cacheKey, promise);
  }
  logger(`  [${idx + 1}/${total}] ${task.query_id}  persona ${isNew ? "..." : "(shared)"}`);
  const persona = await personaCache.get(cacheKey);
  const t1 = Date.now();
  const personaOk = persona.persona_source === "llm_persona_synthesis";
  logger(`      → persona ${(t1 - t0) / 1000 | 0}s ${personaOk ? "✅" : "♻️"} ${persona.persona_title}`);

  logger(`  [${idx + 1}/${total}] ${task.query_id}  query   ...`);
  const queryPrompt = buildQueryPromptFromPersona(task, persona);
  const queryText = await withRetry(
    () => callLlm(queryPrompt, { systemPrompt: SYSTEM_PROMPT_QUERY, label: `${task.query_id}#query` }),
    { maxRetries, label: `${task.query_id}#query`, logger },
  );
  const t2 = Date.now();
  logger(`      → query   ${(t2 - t1) / 1000 | 0}s`);

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
    generator_mode: generatorTag,
    llm_model: transport.model,
    persona_id: persona.persona_id,
    persona_title: persona.persona_title,
    persona_source: persona.persona_source,
    persona_spec: persona,
    query_text: queryText,
    timings_ms: { persona_ms: t1 - t0, query_ms: t2 - t1, total_ms: t2 - t0 },
  };
}

// ---------------------------------------------------------------
// Concurrency pool: tasks run in parallel up to ctx.concurrency.
// Each successful row is appended to outJsonl immediately so a crash mid-run
// is recoverable via the `--resume` flag (default on).
// Failures are accumulated in memory and written once at end.
// ---------------------------------------------------------------
async function runPool(tasks, ctx) {
  const { concurrency, outJsonl, logger } = ctx;
  ctx.personaCache = ctx.personaCache || new Map();
  const ok = [];
  const fail = [];
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        const row = await processOneTask(tasks[i], i, tasks.length, ctx);
        ok.push(row);
        if (outJsonl) appendJsonl(outJsonl, row);
      } catch (e) {
        const errRec = {
          query_id: tasks[i].query_id,
          scene_id: tasks[i].scene_id,
          target_complexity: tasks[i].target_complexity,
          error: (e && e.message) ? e.message : String(e),
          stderr: (e && e.stderr) ? String(e.stderr).slice(0, 1000) : undefined,
          at: new Date().toISOString(),
        };
        fail.push(errRec);
        logger(`  ❌ ${tasks[i].query_id} 失败：${(e && e.message ? e.message : "").split("\n")[0]}`);
      }
    }
  });
  await Promise.all(workers);
  return { ok, fail };
}

// ---------------------------------------------------------------
// Sampling helpers
// ---------------------------------------------------------------
function pickRandom(arr, n, seed) {
  let s = (seed >>> 0) || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function samplePlanFromXlsx(inputPath, { sampleN, seed, targetCountPerScene = 1 } = {}) {
  const fullSpec = parseRequirementsFromWorkbook(inputPath);
  const picked = sampleN > 0
    ? pickRandom(fullSpec.scenarios, sampleN, seed).map((sc) => ({ ...sc, target_count: targetCountPerScene }))
    : fullSpec.scenarios.map((sc) => ({ ...sc, target_count: sc.target_count || targetCountPerScene }));
  const sampledSpec = { ...fullSpec, total_scenarios: picked.length, scenarios: picked };
  return { spec: sampledSpec, plan: buildSeedPlan(sampledSpec, {}) };
}

function loadPlanFromJsonl(planPath) {
  const tasks = readJsonl(planPath);
  return { spec: null, plan: { tasks, total_tasks: tasks.length, version: "external" } };
}

// ---------------------------------------------------------------
// Stats (also consumed by build-query-comparison.js)
// ---------------------------------------------------------------
function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function buildStats(rows) {
  const stats = { total: rows.length, by_complexity: {} };
  for (const c of COMPLEXITY_LEVELS) {
    const rs = rows.filter((r) => r.target_complexity === c);
    const ws = rs.map((r) => wordCount(r.query_text));
    stats.by_complexity[c] = {
      n: rs.length,
      avg_words: rs.length ? +(ws.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : 0,
      min_words: rs.length ? Math.min(...ws) : 0,
      max_words: rs.length ? Math.max(...ws) : 0,
    };
  }
  stats.persona_llm_ok = rows.filter((r) => r.persona_source === "llm_persona_synthesis").length;
  stats.persona_parse_failed = rows.filter((r) => r.persona_source === "llm_persona_synthesis_parse_failed").length;
  stats.persona_fallback = rows.filter((r) => r.persona_source === "deterministic_persona_fallback").length;
  stats.avg_total_seconds = rows.length
    ? +(rows.reduce((a, r) => a + ((r.timings_ms && r.timings_ms.total_ms) || 0), 0) / rows.length / 1000).toFixed(1)
    : 0;
  return stats;
}

// ---------------------------------------------------------------
// Output paths bundle
// ---------------------------------------------------------------
function resolveOutputPaths(outputDir) {
  return {
    planJson: path.join(outputDir, "plan.json"),
    outJsonl: path.join(outputDir, "raw_queries.jsonl"),
    errorsPath: path.join(outputDir, "errors.json"),
    statsPath: path.join(outputDir, "stats.json"),
    configPath: path.join(outputDir, "config.json"),
  };
}

// Produce a config snapshot safe for disk: API keys are masked.
function maskApiKey(k) {
  if (!k || typeof k !== "string") return undefined;
  return k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-2)}` : "***";
}

function safeTransportSnapshot(tx) {
  const out = { ...tx };
  if (out.apiKey) out.apiKey = maskApiKey(out.apiKey);
  return out;
}

// ---------------------------------------------------------------
// Main entry: orchestrates plan → resume diff → pool → stats output.
// ---------------------------------------------------------------
async function runBatch(options) {
  const {
    rootDir,
    inputXlsx,
    planPath,
    outputDir,
    sampleN = 0,
    seed = Date.now() & 0xffff,
    targetCountPerScene = 1,
    transport,
    concurrency = 3,
    maxRetries = 2,
    resume = true,
    generatorTag = "claude-code-cli-subprocess",
    logger = console.log,
  } = options;

  if (!outputDir) throw new Error("runBatch: outputDir is required");
  if (!inputXlsx && !planPath) throw new Error("runBatch: inputXlsx or planPath is required");

  ensureDir(outputDir);
  const paths = resolveOutputPaths(outputDir);

  // Plan (external takes precedence over xlsx sampling).
  let plan;
  if (planPath) {
    plan = loadPlanFromJsonl(planPath).plan;
    logger(`[plan] external plan: ${planPath} (${plan.total_tasks} tasks)`);
  } else {
    plan = samplePlanFromXlsx(inputXlsx, { sampleN, seed, targetCountPerScene }).plan;
    logger(`[plan] xlsx sample: ${inputXlsx}  N=${sampleN || "all"}  seed=${seed}  → ${plan.total_tasks} tasks`);
  }
  writeJson(paths.planJson, plan);

  // Resume: keep prior rows when resume=true, otherwise reset jsonl.
  if (!resume && fs.existsSync(paths.outJsonl)) fs.unlinkSync(paths.outJsonl);
  const existingRows = resume ? readJsonl(paths.outJsonl) : [];
  const existingIds = new Set(existingRows.map((r) => r.id));
  const todo = plan.tasks.filter((t) => !existingIds.has(t.query_id));
  logger(`[resume] done=${existingIds.size}, todo=${todo.length}`);

  const tx = transport || autoTransportFromEnv({});
  const callLlm = resolveTransport(tx);
  logger(`[llm] transport=${tx.kind}  model=${tx.model}  concurrency=${concurrency}  maxRetries=${maxRetries}`);

  writeJson(paths.configPath, {
    started_at: new Date().toISOString(),
    inputXlsx, planPath, outputDir,
    sampleN, seed, targetCountPerScene,
    transport: safeTransportSnapshot(tx),
    concurrency, maxRetries, resume, generatorTag,
    plan_total: plan.total_tasks,
    todo_count: todo.length,
  });

  const ctx = {
    callLlm, maxRetries, concurrency,
    outJsonl: paths.outJsonl,
    logger,
    transport: tx,
    generatorTag,
  };
  const tStart = Date.now();
  const { ok, fail } = todo.length ? await runPool(todo, ctx) : { ok: [], fail: [] };
  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);

  // Final ordered rewrite of jsonl (per-row appends were unordered).
  // Keep existing rows that belong to a *prior* plan (different task IDs), then
  // append the current plan's rows in order. This allows multiple plan passes
  // (seed + backfill) to accumulate into the same output file.
  const allRows = [...existingRows, ...ok];
  const orderById = new Map(allRows.map((r) => [r.id, r]));
  const planTaskIds = new Set(plan.tasks.map((t) => t.query_id));
  const priorRows = existingRows.filter((r) => !planTaskIds.has(r.id));
  const currentOrdered = plan.tasks.map((t) => orderById.get(t.query_id)).filter(Boolean);
  const ordered = [...priorRows, ...currentOrdered];
  writeJsonl(paths.outJsonl, ordered);

  // Errors and stats: single write at end (avoids O(n²) read-modify-write).
  if (fail.length) {
    const prior = fs.existsSync(paths.errorsPath) ? readJsonSafe(paths.errorsPath, []) : [];
    writeJson(paths.errorsPath, [...prior, ...fail]);
  }
  const stats = buildStats(ordered);
  stats.run_seconds = Number(elapsed);
  stats.failed_this_run = fail.length;
  writeJson(paths.statsPath, stats);

  const rel = (p) => path.relative(rootDir || process.cwd(), p);
  logger(`\n[done] ok=${ok.length}  fail=${fail.length}  total=${ordered.length}/${plan.total_tasks}  elapsed=${elapsed}s`);
  logger(`       → ${rel(paths.outJsonl)}`);
  logger(`       → ${rel(paths.statsPath)}`);
  if (fail.length) logger(`       ⚠️  errors: ${rel(paths.errorsPath)}`);

  return { plan, ok, fail, allRows: ordered, stats, paths };
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`[warn] cannot parse ${filePath}: ${e.message}`);
    return fallback;
  }
}

module.exports = {
  TRANSPORT_KINDS,
  COMPLEXITY_LEVELS,
  loadEnvForBatch,
  appendJsonl,
  withRetry, isRetriableError, sleep,
  makeClaudeCliTransport, makeAnthropicHttpTransport, makeOpenAiHttpTransport,
  resolveTransport, autoTransportFromEnv,
  tryParsePersonaJson,
  processOneTask, runPool,
  pickRandom, samplePlanFromXlsx, loadPlanFromJsonl,
  wordCount, buildStats,
  resolveOutputPaths,
  runBatch,
};
