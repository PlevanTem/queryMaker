# UI QueryMaker Pipeline — 论文架构图

> 面向论文展示的核心工作流方法论全景图。
> 严格基于当前仓库的实际实现，未落地的研究设想标注为 future work。

---

## 1. 端到端实现链路（Top-Level Pipeline）

当前可运行的 v2 主链路，一条命令跑通。

```mermaid
flowchart LR
    A["Excel\n需求表格\n(.xlsx)"]
    B["场景解析\n+ 清洗"]
    C["Generation Plan\n(seed / backfill)"]
    D["Persona-Driven\nQuery 生成"]
    E["启发式\n质量评分"]
    F["SQLite\n入库"]
    G["静态\nDashboard"]

    A --> B --> C --> D --> E --> F --> G
```

实际运行命令：

```text
npm run run:mvp
  → parseRequirementsFromWorkbook()
  → buildSeedPlan()
  → generateQueryRecords()       # 默认 persona-fallback，可选 llm-openai / llm-anthropic
  → scoreQueryRecords()
  → importIntoDatabase()
  → buildDashboardAssets()
```

---

## 2. 场景解析与清洗（Stage: Parse & Normalize）

从 Excel 原始需求到结构化场景规范。核心目标：**不让 `l2_scene_raw` 原样污染下游 query**。

```mermaid
flowchart TD
    subgraph INPUT ["输入"]
        X["Excel 需求表\n(含合并单元格)"]
    end

    subgraph PARSE ["解析"]
        P1["fillMergedCells()\n展平合并行"]
        P2["detectHeaderIndex()\n定位 '一级场景' / '二级场景' 列"]
        P3["parseRawRequirements()\n逐行提取 l1_scene, l2_scene_raw, target_count"]
    end

    subgraph CLEAN ["清洗 & 规范化"]
        C1["splitSceneText()\n'① 个人生活类（旅行回忆、年度相册）'\n→ label: '个人生活'\n→ examples: ['旅行回忆', '年度相册']"]
        C2["inferApplicationTypeCandidates()\n关键词匹配 → '旅行回忆应用', '年度相册应用' ..."]
    end

    subgraph OUTPUT ["输出"]
        O["scenario_spec.v2.json\n每条含 id, l1_scene, l2_scene_label,\nl2_scene_examples,\napplication_type_candidates,\ntarget_count"]
    end

    INPUT --> PARSE --> CLEAN --> OUTPUT

    style CLEAN fill:#fff3e0,stroke:#E65100
```

关键设计：`l2_scene_raw` 被拆为 `l2_scene_label`（语义标签）和 `l2_scene_examples`（示例列表），括号内的原始示例不会直接进入 query 文本。

---

## 3. Generation Plan 构建

Plan 阶段为每条待生成 query 预先分配维度组合，实现分布可控。

```mermaid
flowchart TD
    subgraph SPEC ["scenario_spec.v2.json"]
        S1["每个 scenario:\n- application_type_candidates\n- l1_scene / l2_scene_label\n- target_count"]
    end

    subgraph SEED ["buildSeedPlan()"]
        SD1["计算每场景 seed 数量\nmin(9, max(3, target_count × 0.15))"]
        SD2["以 groupIndex = ⌊i/3⌋ 为单位\n分配 application_type\n同组 3 条任务共享同一 app"]
        SD3["同组内轮转 target_complexity\nvague → medium → complex\n保证同一 persona 覆盖三档"]
        SD4["关键词推断 product_type\ninferProductTypes()\n作为元数据，默认不注入 prompt"]
        SD5["关键词推断 design_style\ninferStyles()\n同组 3 条任务共享"]
        SD6["生成 persona_seed\nsha1(scene_id:app:groupIndex)\n同组 3 条任务相同"]
    end

    subgraph BACKFILL ["buildBackfillPlan()"]
        BF1["统计已有 query 的\nscene × complexity 覆盖"]
        BF2["对缺口场景以 groupIndex 分组补齐\n同组天然 1:1:1 复杂度平衡"]
    end

    subgraph PLAN ["generation_plan.v2.jsonl"]
        PL["每条任务:\n{query_id, scene_id,\napplication_type, product_type,\nconstrained, target_complexity,\ndesign_style, persona_seed}"]
    end

    SPEC --> SEED --> PLAN
    SPEC --> BACKFILL --> PLAN

    style SEED fill:#e8f4fd,stroke:#1976D2
    style BACKFILL fill:#e3f2fd,stroke:#42A5F5
```

### 维度空间（实际实现）

Plan 通过关键词推断（非 LLM）组合以下维度：

```text
Query_task = f(application_type, product_type, target_complexity, design_style, persona_seed)
```

| 维度                 | 来源                          | 实际规模         |
| -------------------- | ----------------------------- | ---------------- |
| application_type     | 从 l2_scene_examples 关键词推断 + 20 条规则 | 随输入 Excel 而定 |
| product_type         | 关键词推断（元数据）；`constrained: true` 时注入 prompt | 13 种 |
| target_complexity    | 固定三档轮转                    | vague / medium / complex |
| design_style         | 关键词规则 → 10 种 + null       | 11 种            |
| persona_seed         | SHA1 确定性哈希                 | 每条唯一          |

---

## 4. Persona-Driven Query 生成（核心链路）

不直接从字段拼 query，而是 **先构造 persona，再由 persona 驱动 query 生成**。这是与模板拼接方法的关键区别。

### 4.1 默认模式：persona-fallback（确定性本地生成）

```mermaid
flowchart TD
    subgraph TASK ["plan task"]
        T1["application_type\nproduct_type\ntarget_complexity\ndesign_style\npersona_seed"]
    end

    subgraph PERSONA ["buildPersonaSpec()"]
        PA1["persona_seed → pickSeeded()\n从 5 种 archetype 中选一个:\nmaker / planner / curator /\noperator / founder_like"]
        PA2["生成 persona 对象:\n- persona_title\n- persona_description\n- persona_style_hint\n- user_goal\n- domain_familiarity"]
    end

    subgraph QUERY ["synthesizeQueryFromPersona()"]
        QG1["根据 target_complexity\n选择不同生成模板"]
        QG2["vague: 2-3 句高层描述"]
        QG3["medium: 含结构和交互要求"]
        QG4["complex: 含多模块 +\n交互 + 响应式要求"]
        QG1 --> QG2 & QG3 & QG4
    end

    subgraph OUT ["输出"]
        O["raw_queries.v2.jsonl\n每条含 query_text +\npersona_id, persona_title,\npersona_source"]
    end

    TASK --> PERSONA --> QUERY --> OUT

    style PERSONA fill:#fff3e0,stroke:#FF9800
    style QUERY fill:#e8f5e9,stroke:#4CAF50
```

5 种 persona archetype 的设计逻辑：

| archetype      | 角色含义                 | vague 风格           | complex 风格             |
| -------------- | ----------------------- | -------------------- | ----------------------- |
| maker          | 正在自己动手做产品的人      | 口语，只给大方向         | 目标 + 内容 + 交互都讲清楚 |
| planner        | 在整理需求和表达想法的人    | 说效果不说细节          | 功能边界 + 体验目标完整    |
| curator        | 在整理内容与展示方式的人    | 在意整体感觉           | 内容结构 + 导航 + 浏览行为 |
| operator       | 需要更高效管理信息的人      | 只说想解决的问题         | 筛选 + 状态 + 异常场景     |
| founder_like   | 追求产品感觉和记忆点的人    | 描述气质和方向          | 风格 + 品牌感 + 多模块     |

### 4.2 LLM 模式：llm-openai / llm-anthropic（真实模型调用）

```mermaid
flowchart TD
    subgraph TASK ["plan task"]
        T["维度组合 + persona_seed"]
    end

    subgraph STEP1 ["Step 1: Persona Synthesis (LLM)"]
        S1P["buildPersonaSynthesisPrompt()\n构造 persona 合成 prompt"]
        S1C["callOpenAiCompatibleChat()\n或 callAnthropicCompatibleMessages()\ntemperature=0.8"]
        S1N["normalizePersonaSpec()\n解析 JSON → persona 对象\n(解析失败自动 fallback)"]
        S1P --> S1C --> S1N
    end

    subgraph STEP2 ["Step 2: Query Generation (LLM)"]
        S2P["buildQueryPromptFromPersona()\n注入 persona + 场景 + 复杂度"]
        S2C["LLM 调用\ntemperature=0.95"]
        S2N["normalizeQueryOutput()\n清理 code fence / 引号"]
        S2P --> S2C --> S2N
    end

    subgraph OUT ["输出"]
        O["raw_queries.v2.jsonl\npersona_source: 'llm_persona_synthesis'\nllm_model / llm_usage 已记录"]
    end

    TASK --> STEP1 --> STEP2 --> OUT

    style STEP1 fill:#e8eaf6,stroke:#3F51B5
    style STEP2 fill:#e8f5e9,stroke:#388E3C
```

关键实现细节：
- 支持三种 transport：`claude-cli`（Claude Code CLI 子进程）、`openai`（OpenAI 兼容接口）、`anthropic`（Anthropic Messages 接口）
- **Persona 缓存**：同组 3 条任务共享同一 `persona_seed`，LLM persona 调用只发起一次，其余任务 await 同一 Promise，零重复调用
- `product_type` 默认不注入 LLM prompt（open path）；`constrained: true` 时才显式注入 persona + query 两步 prompt（supplementation path）
- 并发控制（默认 concurrency=3）+ 超时 + 重试
- Persona 解析失败时自动降级到 deterministic fallback
- Windows 系统代理自动检测 + 不安全 TLS 可选

---

## 5. 启发式质量评分

当前实现的评分是**基于规则的启发式版本**，不是 LLM 评分。

```mermaid
flowchart TD
    subgraph INPUT ["scored query input"]
        Q["query_text + metadata"]
    end

    subgraph COMPLEXITY ["inferActualComplexity()"]
        IC1["word count ≥ 70\n或有结构化 block\n或 interaction 关键词 ≥ 5"]
        IC2["→ complex"]
        IC3["word count ≥ 28\n或 interaction 关键词 ≥ 2"]
        IC4["→ medium"]
        IC5["其余 → vague"]
        IC1 --> IC2
        IC3 --> IC4
    end

    subgraph SCORING ["scoreQueryRecord()"]
        AU["authenticity (1-5)\n+1 if 非简单模板句\n+1 if length ≥ 45"]
        SP["specificity (1-5)\n+1 if 含 UI 关键词\n+1 if 非 vague\n+1 if 含标点/编号"]
        DV["diversity (1-5)\n+1 if 有 design_style\n+1 if 非通用 app_type\n+1 if 有 persona_title"]
    end

    subgraph TOTAL ["质量总分"]
        T["total = AU×0.4 + SP×0.4 + DV×0.2\nquality_pass = total ≥ 2.8"]
    end

    INPUT --> COMPLEXITY
    INPUT --> SCORING
    SCORING --> TOTAL

    style SCORING fill:#fce4ec,stroke:#C62828
```

输出字段：`quality_score`、`quality_pass`、`complexity_level`（实际复杂度，用于与 `target_complexity` 对比）。

---

## 6. 数据持久化与可视化

```mermaid
flowchart LR
    subgraph IMPORT ["importIntoDatabase()"]
        DB1["SQLite (sql.js)\n纯 JS，无需编译环境"]
        DB2["三张表:\nimported_requirements\nqueries\ngeneration_runs"]
        DB1 --- DB2
    end

    subgraph DASHBOARD ["buildDashboardAssets()"]
        DA1["summary.json\n8 个维度分布统计"]
        DA2["dashboard.html\n自包含静态 HTML\n含过滤器 + 条形图 + 列表"]
    end

    SQ["scored_queries\n.v2.jsonl"] --> IMPORT
    SP["scenario_spec\n.v2.json"] --> IMPORT
    IMPORT --> DASHBOARD

    style IMPORT fill:#e0f7fa,stroke:#00838F
    style DASHBOARD fill:#f3e5f5,stroke:#7B1FA2
```

Dashboard 统计维度：
- 按一级场景 / 二级场景标签 / application_type / product_type 分布
- 按目标复杂度 / 实际复杂度分布
- 按 persona 来源 / design_style 分布
- target_complexity vs actual_complexity 交叉对比

---

## 7. 完整数据记录生命周期

一条 query 从原始 Excel 行到最终 Dashboard 的完整变换路径。

```mermaid
flowchart TD
    subgraph S1 ["1. Excel Row"]
        A["一级场景: '个人生活类'\n二级场景: '① 个人生活类（旅行回忆、年度相册、画作展示）'\n预计数量: 60"]
    end

    subgraph S2 ["2. Scene Spec"]
        B["l2_scene_label: '个人生活'\nl2_scene_examples: ['旅行回忆','年度相册','画作展示']\napplication_type_candidates: ['旅行回忆应用','年度相册应用','画作展示应用']"]
    end

    subgraph S3 ["3. Plan Task"]
        C["query_id: 'q_scene_003_001'\napplication_type: '旅行回忆应用'\nproduct_type: 'portfolio'\ntarget_complexity: 'medium'\ndesign_style: 'Luxury'\npersona_seed: 'a3f2c8...'"]
    end

    subgraph S4 ["4. Persona"]
        D["archetype: 'curator'\npersona_title: '旅行回忆相关内容的真实使用者'\nstyle_hint: '会同时关注内容组织方式和浏览节奏'\ndomain_familiarity: 'medium'"]
    end

    subgraph S5 ["5. Query"]
        E["'Please build an elegant portfolio site\nfor travel memories. Make it feel editorial\nand premium with refined spacing...\nI want a clear hero section...'"]
    end

    subgraph S6 ["6. Scored"]
        F["quality_score: 3.80\ncomplexity_level: 'medium'\nquality_pass: true"]
    end

    subgraph S7 ["7. Stored"]
        G["SQLite row → Dashboard 可查询"]
    end

    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7
```

---

## 8. 生成模式对比

当前支持 4 种生成模式，覆盖从离线验证到真实 LLM 调用的完整谱系。

```mermaid
flowchart TD
    MODE{"generate:queries\n--mode ?"}

    MODE -->|persona-fallback\n(默认)| PF["确定性本地生成\npersona archetype + 模板\n无需 API Key"]
    MODE -->|llm-openai| LO["OpenAI 兼容接口\n两步 LLM 调用\npersona → query"]
    MODE -->|llm-anthropic| LA["Anthropic Messages 接口\n两步 LLM 调用\npersona → query"]
    MODE -->|template-fallback| TF["最简模板兜底\n一句话 query\n用于基线对照"]
    MODE -->|prompt-packets| PP["只输出 prompt 包\n不生成 query\n用于外接 LLM"]

    PF --> OUT["raw_queries.v2.jsonl"]
    LO --> OUT
    LA --> OUT
    TF --> OUT
    PP --> OUT

    style PF fill:#e8f5e9,stroke:#2E7D32
    style LO fill:#e3f2fd,stroke:#1565C0
    style LA fill:#ede7f6,stroke:#512DA8
    style TF fill:#fff8e1,stroke:#F57F17
    style PP fill:#efebe9,stroke:#795548
```

---

## 9. 核心设计决策

实际落地的设计选择及其背后逻辑。

```mermaid
mindmap
  root((UI QueryMaker 设计决策))
    场景先清洗再生成
      l2_scene_raw 拆为 label + examples
      避免 Excel 原始文本污染 query
      application_type 关键词推断
    Persona-Driven 两步生成
      先合成 persona 再生成 query
      5 种 archetype x 3 档 complexity
      persona 与复杂度解耦，不因 complexity 而变化
      参考 Persona Hub 方法论
    Complexity 前置分配
      plan 阶段指定 vague/medium/complex
      生成后启发式回判 actual complexity
      交叉对比验证分布一致性
    确定性可复现
      persona_seed 基于 SHA1 哈希
      pickSeeded 保证相同输入相同输出
      离线可跑通 无外部依赖
    中间产物全落盘
      scenario_spec / plan / raw / scored
      JSONL 格式便于行级排查
      SQLite 支持 SQL 分析
    多模式可切换
      persona-fallback 离线验证
      llm-openai / llm-anthropic 真实调用
      template-fallback 基线对照
      prompt-packets 外接 LLM
```

---

## 10. Prompt 资产与代码函数映射

仓库中有两套 prompt 资产，它们与运行时函数的关系不同。

```mermaid
flowchart TD
    subgraph ACTIVE ["当前代码使用的 Prompt 资产"]
        PA["persona_synthesis_prompt.md\n→ buildPersonaSynthesisPrompt()"]
        PB["query_from_persona_prompt.md\n→ buildQueryPromptFromPersona()"]
    end

    subgraph CODE ["运行时核心函数"]
        F1["parseRequirementsFromWorkbook()"]
        F2["buildSeedPlan() / buildBackfillPlan()"]
        F3["buildPersonaSpec()\n(deterministic fallback)"]
        F4["synthesizeQueryFromPersona()\n(deterministic fallback)"]
        F5["generateQueryRecordWithLlm()\n(LLM mode)"]
        F6["scoreQueryRecord()"]
        F7["importIntoDatabase()"]
        F8["buildDashboardAssets()"]
    end

    subgraph ARCHIVE ["研究版设计 (未接入运行时)"]
        P1["p1_industry_generation.md"]
        P2["p2_product_derivation.md"]
        P3["p3_social_extraction.md"]
        P4["p4_persona_query_gen.md"]
        P5["p5_quality_scoring.md"]
    end

    PA -.->|"LLM mode 使用"| F5
    PB -.->|"LLM mode 使用"| F5

    style ACTIVE fill:#e8f5e9,stroke:#2E7D32,stroke-width:2px
    style CODE fill:#e3f2fd,stroke:#1565C0
    style ARCHIVE fill:#fff8e1,stroke:#F57F17,stroke-dasharray:5 5
```

---

## 11. 方法论动机：解决现有数据集的三个盲区

本流水线的设计动机来自对现有前端代码生成基准的分析。

```mermaid
flowchart TD
    subgraph GAP ["现有基准的盲区"]
        E1["缺乏业务语境\n(Design2Code [R1], WebUIBench [R2])\n测试用例来自随机网页截图"]
        E2["设计风格不可区分\n无法评估 glassmorphism\nvs minimalism 的生成差异"]
        E3["用户角色单一\n指令均为工程化描述\n缺少不同角色表达方式"]
    end

    subgraph SOLUTION ["本流水线的应对"]
        O1["场景驱动的层级分类\nExcel → l1/l2_scene → application_type\n→ 业务语境在 plan 阶段注入"]
        O2["design_style 作为独立维度\n10 种风格 + 关键词亲和推断\n风格约束注入 query prompt"]
        O3["persona archetype 机制\n5 种表达风格 × 3 档复杂度\npersona 先于 query 生成"]
    end

    E1 -->|"解决"| O1
    E2 -->|"解决"| O2
    E3 -->|"解决"| O3

    style GAP fill:#ffebee,stroke:#C62828
    style SOLUTION fill:#e8f5e9,stroke:#2E7D32
```

---

## 12. 已实现 vs 研究蓝图

清晰区分当前可运行实现与 ARCHIVE 中未落地的设计。

```mermaid
flowchart TD
    subgraph IMPL ["✅ 已实现 (v2 MVP)"]
        direction TB
        I1["Excel → 场景解析清洗"]
        I2["关键词推断\napplication_type / product_type / style"]
        I3["seed plan + backfill plan"]
        I4["5 archetype persona fallback"]
        I5["LLM 两步生成\n(OpenAI + Anthropic)"]
        I6["启发式 3 维评分\n+ complexity 回判"]
        I7["SQLite 入库"]
        I8["静态 Dashboard"]
    end

    subgraph FUTURE ["🔲 研究蓝图 (未落地)"]
        direction TB
        F1["Multi-LLM 行业分类\n+ Borda Count 聚合 (P1)"]
        F2["LLM 产品类型衍生 (P2)"]
        F3["Reddit / PH / Twitter\n社交数据爬取 (P3)"]
        F4["社交语境注入 persona"]
        F5["LLM 三维评分\n+ 多维标签打标 (P5)"]
        F6["MinHash 近似去重"]
        F7["质量门控 +\n重新生成队列"]
        F8["行业-风格亲和权重矩阵\n(当前用关键词规则替代)"]
    end

    style IMPL fill:#e8f5e9,stroke:#2E7D32,stroke-width:2px
    style FUTURE fill:#fff8e1,stroke:#F57F17,stroke-dasharray:5 5
```

---

## 13. 关键产出文件

| 路径                                         | 内容                    | 格式      |
| -------------------------------------------- | ---------------------- | --------- |
| `data/intermediate/scenario_spec.v2.json`    | 清洗后的场景规范          | JSON      |
| `data/intermediate/generation_plan.v2.jsonl` | 首轮生成任务列表          | JSONL     |
| `data/intermediate/backfill_plan.v2.jsonl`   | 覆盖补齐任务列表          | JSONL     |
| `data/output/raw_queries.v2.jsonl`           | 生成后的原始 query       | JSONL     |
| `data/output/scored_queries.v2.jsonl`        | 带评分和复杂度标签的 query | JSONL     |
| `data/db/queries_v2.sqlite`                  | 最终分析数据库            | SQLite    |
| `data/reports_v2/summary.json`               | 8 维分布统计摘要          | JSON      |
| `data/reports_v2/dashboard.html`             | 静态可视化报表            | HTML      |

---

## 引用说明

方法论设计参考了以下工作（详见 `ARCHIVE/references.md`）：

- **Persona Hub [R5]**：persona-driven synthetic data 框架，5 种 archetype 设计的方法论来源
- **PERSONA Benchmark [R6]**：验证基于 persona 属性生成合成数据的统计可靠性
- **WebGen-Bench [R4]**：13 小类产品类型分类法，直接用于 `PRODUCT_TYPE_LABELS`
- **Design2Code [R1]** / **WebUIBench [R2]**：揭示现有基准在业务语境和设计风格上的盲区
