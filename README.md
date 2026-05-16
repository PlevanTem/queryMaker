<div align="center">

# ui-queryMaker

### 真实可用的 UI Query 数据，以工程化方式合成。

一条生产级流水线，用于生成大规模、多样化、persona 真实可信的
自然语言 UI 需求 query —— **语料锚定 · 相似度验证 · 风格感知**。

> **corpus 控制 *what* · persona 控制 *who / how* —— 两个正交控制信号 + 横向 ablation 验证**

[**在线 Demo**](https://plevantem.github.io/queryMaker/) ·
[快速开始](#快速开始) ·
[与 Persona Hub 的差异](#与-persona-hub--self-instruct--magpie-的差异) ·
[四方法对比](#四方法对比) ·
[局限](#局限与已知边界) ·
[架构](#架构)

**简体中文** · [English](./README.en.md)

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Model](https://img.shields.io/badge/model-claude--sonnet--4--6-d97757.svg)](https://www.anthropic.com/)
[![4-way ablation](https://img.shields.io/badge/4--way%20ablation-✓-3fb950.svg)](#四方法对比)
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
| 单条 query 耗时 | **~3.3 秒** | 200 条约 11 分钟（≈ 1080 条 / 小时） |
| 外部 API 成本 | **$0**（no-API 模式） | 走 Claude Code subagent；packy 路径按 token 另计 |
| 跨批次 topic 重叠 | **0%**（Stage 2 起） | Layer-A `corpus_usage.json` 持久化最少使用优先 |

> 在 4 档控制变量 ablation（`llm-direct` / `corpus-direct` / `persona-direct` / `corpus+persona`）下，
> **`corpus-direct` 取得帕累托最优**：topic 命中率 **100%**（vs `persona-only` ≈70%）·
> 5 类 ordinary-user archetype × 11 注册设计风格 = **55 种风格组合** · 「Build a」开头占比
> 自然分散到 21%（vs 朴素基线 54%）。完整对比与控制变量明细 → [§四方法对比](#四方法对比)。

## 与 Persona Hub / Self-Instruct / Magpie 的差异

合成数据领域目前有四条主路线 —— **instance-driven**（Self-Instruct / Evol-Instruct）、
**key-point-driven**（GLAN）、**persona-driven**（Persona Hub）、**self-play**（Magpie）。
本仓库站在 **persona-driven** 路线上，做了原论文未及的三处工程性补强：

| 维度 | Persona Hub (Tencent AI Lab, 2024) | 本仓库 |
| --- | --- | --- |
| **persona 来源** | 通用 10 亿 persona 池子（web text 反推） | 基于产品场景 + 线上用户画像反推的 **5 类定向 archetype** |
| **分布控制** | 黑盒：依赖大 persona 池子自然分散 | **白盒**：corpus 通道统计 2,440 topic 分布，Layer-A 最少使用主动补充 |
| **横向 ablation** | 未做有/无 persona 对照，未与 Self-Instruct / Magpie 对比 | 做了 4 档对照：`llm-direct` / `corpus-direct` / `persona-direct` / `corpus+persona` |
| **典型场景** | 通用领域 distillation，规模化 SFT 数据 | UI vibe-coding 这种**产品垂直域**，能白盒拿到 corpus |

> Persona Hub 的核心证据是「用 1M persona 合成数据训 7B 模型在 MATH 上逼近 GPT-4-turbo」
> —— 这是端到端结果证据，但并未直接证明 *persona 机制本身*相对其他合成方法的边际贡献。
> 本仓库通过 [§四方法对比](#四方法对比) 把这个 ablation 补上，并加入了原论文没有的 **corpus 通道**做白盒分布锚定。

→ 方法论谱系与全部引用：[§核心参考与致谢](#核心参考与致谢)。

## 四方法对比

> 这是 Persona Hub 原论文未做的关键 ablation —— 在**同 base model**（`claude-sonnet-4-6`）/
> **同 query 总量** / **同评测协议**下对照 4 档生成策略。控制变量与原始数据见
> `scripts/test-corpus-methods.js` 与 `data/output/corpus_method_comparison.html`。

| 方法 | Topic 命中 | 平均长度 | 模板痕迹 | 贡献定位 |
| --- | --- | --- | --- | --- |
| `llm-direct` (= `scene-direct`) | ~75% | 71 词 | 中 | baseline 下界：仅给 L2 名称让 LLM 自由发挥 |
| **`corpus-direct`** ★ | **100%** | 84 词 | 极低 | 验证 ***what* 通道**（corpus）的边际贡献 |
| `persona-only` | ~70% | 92 词 | 低 | 验证 ***who / how* 通道**（persona）的边际贡献 |
| `persona+corpus` | ~95% | 96 词 | 低 | 双通道叠加；成本最高，相比 `corpus-direct` 边际收益小 |

**怎么读这张表**：
- `corpus-direct` vs `llm-direct` 的差距 = corpus 锚定（*what* 通道）的净贡献：topic 命中率 75% → 100%。
- `persona-only` vs `llm-direct` 的差距 = persona 注入（*who/how* 通道）的净贡献：语气和模板痕迹改善，但 topic 纪律倒退。
- `persona+corpus` vs `corpus-direct` 的差距 = 第二个 LLM call 的边际产出（小）—— 因此生产推荐 `corpus-direct`，把 persona 信号合到单次 prompt 里。

完整对比写作和数据见 [在线 Demo](https://plevantem.github.io/queryMaker/) ，
或在本地跑完 `scripts/test-corpus-methods.js` 后打开 `data/output/corpus_method_comparison.html`。

## 为什么做这件事

绝大多数「随便 prompt 一下让 LLM 生成 query」的做法，最终都会塌缩成
窄分布、模板化、无法泛化的数据。

合成 query 有两个**不能用同一个信号干净覆盖**的目标 ——
*what to ask about*（场景骨架 / 主题分布）和 *who is asking and how*（提问视角 / 表达风格）。
前者由 **corpus 通道**控制，后者由 **persona 通道**控制；两者笛卡尔积式正交组合，最大化覆盖空间。

| 没有它的样子 | 我们的做法 |
| --- | --- |
| **分布太窄** —— 100 条 query 都是 "build me a dashboard" 的变体，覆盖不到真实产品空间的 5% | **真实语料锚定**（*what* 通道）—— 每条生成都锁定到精选 2,440 entry 语料中的具体 topic |
| **机器味太重** —— LLM 默认输出礼貌、结构化、一致的语气，跟真实用户提需求的方式不一样 | **persona 驱动语气**（*who / how* 通道）—— 5 类 archetype × 3 档复杂度，产出以用户目标为锚的第一人称变化 |
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

- **双通道正交控制** —— corpus 控制 *what*（场景骨架 / 主题分布）· persona 控制 *who / how*（提问视角 / 表达风格）
- **4 档横向 ablation** —— `llm-direct` / `corpus-direct` / `persona-direct` / `corpus+persona`，Persona Hub 原论文未及的工程性补强
- **No-API 模式** —— 走 Claude Code subagent，零外部 API 配额跑通 mobile/web 各 500 条数据集
- **跨批次 dedup state** —— Layer-A `corpus_usage.json`，保证多次跑跨批次 topic 重叠 0%
- **离线 fallback** —— `persona-fallback` 提供确定性输出，无 LLM 也能跑通，适合冒烟 / CI

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

### 🆕 No-API 模式（推荐 · 走 Claude Code subagent，零 API 配额）

当你**没有任何 LLM API key**、或者**packy 余额耗尽**、或者只想**完全免费跑**时，
直接用 Claude Code 自身作为 LLM —— 把生成 / 翻译拆成 batch，每个 batch 由
Claude Code 内置的 subagent（`Task` tool · model=`sonnet` 或 `haiku`）处理。
**1000/500-mobile + 500-web** 整套数据集就是这么 0 成本跑出来的。

```bash
# Step 1: 在 Claude Code 里告诉我「跑 corpus-direct 500 条 mobile，no-API 模式」
node scripts/run-corpus.js --total 500 --platform mobile --prep-only \
  --out data/output/my_run_mobile_500
# → 写出 plan.jsonl + 占位 queries.jsonl + _subagent_in/<platform>_b<NN>_in.json

# Step 2: 在 Claude Code 里我会自动 spawn N 个 Sonnet subagents（每个吃一个 _in.json）
#         它们写出对应的 _out.json

# Step 3: 合并 subagent 输出回 queries.jsonl
node scripts/merge-subagent-retry.js \
  --in-dir     data/output/my_run_mobile_500/_subagent_in \
  --target-dir data/output/my_run_mobile_500
# → 500/500 OK，error 行被填回
```

**翻译同理**：

```bash
# Step 1: 拆 batch
node scripts/prep-translate-batches.js --dir data/output/my_run_mobile_500

# Step 2: Claude Code 里 spawn Haiku subagents 翻译每个 _in.json
# （Haiku 偶尔会 emit 没转义的 ASCII " 在中文里，下一步会自动修）

# Step 3: 合并
node scripts/repair-haiku-json.js --dir data/output/my_run_mobile_500/_translate_in
node scripts/merge-haiku-translations.js \
  --temp-dir data/output/my_run_mobile_500/_translate_in
# → queries.jsonl + queries.xlsx 都新增 query_text_zh 列
```

**为什么这是首选**：
- ✅ **零成本** —— 完全不调外部 API
- ✅ **天然并发** —— Claude Code 一次起 6-15 个 subagent 并行
- ✅ **质量与 packy 路径相当** —— 同样的 corpus-direct prompt，Sonnet 4.6 直出
- ✅ **可断点续跑** —— 任何一个 subagent 失败，只重跑那一个 batch
- ✅ **审计友好** —— 每个 batch 的 prompt + 输出都落盘可查

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

## 演进路线：4 个阶段，4 次修复

不是一次到位 —— 每个阶段都是上一版规模化跑批之后才暴露出来的真实痛点，再做一次聚焦的 prompt / 流水线修复。这条线索本身比单一 prompt 工程更有借鉴价值。

### Stage 1 — 朴素基线（无任何脚手架）

无 persona、无 opener 分布、无 scope 纪律。批次之间反复使用前 N 个相同的 corpus topic；**「Build a mobile X」模板占绝对主导**；query 框定为单页/单屏，不是 0-to-1 完整 app。

### Stage 2 — 三层差异化 ([commit 040a427](https://github.com/PlevanTem/queryMaker/commit/040a427))

| Fix | Layer-A 跨批次最少使用 topic 优先（持久化到 `corpus_usage.json`）· 5 桶 opener 哈希按 `query_id` 决定性分配 · persona-tone 按 L2 语义最佳匹配映射到 5 个普通用户 archetype |
|---|---|
| **Result** | 跨批次 corpus_topic 重叠率 **100% → 0%**；「Build a」开头占比 **54% → 21%**；批次内 5 种 persona 口吻清晰可辨 |
| **New pain** | 审计发现 **49.5% query 仍以「Build a XX page where…」框定** —— opener 已分散，但 scope 名词仍在 page 级 |

### Stage 3 — App-scope 改写 ([commit 07ed4af](https://github.com/PlevanTem/queryMaker/commit/07ed4af))

| Fix | Rule 7 禁止 `page / screen / view / section / module / feature / widget` 作顶层 scope 名词；必须用 `app` 或具体 app 类型（`tracker / tool / reminder / planner / calculator / logger / manager / timer`） |
|---|---|
| **Result** | 单页框定 query：**49.5% → 0%**；平均词数无变化（91 → 91，无长度膨胀） |
| **New pain** | 审计发现 **76% EN / 80% ZH** 含否定词；**45% 出现 grievance dump 模式**（"no stock photo, no cartoon, no confetti…"） |

**真实样本（v5 founder_like 婚礼请柬制作器）—— BEFORE**：

> Make a wedding invitation card creator that feels personal and handcrafted, **not like** some cookie-cutter template factory — I want a small set of maybe four or five elegant layouts I can actually customize with our names, date, and a short line of text, and the font choices should lean traditional and warm, **not** trendy sans-serif stuff. **No** stock photo backgrounds, **no** cartoon illustrations, **no** confetti animations — just clean, tasteful design with maybe a soft floral border option. It should feel like something I made myself, **not** something that came off an assembly line.

### Stage 4 — 正向表达改写 · 当前 ([commit ee04965](https://github.com/PlevanTem/queryMaker/commit/ee04965))

| Fix | (1) 改写 `founder_like` voice —— 之前字面要求 "explain what NOT to include as much as what to include" · (2) 把 3 条 "Do NOT" prompt 规则翻成正向（"Open with the substance" / "Use everyday vocabulary" / "Use 'app' as top-level noun"）· (3) 增加显式正向表达规则，限制每条 query 否定词 ≤1 个 |
|---|---|
| **Result** | 否定词人均 **1.08 → 0.66 (-39%)**；**Grievance 模式 0.58 → 0.22 (-62%)**；按 persona：curator **-56%**、maker **-57%**、planner **-39%**；残留否定词基本是功能价值描述（"auto-saves so you never lose"），不再是 grievance dump |

**真实样本（v6 founder_like ATS 简历生成器，同 persona 同 L2，见对比）—— AFTER**：

> Create a resume builder app that has its own quiet identity — one of those tools you actually feel good using — built around a small, carefully chosen set of ATS-friendly templates that are clean but still carry a bit of character, where I can fill in my experience and skills section by section and watch a live preview come together in a format that looks genuinely considered to a human reader while staying structured enough for automated hiring systems to parse without a fuss.

**关键观察**：每个阶段都是 `main` 上一次聚焦的 commit —— 完全可复现；定量改善按相同 persona 拆分计算，确保不是 topic 选择的运气。完整可交互版本见 [docs/index.html 的 Evolution section](https://plevantem.github.io/queryMaker/#evolution)。

---

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

## 局限与已知边界

合成数据这件事有边界 —— 把可信度建在多维证据网上，需要先把边界讲清楚：

- **persona 池子目前是 5 类 archetype 的小集合** —— 在 UI 产品场景内是按 L2 语义最佳匹配
  定向选出的，覆盖头部典型用户；对长尾用户类型的代表性还需要真实日志反向验证。
- **多样性目前主要测到 lexical（trigram-Jaccard）层和 corpus 分布层** ——
  semantic / 任务分布 / 判别器层的更深证据本仓库范围内未覆盖。
- **端到端下游验证未做** —— 即「合成数据加入训练后下游模型能力的变化」这一终极证据，
  受限于下游训练资源，本仓库未覆盖。接入方建议在自己的训练场景下做一次受控对比。
- **某些 L2 场景的 corpus 偏窄时，persona 通道补不上** —— mode collapse 在此条件下仍可能发生。
  现状：在 `data/intermediate/scenario_specs/` 标记了已识别的窄场景，实际使用时建议
  增量补 corpus 而不是堆 persona。
- **真实性评估目前主要靠设计专家盲评 + 启发式评分**（authenticity / specificity / diversity 三轴），
  缺冷指标（判别器 AUC、分布距离）的对照。

> 主动列出这些不是「自爆」 —— 是把可信度建在多维证据网上，
> 也让接入方知道在自己的场景里需要补哪一段。

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

本项目站在以下几条研究线的肩膀上。**方法论谱系**大致是：
Self-Instruct (2022) → Evol-Instruct (2023) → Magpie (2024) → Persona Hub (2024) → 本仓库（双通道 + 白盒分布锚定 + 4 档 ablation）。

每条引用都附上具体的「借鉴点」与「本仓库的差异」，便于复用本项目的人定位思想源头，
也便于做相关方向研究的同行交叉引用。

### 合成数据路线谱系（baseline 全景）

- **Self-Instruct: Aligning Language Models with Self-Generated Instructions** — Wang et al., 2022. [arXiv:2212.10560](https://arxiv.org/abs/2212.10560) —— *instance-driven* 合成的起点：基于种子样本扩散。
- **Evol-Instruct / WizardLM** — Xu et al., 2023. [arXiv:2304.12244](https://arxiv.org/abs/2304.12244) —— 在 instance-driven 路线上加入复杂度演化。
- **Magpie: Alignment Data Synthesis from Scratch by Prompting Aligned LLMs with Nothing** — Xu et al., 2024. [arXiv:2406.08464](https://arxiv.org/abs/2406.08464) —— *self-play* 路线：直接采样 LLM 内部分布，无 prompt 控制信号。

### Persona-driven synthetic data（本项目方法论锚点）

- **Scaling Synthetic Data Creation with 1,000,000,000 Personas** (PersonaHub) — Tao Ge, Xin Chan, Xiaoyang Wang, Dian Yu, Haitao Mi, Dong Yu. Tencent AI Lab, 2024. [arXiv:2406.20094](https://arxiv.org/abs/2406.20094) · [代码](https://github.com/tencent-ailab/persona-hub)
  - **借鉴点**：「persona 是 LLM 内在多视角索引、是合成数据多样性的中间抽象」这个判断 —— 本项目把它作为 *who / how* 通道的方法论锚点。
  - **本仓库的差异（同时也是 §「与 Persona Hub 的差异」详细展开）**：
    (1) 不依赖通用 10 亿 persona 池子，而是基于产品场景反推 **5 类定向 archetype**（`maker / planner / curator / operator / founder_like`），按 L2 语义最佳匹配分配；
    (2) 加入原论文没有的 **corpus 通道**做白盒分布锚定（Layer-A `corpus_usage.json` 跨批次最少使用优先）；
    (3) 补齐原论文未做的 **4 档横向 ablation**（`llm-direct` / `corpus-direct` / `persona-direct` / `corpus+persona`），定量验证两个通道的边际贡献。

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
