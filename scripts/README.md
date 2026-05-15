# scripts/ — Reusable LLM Batch Pipeline

这一层是流水线的 CLI 表层。原有的 v2 主链路（`parse:requirements → plan:seed → generate:queries → score:queries → import:queries → build:dashboard`）保持不变；本目录新增五个**可复用**的批量生成与分析工具，以便配合真实 LLM API 高效产出 query 数据集。

## 目录

```
scripts/
├── lib/
│   ├── llm-batch.js                  # 共享核心：transport / 重试 / persona-query pipeline / 并发池 / 统计
│   └── claude-cli.js                 # ★ 共享：claude CLI 子进程调用 + env override（被 run-corpus / test-corpus-methods 复用）
├── corpus_data.json                  # ★ 61 个 L2 场景 × ~40 corpus topics（人工评审用）
├── build_corpus.py / gen_html.py     # corpus 数据与可视化构建
├── run-corpus.js                     # ★ Corpus-Direct 生产流水线（人工评审认定为最高质量方案）
├── test-corpus-methods.js            # 4 方法对比评测（控制变量：scene/复杂度/persona 固定）
├── run-free.js                       # ★ LLM 自由生成一键流水线（persona-driven 链路）
├── batch-generate-queries.js         # LLM 批量生成单步 CLI（run-free 内部调用）
├── build-free200-plan.js             # ★ 自由生成 plan 构建（200 条，persona-scope 控制）
├── build-expand200-plan.js           # 发散拓展 plan 构建（200 条，3 part 结构）
├── generate-analysis-report.js       # ★ 批次质量分析报告生成器（含 persona 卡片，可复用 skill）
├── score-queries.js                  # 质量评分单步 CLI
├── export-queries-csv.js             # ★ 导出带前缀的 query CSV
├── build-query-comparison.js         # 多 run 横向对比 HTML 生成器
├── generate-extra-scenes.js          # 基于 L1 分类扩展新 L2 场景（41 个）
├── test-api-connectivity.js          # API 网关连通性自检
├── parse-requirements.js …           # v2 主链路其它脚本（保持原状）
└── legacy/                           # 已归档的历史一次性脚本
```

复用约定：通用工具（`parseArgs` / `readJsonl` / `writeJsonl` / `ensureDir` / `escapeHtml` / `loadLocalEnv` / `COMPLEXITY_LEVELS` / `resolveDesignStyle` / `registerDesignStyle`）来自 `mvp/query_factory_v2.js`，scripts 不重复实现。

## 一键流水线：`run:free`（推荐入口）

> 等价于 `node scripts/run-free.js`

将以下四步编排为单条命令，任一步骤失败立即退出并标明位置：

```
Step 1  build-plan    构建生成计划（build-free200-plan.js）
Step 2  generate      LLM 批量生成 query（batch-generate-queries.js）
Step 3  score         质量评分（score-queries.js）
Step 4  report        生成可视化 HTML 报告（generate-analysis-report.js）
Step 5  export-csv    （可选）导出带前缀的 CSV（export-queries-csv.js）
```

**主要参数：**

| 参数 | 默认 | 说明 |
|---|---|---|
| `--output-dir` | `data/output/runs/free200_llm` | 所有产物目录（锚点） |
| `--persona-scope` | `scene` | `scene`=同场景共享 persona；`task`=每条独立 |
| `--concurrency` | `3` | LLM 并发数 |
| `--no-resume` | — | 全量重跑；不传则从断点续跑 |
| `--skip-plan` | — | 跳过 Step 1，沿用已有 plan 文件 |
| `--skip-score` | — | 跳过 Step 3（调试用） |
| `--skip-report` | — | 跳过 Step 4 |
| `--export-csv` | 关 | 开启 Step 5 |
| `--csv-prefix` | `Generate a plain HTML...` | CSV 每条 query 前缀 |
| `--title` | 自动生成 | 报告标题 |

```bash
# 最简启动
npm run run:free

# 全量重跑到新目录
npm run run:free -- --output-dir data/output/runs/free200_v2 --no-resume

# 跳过 plan 重建 + 导出 CSV
npm run run:free -- --skip-plan --no-resume --export-csv

# 指定 persona 独立模式（每条 task 独立 persona，耗时更长）
npm run run:free -- --persona-scope task --no-resume
```

产物均落在 `--output-dir` 下，与 `batch-generate-queries.js` 的产物格式完全兼容。

## 一键流水线：`run-corpus.js`（生产推荐）

> Corpus-Direct 链路：直接用 `corpus_data.json` 中的具体 topic 作为 query 锚点。在 4 方法对比评测中**人工评审认定为最高质量方案**——topic 命中率 100%，单 task 仅 1 次 LLM 调用，速度比 persona 链路快 3×。

**工作流（与 `run:free` 并存的独立入口）：**

```
parseRequirementsFromWorkbook(xlsx)          # 解析场景（mobile: xlsx；web: JSON spec）
       ↓
buildCorpusPlan(spec, corpus, {              # 按场景配比分配 N 个 task；Layer-A 最少使用采样
  total: 500,
  complexityMix: ["medium"],
  corpusUsage: loadCorpusUsage(...)          # data/state/corpus_usage_{platform}.json
})
       ↓
buildCorpusDirectQueryPrompt(task)           # 显式锁 corpus_topic；Layer-B opener hash；Layer-C persona 注入
       ↓
claude CLI subprocess（lib/claude-cli.js）   # 走 packy CC 网关，model=claude-sonnet-4-6
       ↓                                     # —— 或 --prep-only 模式：跳过此步，写 _subagent_in/ ——
scoreQueryRecord                             # 启发式打分（--score 开启）
       ↓
data/output/corpus_run/
   ├── plan.jsonl                            # 完整计划（每 task 含 corpus_topic + corpus_l2_key）
   ├── queries.jsonl                         # 每条 query + word_count + duration（+ score 如启用）
   ├── queries.xlsx                          # 同内容 Excel（默认生成）
   ├── summary.json                          # 汇总：L1 分布 / 平均质量 / 通过率 / 耗时 / platform
   └── _subagent_in/                         # --prep-only 时：subagent 批次输入文件
       └── {platform}_b01_in.json …
```

**用法：**

```bash
# 默认：200 task，全 medium，mobile 平台
node scripts/run-corpus.js

# 生产批次：500 条 web 端
node scripts/run-corpus.js --platform web --total 500 --out data/output/corpus_run_web_500

# 自定义复杂度 mix
node scripts/run-corpus.js --total 200 --complexity-mix "vague,medium,medium"

# 验证 plan 分布（不调 LLM）
node scripts/run-corpus.js --total 500 --dry-run

# 提高并发
node scripts/run-corpus.js --total 500 --concurrency 8

# 排除 L1 场景（子串匹配，逗号分隔）
node scripts/run-corpus.js --total 200 --exclude-l1 "深度研究,购物消费"

# No-API 模式：只生成 subagent 批次文件，不调 LLM（详见下方「No-API 模式」章节）
node scripts/run-corpus.js --platform mobile --total 500 --prep-only --out data/output/corpus_run_mobile_500

# 关掉 usage 跟踪（一次性试跑、不污染历史）
node scripts/run-corpus.js --total 200 --no-usage-track
```

**参数：**

| 参数 | 默认 | 说明 |
|---|---|---|
| `--platform` | `mobile` | 平台：`mobile`（xlsx 场景 + `corpus_data.json`）或 `web`（JSON spec + `corpus_data_web.json`） |
| `--total` | `200` | 总 task 数；按场景配比缩放分配 |
| `--complexity-mix` | `"medium"` | 复杂度轮换（逗号分隔），如 `"vague,medium,medium"` |
| `--concurrency` | `2` | claude CLI 子进程并发数 |
| `--dry-run` | 关 | 不调 LLM，验证 plan 分布与脚本结构 |
| `--limit N` | 关 | 仅执行前 N 个 task（调试用） |
| `--input` | 自动 | xlsx 路径（mobile 平台；默认从 `data/input/` 自动检测） |
| `--out` | `data/output/corpus_run` | 输出目录 |
| `--exclude-l1` | 无 | L1 场景子串过滤（逗号分隔） |
| `--usage-state` | `data/state/corpus_usage_{platform}.json` | Layer-A 跨批次 topic 去重 state；不同平台自动隔离 |
| `--no-usage-track` | 关 | 关闭 Layer-A 跟踪（一次性试跑、不污染历史）|
| `--persona-map` | `scripts/corpus_persona_map[_web].json` | Layer-C L2 → persona 语义映射文件 |
| `--prep-only` | 关 | No-API 模式：只写 subagent 批次文件，不调 LLM（见下方章节） |
| `--prep-batch` | `25` | `--prep-only` 每批次 task 数 |
| `--score` | 关 | 开启启发式质量评分 |
| `--no-xlsx` | 关 | 跳过 xlsx 导出 |

**三层多样性机制（默认全部启用）：**

- **Layer-A 跨批次去重**：`data/state/corpus_usage_{platform}.json` 记录 `(l2_key, topic)` 累计使用次数；新批次优先选 least-used，与历史 batch topic 重叠 100% → 0%。当某 L2 topic 池全部耗尽时输出 `[Layer-A WARN]` 提示（此时可运行 `grow-corpus.js` 扩池）
- **Layer-B Opener hash**：`query_id` 决定性哈希到 5 桶之一（`Build a` / `Need a` / `Create a` / `Make a` / 无 formal opener），破除模型在 "Build a..." 上的收敛
- **Layer-C Persona-tone 语义映射**：`scripts/corpus_persona_map[_web].json` 按 L2 语义匹配 5 种普通用户 persona（`maker` / `planner` / `curator` / `operator` / `founder_like`），prompt 注入 voice 描述 + dev jargon 黑名单，把含 dev 术语的 query 占比从 20%（v4）压到 0.5%（v5）

**复用关系：** 共享 `scripts/lib/claude-cli.js` 与 `test-corpus-methods.js`，两脚本对 claude CLI 调用统一一处实现。

## No-API 模式：`--prep-only` + subagent + merge

> 当 Packy API 额度耗尽或需要零 token 成本生产时，使用此三步流程。

**流程：**

```
Step 1  run-corpus.js --prep-only
        → 生成 plan.jsonl + 占位 queries.jsonl（全 error=PREP_ONLY_PENDING）
        → 写 <out>/_subagent_in/{platform}_b01_in.json … _bNN_in.json（每批 25 条）
        → 持久化 Layer-A usage state（与正常模式一致）

Step 2  Claude Code subagent × N（并行）
        → 每个 subagent 读取一个 *_in.json（25 条 prompt）
        → 对每条 prompt 调用 claude -p --bare 生成 query_text
        → 输出对应的 *_out.json（[{ id, query_text }, ...]）

Step 3  node scripts/merge-subagent-retry.js --in-dir <out>/_subagent_in --target-dir <out>
        → 将 *_out.json 的 query_text 回写到 queries.jsonl
        → 重建 queries.xlsx
        → 自动更新 Layer-A usage state（从 summary.json 自动识别平台）
```

**Step 1 示例（500 条移动端）：**

```bash
node scripts/run-corpus.js \
  --platform mobile --total 500 \
  --prep-only --prep-batch 25 \
  --out data/output/corpus_run_mobile_500
# → 写出 20 个 batch（mobile_b01_in.json … mobile_b20_in.json）
# → Layer-A state 已更新
```

**Step 2 示例（在 Claude Code 内，每批开一个 subagent）：**

```
对每个 _subagent_in/mobile_b01_in.json，创建一个 subagent：
  读取 mobile_b01_in.json（JSON 数组，含 25 个 { id, prompt }）
  对每条 item 用 callClaudeCli(item.prompt) 生成 item.query_text
  写出 mobile_b01_out.json（[{ id, query_text }, ...]）
```

**Step 3 示例：**

```bash
node scripts/merge-subagent-retry.js \
  --in-dir data/output/corpus_run_mobile_500/_subagent_in \
  --target-dir data/output/corpus_run_mobile_500
# → queries.jsonl + queries.xlsx 更新
# → corpus_usage_mobile.json 自动增量更新
```

## 语料池扩展：`grow-corpus.js`

> 当某个 L2 的 topic 池全部用完（Layer-A 触发 WARN）时，运行此脚本扩充语料。

**工作原理：**

1. 扫描 `corpus_data[_web].json`，找出剩余新鲜 topic 数 < `--threshold` 的 L2
2. 对每个目标 L2，调用 Claude 生成 `--expand-by` 个新 topic 候选
3. Jaccard 相似度去重（阈值 0.4），过滤过于相似的候选
4. 追加到 `corpus_data[_web].json`（in-place）

```bash
# 查看哪些 L2 需要扩充（不写文件）
node scripts/grow-corpus.js --platform mobile --dry-run

# 扩充移动端所有耗尽 L2（每个 +20 topic）
node scripts/grow-corpus.js --platform mobile

# 指定单个 L2
node scripts/grow-corpus.js --platform mobile --only "① 个人生活类" --expand-by 30

# web 端
node scripts/grow-corpus.js --platform web
```

**参数：**

| 参数 | 默认 | 说明 |
|---|---|---|
| `--platform` | `mobile` | 目标语料文件（`mobile` = `corpus_data.json`；`web` = `corpus_data_web.json`） |
| `--threshold` | `10` | 剩余新鲜 topic < N 时触发扩充；`0` = 仅扩充完全耗尽的 L2 |
| `--expand-by` | `20` | 每个 L2 目标新增 topic 数 |
| `--only` | 无 | 只扩充指定 L2 key（精确匹配） |
| `--dry-run` | 关 | 只打印计划，不调 Claude，不写文件 |
| `--no-usage-track` | 关 | 忽略 usage state，仅按 pool 大小判断 |

> **注意**：需要 Claude API 额度（通过 `lib/claude-cli.js` 调用）。Packy 额度耗尽时用 `--dry-run` 确认目标 L2，补充额度后再运行。

## 历史 batch 补充：`merge-subagent-retry.js`

> 将 subagent 生成的 `*_out.json` 结果合并回已有 `queries.jsonl`，替换 error 行。

**用途：**

- No-API 流程的 Step 3（见上方）
- 手动补全某次生产跑的失败条目

```bash
# No-API 模式（单 run dir）
node scripts/merge-subagent-retry.js \
  --in-dir data/output/corpus_run_mobile_500/_subagent_in \
  --target-dir data/output/corpus_run_mobile_500

# 跳过 usage state 更新（试跑）
node scripts/merge-subagent-retry.js \
  --in-dir <in> --target-dir <target> --no-usage-track
```

| 参数 | 说明 |
|---|---|
| `--in-dir` | subagent 输出目录（含 `*_out.json`）；默认 `data/output/_retry_subagent` |
| `--target-dir` | 目标 run 目录（含 `queries.jsonl`）；默认查找 v7 批次目录 |
| `--usage-state` | 显式指定 usage state 路径；不传则从 `summary.json` 自动识别 `platform` |
| `--no-usage-track` | 跳过 Layer-A usage state 更新 |

## 自由生成 plan：`build-free200-plan.js`

> 为 `run:free` 提供输入 plan，也可单独调用。

构建 200 条任务计划，分两部分：
- **Part A**（100 条）：25 个已有场景，使用 expand200 未覆盖的 product_type 组合
- **Part B**（100 条）：20 个全新 L2 场景（fintech / dev-tools / creator economy / 身心健康 / 市政服务 / 可持续生活 / 宠物生活 / 职业成长）

复杂度：vague:medium = 1:2（无 complex），`design_style` 全部 `null`（LLM 自由发挥）。

**persona-scope（关键设计决策）：**

| 模式 | `persona_seed` | 行为 | 适用场景 |
|---|---|---|---|
| `scene`（默认） | `hash(sceneId)` | 同场景所有 task 共享一个 persona | 节省 LLM 调用、场景内一致性好 |
| `task` | `hash(sceneId + seq)` | 每条 task 独立生成 persona | 数据多样性最大，耗时耗钱 |

⚠️ 不要把 `globalSeq` / `query_id` 等 task 级变量混入 `scene` 模式的 seed hash，否则退化为 task 模式（历史已踩坑）。

```bash
node scripts/build-free200-plan.js [--dry-run]
node scripts/build-free200-plan.js --persona-scope task   # 每条独立
```

输出：`data/intermediate/generation_plan.free200.jsonl`

## 核心入口：`batch:generate`

> 等价于 `node scripts/batch-generate-queries.js`

**两种输入二选一：**

| 入参 | 说明 |
|---|---|
| `--input <xlsx>` | 需求表（如 `data/input/场景覆盖.xlsx`），将走 `parseRequirementsFromWorkbook + buildSeedPlan` |
| `--plan <jsonl>` | 已构建好的 generation plan（`data/intermediate/generation_plan.v2.jsonl` 等） |

**主要参数（CLI flag 优先，未传则取等价 env）：**

| flag | env | 默认 | 说明 |
|---|---|---|---|
| `--output-dir` | — | `data/output/runs/run_<ts>` | 所有产物的目录（必传或自动按时间戳命名） |
| `--sample-n` | `SAMPLE_N` | `0` | 从 xlsx 随机抽几个二级场景；`0` 表示全部 |
| `--seed` | `SAMPLE_SEED` | 随机 | 抽样种子，便于复现 |
| `--target-count-per-scene` | — | `1` | 每个抽样场景分配多少条任务（每条仍展开 3 复杂度） |
| `--transport` | `LLM_TRANSPORT` | `claude-cli` | `claude-cli` / `anthropic` / `openai` |
| `--model` | `ANTHROPIC_MODEL` / `PACKY_MODEL` | `claude-sonnet-4-6` | 模型 id |
| `--concurrency` | `LLM_CONCURRENCY` | `3` | 并发任务数 |
| `--max-retries` | `LLM_MAX_RETRIES` | `2` | 503 / 超时退避重试次数 |
| `--per-call-timeout` | `PER_CALL_TIMEOUT_MS` | `180000` | 单次 LLM 调用超时（ms） |
| `--no-resume` | — | resume 默认开 | 关掉断点续跑（重新覆盖 jsonl） |
| `--generator-tag` | — | `claude-code-cli-subprocess` | 落盘记录里 `generator_mode` 标签 |

**Transport 选择指南：**

- **`claude-cli`** — 本机 Claude Code CLI 子进程（`claude -p --bare …`）。**唯一能跑通 packy-cc 网关**的方式，因为该网关会指纹识别非官方 CLI。
  需要先 `npm i -g @anthropic-ai/claude-code` 并在 `.env.local` 配好 `ANTHROPIC_BASE_URL` / `PACKY_API_KEY`。
- **`anthropic`** — HTTP 直连 `/v1/messages`。普通 Anthropic key 或开放型网关用这个。
- **`openai`** — HTTP 直连 `/v1/chat/completions`。OpenAI 兼容网关（如 packy 普通分组、LiteLLM）用这个。

### 标准化产物（`--output-dir/` 下）

| 文件 | 作用 |
|---|---|
| `plan.json` | 本批 plan 完整快照（带场景 spec），用于审计与 fill 入口 |
| `raw_queries.jsonl` | ✅ 主产物：每行一条 query 记录，schema 与既有 `data/output/raw_queries.v2.jsonl` 兼容 |
| `errors.json` | 失败任务清单（error/stderr/at），可作为下一轮 fill 输入 |
| `stats.json` | 自动统计：按 complexity 的 avg/min/max words、persona 解析成功率、整体耗时 |
| `config.json` | 入参/transport/时间留痕（API key 自动脱敏为前 6 位 + `…`） |

### 例子

```bash
# 1) 抽样冒烟（5 个场景 × 3 复杂度 = 15 任务）
npm run batch:generate -- \
  --input data/input/场景覆盖.xlsx \
  --output-dir data/output/runs/sample5_$(date +%Y%m%d_%H%M%S) \
  --sample-n 5 --seed 4073

# 2) 全量跑 + 断点续跑（中途挂掉直接重跑同一目录即可）
npm run batch:generate -- \
  --plan data/intermediate/generation_plan.v2.jsonl \
  --output-dir data/output/runs/full_v2 \
  --concurrency 4

# 3) 跑完发现还差几条 → 同目录重跑（resume 自动跳过已完成）
npm run batch:generate -- \
  --plan data/intermediate/generation_plan.v2.jsonl \
  --output-dir data/output/runs/full_v2

# 4) 切换 OpenAI 兼容网关
LLM_TRANSPORT=openai \
PACKY_BASE_URL=https://your-gateway/v1 \
PACKY_API_KEY=xxx \
npm run batch:generate -- \
  --input data/input/场景覆盖.xlsx --sample-n 10 \
  --output-dir data/output/runs/openai_sample10 \
  --model claude-3-5-sonnet-20240620
```

### 退出码

- `0` — 全部任务成功
- `1` — 至少一条失败（jsonl 仍是有效产物，可重跑同目录靠 resume 补齐）
- `2` — 入参错误（找不到文件等）

## 对比报告：`build:comparison`

> 等价于 `node scripts/build-query-comparison.js`

把任意多个 run 的 `raw_queries.jsonl` 合成一份并排对比 HTML。

### 用法 A：按目录推断（最简单）

```bash
npm run build:comparison -- \
  --run-dir data/output/sample5 \
  --run-dir data/output/sample5_cli \
  --run-dir data/output/sample5_cli_fewshot \
  --output data/output/query_comparison.html \
  --title "Query 生成对比"
```

每个目录默认找 `raw_queries.jsonl`；找不到则用目录里第一个 `.jsonl`。label 默认是目录名。

### 用法 B：精确指定每组（label / path / color / sub）

```bash
npm run build:comparison -- \
  --runs \
    "label=① 模板|path=data/output/sample5/raw_queries.sample5.jsonl|color=#9aa4b2|sub=persona-fallback（不调 LLM）" \
    "label=② LLM|path=data/output/sample5_cli/raw_queries.sample5.cli.jsonl|color=#3b82f6|sub=persona-llm baseline" \
    "label=③ LLM+few-shot|path=data/output/sample5_cli_fewshot/raw_queries.sample5.cli.jsonl|color=#10b981|sub=加 few-shot 示例" \
  --output data/output/query_comparison.html
```

HTML 包含：

- 顶部量化表（complexity 维度 avg/min-max/n + 首句指纹唯一率 + persona 解析率）
- 自动评估表（跨复杂度梯度 + 区分度评分 → 自动标出最优组）
- 逐条对比卡片（按任务最多的那一组顺序对齐，缺失列灰显「missing」），顶部有 vague/medium/complex 筛选

## 连通性自检：`test:api`

> 等价于 `node scripts/test-api-connectivity.js`

只做一次 ping，分别测 Anthropic Messages 与 OpenAI 兼容 Chat 两条路是否能拿到响应；用于快速判断 key / base_url / 网关分组的状态。

## Schema：`raw_queries.jsonl` 一条记录

```jsonc
{
  "id": "q_scene_025_001",            // 来自 plan 的 query_id
  "scene_id": "scene_025",
  "l1_scene": "教育学习",
  "l2_scene_label": "备考自测/刷题 ★",
  "l2_scene_examples": [],
  "application_type": "刷题练习应用",
  "product_type": "portfolio",
  "target_complexity": "vague",       // vague | medium | complex
  "design_style": null,               // 默认 null（LLM 自由发挥）；--design-styles 时有值
  "created_at": "2026-05-07T13:54:00.000Z",
  "generator_mode": "claude-code-cli-subprocess",
  "llm_model": "claude-sonnet-4-6",
  "persona_id": "p_xxx",
  "persona_title": "...",
  "persona_source": "llm_persona_synthesis",  // 或 _parse_failed / deterministic_persona_fallback
  "persona_spec": { /* 完整 persona JSON */ },
  "persona_prompt_text": "...",        // 留底，便于复盘
  "query_prompt_text": "...",
  "query_text": "...",                 // ✅ 最终 query
  "timings_ms": { "persona_ms": 3210, "query_ms": 8120, "total_ms": 11330 }
}
```

字段集与既有 `data/output/raw_queries.v2.jsonl` 兼容，可直接喂给 `score:queries` / `import:queries` 后续步骤。

## 发散拓展：`build-expand200-plan.js`

从已有场景基础上，构建 200 条结构化拓展任务（三部分）：

| Part | 范围 | 条数 | 说明 |
|------|------|------|------|
| A | scene_063–103（41 extra 场景第 2 轮） | 82 | 换用不同 product_type + 复杂度，seq 004/005 |
| B | scene_039–058（20 个低覆盖原始场景） | 60 | seq 010/011/012，不与已有 001-009 冲突 |
| C | scene_104–122（19 个全新领域场景） | 58 | fintech / healthcare / dev-tools / creative / IoT / pet 等 |

```bash
# 默认：design_style = null（LLM 自由发挥）
node scripts/build-expand200-plan.js [--dry-run]

# 指定风格列表（循环分配）
node scripts/build-expand200-plan.js --design-styles "Dark,Glassmorphism,Cyberpunk"

# 启发式按场景关键词推断风格
node scripts/build-expand200-plan.js --design-styles auto
```

输出：`data/intermediate/generation_plan.expand200.jsonl`

之后用 `batch-generate-queries.js` 跑生成：
```bash
node scripts/batch-generate-queries.js \
  --plan data/intermediate/generation_plan.expand200.jsonl \
  --output-dir data/output/runs/expand200_llm \
  --concurrency 3
```

## 质量分析报告：`generate-analysis-report.js`

**可复用 skill**：读取任意 `scored_queries.jsonl`，输出自包含单文件 HTML 报告。

```bash
node scripts/generate-analysis-report.js \
  --input  data/output/runs/<batch>/scored_queries.jsonl \
  --output data/output/runs/<batch>/analysis_report.html \
  [--title "批次名"] \
  [--meta  "N 条 · 模型信息"]
```

报告包含：

| 模块 | 内容 |
|------|------|
| KPI 卡片 | 总条数 / 通过 / 失败 / 平均分 / 通过率 / fallback 数 |
| 评分方式与细则 | 公式、三维度 per-complexity 规则、complexity 推断表 |
| 质量分直方图 | 分档颜色（红 < 2.8 / 橙 2.8–4.0 / 绿 ≥ 4.0）|
| 复杂度堆叠图 | vague / medium / complex 通过/失败对比 |
| 词数分布图 | 按词数区间统计通过/失败 |
| Design Style 网格 | 每种风格通过率热图 |
| L1 场景横向条 | 各 L1 通过数量对比 |
| **全量 Query 浏览器** | 多轴筛选（复杂度 / 风格 / 场景 / 通过状态 / 关键词搜索）+ 排序 + 分页 + 点击展开（展开后显示 **persona 卡片**：描述 / 目标 / 表达风格 / 熟悉度 + 完整 query 文本） |
| 诊断 / 建议 | 自动根据失败率生成（全通过时显示 ✓）|

无外部运行时依赖（Chart.js 走 CDN；所有数据内嵌为 JSON）。

## CSV 导出：`export-queries-csv.js`

从 `raw_queries.jsonl` 或 `scored_queries.jsonl` 导出两列 CSV（`id` / `prompt`），每条 query 前自动拼接前缀指令。

```bash
# 默认（读 free200_llm/raw_queries.jsonl）
node scripts/export-queries-csv.js

# 指定任意批次
node scripts/export-queries-csv.js \
  --input  data/output/runs/<batch>/raw_queries.jsonl \
  [--output <file.csv>] \
  [--prefix "Build a React component for:"]
```

输出格式（RFC 4180，双引号包裹，内部双引号转义）：

```csv
"id","prompt"
"q_scene_fa_01_001","Generate a plain HTML optimized for mobile devices. just want something where I can repeat after it…"
```

## 设计原则

1. **断点续跑优先** — 默认 resume，每条完成立即 append 到 `raw_queries.jsonl`，崩了重跑同目录即可
2. **失败可定位** — `errors.json` 留下 stderr，`config.json` 留下入参与 transport
3. **transport 可换** — 三种 transport 都实现 `(prompt, opts) => Promise<string>` 同一签名，便于以后接其它网关
4. **零外部依赖** — 复用项目已有的 `xlsx` / `undici`-fetch，不引入 OpenAI / Anthropic SDK
5. **可观测** — 每条任务实时打印 persona/query 各自耗时与 persona JSON 解析状态
6. **prompt 与代码分离** — 改 prompt 优先改 `mvp/query_factory_v2.js` 中的 `buildPersonaSynthesisPrompt` / `buildQueryPromptFromPersona`，并在 `prompts/*.md` 留同步副本，scripts 层不持有 prompt
7. **一切通用工具下沉** — `mvp/query_factory_v2.js` 已导出 `parseArgs / readJsonl / writeJsonl / ensureDir / loadLocalEnv / escapeHtml / COMPLEXITY_LEVELS / resolveDesignStyle / registerDesignStyle / DESIGN_STYLES / STYLE_HINTS`，scripts 与 lib 直接 require 复用，不重复造轮子
8. **design_style 默认不注入** — plan 任务的 `design_style` 默认为 `null`，让 LLM 根据场景上下文自然发挥；只在明确有 UI 风格诉求时通过 `--design-styles` 或 `registerDesignStyle()` 显式控制

## 历史脚本归档

为避免新人误用旧路径，下列一次性脚本已迁移到 [scripts/legacy/](./legacy/)：

| 旧脚本 | 新方案 |
|---|---|
| `test-sample5.js` / `test-sample5-cli.js` | `npm run batch:generate` + `--sample-n 5 --transport claude-cli` |
| `fill-missing.js` | 重跑同一 `--output-dir`（resume 默认开） |
| `build-comparison-html.js` | `npm run build:comparison` （支持任意 run 数） |
