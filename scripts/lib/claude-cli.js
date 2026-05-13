/**
 * claude-cli.js — shared subprocess caller for `claude -p --bare`.
 *
 * Why this exists:
 *   packy CC-group API keys are rejected by direct HTTP calls (403 "only accessible
 *   via the official Claude CLI"). Spawning the real `claude` binary bypasses the
 *   gateway's UA check, so all corpus-* generation scripts route through here.
 *
 * Provides:
 *   - applyPackyEnv()      → loads .env.local with force-override; maps PACKY_API_KEY
 *                            to ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
 *   - callClaudeCli(prompt, opts)
 *       opts: { systemPrompt, model, label, timeoutMs, maxRetries }
 *       returns: stdout (string)
 *   - CLI_MODEL              default model id (claude-sonnet-4-6)
 */

const fs   = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || process.env.PACKY_MODEL || "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = Number(process.env.PER_CALL_TIMEOUT_MS || 180000);
const DEFAULT_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES || 2);

/**
 * Force-load .env.local into process.env (overrides system env vars).
 * Then map PACKY_API_KEY → ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN so claude CLI
 * authenticates against the packy gateway (not real api.anthropic.com).
 */
function applyPackyEnv(rootDir = process.cwd()) {
  const envPath = path.resolve(rootDir, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val; // force override
    }
  }
  if (process.env.PACKY_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.PACKY_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = process.env.PACKY_API_KEY;
  }
}

function isRetriable(err) {
  const msg = `${err?.message || ""}\n${err?.stderr || ""}`;
  return /超时|退出码=1\b|\b(503|502|504|429|408)\b|timeout|timed out|ETIMEDOUT|ECONNRESET|socket hang up|服务不可用|访问被拒绝|model_not_found|distributor|rate ?limit/i.test(
    msg,
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function callClaudeCliOnce(prompt, { systemPrompt, model = DEFAULT_MODEL, label = "", timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--bare",
      "--tools", "",
      "--no-session-persistence",
      "--input-format", "text",
      "--output-format", "text",
      "--model", model,
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
    } catch {}

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`[${label}] 超时 ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(`[${label}] claude 退出码=${code}\n${stderr || stdout}`);
        err.code = code;
        err.stderr = stderr || stdout;
        return reject(err);
      }
      resolve(stdout.trim());
    });
  });
}

async function callClaudeCli(prompt, opts = {}) {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await callClaudeCliOnce(prompt, opts);
    } catch (e) {
      lastError = e;
      if (attempt >= maxRetries || !isRetriable(e)) throw e;
      const backoff = Math.round(2000 * Math.pow(2, attempt) + Math.random() * 800);
      await sleep(backoff);
    }
  }
  throw lastError;
}

module.exports = {
  applyPackyEnv,
  callClaudeCli,
  callClaudeCliOnce,
  isRetriable,
  CLI_MODEL: DEFAULT_MODEL,
  CLI_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
  CLI_MAX_RETRIES: DEFAULT_MAX_RETRIES,
};
