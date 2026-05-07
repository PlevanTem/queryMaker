# Stage 4 · 数据清洗 / 标签 / 入库 / 质检

> **目标**：对 Stage 3 生成的原始 Query 进行系统性清洗、多维度标签打标、结构化入库，并通过抽样质检保障数据集的质量和分布均衡性。

**理论支撑**: [R4] WebGen-Instruct 的 human+GPT-4o 协作质检流程，[R1] Design2Code 的人工精筛方法论

---

## 流程总览

```
raw_queries/           Stage 3 输出
    │
    ▼
[4.1] 预筛选           格式校验 + 基础质量过滤
    │
    ▼
[4.2] MinHash 去重     相似度去重（阈值 0.85）
    │
    ▼
[4.3] LLM 多维标签     自动打标（复杂度/组件类型/技术栈等）
    │
    ▼
[4.4] 分区入库         SQLite + JSONL 分区存储
    │
    ▼
[4.5] 抽样质检         LLM 评分 + 人工复核
    │
    ▼
[4.6] 分布报告         覆盖度统计 + 可视化
    │
    ▼
queries_clean.db       最终数据集
```

---

## 4.1 预筛选（Rule-Based Filter）

在 LLM 处理之前，用规则快速淘汰明显低质数据：

```python
def prefilter(query: dict) -> tuple[bool, str]:
    """
    返回 (是否通过, 拒绝原因)
    """
    text = query.get("query", "")

    # 长度检查
    if len(text) < 30:
        return False, "too_short"
    if len(text) > 600:
        return False, "too_long"

    # 语言检查（主要接受中文/英文，混合也可）
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    total_chars = len(text.replace(" ", ""))
    if total_chars > 0 and chinese_chars / total_chars < 0.05 and not is_english(text):
        return False, "unsupported_language"

    # 内容相关性检查
    ui_keywords = [
        "页面", "组件", "界面", "按钮", "布局", "样式", "设计",
        "page", "component", "UI", "layout", "button", "design",
        "dashboard", "form", "card", "modal", "navbar"
    ]
    if not any(kw.lower() in text.lower() for kw in ui_keywords):
        return False, "not_ui_related"

    # LLM 生成失败标志
    failure_patterns = ["对不起", "I cannot", "As an AI", "I'm sorry", "抱歉"]
    if any(p in text for p in failure_patterns):
        return False, "llm_refusal"

    return True, ""
```

**预期过滤率**: 约 5-10%

---

## 4.2 MinHash 去重

使用 MinHash 算法检测近重复 Query，避免模型训练时记忆重复模式：

```python
from datasketch import MinHash, MinHashLSH
import re

def tokenize(text: str) -> list[str]:
    """字符级 n-gram（n=3），适合中英文混合"""
    text = re.sub(r'\s+', ' ', text.strip().lower())
    return [text[i:i+3] for i in range(len(text) - 2)]

def build_minhash(text: str, num_perm: int = 128) -> MinHash:
    m = MinHash(num_perm=num_perm)
    for gram in tokenize(text):
        m.update(gram.encode('utf8'))
    return m

def dedup_queries(queries: list[dict], threshold: float = 0.85) -> list[dict]:
    """
    移除 Jaccard 相似度 >= threshold 的近重复条目
    保留每组中分数最高的一条
    """
    lsh = MinHashLSH(threshold=threshold, num_perm=128)
    minhashes = {}

    # 建索引
    for i, q in enumerate(queries):
        m = build_minhash(q["query"])
        minhashes[i] = m
        try:
            lsh.insert(str(i), m)
        except ValueError:
            pass  # 重复键，跳过

    # 找出重复组
    seen = set()
    keep = []
    for i, q in enumerate(queries):
        if i in seen:
            continue
        candidates = lsh.query(minhashes[i])
        group = [int(c) for c in candidates if int(c) != i]
        for j in group:
            seen.add(j)
        keep.append(q)

    removal_rate = (len(queries) - len(keep)) / len(queries)
    print(f"去重：{len(queries)} → {len(keep)}（移除 {removal_rate:.1%}）")
    return keep
```

**预期去重率**: 约 10-20%（主要来自同一象限的近似 Query）

---

## 4.3 LLM 多维标签打标

对通过去重的每条 Query，调用 LLM 批量打标（批次大小 50，降低 API 成本）：

**标签 Schema**:

```python
LABEL_SCHEMA = {
    "complexity_level": "simple | medium | complex",
    # simple: 单组件，无复杂交互
    # medium: 多组件，有状态管理
    # complex: 完整页面，含数据流/动效/多交互

    "component_types": ["navbar", "card", "table", "chart", "form", "modal",
                        "sidebar", "button", "input", "tabs", "carousel", ...],
    # 多选，Query 中涉及的 UI 组件类型

    "has_data_viz": True | False,
    # 是否涉及图表、统计数据展示

    "mobile_responsive": True | False | None,
    # 是否明确要求移动端适配（None=未提及）

    "tech_stack": ["React", "Vue", "Next.js", "Tailwind", "CSS", "HTML",
                   "TypeScript", "Framer Motion", ...],
    # 多选，Query 中明确提到的技术栈

    "interaction_types": ["click", "hover", "drag", "scroll", "animation",
                           "form_submit", "real_time", "filter", ...],
    # 多选，涉及的交互类型

    "explicit_style": True | False,
    # Query 中是否显式提到了设计风格（玻璃拟态/极简等）

    "reference_product": "string | null",
    # 是否提到竞品/参考产品（如 "像 Notion 那样"）

    "query_type": "greenfield | modification | component_level | page_level",
    # greenfield=从零构建，modification=修改现有，component=单组件，page=完整页面
}
```

**打标提示词**（完整版见 `prompts/p5_quality_scoring.md`）:

```
以下是一条前端 UI 开发需求 Query:
---
{query_text}
---
请按照如下 JSON schema 为其打标（严格输出 JSON，无需解释）:
{schema_definition}
```

---

## 4.4 分区入库（SQLite + JSONL）

### SQLite 表结构

```sql
CREATE TABLE queries (
    id              TEXT PRIMARY KEY,
    query_text      TEXT NOT NULL,
    industry_l1     TEXT NOT NULL,
    industry_l2     TEXT NOT NULL,
    product_type    TEXT NOT NULL,
    user_role       TEXT NOT NULL,
    design_style    TEXT NOT NULL,

    -- 打标字段
    complexity_level    TEXT,
    has_data_viz        INTEGER,   -- 0/1
    mobile_responsive   INTEGER,   -- 0/1/NULL
    explicit_style      INTEGER,   -- 0/1
    query_type          TEXT,
    component_types     TEXT,      -- JSON 数组序列化
    tech_stack          TEXT,      -- JSON 数组序列化
    interaction_types   TEXT,      -- JSON 数组序列化
    reference_product   TEXT,

    -- 质检字段
    quality_score       REAL,      -- LLM 质检总分 (1-5)
    score_authenticity  REAL,      -- 真实性分 (1-5)
    score_specificity   REAL,      -- 具体性分 (1-5)
    score_diversity     REAL,      -- 差异性分 (1-5)
    is_human_reviewed   INTEGER DEFAULT 0,
    human_review_note   TEXT,

    -- 元数据
    social_context_id   TEXT,
    is_multi_turn       INTEGER DEFAULT 0,
    turn_index          INTEGER,
    generated_at        TEXT,
    inserted_at         TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_industry ON queries(industry_l1, industry_l2);
CREATE INDEX idx_style ON queries(design_style);
CREATE INDEX idx_complexity ON queries(complexity_level);
CREATE INDEX idx_quality ON queries(quality_score);
```

### 入库脚本

```python
import sqlite3
import json
from pathlib import Path

def insert_queries(db_path: str, queries: list[dict]):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.executemany("""
        INSERT OR IGNORE INTO queries
        (id, query_text, industry_l1, industry_l2, product_type, user_role,
         design_style, complexity_level, has_data_viz, mobile_responsive,
         explicit_style, query_type, component_types, tech_stack,
         interaction_types, reference_product, social_context_id,
         is_multi_turn, turn_index, generated_at)
        VALUES
        (:id, :query, :industry_l1, :industry_l2, :product_type, :user_role,
         :design_style, :complexity_level, :has_data_viz, :mobile_responsive,
         :explicit_style, :query_type, :component_types_json, :tech_stack_json,
         :interaction_types_json, :reference_product, :social_context_id,
         :is_multi_turn, :turn_index, :generated_at)
    """, [prepare_row(q) for q in queries])

    conn.commit()
    conn.close()
    print(f"入库完成：{len(queries)} 条")
```

---

## 4.5 抽样质检

参考 WebGen-Bench [R4] 的 GPT-4o + 人工过滤方法，采用两级质检：

### Level 1：LLM 自动评分（100% 覆盖）

对全量数据调用 LLM 质检提示词（见 `prompts/p5_quality_scoring.md`），三个维度各 1-5 分：

| 维度 | 定义 | 评分标准 |
|------|------|---------|
| **真实性** (Authenticity) | Query 是否像真实用户发出 | 5=完全像真人，1=明显是模板生成 |
| **具体性** (Specificity) | 需求是否具体可实施 | 5=可直接编码，1=过于抽象 |
| **差异性** (Diversity) | 与同行业其他 Query 的区分度 | 5=独特场景，1=高度同质 |

**总分 = (Authenticity × 0.4 + Specificity × 0.4 + Diversity × 0.2)**

**过滤阈值**: 总分 < 2.5 的 Query 移入 `quarantine` 表，不进入最终数据集

### Level 2：人工抽样复核（每个 Industry_L2 × Design_Style 组合抽 5 条）

```python
def create_review_sample(db_path: str, sample_per_cell: int = 5) -> list[dict]:
    """
    按 (industry_l2 × design_style) 分层抽样
    优先抽取 LLM 评分在 2.5-3.5 的边界样本（最需要人工判断的区间）
    """
    conn = sqlite3.connect(db_path)

    # 抽取边界样本
    borderline = conn.execute("""
        SELECT * FROM queries
        WHERE quality_score BETWEEN 2.5 AND 3.5
        ORDER BY RANDOM()
        LIMIT ?
    """, (sample_per_cell * 100,)).fetchall()

    # 按 (industry_l2, design_style) 分组后各取 sample_per_cell 条
    return stratified_sample(borderline, ["industry_l2", "design_style"], sample_per_cell)
```

**人工复核结果**写回 `is_human_reviewed=1` 和 `human_review_note` 字段。

---

## 4.6 分布统计报告

生成 `distribution_report.json` 用于检查数据分布均衡性：

```python
def generate_distribution_report(db_path: str) -> dict:
    conn = sqlite3.connect(db_path)

    report = {
        "total_queries": 0,
        "by_industry_l1": {},          # 各 L1 行业条数
        "by_product_type": {},         # 各产品类型条数
        "by_user_role": {},            # 各用户角色条数
        "by_design_style": {},         # 各设计风格条数
        "by_complexity": {},           # 各复杂度条数
        "by_query_type": {},           # 各 Query 类型条数
        "quality_distribution": {      # 质量分分布
            "excellent": 0,            # >=4.0
            "good": 0,                 # 3.0-4.0
            "acceptable": 0,           # 2.5-3.0
            "quarantine": 0            # <2.5
        },
        "coverage_matrix": {},         # (industry_l2 × design_style) 覆盖热图数据
        "multi_turn_ratio": 0.0,
        "explicit_style_ratio": 0.0,
        "avg_query_length": 0.0,
        "tech_stack_distribution": {}
    }

    # ... 执行 SQL 查询填充各字段 ...

    return report
```

**报告输出路径**: `data/distribution_report.json`

---

## 最终数据集规模目标

| 指标 | 目标值 |
|------|-------|
| 原始 Query 生成量 | 15,000 - 25,000 条 |
| 预筛选后 | ~22,000 条 |
| 去重后 | ~18,000 条 |
| LLM 质检通过（>2.5分）| ~15,000 条 |
| 进入最终数据集 | **10,000 - 15,000 条** |
| 其中人工复核比例 | ≥5%（~600 条） |
| 多轮对话比例 | ~10%（~1,200 条） |
| 设计风格覆盖 | 10种全覆盖 |
| 行业覆盖 | L1 ≥15类，L2 ≥50类 |
| 平均 query 长度 | 80-180 字 |

---

## 执行入口

```bash
# 完整执行 Stage 4
python scripts/run_data_cleaning.py \
  --input data/raw_queries/ \
  --output data/queries_clean.db \
  --dedup-threshold 0.85 \
  --quality-threshold 2.5 \
  --report-output data/distribution_report.json
```
