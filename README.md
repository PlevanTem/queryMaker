<div align="center">

# ui-queryMaker

### 真实可用的 UI Query 数据，以工程化方式合成。

一条生产级流水线，用于生成大规模、多样化、persona 真实可信的
自然语言 UI 需求 query —— **语料锚定 · 相似度验证 · 风格感知**。

[**在线 Demo**](https://plevantem.github.io/queryMaker/) ·
[快速开始](#快速开始) ·
[两条流水线](#两条流水线) ·
[四方法对比](#四方法对比) ·
[架构](#架构)

**简体中文** · [English](./README.en.md)

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Model](https://img.shields.io/badge/model-claude--sonnet--4--6-d97757.svg)](https://www.anthropic.com/)
[![Stars](https://img.shields.io/github/stars/PlevanTem/queryMaker?style=social)](https://github.com/PlevanTem/queryMaker/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/PlevanTem/queryMaker)](https://github.com/PlevanTem/queryMaker/commits)

</div>

---

## 核心指标

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 语料覆盖 | **2,440 个 topic** | 61 个 L2 场景 · 12 个 L1 类目 |
| 跑通成功率 | **200 / 200** | `claude-sonnet-4-6`，0 失败 |
| 平均 query 长度 | **~84 词** | medium 复杂度，英文 |
| 单条 query 耗时 | **~3.3 秒** | 200 条约 11 分钟 |

> 在控制变量条件下对比了四种生成策略。人工评审认定
> **`corpus-direct` 为最高质量方案** —— topic 命中率 100%、模板痕迹最低、多样性最强。

## 为什么做这件事

绝大多数「随便 prompt 一下让 LLM 生成 query」的做法，最终都会塌缩成
窄分布、模板化、无法泛化的数据。本仓库从三个维度上解决这个问题：

| 没有它的样子 | 我们的做法 |
| --- | --- |
| **分布太窄** —— 100 条 query 都是 "build me a dashboard" 的变体，覆盖不到真实产品空间的 5% | **真实语料锚定** —— 每条生成都锁定到一个精选 2,440 entry 语料中的具体 topic |
| **机器味太重** —— LLM 默认输出礼貌、结构化、一致的语气，跟真实用户提需求的方式不一样 | **persona 驱动语气** —— 5 类 archetype × 3 档复杂度，产出以用户目标为锚的第一人称变化 |
| **视觉风格扁平** —— query 很少描述视觉风格，下游 UI 生成只能默认一种审美 | **设计风格感知** —— 11 个注册风格 × 3 种调用方式（默认 / 指定列表 / 启发式自动） |

## 谁会用到这个仓库

三类典型用法，每类都是真实场景中"找一批高质量 query 数据"会碰到的需求：

| 视角 | 谁 / 什么场景 | 直接价值 |
| --- | --- | --- |
| **🏭 工业 · 产品落地** | 字节豆包 / 蚂蚁灵光 / Bolt / v0.dev / Builder.io 这类「自然语言 → mini-app 代码」产品 | 即用的 seed query 训练 / 评测集：2,440 条 topic × 5 persona × 11 设计风格，分布忠实 xlsx 场景比例，0-1 mini-app 框架而非单页 mock |
| **🎓 学界 · 方法验证** | 做合成数据 / instruction tuning / UI 代码生成的研究者 | 控制变量评测 (`test-corpus-methods.js`) 实证 corpus 锚定 + persona 双因子的可加性；4 方法对比 + 三层差异化机制（Layer-A 去重 / opener hash / persona-tone）全开源，可直接复现或当 baseline |
| **🛠 工业 · 内部团队** | 需要"快速做一批 seed query"的内部 ML / 工程团队 | 单条 ~3.3s · 200 条 ~7 分钟 · 跨批次自动去重 state · 中英双语 xlsx 直出。适用于 prompt 迭代、UX 测试集构造、API 上线前压测、产品 demo 等场景 |

不在愿景里的：通用 LLM benchmark、UI 设计稿评测、视觉模型训练。本项目专注「query 这一侧」的真实分布合成。

## 项目亮点

- **端到端流水线** —— Excel 场景规格 → plan → 生成 → 评分 → SQLite → dashboard
- **两条生产链路并存** —— `corpus-direct`（单次调用、topic 锚定、生产推荐）和 `persona-driven`（两步调用、persona 锚定、研究/兼容）
- **离线 fallback 模式** —— 不接任何 LLM 也能跑通，`persona-fallback` 提供确定性输出，适合冒烟和 CI
- **多 transport 接入** —— `claude-cli`（子进程）/ `openai` 兼容 / `anthropic` `/v1/messages`，单参数切换
- **相似度去重** —— trigram 相似度算法保证 corpus 分布广度
- **可复跑、可断点续跑** —— 所有中间产物落盘；plan 是确定性的
- **内置基准测试** —— `test-corpus-methods.js` 控制变量跑四种策略，输出并排对比 HTML

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 跑离线 MVP（不接 LLM，确定性 fallback）
npm run run:mvp

# 3. 查看结果
open data/reports_v2/dashboard.html
```

**接真实 LLM** —— 把凭证写入 `.env.local`，然后选择一条流水线：

```bash
# Corpus-Direct（生产推荐）
node scripts/run-corpus.js --total 200

# Persona-Driven 自由生成（研究 / 探索）
npm run run:free
```

<details>
<summary><b>完整 .env.local 模板</b></summary>

```bash
# OpenAI 兼容网关（Packy / LiteLLM / 自建）
PACKY_API_KEY=your_api_key_here
PACKY_BASE_URL=https://www.packyapi.com/v1
PACKY_MODEL=claude-3-5-sonnet-20240620

# Anthropic / Claude Code 风格（CC 分组令牌）
ANTHROPIC_AUTH_TOKEN=your_cc_group_token_here
ANTHROPIC_BASE_URL=https://www.packyapi.com
ANTHROPIC_MODEL=claude-sonnet-4-6

# 并发 / 网络
PACKY_CONCURRENCY=3
PACKY_TIMEOUT_MS=120000
PACKY_MAX_RETRIES=2
PACKY_USE_SYSTEM_PROXY=1
PACKY_ALLOW_INSECURE_TLS=0
```

说明：
- `llm-openai` / `real-llm` / `packy-openai` → OpenAI 兼容接口
- `llm-anthropic` / `claude-code` / `anthropic-cc` / `packy-cc` → Anthropic 风格 `/v1/messages`
- LLM 调用使用 Node 内建 `undici`，无需额外安装 SDK
- Windows 默认自动读取系统代理，内网网关可设置 `PACKY_USE_SYSTEM_PROXY=0`

</details>

## 两条流水线

仓库提供两条生产路径，共用评分、去重和报告层：

| | Corpus-Direct ★ | Persona-Driven |
| --- | --- | --- |
| 入口 | `node scripts/run-corpus.js` | `npm run run:free` |
| 单 task LLM 调用次数 | **1** | 2（persona → query） |
| 锚点 | 真实语料中的具体 topic（2,440 条） | 合成 persona + 场景 |
| Topic 命中率 | **100%** | ~70–85%（会在 L2 类目内漂移） |
| 适用场景 | 生产数据集、分布忠实的语料 | 研究、语气多样性探索 |

```mermaid
flowchart TD
    A["场景覆盖.xlsx"] --> B["parseRequirementsFromWorkbook()"]
    B --> C["Scenario spec"]

    subgraph CorpusLine["Corpus-Direct (run-corpus) ★"]
      C --> D2["buildCorpusPlan(spec, corpus, mix)"]
      D2 --> E2["带 corpus_topic 的 plan"]
      E2 --> G2["buildCorpusDirectQueryPrompt<br/>（1× LLM 调用）"]
    end

    subgraph PersonaLine["Persona-Driven (run-free / run-mvp)"]
      C --> D1["buildSeedPlan / buildBackfillPlan"]
      D1 --> E1["Generation plan"]
      E1 --> F1["Persona 合成 (LLM)"]
      F1 --> G1["从 persona 生成 query (LLM)"]
    end

    G1 --> H["启发式评分"]
    G2 --> H
    H --> I["SQLite / JSONL 产物"]
    I --> J["Dashboard + summary"]
```

## 四方法对比

`scripts/test-corpus-methods.js` 在控制变量下跑四种策略，并产出并排对比报告。主要结论：

| 方法 | Topic 命中 | 平均长度 | 模板痕迹 | 备注 |
| --- | --- | --- | --- | --- |
| **`corpus-direct`** ★ | **100%** | 84 词 | 极低 | 生产首选。锁 topic、显式控制 complexity |
| `scene-direct` | ~75% | 71 词 | 中 | 在 L2 类目里漂移，省一跳 |
| `persona-only` | ~70% | 92 词 | 低 | 语气最强，topic 纪律最弱 |
| `persona+corpus` | ~95% | 96 词 | 低 | 成本最高，相比 `corpus-direct` 边际收益小 |

完整对比写作和数据见 [在线 Demo](https://plevantem.github.io/queryMaker/)，
或在本地跑完 `scripts/test-corpus-methods.js` 后打开 `data/output/corpus_method_comparison.html`。

## 多样性与去重策略

> 真实跑批次发现：单次任务质量好不代表整批分布健康。两个隐藏盲点专门花了一个迭代解决。

### 之前的两个盲点

| 盲点 | 表现 |
| --- | --- |
| **朴素 topic rotate** | `topics[i % length]` 让不同批次的同 L2 都从第 0 条 topic 开始 → 跨批次 corpus_topic **100% 重叠** |
| **Jaccard 同辈相似度只看 batch 内** | `scoreQueryRecords` 仅按 `scene_id` 分组比对当前 batch 兄弟，看不见历史。新跑的 query 与上次跑的可能逐字相似，没有任何信号 |
| **LLM opener 收敛** | system prompt 提到 "mobile H5"，模型在 200 条里 54% 都用 `Build a mobile ...` 开头 |

### Layer-A：Topic 层差异化采样

`mvp/query_factory_v2.js` 新增三个函数：

| API | 用途 |
| --- | --- |
| `pickLeastUsedTopics(topics, count, usageMap)` | 优先选累计使用次数最少的 topic；同次数按原始 index 决定性 tiebreak |
| `loadCorpusUsage(statePath)` | 读 `data/state/corpus_usage.json` → `{ l2_key: { topic: count } }` |
| `saveCorpusUsage(statePath, usedTopicsByL2)` | 跑完后增量写回（仅记录成功条目）|

`buildCorpusPlan` 接受 `corpusUsage` 与 `excludeL1` 选项。`run-corpus.js` 默认在 `data/state/corpus_usage.json` 维护跨批次 state。

### Opener Hash 强制分布

`buildCorpusDirectQueryPrompt` 用 `hashText(query_id) % 5` 决定性分配开头到 5 桶之一：`Build a` / `Need a` / `Create a` / `Make a` / 无 formal opener。同一 `query_id` 永远拿到同一开头（idempotent rerun），200 条上自然均匀分布。

### Persona-Tone 语义映射（Layer-C）

> 第三个隐藏盲点：v4 query 虽然 topic 命中、开头多样化，但**口吻全是 PM/dev 腔**（"GTD inbox dashboard"、"auto-generate based on UV index"、"bottom card swipe up to expand"），完全不像普通用户提需求的方式。

每个 task 按 **`corpus_l2_key` 语义最佳匹配**（非随机）分配一个普通用户 persona，prompt 里注入对应 voice 描述（**只描述特征、不给词汇示例**，避免模型生成僵化）。

5 个 ordinary-user persona（`mvp/query_factory_v2.js` `CORPUS_DIRECT_PERSONAS`）：

| id | title | voice descriptor |
| --- | --- | --- |
| `maker` | 爱折腾的小白手艺人 | Talks casually about what to make and the use case; doesn't worry about UI/layout. |
| `planner` | 喜欢列清单的整理控 | Lists what they want in everyday language; mentions a few specific things; not technical. |
| `curator` | 内容驱动的审美派 | Describes feel, vibe, visual references; cares about taste; doesn't speak in component names. |
| `operator` | 想偷懒的打工人 / 学生 | Talks about pain points or hassles to remove; pragmatic; doesn't care how it looks. |
| `founder_like` | 有点情怀的"自留地"用户 | Short, opinionated; explains what NOT to include as much as what to include. |

L2 → persona 映射在 [`scripts/corpus_persona_map.json`](./scripts/corpus_persona_map.json)（61 entry，可手工调）。例：

| L2 类别 | persona |
| --- | --- |
| 番茄钟 / 待办 / 健康打卡 | `operator`（关注省事痛点）|
| 个人生活类 / 内容创作工具 / 餐厅点评 | `curator`（关注感觉氛围）|
| 闪卡 / 行程规划 / 健康追踪 | `planner`（列要点、追求规律）|
| 个人专业类 / 海报模板 | `founder_like`（短句、有取舍）|
| Adding & Creating / 经典小游戏 / 长尾微工具 | `maker`（想到啥说啥）|

prompt rule 5 同步增加 dev jargon 黑名单（"modal" / "dashboard" / "auto-generate" / "swipeable" / "bottom sheet" / "scrollable card" / "tag chip" / "GTD" / "CTA"），强约束 persona 不该使用的术语。

### 实测对比（v3 → v4 → v5 同 200 条规模）

| 指标 | v3（朴素） | v4（Layer-A + opener hash）| v5（+ persona-tone） |
| --- | --- | --- | --- |
| 与历史 corpus_topic 重叠 | 100%（同 plan） | **0%** | **0%** |
| 开头 `Build a` 占比 | 54%（108/200） | 21%（41/200） | ~21% |
| 主开头均衡度 | 1 个主导 | 38–48 均衡分布 | 38–48 均衡分布 |
| 含 dev 术语的 query 占比 | 普遍出现 | **20%**（40/200） | **0.5%**（1/200） |
| `dashboard` / `modal` / `bottom sheet` 等 | 11 / 5 / 6 | 11 / 5 / 6 | **0 / 0 / 0** |
| 用户口吻区分度 | 全部"普通人"模板 | 全部"普通人"模板 | **5 种 persona 视角分散** |
| 平均词数 | 102 | 103 | 91（更精炼）|

### CLI 用法

```bash
# 默认：自动跨批次去重 + 自动 L2 → persona 语义匹配
node scripts/run-corpus.js --total 200

# 排除某些 L1（子串匹配，逗号分隔）
node scripts/run-corpus.js --total 200 --exclude-l1 "深度研究,购物消费"

# 自定义 state / persona-map 路径
node scripts/run-corpus.js --total 200 \
  --usage-state data/state/run_alpha.json \
  --persona-map scripts/corpus_persona_map.json

# 关掉 usage 跟踪（一次性试跑、不污染历史）
node scripts/run-corpus.js --total 200 --no-usage-track
```

### Bootstrap：从历史 run 初始化 state

首次启用 Layer-A 时，可一次性把已有 `queries.jsonl` 的 topic 使用情况导入 state：

```bash
node -e "
const { saveCorpusUsage } = require('./mvp/query_factory_v2');
const fs = require('fs');
const tasks   = fs.readFileSync('data/output/<run>/plan.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);
const queries = fs.readFileSync('data/output/<run>/queries.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);
const okIds = new Set(queries.filter(r => !r.error).map(r => r.id));
const used = {};
for (const t of tasks) {
  if (!okIds.has(t.query_id)) continue;
  const k = t.corpus_l2_key, top = t.corpus_topic;
  if (!k || !top) continue;
  (used[k] = used[k] || []).push(top);
}
saveCorpusUsage('data/state/corpus_usage.json', used);
"
```

> Layer-B（query 文本层 trigram-jaccard 跨批次去重 vs 历史蓄水池）已设计未实现，等 Layer-A + Layer-C 累积几个批次再判断必要性。

## 架构

核心逻辑集中，CLI 是薄封装。

```mermaid
flowchart LR
    A["scripts/*.js<br/>CLI 入口"] --> B["mvp/query_factory.js"]
    B --> C["mvp/query_factory_v2.js<br/>核心 pipeline"]
    C --> D["data/intermediate/*"]
    C --> E["data/output/*"]
    C --> F["data/db/queries_v2.sqlite"]
    C --> G["data/reports_v2/*"]
    C -. prompt 资产 .-> H["prompts/*.md"]
    T["tests/query-factory-smoke.test.js"] --> B
```

- `scripts/` —— 阶段化 CLI 入口（参数解析、路径约定、文件 IO）
- `mvp/` —— 所有可运行核心逻辑
- `prompts/` —— prompt 资产（persona 链路 + 研究版多阶段）
- `data/` —— 中间产物、输出、SQLite、可视化报表
- `tests/` —— 主链路冒烟测试
- `ARCHIVE/` —— 方法论与研究蓝图（不等于代码全部已实现）

## 设计风格系统

`design_style` 默认为 `null` —— LLM 根据上下文自然推断视觉方向。
三种 opt-in 模式：

| 方式 | 行为 |
| --- | --- |
| 不传（默认） | `design_style: null`，LLM 按场景上下文推断 |
| `--design-styles "Dark,Glassmorphism,Cyberpunk"` | 在指定列表中轮换分配 |
| `--design-styles auto` | 按 L1/L2/app 关键词启发式推断 |

内置 11 个注册风格：`Dark`、`Glassmorphism`、`Neumorphism`、`Neubrutalism`、`Minimalism`、
`Material`、`Data-Dense`、`Cyberpunk`、`Luxury`、`Vibrant`。通过 `registerDesignStyle()`
可扩展，注册时同步更新 `DESIGN_STYLES` 列表、中文 persona hint 和英文 prompt 指令。

<details>
<summary><b>项目结构</b></summary>

```text
.
├── README.md / README.en.md
├── MVP_QUERY_FACTORY.md
├── docs/index.html                    # ★ 公开 landing page (GitHub Pages)
├── package.json
├── mvp/
│   ├── query_factory.js
│   └── query_factory_v2.js            # 核心：pipeline / 评分 / design_style
├── scripts/
│   ├── README.md                      # CLI 参数 / 示例 / 设计原则
│   ├── lib/
│   │   ├── llm-batch.js               # transports / 重试 / persona pipeline / 并发池
│   │   └── claude-cli.js              # ★ claude CLI 子进程（绕过 CC 网关 UA 校验）
│   ├── corpus_data.json               # ★ 61 个 L2 × ~40 topics
│   ├── build_corpus.py                # corpus 构建脚本
│   ├── gen_html.py                    # corpus 可视化
│   ├── run-corpus.js                  # ★ Corpus-Direct 一键流水线（生产）
│   ├── test-corpus-methods.js         # 4 方法对比评测
│   ├── run-free.js                    # ★ LLM 自由生成一键流水线
│   ├── batch-generate-queries.js      # LLM 批量生成（run-free 内部调用）
│   ├── build-free200-plan.js          # ★ 自由生成 plan（200 条，persona-scope 控制）
│   ├── build-expand200-plan.js        # 发散拓展 plan（200 条，3 part 结构）
│   ├── generate-analysis-report.js    # ★ 批次质量分析 HTML（含 persona 卡片）
│   ├── score-queries.js
│   ├── export-queries-csv.js          # ★ 导出带前缀的 query CSV
│   ├── build-query-comparison.js
│   ├── generate-extra-scenes.js       # 基于 L1 扩展 L2 场景（41 个新）
│   ├── test-api-connectivity.js
│   ├── parse-requirements.js
│   ├── build-generation-plan.js
│   ├── build-backfill-plan.js
│   ├── generate-queries.js
│   ├── supplement-anchored-persona-queries.js
│   ├── import-queries.js
│   ├── build-dashboard.js
│   ├── preview-persona-flow.js
│   ├── run-mvp.js                     # 旧版一键（persona-fallback，无 LLM）
│   └── legacy/                        # 已归档一次性脚本
├── prompts/
│   ├── persona_synthesis_prompt.md
│   ├── query_from_persona_prompt.md
│   └── generate_corpus_prompt.md
├── ARCHIVE/                           # 研究版方法论 (p1-p5)
├── tests/
│   └── query-factory-smoke.test.js
└── data/
    ├── intermediate/
    ├── output/
    │   ├── corpus_run/                # ★ Corpus-Direct 输出
    │   ├── corpus_method_comparison.html
    │   └── runs/
    │       ├── expand200_llm/
    │       └── free200_llm/           # ★ 自由生成批次输出
    ├── db/
    └── reports_v2/
```

</details>

<details>
<summary><b>CLI 命令清单</b></summary>

| 命令 | 用途 |
| --- | --- |
| `npm run parse:requirements` | 解析 Excel → 标准化场景规格 |
| `npm run plan:seed` | 生成首轮 seed plan |
| `npm run plan:backfill` | 对覆盖不足的场景生成补齐 plan |
| `npm run generate:queries` | 根据 plan 生成 query |
| `npm run preview:persona` | 预览单条任务的 persona + query 生成 |
| `npm run score:queries` | 启发式质量评分 |
| `npm run import:queries` | 将场景与 query 导入 SQLite |
| `npm run build:dashboard` | 从 SQLite 生成静态 dashboard |
| `npm run run:mvp` | 旧版一键流水线（persona-fallback，无 LLM） |
| `npm run run:free` | ★ LLM 自由生成一键流水线（persona-driven） |
| `node scripts/run-corpus.js` | ★ Corpus-Direct 一键流水线（生产） |
| `npm run batch:generate` | LLM 批量生成单步入口（支持断点续跑） |
| `npm run build:comparison` | 多 run 横向对比 HTML |
| `npm run test:api` | 探活：Anthropic 与 OpenAI 兼容端点 |
| `npm test` | 冒烟测试 |

**直接调用脚本：**

```bash
# Corpus-Direct
node scripts/run-corpus.js --total 200 --complexity-mix "vague,medium,medium"
node scripts/run-corpus.js --total 200 --dry-run                          # 只验证 plan
node scripts/run-corpus.js --total 200 --limit 10                          # 小批量真实跑

# 自由生成
node scripts/run-free.js --output-dir data/output/runs/free200_v2 --no-resume --export-csv

# Plan 构建
node scripts/build-free200-plan.js [--persona-scope scene|task]
node scripts/build-expand200-plan.js [--design-styles "Dark,Glassmorphism"]

# 分析报告
node scripts/generate-analysis-report.js \
  --input  data/output/runs/<batch>/scored_queries.jsonl \
  --output data/output/runs/<batch>/analysis_report.html
```

</details>

## 评分规则

`scoreQueryRecord()` 按复杂度独立打分：

- **`vague`** —— 词数 5–40、含 app 类型词、无尾问句、无 sign-off
- **`medium` / `complex`** —— UI 组件词汇、句子结构、复杂度对齐
- **加权公式** —— `Authenticity × 0.4 + Specificity × 0.4 + Diversity × 0.2`，通过阈值 ≥ 2.8
- **`design_style` 影响** —— 字段有值时 Diversity 维度 +1；`null` 时 Diversity 最高 4 分

## Roadmap

- [ ] LLM-based 质量评分（用 `p5` 设计替换启发式）
- [ ] 端到端研究版流水线（Stage 1 → Stage 4 全自动）
- [ ] 分布感知的 backfill（从按场景补齐升级为按热区补齐）
- [ ] 在线服务化 / 定时批处理
- [ ] 训练集规模去重（当前是 trigram、批次级别）

## 当前状态

**已实现**

- Excel → scenario spec 解析
- seed + backfill plan 生成（同组任务共享 persona）
- Persona-driven 离线 fallback 生成
- LLM 两步生成，三种 transport（`claude-cli` / `openai` / `anthropic`）
- Corpus-Direct 生产流水线（单次调用、topic 锚定）
- 4 方法控制变量基准评测
- 启发式评分（按复杂度独立、design-style 感知）
- 设计风格系统（11 种、3 种调用方式、动态注册）
- 可复用质量分析报告 skill（交互式 HTML + persona 卡片）
- 自由生成流水线（`run-free`、persona-scope 控制）
- 带前缀 CSV 导出
- SQLite 导入 + 静态 dashboard
- 主链路冒烟测试

**尚未端到端打通**

- 基于 `p5` 的 LLM 评分
- Stage 1 → Stage 4 全自动
- 在线服务 / 任务调度

## 核心参考与致谢

本项目的几个关键设计决策直接受益于下面这几条研究线。每条都附上具体的「借鉴点」，便于复用本项目的人定位思想源头，也便于做相关方向研究的同行交叉引用。

### Persona-driven synthetic data

- **Scaling Synthetic Data Creation with 1,000,000,000 Personas** (PersonaHub) — Tao Ge, Xin Chan, Xiaoyang Wang, Dian Yu, Haitao Mi, Dong Yu. Tencent AI Lab, 2024. [arXiv:2406.20094](https://arxiv.org/abs/2406.20094)
  - 直接启发了本项目"persona 不是装饰、是合成数据多视角的核心驱动"这个判断。差异：PersonaHub 走十亿级别广度，本项目在 UI vibe-coding query 这个垂直场景里走 5 个手工打磨的 ordinary-user archetype（`maker / planner / curator / operator / founder_like`），并把"哪个 persona 适合这个 corpus topic"做成 L2 语义最佳匹配（而非随机）。

### Instruction-tuning data synthesis

- **Instruction-Tuning Data Synthesis from Scratch via Web Reconstruction (WebR)**, 2025. [arXiv:2504.15573](https://arxiv.org/abs/2504.15573)
  - "Web as Instruction / Web as Response" 双策略给本项目的启示：从原始 corpus（xlsx 场景规格 + 2,440 条 topic）出发用 LLM 重构出真实分布的 instruction，而不是模板拼接。本项目 `corpus-direct` 流水线的"topic 锚定 + 单次 LLM 调用"工作方式与 WebR 思路同源。

- **Instruction Tuning for Large Language Models: A Survey** — Shengyu Zhang, Linfeng Dong, Xiaoya Li, Sen Zhang, Xiaofei Sun, Shuhe Wang, Jiwei Li, Runyi Hu, Tianwei Zhang, Fei Wu, Guoyin Wang. *ACM Computing Surveys*, 2025.
  - 系统综述了 instruction tuning 的数据构造、质量评估和多样性度量。本项目的「authenticity / specificity / diversity」三维评分、「同场景内 trigram-Jaccard 同辈相似度」去重，分类法和评估指标都参照了这篇 survey 的脉络。

### UI / Web 代码生成下游目标

- **WebGen-Bench: Evaluating LLMs on Generating Interactive and Functional Websites from Scratch**, 2025. [arXiv:2505.03733](https://arxiv.org/abs/2505.03733)
  - 提供了本项目 query 数据集的下游验收标准 —— query 应能驱动 LLM 真正生成 0-to-1 可运行的 mini-app，而非单页 mock。最近一次的「app-scope rewrite」（禁止 `page / screen / view` 作为顶层名词，必须用 `app / tracker / tool / reminder` 等）正是为了对齐这个评测目标。

- **Code Aesthetics with Agentic Reward Feedback** — Bang Xiao, Lingjie Jiang, Shaohan Huang, Tengchao Lv, Yupan Huang, Xun Wu, Lei Cui, Furu Wei. Microsoft, 2025. [arXiv:2510.23272](https://arxiv.org/abs/2510.23272)
  - 提醒了「query 不只是功能描述，还应自然带出审美偏好」。本项目的 11 种注册设计风格（`Glassmorphism / Neumorphism / Cyberpunk / ...`）和「风格 hint 揉进 query 而非生硬罗列」的 prompt 写法，与这条工作的「美学反馈」思路同向。

---

如果本项目对你的合成数据、instruction tuning 数据集或 UI / Web 代码生成基线工作有用，欢迎在 issue 里说一声你的场景 —— 我们对真实 downstream 用法很感兴趣，也方便后续按真实需求迭代。Star 与 fork 都欢迎，使用方式见 [LICENSE](./LICENSE)。

> 想贡献代码？跑通 `npm install && npm test`、过一眼 [`scripts/README.md`](./scripts/README.md) 的 CLI 设计契约，较大重构开个 issue 先聊聊。

## Star History

<a href="https://www.star-history.com/?type=date&repos=PlevanTem%2FqueryMaker">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=PlevanTem/queryMaker&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=PlevanTem/queryMaker&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=PlevanTem/queryMaker&type=date&legend=top-left" />
  </picture>
</a>

## License

[ISC](./LICENSE) © 2026 ui-queryMaker contributors

---

<div align="center">

**[在线 Demo](https://plevantem.github.io/queryMaker/)** ·
**[English](./README.en.md)** ·
**[报告 Bug](https://github.com/PlevanTem/queryMaker/issues)**

</div>
