// 简易 API 连通性测试：分别测 Anthropic Messages 与 OpenAI 兼容 Chat
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const p = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx <= 0) continue;
    const k = t.slice(0, idx).trim();
    let v = t.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v; // 强制以 .env.local 为准，覆盖外部环境变量
  }
}

loadEnvLocal();

const apiKey = process.env.PACKY_API_KEY || process.env.ANTHROPIC_API_KEY;
const anthropicBase = (process.env.ANTHROPIC_BASE_URL || "https://www.packyapi.com").replace(/\/+$/, "").replace(/\/v1$/, "");
const openaiBase = process.env.PACKY_BASE_URL || "https://www.packyapi.com/v1";
const model = process.env.ANTHROPIC_MODEL || process.env.PACKY_MODEL || "claude-sonnet-4-6";
const timeoutMs = Number(process.env.PACKY_TIMEOUT_MS || 60000);

if (!apiKey) {
  console.error("[FATAL] 未找到 PACKY_API_KEY");
  process.exit(2);
}

function maskKey(k) {
  if (!k) return "(empty)";
  return `${k.slice(0, 6)}...${k.slice(-4)} (len=${k.length})`;
}

async function withTimeout(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promiseFactory(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function testAnthropic() {
  const url = `${anthropicBase}/v1/messages`;
  const payload = {
    model,
    max_tokens: 64,
    system: [
      { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
    ],
    messages: [
      { role: "user", content: [{ type: "text", text: "请用一句话回答：你好，能听到我吗？" }] },
    ],
    metadata: { user_id: "user_connectivity_test" },
  };
  const t0 = Date.now();
  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
          "anthropic-dangerous-direct-browser-access": "true",
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
          "user-agent": "claude-cli/1.0.60 (external, cli)",
          "x-stainless-lang": "js",
          "x-stainless-package-version": "0.39.0",
          "x-stainless-runtime": "node",
          "x-app": "cli",
        },
        body: JSON.stringify(payload),
        signal,
      }),
    timeoutMs
  );
  const text = await res.text();
  const ms = Date.now() - t0;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, ms, url, raw: parsed || text };
}

async function testOpenAi() {
  const url = `${openaiBase}/chat/completions`;
  const payload = {
    model,
    max_tokens: 64,
    messages: [{ role: "user", content: "请用一句话回答：你好，能听到我吗？" }],
  };
  const t0 = Date.now();
  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      }),
    timeoutMs
  );
  const text = await res.text();
  const ms = Date.now() - t0;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, ms, url, raw: parsed || text };
}

function summarizeAnthropic(raw) {
  if (!raw || typeof raw !== "object") return String(raw).slice(0, 300);
  if (Array.isArray(raw.content)) {
    return raw.content.map((b) => (b && b.type === "text" ? b.text : `[${b && b.type}]`)).join("");
  }
  return JSON.stringify(raw).slice(0, 300);
}

function summarizeOpenAi(raw) {
  if (!raw || typeof raw !== "object") return String(raw).slice(0, 300);
  const msg = raw.choices && raw.choices[0] && raw.choices[0].message;
  if (msg && typeof msg.content === "string") return msg.content;
  return JSON.stringify(raw).slice(0, 300);
}

(async () => {
  console.log("=== API 连通性测试 ===");
  console.log("API Key       :", maskKey(apiKey));
  console.log("Anthropic Base:", anthropicBase, "→", `${anthropicBase}/v1/messages`);
  console.log("OpenAI Base   :", openaiBase, "→", `${openaiBase}/chat/completions`);
  console.log("Model         :", model);
  console.log("Timeout(ms)   :", timeoutMs);
  console.log();

  // Anthropic
  console.log("[1/2] 测试 Anthropic Messages 接口 ...");
  try {
    const r = await testAnthropic();
    console.log(`  status=${r.status}  耗时=${r.ms}ms`);
    if (r.ok) {
      console.log("  ✅ 通  内容:", summarizeAnthropic(r.raw));
    } else {
      console.log("  ❌ 失败 响应:", typeof r.raw === "string" ? r.raw.slice(0, 500) : JSON.stringify(r.raw).slice(0, 500));
    }
  } catch (e) {
    console.log("  ❌ 异常:", e.message || e);
  }
  console.log();

  // OpenAI compatible
  console.log("[2/2] 测试 OpenAI 兼容 Chat Completions 接口 ...");
  try {
    const r = await testOpenAi();
    console.log(`  status=${r.status}  耗时=${r.ms}ms`);
    if (r.ok) {
      console.log("  ✅ 通  内容:", summarizeOpenAi(r.raw));
    } else {
      console.log("  ❌ 失败 响应:", typeof r.raw === "string" ? r.raw.slice(0, 500) : JSON.stringify(r.raw).slice(0, 500));
    }
  } catch (e) {
    console.log("  ❌ 异常:", e.message || e);
  }
})();
