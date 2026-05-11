# UI QueryMaker Pipeline

> Build realistic, diverse, and structured front-end UI requirement queries from scenario specifications.

一个面向前端 UI 需求数据集构建的生成流水线。
它将需求表格解析为场景，自动生成 `persona-driven query`，完成评分、入库与可视化，形成一条可离线跑通的 MVP 数据生产链路。

## Why This Project

当前很多 UI 生成或代码生成相关数据，往往有三个问题：

- 只有“页面长什么样”，没有“用户为什么会提这个需求”
- 只有功能描述，缺少产品语境、角色差异与表达风格
- 只有样例，没有一条可以稳定复跑、统计分析、持续扩展的数据生产流水线

这个项目的目标不是再造一个 prompt 集合，而是把这件事做成一个 **可解析、可生成、可评分、可入库、可分析** 的系统。

当前已落地的 v2 主链路：

```text
xlsx requirements -> scenario spec -> generation plan -> persona/query generation -> scoring -> SQLite -> dashboard
```

## Pain Points In Query / Instruction Synthesis

在 UI query / instruction 合成这件事上，常见痛点不是“模型不会写句子”，而是生成结果很难长期稳定地作为数据资产使用。

典型问题有：

- `模板味太重`
直接把场景字段拼成一句话，容易得到表面多样、实际同质的 instruction
- `只有功能，没有人`
很多 query 只有模块和功能，没有真实用户动机、表达方式和信息缺失模式
- `场景原文污染输出`
像 `① 个人生活类（旅行回忆、年度相册、画作展示、宝宝成长）` 这样的原始需求文本，如果直接带进 query，会让数据既生硬又泄漏标注痕迹
- `复杂度不可控`
生成前没有显式控制，生成后也无法判断到底是 vague、medium 还是 complex
- `只能生成，不能运营`
没有 plan、数据库、统计和可视化时，数据很难补齐、复跑、对比和持续迭代

我们的解决方案是把 query 合成从“单步 prompt 生成”改造成“结构化数据生产链路”，靠 前置规划 + 显式维度建模 + 生成后可观测回判，控制“分布多样性”和“低重复性”：

- `场景先清洗，再进入生成`
先把 `l2_scene_raw` 拆成 `l2_scene_label`、`l2_scene_examples` 和 `application_type_candidates`，避免把原始 Excel 文本直接污染最终 instruction
- `显式引入 L3 application_type`
让 query 不是围着抽象场景说空话，而是围绕更具体的 app/product direction 生成
- `persona-driven synthesis`
不再直接从字段拼 query，而是先合成 persona，再由 persona 生成 instruction，把“谁在提需求、为什么这样提”显式建模出来
- `target_complexity 前置控制`
在 plan 阶段就指定 `vague / medium / complex`，而不是等生成完再事后猜测
- `生成后再做回判`
保留 `complexity_level` 和 `quality_score`，用于判断“计划中的复杂度”是否真的落到了输出上
- `把生成变成可运营系统`
中间产物全部落盘，最终入 SQLite 并进入 dashboard，这样 query 数据不只是一次性样例，而是可以复跑、补齐、分析和持续优化的数据集

## Highlights

- `End-to-end pipeline`
从 Excel 输入一路到 SQLite 和静态 Dashboard，完整闭环
- `Persona-driven generation`
不直接拼模板字段，而是先构造 persona，再生成 query
- `Deterministic fallback`
即使不接外部 LLM，当前版本也可以离线稳定产出结果
- `Structured artifacts`
中间结果全部显式落盘，便于排查、复用和二次分析
- `MVP + research blueprint`
一边有当前可运行实现，一边保留完整研究版方法论与提示词资产

## Quick Start

### 1. 安装依赖

```bash
npm install
```

### 2. 准备输入

将需求 Excel 放到仓库根目录，或在运行时通过 `--input` 指定。

### 3. 一键跑通主链路

```bash
npm run run:mvp
```

### 4. 查看结果

- 结构化场景：`data/intermediate/scenario_spec.v2.json`
- 生成计划：`data/intermediate/generation_plan.v2.jsonl`
- 原始 query：`data/output/raw_queries.v2.jsonl`
- 评分结果：`data/output/scored_queries.v2.jsonl`
- 数据库：`data/db/queries_v2.sqlite`
- 可视化报表：`data/reports_v2/dashboard.html`

### 5. 运行验证

```bash
npm test
```

### 6. 使用真实 LLM 生成

当前仓库除离线 `persona-fallback` 外，也支持通过 OpenAI 兼容接口和 Anthropic / Claude Code 风格接口接入真实模型。

推荐使用 `.env.local` 配置：

```bash
PACKY_API_KEY=your_api_key_here
PACKY_BASE_URL=https://www.packyapi.com/v1
PACKY_MODEL=claude-3-5-sonnet-20240620
ANTHROPIC_AUTH_TOKEN=your_cc_group_token_here
ANTHROPIC_BASE_URL=https://www.packyapi.com
ANTHROPIC_MODEL=claude-sonnet-4-6
PACKY_CONCURRENCY=3
PACKY_TIMEOUT_MS=120000
PACKY_MAX_RETRIES=2
PACKY_USE_SYSTEM_PROXY=1
PACKY_ALLOW_INSECURE_TLS=0
```

然后可直接运行：

```bash
npm run generate:queries -- --mode llm-openai
```

如果你使用的是 `CC` 分组令牌，可改走 Anthropic / Claude Code 风格接口：

```bash
npm run generate:queries -- --mode llm-anthropic
```

或一键跑完整链路：

```bash
npm run run:mvp -- --mode llm-openai
```

```bash
npm run run:mvp -- --mode llm-anthropic
```

说明：

- `llm-openai` / `real-llm` / `packy-openai` 都会走真实模型调用
- `llm-anthropic` / `claude-code` / `anthropic-cc` / `packy-cc` 会走 Anthropic / Claude Code 风格的 `/v1/messages`
- 真实调用会先生成 persona，再基于 persona 生成 query
- `PACKY_BASE_URL` 为 OpenAI 兼容的 Chat Completions 基地址，通常以 `/v1` 结尾；接入自建或 LiteLLM 网关时设置为你提供的 POST 根路径即可；`PACKY_MODEL` 必须与该网关 `GET /v1/models` 返回的 `id` 一致（例如 `gemini-3.1-pro-preview`）
- 单条联调可运行：`npm run preview:persona -- --mode llm-openai --index 0`
- 若未配置 API Key，会自动报错并提示需要设置 `PACKY_API_KEY` 或 `OPENAI_API_KEY`
- 若使用 `CC` 分组，优先设置 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`
- Windows 下默认会尝试读取系统代理设置，并将其映射到 `HTTP_PROXY / HTTPS_PROXY`；内网直连网关时可在 `.env.local` 中设置 `PACKY_USE_SYSTEM_PROXY=0`
- 若公司代理做了 HTTPS 中间证书注入，Node 可能报 `SELF_SIGNED_CERT_IN_CHAIN`
- 这时优先建议给 Node 配置可信 CA；临时验证时也可将 `PACKY_ALLOW_INSECURE_TLS=1`

**依赖说明：** LLM 调用使用项目已有的 `undici`（Node 内建环境变量加载见 `mvp/query_factory_v2.js`），接入真实模型时 **无需** 额外安装 OpenAI 官方 SDK；`npm install` 一次即可，除非升级 Node 大版本，一般不必为「换模型 / 换网关」更新 `package.json` 依赖。

### 7. LLM 自由生成流水线（推荐入口）

`run:free` 是当前推荐的 LLM 批量生成一键入口，内部按顺序编排四步：构建计划 → LLM 生成 → 质量评分 → 可视化报告，任一步骤失败立即退出并标明位置。

```bash
# 最简启动（全部默认）
npm run run:free

# 全量重跑到新目录
npm run run:free -- --output-dir data/output/runs/free200_v2 --no-resume

# 同时导出带前缀的 CSV
npm run run:free -- --no-resume --export-csv

# 完整参数
npm run run:free -- \
  --output-dir    data/output/runs/free200_v2 \
  --persona-scope scene \
  --concurrency   3 \
  --no-resume \
  --title         "free200 v2 · 2026-05" \
  --export-csv \
  --csv-prefix    "Generate a plain HTML optimized for mobile devices."
```

**主要参数：**

| 参数 | 默认 | 说明 |
|---|---|---|
| `--output-dir` | `data/output/runs/free200_llm` | 所有产物目录 |
| `--persona-scope` | `scene` | `scene`=同场景共享 persona；`task`=每条独立 |
| `--concurrency` | `3` | LLM 并发数 |
| `--no-resume` | 断点续跑 | 传此参数则全量重跑 |
| `--skip-plan` | — | 跳过计划构建，沿用已有 plan |
| `--export-csv` | 关 | 开启后额外导出带前缀的 CSV |
| `--csv-prefix` | `Generate a plain HTML optimized for mobile devices.` | CSV 每条 query 前缀 |

单步调用方式见 [scripts/README.md](./scripts/README.md)。

## Pipeline Overview

```mermaid
flowchart TD
    A["Excel requirements"] --> B["Parse requirements"]
    B --> C["Scenario spec"]
    C --> D["Seed / backfill planning"]
    D --> E["Generation plan"]
    E --> F["Persona synthesis"]
    F --> G["Query generation"]
    G --> H["Heuristic scoring"]
    H --> I["SQLite import"]
    I --> J["Dashboard + summary"]
```



## Architecture

当前代码结构非常明确，核心逻辑集中，CLI 只是薄封装。

```mermaid
flowchart LR
    A["scripts/*.js\nCLI entrypoints"] --> B["mvp/query_factory.js"]
    B --> C["mvp/query_factory_v2.js\ncore pipeline"]
    C --> D["data/intermediate/*"]
    C --> E["data/output/*"]
    C --> F["data/db/queries_v2.sqlite"]
    C --> G["data/reports_v2/*"]
    C -. prompt assets .-> H["prompts/*.md"]
    T["tests/query-factory-smoke.test.js"] --> B
```



### Core Design

- `scripts/`
阶段化 CLI 入口，负责参数解析、路径约定和文件落盘
- `mvp/`
当前可运行实现，所有核心逻辑都在这里
- `prompts/`
prompt 资产层，既包含当前 persona 链路提示词，也包含研究版多阶段方案
- `data/`
中间文件、输出文件、数据库和可视化报表
- `tests/`
冒烟测试，确保主链路可跑通
- `ARCHIVE/`
方法论与研究设计背景，不等于当前所有代码都已实现

## Data Flow

### Runtime Data Flow

```mermaid
flowchart TD
    A["root *.xlsx"] --> B["parseRequirementsFromWorkbook()"]
    B --> C["scenario_spec.v2.json"]
    C --> D["buildSeedPlan() / buildBackfillPlan()"]
    D --> E["generation_plan.v2.jsonl / backfill_plan.v2.jsonl"]
    E --> F["generateQueryRecords()"]
    F --> G["raw_queries.v2.jsonl"]
    G --> H["scoreQueryRecords()"]
    H --> I["scored_queries.v2.jsonl"]
    C --> J["importIntoDatabase()"]
    I --> J
    J --> K["queries_v2.sqlite"]
    K --> L["buildDashboardAssets()"]
    L --> M["dashboard.html"]
    L --> N["summary.json"]
```



### Record Lifecycle

```mermaid
flowchart LR
    A["Excel row"] --> B["scene"]
    B --> C["plan task"]
    C --> D["persona"]
    D --> E["query_text"]
    E --> F["quality_score + complexity_level"]
    F --> G["SQLite row"]
    G --> H["dashboard analytics"]
```



## Project Layout

```text
.
├── README.md
├── MVP_QUERY_FACTORY.md
├── package.json
├── mvp/
│   ├── query_factory.js
│   └── query_factory_v2.js             # 核心：pipeline / 评分 / design_style 系统
├── scripts/
│   ├── README.md                       # 脚本层使用说明（参数、示例、设计原则）
│   ├── lib/
│   │   └── llm-batch.js                # 共享：transports / 重试 / persona-query pipeline / 并发池
│   ├── run-free.js                     # ★ LLM 自由生成一键流水线（推荐入口）
│   ├── batch-generate-queries.js       # LLM 批量生成（run-free 内部调用，也可单独使用）
│   ├── build-free200-plan.js           # ★ 自由生成计划构建（200 条，persona-scope 控制）
│   ├── build-expand200-plan.js         # 发散性拓展 plan（200 条，3 part 结构）
│   ├── generate-analysis-report.js     # ★ 批次质量分析报告（含 persona 卡片）
│   ├── score-queries.js                # 质量评分
│   ├── export-queries-csv.js           # ★ 导出带前缀的 query CSV
│   ├── build-query-comparison.js       # 多 run 横向对比 HTML
│   ├── generate-extra-scenes.js        # 基于 L1 扩展新 L2 场景（41 个）
│   ├── test-api-connectivity.js        # API 网关探活
│   ├── parse-requirements.js
│   ├── build-generation-plan.js
│   ├── build-backfill-plan.js
│   ├── generate-queries.js
│   ├── supplement-anchored-persona-queries.js
│   ├── import-queries.js
│   ├── build-dashboard.js
│   ├── preview-persona-flow.js
│   ├── run-mvp.js                      # 旧版一键流水线（persona-fallback，无 LLM）
│   └── legacy/                         # 已归档的一次性脚本
├── prompts/
│   ├── persona_synthesis_prompt.md
│   ├── query_from_persona_prompt.md
│   ├── p1_industry_generation.md
│   ├── p2_product_derivation.md
│   ├── p3_social_extraction.md
│   ├── p4_persona_query_gen.md
│   └── p5_quality_scoring.md
├── tests/
│   └── query-factory-smoke.test.js
├── data/
│   ├── intermediate/
│   │   ├── generation_plan.v2.jsonl
│   │   ├── generation_plan.expand200.jsonl
│   │   ├── generation_plan.extra.jsonl
│   │   └── generation_plan.free200.jsonl    # ★ 自由生成计划（build-free200-plan.js 产出）
│   ├── output/
│   │   └── runs/
│   │       ├── expand200_llm/               # expand200 批次产物
│   │       └── free200_llm/                 # ★ 自由生成批次产物
│   │           ├── raw_queries.jsonl
│   │           ├── scored_queries.jsonl
│   │           ├── analysis_report.html
│   │           └── export_prompts.csv
│   ├── db/
│   └── reports_v2/
└── ARCHIVE/
    └── README.md
```

## CLI Commands


| Command                      | Purpose                      |
| ---------------------------- | ---------------------------- |
| `npm run parse:requirements` | 解析 Excel，输出标准化场景定义           |
| `npm run plan:seed`          | 生成首轮 seed plan               |
| `npm run plan:backfill`      | 对覆盖不足的场景生成补齐计划               |
| `npm run generate:queries`   | 根据 plan 生成 query             |
| `npm run preview:persona`    | 预览单条任务的 persona 与 query 生成过程 |
| `npm run score:queries`      | 对 query 做启发式评分               |
| `npm run import:queries`     | 将场景与 query 导入 SQLite         |
| `npm run build:dashboard`    | 从数据库生成静态报表                   |
| `npm run run:mvp`            | 一键跑通完整 v2 MVP 流程（旧版，persona-fallback，无 LLM） |
| `npm run run:free`           | ★ LLM 自由生成一键流水线（plan → generate → score → report） |
| `npm run batch:generate`     | LLM 批量生成单步入口（支持 xlsx 抽样 / plan 输入 / 断点续跑） |
| `npm run build:comparison`   | 把任意多个 batch run 拼成并排 HTML 对比报告 |
| `npm run test:api`           | 探活：分别测 Anthropic 与 OpenAI 兼容端点 |
| `npm test`                   | 运行冒烟测试                       |

**扩展脚本（直接调用）：**

```bash
# ★ 构建自由生成 plan（200 条，persona-scope 默认 scene）
node scripts/build-free200-plan.js [--dry-run] [--persona-scope scene|task]

# 构建发散拓展 plan（三部分结构，200 条）
node scripts/build-expand200-plan.js [--dry-run] [--design-styles "Dark,Glassmorphism"]

# 从任意 scored_queries.jsonl 生成可交互 HTML 分析报告（含 persona 卡片）
node scripts/generate-analysis-report.js \
  --input  data/output/runs/<batch>/scored_queries.jsonl \
  --output data/output/runs/<batch>/analysis_report.html \
  [--title "批次名"] [--meta "N 条 · 模型信息"]

# 导出带前缀的 query CSV
node scripts/export-queries-csv.js \
  --input  data/output/runs/<batch>/raw_queries.jsonl \
  [--output <file.csv>] \
  [--prefix "Generate a plain HTML optimized for mobile devices."]
```


## Key Artifacts


| Path                                         | Description       |
| -------------------------------------------- | ----------------- |
| `data/intermediate/scenario_spec.v2.json`    | 清洗后的场景规范          |
| `data/intermediate/generation_plan.v2.jsonl` | 首轮生成任务列表          |
| `data/intermediate/backfill_plan.v2.jsonl`   | 覆盖补齐任务列表          |
| `data/output/raw_queries.v2.jsonl`           | 生成后的原始 query      |
| `data/output/scored_queries.v2.jsonl`        | 带质量分和复杂度标签的 query |
| `data/db/queries_v2.sqlite`                  | 最终分析数据库           |
| `data/reports_v2/dashboard.html`             | 静态可视化面板           |
| `data/reports_v2/summary.json`               | 聚合统计摘要            |


## How Generation Works

当前默认模式为 `persona-fallback`。
它不是直接把字段机械拼接成句子，而是分两步生成：

1. 先根据 `scene + application_type + design_style` 合成 persona（`product_type` 在默认开放路径下仅作元数据，不注入 prompt）
2. 再由 persona 生成符合语气和复杂度目标的前端 UI query

可选生成模式：

- `persona-fallback`
  默认模式。直接在本地生成 persona 和 query，适合跑通当前主链路。
- `llm-openai`
  通过 OpenAI 兼容接口调用真实模型，适合接入 `PackyAPI` 等统一网关。
- `prompt-packets`
  只输出 prompt 包，不直接生成最终 query，适合后续接入 Cursor 或外部 LLM。
- `template-fallback`
  使用更简单的模板化 query 兜底，适合做基础对照或最小可运行验证。

当前实现特点：

- 支持 `vague / medium / complex` 三档目标复杂度
- 支持 `application_type`、`product_type`、`design_style` 的组合约束
- 使用稳定的 `persona_seed` 保证结果可复现
- 通过启发式规则回判 `complexity_level` 和 `quality_score`

这条链路已经可以离线跑通，也支持通过 `--transport claude-cli / openai / anthropic` 接入真实 LLM 批量生成。

## Design Style 系统

### 默认行为：`null`（LLM 自由发挥）

`buildSeedPlan()` / `buildBackfillPlan()` / `build-expand200-plan.js` 生成的所有 plan task，`design_style` 字段默认为 `null`。

prompt 注入：
- `design_style = null` → `"No fixed visual style is required — let the visual direction emerge naturally."`
- `design_style = "Dark"` → `"Use a dark theme with strong contrast on key information."`

### 三种 opt-in 方式

| 方式 | 行为 |
|------|------|
| 不传（默认） | `design_style: null`，LLM 按场景上下文自然推断 |
| `--design-styles "Dark,Glassmorphism,Cyberpunk"` | 在指定列表中循环分配 |
| `--design-styles auto` | 按场景 L1/L2/app 关键词启发式推断（旧行为） |

```bash
# 不指定风格（推荐默认）
node scripts/build-expand200-plan.js

# 指定固定风格列表（循环分配）
node scripts/build-expand200-plan.js --design-styles "Dark,Glassmorphism,Cyberpunk"

# 按场景启发式推断
node scripts/build-expand200-plan.js --design-styles auto
```

### 当前注册的设计风格

| 名称 | 风格定义 |
|------|------|
| `Dark` | 深色主题，重点信息高对比突出 |
| `Glassmorphism` | 玻璃拟态，卡片半透明 + 背景模糊 |
| `Neumorphism` | 软质拟态，元素从背景浮起 |
| `Neubrutalism` | 新粗野，边框阴影对比感强 |
| `Minimalism` | 极简，留白充足，层级清晰 |
| `Material` | Material 风格，交互反馈明确 |
| `Data-Dense` | 信息密度高，适合快速扫读 |
| `Cyberpunk` | 霓虹赛博感，视觉冲击强 |
| `Luxury` | 高质感杂志专题，排版精致 |
| `Vibrant` | 活泼，颜色饱和度高 |

### 扩展新风格

在任意调用方代码中：

```js
const { registerDesignStyle } = require('./mvp/query_factory_v2');

registerDesignStyle(
  'Y2K',                                                    // plan 字段值
  '千禧复古风格，金属光泽渐变、霓虹色调、科技感配合怀旧元素',      // 中文 persona 提示
  'Use a Y2K-inspired aesthetic with metallic gradients and neon accents.'  // 英文 query 指令
);
```

注册后立即生效，同步更新 `DESIGN_STYLES` 列表、中文 prompt hint（`STYLE_HINTS`）和英文 prompt 指令（`_EN_STYLE_INSTRUCTIONS`）。

### 评分器与 design_style

评分器 `scoreQueryRecord()` 对 `design_style` 的处理：
- `design_style` 字段有值 → Diversity 维度 **+1**
- 不影响 Authenticity / Specificity 两个维度的评分

因此：`design_style = null` 的 query 在 Diversity 维度最多得 4 分（而非 5 分）。如果 Diversity 基准分不够，可考虑通过 `--design-styles` 注入或场景本身 `application_type` 的具体程度来补偿。

## Documentation Map

这是整个仓库最重要的一节。
如果不先理解文档关系，很容易把“当前实现”和“研究蓝图”混在一起。

### A. 当前可运行实现


| File                      | What it means                  |
| ------------------------- | ------------------------------ |
| `README.md`               | 仓库首页，帮助理解架构、数据流、目录和文档关系        |
| `MVP_QUERY_FACTORY.md`    | 当前 v2 MVP 的操作说明、路径约定和关键 schema |
| `mvp/query_factory_v2.js` | 当前真正执行逻辑的核心实现                  |


### B. 当前 persona 链路提示词


| File                                   | Relation to code                                |
| -------------------------------------- | ----------------------------------------------- |
| `prompts/persona_synthesis_prompt.md`  | 对应 `buildPersonaSynthesisPrompt()` 的 prompt 资产版 |
| `prompts/query_from_persona_prompt.md` | 对应 `buildQueryPromptFromPersona()` 的 prompt 资产版 |


说明：
当前代码已经内置可运行 fallback，所以即使不接外部 LLM，也可以产出结构化 query。

### C. 研究版完整方案


| File                                | Meaning                     |
| ----------------------------------- | --------------------------- |
| `ARCHIVE/README.md`                 | 项目完整方法论总览                   |
| `prompts/p1_industry_generation.md` | Stage 1，行业层级生成              |
| `prompts/p2_product_derivation.md`  | Stage 2，产品类型衍生              |
| `prompts/p3_social_extraction.md`   | Stage 2，社交内容结构化             |
| `prompts/p4_persona_query_gen.md`   | Stage 3，完整 persona query 合成 |
| `prompts/p5_quality_scoring.md`     | Stage 4，LLM 评分与标签提取         |


说明：
这部分描述的是更完整、更理想的 AI 数据工厂设计，不代表当前仓库中的每一步都已自动化接入。

## Where To Start

### 如果你想先跑起来

1. 看 `README.md`
2. 跑 `npm run run:mvp`
3. 打开 `data/reports_v2/dashboard.html`

### 如果你想先读代码

1. 看 `scripts/run-mvp.js`
2. 看 `mvp/query_factory_v2.js`
3. 看 `tests/query-factory-smoke.test.js`

### 如果你想升级为真实 LLM pipeline

1. 看 `prompts/persona_synthesis_prompt.md`
2. 看 `prompts/query_from_persona_prompt.md`
3. 看 `generateQueryRecords()`
4. 看 `buildPersonaSynthesisPrompt()`
5. 看 `buildQueryPromptFromPersona()`

### 如果你想理解方法论来源

1. 看 `ARCHIVE/README.md`
2. 看 `prompts/p1_industry_generation.md` 到 `prompts/p5_quality_scoring.md`

## Current Status

### Implemented

- Excel -> scenario spec 解析链路
- seed plan 与 backfill plan 生成（groupIndex 分组，同组 3 条任务共享 persona）
- persona-driven fallback query 生成
- LLM 两步生成：`batch-generate-queries.js` 支持 `claude-cli / openai / anthropic` 三种 transport
- `constrained` 标志：`product_type` 默认仅作元数据，`constrained: true` 时才注入 prompt
- **启发式质量评分（per-complexity 独立规则）**
  - `vague`：词数 5–40、含 app 类型词、无尾问句、无 sign-off
  - `medium / complex`：UI 组件词数、句子结构、推断复杂度对齐
  - 评分公式：`Authenticity × 0.4 + Specificity × 0.4 + Diversity × 0.2`，通过阈值 ≥ 2.8
- **Design Style 系统**：`design_style` 默认 `null`，LLM 自由发挥；支持 `--design-styles` opt-in 注入；`registerDesignStyle()` 动态扩展
- **发散性拓展 plan**：`build-expand200-plan.js` 产出 200 条任务（3 part 结构，覆盖 19 个新领域）
- **可复用质量分析报告 skill**：`generate-analysis-report.js` 从任意 scored JSONL 生成自包含 HTML（图表 + 交互筛选器 + 评分细则 + **persona 卡片展开**）
- **自由生成流水线**：`run-free.js` 一键编排 plan → generate → score → report → (可选) CSV 导出；`build-free200-plan.js` 管理 persona-scope（默认 scene 共享）
- **persona-scope 控制**：`--persona-scope scene`（默认）同场景共享 persona；`--persona-scope task` 每条独立；防止 task 级变量误混入 seed
- **CSV 导出**：`export-queries-csv.js` 从任意 raw_queries.jsonl 导出带自定义前缀的 prompt CSV
- SQLite 导入与静态 dashboard 输出
- 主链路冒烟测试

### Not Yet Implemented End-to-End

- 基于 `p5` 的完整 LLM 评分与多维标签抽取
- 从 Stage 1 到 Stage 4 的全自动研究版流水线
- 在线服务化或任务调度系统

## Limitations

- 当前主链路默认使用 deterministic/persona fallback，不是线上模型调用
- 当前评分是启发式版本，不是最终研究版质量评审
- `ARCHIVE/` 和 `p1-p5` 更偏蓝图与研究设计
- Dashboard 是静态 HTML，适合本地分析，不是生产 Web 服务

## Roadmap

- 接入外部 LLM，替换 persona/query fallback
- 将 `p5` 评分流程落地到实际批处理
- 增强 backfill 策略，从按场景补齐升级为按分布热区补齐
- 引入更细粒度的质量控制、去重与数据审计

## In One Sentence

这是一个把“前端 UI 需求数据生成”从零散 prompt 工程，推进到 **可运行、可验证、可分析的 AI 数据流水线** 的仓库。