/**
 * test-corpus-methods.js
 *
 * 对比 4 种 Query 生成方法在 3 个典型场景下的输出质量。
 *
 * 方法对照：
 *   corpus-direct   — Scene + Corpus Topic → Query（1次LLM调用，无 persona）
 *   persona-corpus  — Scene + Corpus Topic → Persona → Query（2次LLM调用）
 *   persona-only    — Scene → Persona → Query（无 corpus，现有流水线）
 *   scene-direct    — Scene → Query（无 corpus 无 persona，基线）
 *
 * 用法：
 *   node scripts/test-corpus-methods.js [--mode llm-openai|llm-anthropic] [--dry-run] [--concurrency 2]
 *
 * 输出：
 *   data/output/corpus_comparison_results.json
 *   data/output/corpus_method_comparison.html
 */

const path = require("path");
const fs   = require("fs");

const {
  parseArgs,
  ensureDir,
  writeJson,
  cleanText,
  scoreQueryRecord,
  normalizeQueryOutput,
  normalizePersonaSpec,
  buildPersonaSynthesisPrompt,
  buildCorpusPersonaSynthesisPrompt,
  buildQueryPromptFromPersona,
  buildCorpusDirectQueryPrompt,
  buildSceneDirectQueryPrompt,
  buildPersonaSpec,
  mapWithConcurrency,
} = require("../mvp/query_factory_v2");

const {
  applyPackyEnv,
  callClaudeCli,
  CLI_MODEL,
  CLI_TIMEOUT_MS,
  CLI_MAX_RETRIES,
} = require("./lib/claude-cli");

applyPackyEnv();

// ─── 1. TEST SCENES ──────────────────────────────────────────────────────────

const TEST_SCENES = [
  {
    id: "scene_A",
    label: "深度研究展示 × 个人生活类",
    l1_scene: "深度研究展示",
    l2_scene_label: "个人生活类",
    l2_scene_raw: "① 个人生活类（旅行回忆、年度相册、画作展示、宝宝成长）",
    l2_scene_examples: ["旅行回忆", "年度相册", "画作展示", "宝宝成长"],
    corpus_topic: "Travel Memory Scrapbook",
    target_complexity: "medium",
    design_style: null,
  },
  {
    id: "scene_B",
    label: "交互方式 × 新建与创建",
    l1_scene: "交互方式",
    l2_scene_label: "Adding & Creating",
    l2_scene_raw: "① Adding & Creating 新建与创建",
    l2_scene_examples: ["新建", "创建"],
    corpus_topic: "Recipe step-by-step creation wizard with ingredient input",
    target_complexity: "complex",
    design_style: null,
  },
  {
    id: "scene_C",
    label: "工具与效率 × 番茄钟/专注计时",
    l1_scene: "工具与效率",
    l2_scene_label: "番茄钟/专注计时",
    l2_scene_raw: "② 番茄钟/专注计时 ★",
    l2_scene_examples: ["番茄钟", "专注计时"],
    corpus_topic: "90-minute deep work flow block timer",
    target_complexity: "vague",
    design_style: null,
  },
];

// ─── 2. METHOD DEFINITIONS ───────────────────────────────────────────────────
// All 4 methods are 1-LLM-call (persona is pre-generated and shared).
// The independent variable is what appears in the QUERY GENERATION prompt.

const METHODS = [
  {
    id: "scene-direct",
    label: "Scene-Direct",
    badge: "scene",
    color: "#6b7280",
    useCorpus: false,
    usePersona: false,
    desc: "基线：query prompt 只含场景",
  },
  {
    id: "corpus-direct",
    label: "Corpus-Direct",
    badge: "scene + topic",
    color: "#6366f1",
    useCorpus: true,
    usePersona: false,
    desc: "query prompt = 场景 + corpus topic",
  },
  {
    id: "persona-only",
    label: "Persona-Only",
    badge: "scene + persona",
    color: "#f59e0b",
    useCorpus: false,
    usePersona: true,
    desc: "query prompt = 场景 + 共享 persona（不含 topic）",
  },
  {
    id: "persona-corpus",
    label: "Persona + Corpus",
    badge: "scene + topic + persona",
    color: "#0ea5e9",
    useCorpus: true,
    usePersona: true,
    desc: "query prompt = 场景 + corpus topic + 共享 persona",
  },
];

const QUERY_SYSTEM = "You are roleplaying as a real end-user typing a UI request to an AI coding assistant. Output only the user's message. No JSON. No meta commentary. English only.";
const PERSONA_SYSTEM = "You are a persona synthesis assistant. Output strict JSON only, no prose, no code fences. Respect the schema in the user message.";

// ─── 3. ANCHOR PERSONA GENERATION (once per scene) ───────────────────────────

/**
 * Pre-generate a corpus-aware persona for the scene. Shared across persona methods.
 */
async function generateAnchorPersona(scene, isDryRun) {
  // For persona synthesis prompt we need a task-shaped object.
  const task = {
    ...scene,
    application_type: scene.corpus_topic,
    persona_seed: scene.id + "_anchor",
    query_id: scene.id + "_anchor",
    product_type: "portfolio",
    constrained: false,
  };
  const promptText = buildCorpusPersonaSynthesisPrompt(task);

  if (isDryRun) {
    return {
      persona_spec: {
        persona_id: `p_${scene.id}_anchor`,
        persona_title: `[DRY-RUN] User for ${scene.corpus_topic}`,
        persona_description: `[DRY-RUN persona] Someone interested in ${scene.corpus_topic.toLowerCase()}.`,
        persona_style_hint: "casual",
        user_goal: `Build ${scene.corpus_topic} UI`,
        domain_familiarity: "medium",
        persona_source: "dry_run",
      },
      prompt_text: promptText,
      duration_ms: 1,
    };
  }

  const t0 = Date.now();
  const raw = await callClaudeCli(promptText, { systemPrompt: PERSONA_SYSTEM, label: `${scene.id}#anchor-persona` });
  return {
    persona_spec: normalizePersonaSpec(task, raw),
    prompt_text: promptText,
    duration_ms: Date.now() - t0,
  };
}

// ─── 4. QUERY GENERATION (one sample, fixed inputs) ──────────────────────────

/**
 * @returns {{ query_text, query_prompt_text, duration_ms }}
 * Each method = exactly 1 LLM call. Persona is passed in (not generated here).
 */
async function runQueryGeneration(methodId, scene, anchorPersona, sampleIdx, isDryRun) {
  const t0 = Date.now();
  const method = METHODS.find((m) => m.id === methodId);

  // Build the task object that prompt builders expect.
  // application_type controls what's anchored in the query prompt:
  //   - useCorpus=true  → application_type = corpus_topic (specific anchor)
  //   - useCorpus=false → application_type = l2_scene_label (category-level)
  const task = {
    ...scene,
    application_type: method.useCorpus ? scene.corpus_topic : scene.l2_scene_label,
    persona_seed: `${scene.id}_${methodId}_${sampleIdx}`,
    query_id: `${scene.id}_${methodId}_s${sampleIdx}`,
    product_type: "portfolio",
    constrained: false,
  };

  // ── dry-run: deterministic templates ──
  if (isDryRun) {
    const tmpl = {
      "scene-direct":   `[DRY/${sampleIdx}] Something for the ${task.l2_scene_label} category.`,
      "corpus-direct":  `[DRY/${sampleIdx}] Build a ${task.corpus_topic} UI.`,
      "persona-only":   `[DRY/${sampleIdx}] As ${anchorPersona.persona_title} — need a ${task.l2_scene_label} app.`,
      "persona-corpus": `[DRY/${sampleIdx}] As ${anchorPersona.persona_title} — need ${task.corpus_topic} UI.`,
    };
    return {
      query_text: tmpl[methodId] || `[DRY/${sampleIdx}] ${methodId}`,
      query_prompt_text: `(dry-run/${sampleIdx} — ${methodId})`,
      duration_ms: 1,
    };
  }

  // ── real LLM: build the appropriate prompt based on method ──
  let promptText;
  if (methodId === "scene-direct")   promptText = buildSceneDirectQueryPrompt(task);
  else if (methodId === "corpus-direct")  promptText = buildCorpusDirectQueryPrompt(task);
  else if (methodId === "persona-only" || methodId === "persona-corpus") {
    // Both use buildQueryPromptFromPersona with the shared anchor persona.
    // task.application_type differs (set above) — that's the corpus effect.
    promptText = buildQueryPromptFromPersona(task, anchorPersona);
  } else {
    throw new Error(`Unknown method: ${methodId}`);
  }

  const raw = await callClaudeCli(promptText, {
    systemPrompt: QUERY_SYSTEM,
    label: `${scene.id}#${methodId}#s${sampleIdx}`,
  });

  return {
    query_text: normalizeQueryOutput(raw),
    query_prompt_text: promptText,
    duration_ms: Date.now() - t0,
  };
}

// ─── 5. MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const isDryRun = args["dry-run"] === true;
  const N_SAMPLES = Math.max(1, Number(args.samples || 3));
  const concurrency = isDryRun ? 6 : Number(args.concurrency || 2);

  if (isDryRun) {
    console.log("🧪 DRY-RUN 模式 — 不调用真实 LLM");
  } else {
    console.log(`🔧 LLM via claude CLI subprocess  ·  model=${CLI_MODEL}  ·  timeout=${CLI_TIMEOUT_MS}ms  ·  retries=${CLI_MAX_RETRIES}`);
  }
  console.log(`📐 实验设计：场景/复杂度/persona 固定；每方法采样 N=${N_SAMPLES}`);
  console.log(`   总调用量：${TEST_SCENES.length} persona + ${TEST_SCENES.length}×${METHODS.length}×${N_SAMPLES} query = ${TEST_SCENES.length + TEST_SCENES.length * METHODS.length * N_SAMPLES} 次`);

  const outDir = path.resolve(rootDir, "data/output");
  ensureDir(outDir);

  // ── Phase 1: pre-generate anchor persona for each scene (controlled variable) ──
  console.log(`\n▶ Phase 1: 生成场景 anchor persona（${TEST_SCENES.length} 个，每场景 1 次 LLM 调用）`);
  const anchorPersonasByScene = {};
  for (const scene of TEST_SCENES) {
    process.stdout.write(`  ${scene.label} ... `);
    try {
      const { persona_spec, prompt_text, duration_ms } = await generateAnchorPersona(scene, isDryRun);
      anchorPersonasByScene[scene.id] = { persona_spec, prompt_text, duration_ms };
      console.log(`✓ ${persona_spec.persona_title} (${duration_ms}ms)`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
      anchorPersonasByScene[scene.id] = null;
    }
  }

  // ── Phase 2: run each (scene × method) N_SAMPLES times in parallel ──
  console.log(`\n▶ Phase 2: 跑 ${TEST_SCENES.length}×${METHODS.length}×${N_SAMPLES}=${TEST_SCENES.length * METHODS.length * N_SAMPLES} 个 query（concurrency=${concurrency}）\n`);

  const workItems = [];
  for (const scene of TEST_SCENES) {
    for (const method of METHODS) {
      for (let i = 0; i < N_SAMPLES; i += 1) {
        workItems.push({ scene, method, sampleIdx: i });
      }
    }
  }

  const samples = await mapWithConcurrency(workItems, concurrency, async ({ scene, method, sampleIdx }) => {
    const anchor = anchorPersonasByScene[scene.id];
    const personaSpec = anchor?.persona_spec || null;
    const label = `[${method.label.padEnd(17)}] ${scene.label} s${sampleIdx + 1}`;
    try {
      const out = await runQueryGeneration(method.id, scene, personaSpec, sampleIdx, isDryRun);
      const scored = scoreQueryRecord({
        query_text: out.query_text,
        target_complexity: scene.target_complexity,
        application_type: method.useCorpus ? scene.corpus_topic : scene.l2_scene_label,
        design_style: scene.design_style,
        persona_title: method.usePersona ? personaSpec?.persona_title : null,
        product_type: null,
      });
      console.log(`  ${label} ✓ (${wordCount(out.query_text)}w, q=${scored.quality_score})`);
      return {
        scene_id: scene.id,
        scene_label: scene.label,
        method_id: method.id,
        method_label: method.label,
        sample_idx: sampleIdx,
        l1_scene: scene.l1_scene,
        l2_scene_label: scene.l2_scene_label,
        corpus_topic: scene.corpus_topic,
        target_complexity: scene.target_complexity,
        anchor_persona_title: personaSpec?.persona_title || null,
        anchor_persona_used: method.usePersona,
        query_text: out.query_text,
        query_prompt_text: out.query_prompt_text,
        word_count: wordCount(out.query_text),
        quality_score: scored.quality_score,
        quality_pass: scored.quality_pass,
        complexity_inferred: scored.complexity_level,
        peer_similarity: scored.peer_similarity,
        duration_ms: out.duration_ms,
        error: null,
      };
    } catch (err) {
      console.log(`  ${label} ✗ ${err.message.split("\n")[0]}`);
      return {
        scene_id: scene.id, scene_label: scene.label,
        method_id: method.id, method_label: method.label,
        sample_idx: sampleIdx,
        corpus_topic: scene.corpus_topic,
        target_complexity: scene.target_complexity,
        query_text: "", quality_score: 0, quality_pass: false,
        error: err.message,
      };
    }
  });

  // Save raw JSON
  const jsonPath = path.join(outDir, "corpus_comparison_results.json");
  writeJson(jsonPath, {
    generated_at: new Date().toISOString(),
    dry_run: isDryRun,
    n_samples: N_SAMPLES,
    methodology: "controlled-variables: scene/complexity/persona fixed; N samples per (scene × method)",
    anchor_personas: Object.fromEntries(Object.entries(anchorPersonasByScene).map(([id, v]) => [id, v?.persona_spec || null])),
    samples,
  });
  console.log(`\n📄 JSON → ${jsonPath}`);

  // HTML report
  const htmlPath = path.join(outDir, "corpus_method_comparison.html");
  fs.writeFileSync(htmlPath, buildHtmlReport(samples, anchorPersonasByScene, N_SAMPLES, isDryRun), "utf8");
  console.log(`📊 HTML → ${htmlPath}`);

  printSummaryTable(samples, N_SAMPLES);
}

// ─── 5. HELPERS ───────────────────────────────────────────────────────────────

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stats(arr) {
  if (!arr.length) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return {
    mean: +mean.toFixed(2),
    std: +Math.sqrt(variance).toFixed(2),
    min: Math.min(...arr),
    max: Math.max(...arr),
  };
}

function printSummaryTable(results, N) {
  console.log(`\n┌─ 汇总（每方法 ${N} 次采样均值±标准差）───────────────────────────────────────┐`);
  for (const method of METHODS) {
    const rows = results.filter((r) => r.method_id === method.id && !r.error);
    if (!rows.length) {
      console.log(`│  ${method.label.padEnd(18)} —  no results`);
      continue;
    }
    const qs = stats(rows.map((r) => r.quality_score));
    const ws = stats(rows.map((r) => r.word_count));
    const ms = stats(rows.map((r) => r.duration_ms || 0));
    const pass = rows.filter((r) => r.quality_pass).length;
    console.log(
      `│  ${method.label.padEnd(18)} q=${qs.mean.toFixed(2)}±${qs.std.toFixed(2)} (n=${rows.length})  词=${String(ws.mean.toFixed(0)).padStart(3)}±${ws.std.toFixed(0)}  pass=${pass}/${rows.length}  耗时≈${Math.round(ms.mean)}ms  [${method.badge}]`,
    );
  }
  console.log("└──────────────────────────────────────────────────────────────────────────────┘\n");
}

// ─── 6. HTML REPORT ──────────────────────────────────────────────────────────

function buildHtmlReport(samples, anchorPersonasByScene, N, isDryRun) {
  function scoreColor(s) {
    if (s >= 3.5) return "#22c55e";
    if (s >= 2.8) return "#f59e0b";
    return "#ef4444";
  }
  function complexityBadge(c) {
    const map = { vague: "#94a3b8", medium: "#6366f1", complex: "#0ea5e9" };
    return `<span style="background:${map[c]||"#6b7280"};color:#fff;padding:1px 6px;border-radius:9px;font-size:11px">${c}</span>`;
  }

  // Per-method aggregate across all scenes & samples
  const methodStats = {};
  for (const m of METHODS) {
    const rows = samples.filter((r) => r.method_id === m.id && !r.error);
    methodStats[m.id] = {
      q:    stats(rows.map((r) => r.quality_score)),
      w:    stats(rows.map((r) => r.word_count)),
      ms:   stats(rows.map((r) => r.duration_ms || 0)),
      pass: rows.filter((r) => r.quality_pass).length,
      total: rows.length,
    };
  }

  // Per-(scene × method) aggregate
  const cellStats = {};
  for (const scene of TEST_SCENES) {
    cellStats[scene.id] = {};
    for (const m of METHODS) {
      const rows = samples.filter((r) => r.scene_id === scene.id && r.method_id === m.id && !r.error);
      cellStats[scene.id][m.id] = {
        rows,
        q: stats(rows.map((r) => r.quality_score)),
        w: stats(rows.map((r) => r.word_count)),
      };
    }
  }

  // ── Summary table (overall) ──
  let summaryRows = "";
  for (const m of METHODS) {
    const s = methodStats[m.id];
    const barW = Math.round((s.q.mean / 5) * 100);
    summaryRows += `
      <tr>
        <td><span class="dot" style="background:${m.color}"></span><b>${esc(m.label)}</b></td>
        <td><span class="badge-inline" style="background:${m.color}">${esc(m.badge)}</span></td>
        <td>${m.useCorpus ? "✅" : "—"}</td>
        <td>${m.usePersona ? "✅" : "—"}</td>
        <td>
          <div class="bar-wrap"><div class="bar-fill" style="width:${barW}%;background:${scoreColor(s.q.mean)}"></div></div>
          <span style="color:${scoreColor(s.q.mean)};font-weight:700">${s.q.mean.toFixed(2)}</span>
          <span style="color:var(--muted);font-size:11px"> ±${s.q.std.toFixed(2)}</span>
        </td>
        <td>${s.w.mean.toFixed(0)} <span style="color:var(--muted);font-size:11px">±${s.w.std.toFixed(0)}</span></td>
        <td>${s.pass}/${s.total}</td>
        <td>${Math.round(s.ms.mean)}ms</td>
      </tr>`;
  }

  // ── Scene blocks ──
  let sceneBlocks = "";
  for (const scene of TEST_SCENES) {
    const anchor = anchorPersonasByScene[scene.id]?.persona_spec;
    const anchorBlock = anchor
      ? `<div class="anchor-persona">
          <div class="anchor-label">🧑 共享 Anchor Persona（persona-only & persona-corpus 共用）</div>
          <div class="anchor-title">${esc(anchor.persona_title || "")}</div>
          <div class="anchor-desc">${esc(anchor.persona_description || "")}</div>
          <div class="anchor-row"><span class="kv-key">Goal:</span> ${esc(anchor.user_goal || "")}</div>
          <div class="anchor-row"><span class="kv-key">Style:</span> ${esc(anchor.persona_style_hint || "")}</div>
          <div class="anchor-row"><span class="kv-key">Familiarity:</span> ${esc(anchor.domain_familiarity || "")}</div>
        </div>`
      : "";

    let methodCards = "";
    for (const method of METHODS) {
      const cell = cellStats[scene.id][method.id];
      const rows = cell.rows;
      if (!rows.length) {
        methodCards += `<div class="method-card" style="border-top:3px solid ${method.color}"><div class="method-header"><span class="method-badge" style="background:${method.color}">${esc(method.badge)}</span><span class="method-name">${esc(method.label)}</span></div><div class="error-box">no results</div></div>`;
        continue;
      }

      // Cell aggregate
      const cellAggHtml = `
        <div class="cell-agg">
          <span style="color:${scoreColor(cell.q.mean)};font-weight:700;font-size:14px">★ ${cell.q.mean.toFixed(2)}</span>
          <span style="color:var(--muted);font-size:11px">±${cell.q.std.toFixed(2)}</span>
          <span class="metric" style="margin-left:auto">📝 ${cell.w.mean.toFixed(0)}±${cell.w.std.toFixed(0)}w</span>
        </div>`;

      // Show all samples
      const sampleBlocks = rows.map((r, i) => `
        <div class="sample-block">
          <div class="sample-head">
            <span class="sample-idx">#${i + 1}</span>
            <span class="metric" style="color:${scoreColor(r.quality_score)}">★ ${r.quality_score}</span>
            <span class="metric">📝 ${r.word_count}w</span>
            <span class="metric">${complexityBadge(r.complexity_inferred || r.target_complexity)}</span>
            ${r.duration_ms > 1 ? `<span class="metric">⏱ ${r.duration_ms}ms</span>` : ""}
          </div>
          <div class="query-box">${esc(r.query_text)}</div>
        </div>`).join("");

      methodCards += `
        <div class="method-card" style="border-top:3px solid ${method.color}">
          <div class="method-header">
            <span class="method-badge" style="background:${method.color}">${esc(method.badge)}</span>
            <span class="method-name">${esc(method.label)}</span>
          </div>
          <div class="method-desc">${esc(method.desc)}</div>
          ${cellAggHtml}
          ${sampleBlocks}
          <details class="prompt-details">
            <summary>查看 query prompt</summary>
            <pre class="prompt-pre">${esc(rows[0].query_prompt_text || "")}</pre>
          </details>
        </div>`;
    }

    sceneBlocks += `
      <section class="scene-section">
        <div class="scene-header">
          <div class="scene-title">${esc(scene.label)}</div>
          <div class="scene-meta">
            <span class="tag tag-complexity">${esc(scene.target_complexity)}</span>
            <span class="tag tag-corpus">🗂 ${esc(scene.corpus_topic)}</span>
          </div>
        </div>
        ${anchorBlock}
        <div class="method-grid">${methodCards}</div>
      </section>`;
  }

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Corpus Method Comparison</title>
<style>
  :root{--bg:#0f172a;--surface:#1e293b;--surface2:#293548;--border:#334155;--text:#f1f5f9;--muted:#94a3b8}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.6}
  h1{font-size:22px;font-weight:700;padding:28px 32px 4px}
  .subtitle{color:var(--muted);padding:0 32px 24px;font-size:13px}
  .dry-run-banner{background:#7c3aed;color:#fff;padding:6px 32px;font-size:12px;font-weight:600}
  /* summary table */
  .summary-wrap{padding:0 32px 32px}
  .summary-title{font-size:15px;font-weight:600;margin-bottom:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:10px;overflow:hidden}
  th{background:var(--surface2);padding:10px 14px;text-align:left;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  td{padding:10px 14px;border-top:1px solid var(--border);vertical-align:middle}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;vertical-align:middle}
  .bar-wrap{display:inline-block;width:80px;height:7px;background:var(--border);border-radius:4px;margin-right:6px;vertical-align:middle}
  .bar-fill{height:100%;border-radius:4px}
  /* scene sections */
  .scene-section{padding:0 32px 36px}
  .scene-header{display:flex;align-items:center;gap:12px;margin-bottom:14px}
  .scene-title{font-size:16px;font-weight:700}
  .tag{padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}
  .tag-complexity{background:#1e3a5f;color:#7dd3fc}
  .tag-corpus{background:#1e2d1e;color:#86efac;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .method-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  @media(max-width:1100px){.method-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:640px){.method-grid{grid-template-columns:1fr}}
  .method-card{background:var(--surface);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px}
  .method-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .method-badge{padding:2px 8px;border-radius:12px;font-size:11px;color:#fff;font-weight:600;white-space:nowrap}
  .method-name{font-weight:600;font-size:13px}
  .llm-calls{margin-left:auto;font-size:11px;color:var(--muted)}
  .method-desc{font-size:12px;color:var(--muted);border-left:2px solid var(--border);padding-left:8px}
  .anchor-persona{background:#0c2541;border:1px solid #1e40af;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:13px}
  .anchor-label{font-size:11px;color:#93c5fd;text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:8px}
  .anchor-title{font-weight:700;color:#dbeafe;margin-bottom:6px;font-size:14px}
  .anchor-desc{color:#cbd5e1;margin-bottom:8px;line-height:1.6}
  .anchor-row{font-size:12px;color:#94a3b8;margin-top:3px}
  .kv-key{color:#7dd3fc;font-weight:600;margin-right:6px}
  .query-box{background:#0d1b2a;border-radius:7px;padding:10px 12px;font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word}
  .error-box{background:#3f0d0d;color:#fca5a5;border-radius:7px;padding:10px;font-size:12px}
  .cell-agg{display:flex;align-items:center;gap:6px;background:#0d1b2a;border-radius:7px;padding:8px 12px;border-left:3px solid #f59e0b}
  .sample-block{display:flex;flex-direction:column;gap:6px;border-top:1px dashed var(--border);padding-top:8px}
  .sample-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .sample-idx{font-size:11px;font-weight:700;color:var(--muted);background:var(--surface2);padding:1px 7px;border-radius:9px}
  .metric{font-size:11px;font-weight:600}
  .badge-inline{padding:2px 8px;border-radius:10px;font-size:11px;color:#fff;font-weight:600}
  .prompt-details{font-size:11px}
  .prompt-details summary{color:var(--muted);cursor:pointer;padding:4px 0}
  .prompt-details summary:hover{color:var(--text)}
  .prompt-pre{background:#0d1117;border-radius:6px;padding:10px;white-space:pre-wrap;word-break:break-word;color:#94a3b8;max-height:300px;overflow-y:auto;margin-top:6px;font-size:11px}
  .methodology-box{background:var(--surface);border-left:3px solid #22c55e;border-radius:6px;padding:12px 16px;margin:0 32px 24px;font-size:13px;line-height:1.7}
  .methodology-box b{color:#86efac}
  hr{border:none;border-top:1px solid var(--border);margin:0 32px 32px}
</style>
</head>
<body>
${isDryRun ? '<div class="dry-run-banner">⚠ DRY-RUN 模式 — 以下 query 为模板填充，非真实 LLM 输出</div>' : ""}
<h1>Corpus Method Comparison · 控制变量实验</h1>
<p class="subtitle">4 种 query 生成方法 × ${TEST_SCENES.length} 个场景 × N=${N} 次采样 · 生成时间：${new Date().toLocaleString("zh-CN")}</p>

<div class="methodology-box">
  <b>实验设计：</b>
  <span style="color:var(--muted)">控制变量 — </span>
  <span>场景/L1/L2/复杂度/corpus topic 固定 ✓</span>
  <span> · </span>
  <span><b>persona 预生成1次/场景，所有 persona 方法共用</b></span>
  <span> · </span>
  <span>每方法跑 N=${N} 次采样取均值±标准差（消除 LLM 随机性）</span>
  <br>
  <b>独立变量：</b>
  <span style="color:var(--muted)">query 生成 prompt 是否包含 corpus topic、是否包含 persona</span>
  <span> · </span>
  <b>所有方法均为 1 次 LLM 调用</b>（persona 不计入方法对比）
</div>

<div class="summary-wrap">
  <div class="summary-title">方法汇总（跨场景 × 跨样本）</div>
  <table>
    <thead><tr><th>方法</th><th>Query Prompt 输入</th><th>含 Topic</th><th>含 Persona</th><th>质量分 (mean±std)</th><th>词数 (mean±std)</th><th>通过率</th><th>耗时</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
</div>

<hr>
${sceneBlocks}
</body>
</html>`;
}

// ─── RUN ──────────────────────────────────────────────────────────────────────

// Polyfill `isDryRun` const → need a var here for reassignment in catch
let _isDryRun_patched = false;
main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});
