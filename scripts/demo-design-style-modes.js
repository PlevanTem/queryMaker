#!/usr/bin/env node
/**
 * scripts/demo-design-style-modes.js
 *
 * 三种 design_style 注入模式的完整过程对比：
 *   Mode A — design_style: null       （LLM 自由发挥，新默认行为）
 *   Mode B — design_style: "Dark"     （显式指定单一风格）
 *   Mode C — design_style: "Glassmorphism" （另一种显式风格）
 *
 * 相同场景 / 相同复杂度 / 独立 persona seed → 完整记录
 * 每步：task metadata → persona prompt → persona JSON → query prompt → query 文本
 *
 * 用法：
 *   node scripts/demo-design-style-modes.js [--output data/output/demo_ds_modes.html] [--complexity medium]
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ─── Load env (.env.local wins over system env) ────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z_]\w*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
  if (process.env.PACKY_API_KEY) {
    process.env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || process.env.PACKY_API_KEY;
    process.env.ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY    || process.env.PACKY_API_KEY;
  }
}
loadEnv();

const {
  buildPersonaSynthesisPrompt,
  buildQueryPromptFromPersona,
  buildPersonaSpec,
} = require("../mvp/query_factory_v2");

// Reuse the battle-tested transport from llm-batch
const { makeClaudeCliTransport, autoTransportFromEnv } = require("./lib/llm-batch");

// ─── CLI args ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      a[key] = (!argv[i+1] || argv[i+1].startsWith("--")) ? true : argv[++i];
    }
  }
  return a;
}
const args       = parseArgs(process.argv.slice(2));
const COMPLEXITY = args.complexity || "medium";
const OUT_HTML   = path.resolve(args.output || path.join(ROOT, "data/output/demo_ds_modes.html"));

// ─── Three demo tasks — identical except design_style and persona_seed ─────
const BASE_SCENE = {
  scene_id:          "scene_028",
  l1_scene:          "办公效率",
  l2_scene_label:    "项目看板/任务追踪 ★",
  l2_scene_examples: ["看板视图","进度条","优先级标签","里程碑管理"],
  application_type:  "项目看板应用",
  product_type:      "dashboard",
  target_complexity: COMPLEXITY,
  constrained:       false,
};

const MODES = [
  {
    label:        "Mode A — null（LLM 自由发挥）",
    tag:          "null",
    color:        "#6c63ff",
    design_style: null,
    persona_seed: "demo_null_01",
    query_id:     "demo_A",
  },
  {
    label:        "Mode B — \"Dark\"（显式指定）",
    tag:          "Dark",
    color:        "#36d399",
    design_style: "Dark",
    persona_seed: "demo_dark_01",
    query_id:     "demo_B",
  },
  {
    label:        "Mode C — \"Glassmorphism\"（显式指定）",
    tag:          "Glassmorphism",
    color:        "#00d4aa",
    design_style: "Glassmorphism",
    persona_seed: "demo_glass_01",
    query_id:     "demo_C",
  },
];

// ─── LLM: reuse battle-tested claude-cli transport from llm-batch ─────────
const SYSTEM_PERSONA = "You are a persona synthesis assistant. Output strict JSON only, no prose, no code fences. Respect the schema in the user message.";
const SYSTEM_QUERY   = "You are roleplaying as a real end-user typing a UI request to an AI coding assistant. Output only the user's message. No JSON. No meta commentary. English only.";

const MODEL    = process.env.ANTHROPIC_MODEL || process.env.PACKY_MODEL || "claude-sonnet-4-6";
const callLlm  = makeClaudeCliTransport({ model: MODEL, perCallTimeoutMs: 180_000 });

function tryParsePersonaJson(raw, fallback) {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const fence = cleaned.match(/\{[\s\S]*\}/);
  try { return { ...JSON.parse(fence ? fence[0] : cleaned), persona_source: "llm_persona_synthesis" }; }
  catch { return { ...fallback, persona_source: "llm_parse_failed", raw_persona_text: raw }; }
}

// ─── Run one mode ──────────────────────────────────────────────────────────
async function runMode(modeConfig) {
  const task = { ...BASE_SCENE, ...modeConfig };
  const result = { mode: modeConfig, task, steps: {}, timings: {}, error: null };

  console.log(`\n▶ ${modeConfig.label}`);

  try {
    // ── Step 1: build persona prompt ──
    const personaPrompt = buildPersonaSynthesisPrompt(task);
    result.steps.personaPrompt = personaPrompt;

    // ── Step 2: LLM → persona ──
    const t0 = Date.now();
    console.log(`  [persona] calling LLM...`);
    const personaRaw = await callLlm(personaPrompt, { systemPrompt: SYSTEM_PERSONA, label: `${modeConfig.query_id}#persona` });
    result.steps.personaRaw = personaRaw;
    result.timings.personaMs = Date.now() - t0;
    console.log(`  [persona] ✅ ${(result.timings.personaMs / 1000).toFixed(1)}s`);

    const personaSpec = tryParsePersonaJson(personaRaw, buildPersonaSpec(task));
    result.steps.personaSpec = personaSpec;
    const personaOkMsg = personaSpec.persona_source === "llm_persona_synthesis" ? "✅" : "⚠ parse_failed";
    console.log(`  [persona] ${personaOkMsg} → ${personaSpec.persona_title || "?"}`);

    // ── Step 3: build query prompt ──
    const queryPrompt = buildQueryPromptFromPersona(task, personaSpec);
    result.steps.queryPrompt = queryPrompt;

    // ── Step 4: LLM → query ──
    const t1 = Date.now();
    console.log(`  [query]   calling LLM...`);
    const queryText = await callLlm(queryPrompt, { systemPrompt: SYSTEM_QUERY, label: `${modeConfig.query_id}#query` });
    result.steps.queryText = queryText;
    result.timings.queryMs = Date.now() - t1;
    result.timings.totalMs = result.timings.personaMs + result.timings.queryMs;
    console.log(`  [query]   ✅ ${(result.timings.queryMs / 1000).toFixed(1)}s → ${queryText.split(/\s+/).length} words`);

  } catch (err) {
    result.error = err.message;
    console.error(`  ❌ ${err.message}`);
  }

  return result;
}

// ─── Highlight the design_style injection in a prompt string ──────────────
function highlightPrompt(text, designStyle) {
  if (!text) return "";
  const styleInstruction = designStyle
    ? `Use a ${designStyle}` // English partial match
    : "No fixed visual style";
  const zhStyle = designStyle
    ? (designStyle === "Dark" ? "深色主题" : designStyle === "Glassmorphism" ? "玻璃拟态" : designStyle)
    : "未显式指定设计风格";

  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(
      new RegExp(`(设计风格：[^\n]+)`, "g"),
      `<mark class="hl-zh">$1</mark>`
    )
    .replace(
      new RegExp(`(No fixed visual style[^.]*\\.|Use a ${designStyle || ""}[^.]*\\.)`, "g"),
      `<mark class="hl-en">$1</mark>`
    );
}

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─── HTML report builder ──────────────────────────────────────────────────
function buildHTML(results, complexity) {
  const now = new Date().toISOString().slice(0,16).replace("T"," ");

  const extractStyleLine = (prompt, zh = true) => {
    if (!prompt) return "—";
    const lines = prompt.split("\n");
    if (zh) {
      const l = lines.find(l => l.includes("设计风格："));
      return l ? esc(l.trim()) : "—";
    } else {
      const l = lines.find(l => l.includes("visual style") || l.includes("visual direction"));
      return l ? esc(l.trim()) : "—";
    }
  };

  // Diff highlight: find what changed between Mode A (null) and B/C
  const nullResult = results[0];

  const colHTML = results.map((r, i) => {
    const m = r.mode;
    const s = r.steps;
    const hasError = !!r.error;
    const wordCount = s.queryText ? s.queryText.split(/\s+/).filter(Boolean).length : 0;
    const personaOk = s.personaSpec?.persona_source === "llm_persona_synthesis";

    const personaPromptHighlighted = s.personaPrompt
      ? highlightPrompt(s.personaPrompt, m.design_style)
      : "<em style='color:#666'>—</em>";
    const queryPromptHighlighted = s.queryPrompt
      ? highlightPrompt(s.queryPrompt, m.design_style)
      : "<em style='color:#666'>—</em>";

    const zhStyleLine = extractStyleLine(s.personaPrompt, true);
    const enStyleLine = extractStyleLine(s.queryPrompt, false);

    const personaFields = s.personaSpec ? [
      ["persona_title",       s.personaSpec.persona_title],
      ["persona_description", s.personaSpec.persona_description],
      ["persona_style_hint",  s.personaSpec.persona_style_hint],
      ["user_goal",           s.personaSpec.user_goal],
      ["domain_familiarity",  s.personaSpec.domain_familiarity],
      ["persona_source",      s.personaSpec.persona_source],
    ] : [];

    return `
<div class="col" style="--col-color:${m.color}">
  <div class="col-header" style="border-top:3px solid ${m.color}">
    <div class="mode-badge" style="background:${m.color}22;color:${m.color}">${esc(m.tag)}</div>
    <div class="mode-label">${esc(m.label)}</div>
    ${hasError ? `<div class="error-badge">❌ 错误</div>` : ""}
  </div>

  <!-- Task metadata -->
  <div class="step-block">
    <div class="step-title"><span class="step-num">1</span> Plan Task（输入）</div>
    <div class="meta-grid">
      <div class="meta-row"><span class="mk">scene</span><span class="mv">${esc(r.task.l2_scene_label)}</span></div>
      <div class="meta-row"><span class="mk">app</span><span class="mv">${esc(r.task.application_type)}</span></div>
      <div class="meta-row"><span class="mk">complexity</span><span class="mv badge-${complexity}">${esc(complexity)}</span></div>
      <div class="meta-row"><span class="mk">design_style</span><span class="mv" style="color:${m.color};font-weight:700">${m.design_style ? `"${esc(m.design_style)}"` : '<span style="color:#666;font-style:italic">null（不注入）</span>'}</span></div>
    </div>
  </div>

  <!-- Persona prompt -->
  <div class="step-block">
    <div class="step-title"><span class="step-num">2</span> Persona 合成 Prompt（发给 LLM）</div>
    <div class="diff-callout">
      <div class="diff-label">中文风格行</div>
      <code class="diff-line ${m.design_style ? 'has-style' : 'no-style'}">${zhStyleLine}</code>
    </div>
    <details>
      <summary>展开完整 prompt（${s.personaPrompt ? s.personaPrompt.split("\n").length : 0} 行）</summary>
      <pre class="prompt-pre">${personaPromptHighlighted}</pre>
    </details>
  </div>

  <!-- Persona output -->
  <div class="step-block">
    <div class="step-title"><span class="step-num">3</span> Persona 合成结果 <span class="timing">${r.timings.personaMs ? ((r.timings.personaMs/1000).toFixed(1)+"s") : "—"}</span></div>
    ${hasError && !s.personaSpec ? `<div class="error-msg">${esc(r.error)}</div>` : ""}
    ${personaFields.length ? `
    <div class="persona-card">
      ${personaFields.map(([k,v]) => `
        <div class="pf-row">
          <div class="pf-key">${esc(k)}</div>
          <div class="pf-val">${esc(v ?? "—")}</div>
        </div>`).join("")}
    </div>
    <div class="source-tag ${personaOk ? "ok" : "warn"}">${personaOk ? "✅ llm_persona_synthesis" : "⚠ parse_failed / fallback"}</div>
    ` : "<div class='no-data'>暂无 persona 数据</div>"}
  </div>

  <!-- Query prompt -->
  <div class="step-block">
    <div class="step-title"><span class="step-num">4</span> Query 生成 Prompt（发给 LLM）</div>
    <div class="diff-callout">
      <div class="diff-label">英文风格句</div>
      <code class="diff-line ${m.design_style ? 'has-style' : 'no-style'}">${enStyleLine}</code>
    </div>
    <details>
      <summary>展开完整 prompt（${s.queryPrompt ? s.queryPrompt.split("\n").length : 0} 行）</summary>
      <pre class="prompt-pre">${queryPromptHighlighted}</pre>
    </details>
  </div>

  <!-- Final query -->
  <div class="step-block step-final">
    <div class="step-title"><span class="step-num">5</span> 最终 Query 输出 <span class="timing">${r.timings.queryMs ? ((r.timings.queryMs/1000).toFixed(1)+"s") : "—"}</span> <span class="wc-tag">${wordCount} 词</span></div>
    ${s.queryText
      ? `<blockquote class="query-output">${esc(s.queryText)}</blockquote>`
      : `<div class="error-msg">${esc(r.error || "无输出")}</div>`}
  </div>

  <!-- Total timing -->
  <div class="timing-footer">
    总耗时 ${r.timings.totalMs ? ((r.timings.totalMs/1000).toFixed(1)+"s") : "—"}
    &nbsp;·&nbsp;
    persona ${r.timings.personaMs ? ((r.timings.personaMs/1000).toFixed(1)+"s") : "—"}
    &nbsp;+&nbsp;
    query ${r.timings.queryMs ? ((r.timings.queryMs/1000).toFixed(1)+"s") : "—"}
  </div>
</div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design Style 模式对比 · ${complexity}</title>
<style>
:root {
  --bg:#0f1117; --surface:#1a1d27; --surface2:#22263a; --border:#2e3350;
  --accent:#6c63ff; --accent2:#00d4aa; --warn2:#ffa940;
  --text:#e8eaf6; --text2:#9da3c4; --pass:#36d399; --fail:#ff6b6b;
  --radius:10px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:13px;line-height:1.6}

/* ── Layout ── */
.page{max-width:1480px;margin:0 auto;padding:28px 20px 80px}
header{margin-bottom:32px;border-bottom:1px solid var(--border);padding-bottom:20px}
header h1{font-size:20px;font-weight:700}
header .sub{color:var(--text2);font-size:12px;margin-top:6px}

/* Scenario banner */
.scene-banner{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;display:flex;gap:24px;flex-wrap:wrap;align-items:center}
.scene-item{display:flex;flex-direction:column;gap:2px}
.scene-key{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px}
.scene-val{font-size:13px;font-weight:600;color:var(--text)}
.badge-medium{display:inline-block;background:#ffa94022;color:var(--warn2);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
.badge-vague{display:inline-block;background:#6c63ff22;color:var(--accent);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
.badge-complex{display:inline-block;background:#ff6b6b22;color:var(--fail);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}

/* Concept callout */
.concept{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius);padding:14px 18px;margin-bottom:24px;font-size:12px;color:var(--text2);line-height:1.7}
.concept strong{color:var(--text)}
.concept .hl-row{margin-top:8px;display:flex;gap:12px;flex-wrap:wrap}
.chip{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;margin-right:4px}
.chip-null{background:#6c63ff22;color:#6c63ff}
.chip-dark{background:#36d39922;color:#36d399}
.chip-glass{background:#00d4aa22;color:#00d4aa}

/* Columns grid */
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start}
@media(max-width:1100px){.cols{grid-template-columns:1fr}}

.col{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.col-header{padding:14px 16px;background:var(--surface2);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.mode-badge{padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700}
.mode-label{font-size:13px;font-weight:600;flex:1}
.error-badge{background:#ff6b6b22;color:var(--fail);padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700}

/* Steps */
.step-block{padding:14px 16px;border-bottom:1px solid var(--border)}
.step-block:last-child{border-bottom:none}
.step-final{background:var(--surface2)}
.step-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:10px;display:flex;align-items:center;gap:8px}
.step-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--accent);color:#fff;border-radius:50%;font-size:10px;font-weight:800;flex-shrink:0}
.timing{color:var(--accent2);font-weight:600;font-variant-numeric:tabular-nums}
.wc-tag{background:var(--surface);border:1px solid var(--border);color:var(--text2);padding:1px 6px;border-radius:8px;font-size:10px}

/* Metadata */
.meta-grid{display:flex;flex-direction:column;gap:5px}
.meta-row{display:flex;gap:8px;align-items:baseline}
.mk{font-size:10px;color:var(--text2);width:90px;flex-shrink:0;font-family:monospace}
.mv{font-size:12px;color:var(--text)}

/* Diff callout */
.diff-callout{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:8px}
.diff-label{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.diff-line{display:block;font-size:11px;font-family:monospace;word-break:break-word;color:var(--text2)}
.diff-line.has-style{color:var(--accent2)}
.diff-line.no-style{color:#ffa940;font-style:italic}

/* Highlight marks in prompt text */
mark.hl-zh{background:#ffa94033;color:#ffa940;padding:0 2px;border-radius:2px}
mark.hl-en{background:#00d4aa22;color:#00d4aa;padding:0 2px;border-radius:2px}

/* Prompt pre */
details summary{font-size:11px;color:var(--text2);cursor:pointer;padding:4px 0;user-select:none}
details summary:hover{color:var(--text)}
.prompt-pre{font-size:10.5px;font-family:'Fira Code',monospace;white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-top:8px;color:var(--text2);max-height:320px;overflow-y:auto;line-height:1.6}

/* Persona card */
.persona-card{background:var(--bg);border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:8px}
.pf-row{display:grid;grid-template-columns:140px 1fr;border-bottom:1px solid var(--border)}
.pf-row:last-child{border-bottom:none}
.pf-key{font-size:10px;font-family:monospace;color:var(--text2);padding:6px 8px;background:var(--surface);border-right:1px solid var(--border);word-break:break-all}
.pf-val{font-size:11px;padding:6px 8px;color:var(--text);line-height:1.5}
.source-tag{font-size:10px;padding:3px 8px;border-radius:4px;display:inline-block}
.source-tag.ok{background:#36d39918;color:var(--pass)}
.source-tag.warn{background:#ffa94018;color:var(--warn2)}
.no-data{color:var(--text2);font-size:11px;font-style:italic}
.error-msg{background:#ff6b6b18;border:1px solid #ff6b6b44;border-radius:6px;padding:8px 10px;color:var(--fail);font-size:11px}

/* Query output */
.query-output{background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--col-color,var(--accent));border-radius:6px;padding:12px 14px;font-size:12px;color:var(--text);line-height:1.7;white-space:pre-wrap;word-break:break-word}

/* Timing footer */
.timing-footer{padding:10px 16px;font-size:11px;color:var(--text2);background:var(--bg);border-top:1px solid var(--border);text-align:right}

/* Legend */
.legend{margin-top:32px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px}
.legend h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:12px}
.legend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.legend-item{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px}
.legend-item h4{font-size:12px;font-weight:700;margin-bottom:6px}
.legend-item p{font-size:11px;color:var(--text2);line-height:1.6}
.legend-item code{background:var(--surface);padding:1px 5px;border-radius:3px;font-size:10px;color:var(--accent2)}
</style>
</head>
<body>
<div class="page">

<header>
  <h1>Design Style 注入模式 · 完整过程对比</h1>
  <div class="sub">相同场景 / 相同复杂度 / 独立 persona seed · 生成于 ${now} · claude-cli transport</div>
</header>

<div class="scene-banner">
  <div class="scene-item"><div class="scene-key">L1 场景</div><div class="scene-val">办公效率</div></div>
  <div class="scene-item"><div class="scene-key">L2 场景</div><div class="scene-val">项目看板/任务追踪 ★</div></div>
  <div class="scene-item"><div class="scene-key">应用类型</div><div class="scene-val">项目看板应用</div></div>
  <div class="scene-item"><div class="scene-key">目标复杂度</div><div class="scene-val"><span class="badge-${complexity}">${complexity}</span></div></div>
</div>

<div class="concept">
  <strong>三种模式的核心差异</strong>：design_style 字段影响两个 prompt 注入点。
  <div class="hl-row">
    <span><span class="chip chip-null">null（默认）</span> 中文: "未显式指定设计风格，可根据场景自然推断。" &nbsp;|&nbsp; 英文: "No fixed visual style is required — let the visual direction emerge naturally..."</span>
  </div>
  <div class="hl-row">
    <span><span class="chip chip-dark">Dark</span> 中文: "使用深色主题，重点信息高对比突出" &nbsp;|&nbsp; 英文: "Use a dark theme with strong contrast on key information."</span>
  </div>
  <div class="hl-row">
    <span><span class="chip chip-glass">Glassmorphism</span> 中文: "整体偏玻璃拟态风格，卡片有毛玻璃层次和背景透视感" &nbsp;|&nbsp; 英文: "Use a glassmorphism visual style with translucent layered cards."</span>
  </div>
  <div style="margin-top:8px;color:#9da3c4"><strong style="color:#ffa940">黄色高亮</strong> = 中文设计风格行 &nbsp;·&nbsp; <strong style="color:#00d4aa">绿色高亮</strong> = 英文风格指令句</div>
</div>

<div class="cols">${colHTML}</div>

<div class="legend">
  <h3>流程说明 — 5 步 Pipeline</h3>
  <div class="legend-grid">
    <div class="legend-item">
      <h4 style="color:var(--accent)">步骤 1 · Plan Task</h4>
      <p>plan 阶段确定 <code>design_style</code> 字段。默认 <code>null</code>，可通过 <code>--design-styles</code> 显式注入，或 <code>registerDesignStyle()</code> 扩展风格库。</p>
    </div>
    <div class="legend-item">
      <h4 style="color:var(--accent)">步骤 2 · Persona Prompt</h4>
      <p><code>buildPersonaSynthesisPrompt(task)</code> 生成中文 persona 合成指令。<strong style="color:#ffa940">风格行</strong>注入在 "## 场景输入" 块内，影响 LLM 对用户角色的理解。</p>
    </div>
    <div class="legend-item">
      <h4 style="color:var(--accent2)">步骤 3 · Persona 合成</h4>
      <p>LLM 返回 JSON: <code>persona_title</code> / <code>persona_description</code> / <code>persona_style_hint</code> / <code>user_goal</code> 等字段。persona 决定了后续 query 的说话人语气。</p>
    </div>
    <div class="legend-item">
      <h4 style="color:var(--accent2)">步骤 4 · Query Prompt</h4>
      <p><code>buildQueryPromptFromPersona(task, persona)</code> 生成英文 query 指令。<strong style="color:#00d4aa">风格句</strong>直接嵌入 query 模板（medium: "...${'{styleSentence}'} I want a clear hero section..."）。</p>
    </div>
    <div class="legend-item">
      <h4 style="color:var(--warn2)">步骤 5 · 最终 Query</h4>
      <p>LLM 以 persona 身份输出 UI 需求描述。design_style 影响程度：<br>null → LLM 自由融入场景感；explicit → 用户语气中会带入具体风格词汇。</p>
    </div>
    <div class="legend-item">
      <h4 style="color:var(--pass)">扩展新风格</h4>
      <p><code>registerDesignStyle("Y2K", "千禧复古...", "Use a Y2K-inspired aesthetic...")</code> — 立即生效，同步更新 DESIGN_STYLES / STYLE_HINTS / _EN_STYLE_INSTRUCTIONS。</p>
    </div>
  </div>
</div>

</div>
</body>
</html>`;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Design Style 模式对比 Demo ===`);
  console.log(`场景: ${BASE_SCENE.l2_scene_label} | 复杂度: ${COMPLEXITY}`);
  console.log(`输出: ${OUT_HTML}\n`);

  const results = [];
  for (const mode of MODES) {
    const r = await runMode(mode);
    results.push(r);
  }

  // Write JSON artifacts for inspection
  const artifactsPath = OUT_HTML.replace(".html", "_artifacts.json");
  fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
  fs.writeFileSync(artifactsPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\n[artifacts] ${artifactsPath}`);

  // Build HTML
  const html = buildHTML(results, COMPLEXITY);
  fs.writeFileSync(OUT_HTML, html, "utf8");
  console.log(`[html]      ${OUT_HTML}`);
  console.log(`\n完成。用浏览器打开 HTML 查看三列对比。`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
