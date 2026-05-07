# raw_queries.7l1 — 7 个一级场景 × 简中难（21 条）

**生成时间：** 见 `raw_queries.7l1.jsonl` 内 `created_at`（约 `2026-04-27T10:53:51Z`）  
**模型：** `gemini-3.1-pro-preview` · **模式：** `llm-openai`（每任务 persona + query 各 1 次 LLM）  
**排除：** 一级场景「深度研究展示」（与 `trial_3c` 重叠，脚本内 `EXCLUDE_L1` 可改）

## 产物路径

| 文件 | 说明 |
|------|------|
| `data/intermediate/generation_plan.7l1.jsonl` | 21 条 plan（`buildSeedPlan` · `minSeed=maxSeed=3`） |
| `data/output/raw_queries.7l1.jsonl` | 21 条生成结果 |

## 选取规则

在 `scenario_spec.v2.json` 中按 **首次出现** 为每个不同 `l1_scene` 取 **1 条 scenario**（跳过 `深度研究展示`），取满 **7** 个一级场景；每个场景 **3** 条任务，难度轮换覆盖 **vague / medium / complex**（顺序随 `scenarioIndex` 旋转，与主链路 `buildSeedPlan` 一致）。

## 一级场景与 scene_id

| # | 一级场景 | scene_id | 二级场景（L2）摘要 |
|---|----------|----------|-------------------|
| 1 | 交互方式 | `scene_006` | Adding & Creating 新建与创建 |
| 2 | 实用工具 | `scene_016` | 计算器/换算器 ★ |
| 3 | 教育学习 | `scene_024` | 闪卡/单词记忆 ★ |
| 4 | 办公效率 | `scene_029` | 待办清单/任务管理 ★ |
| 5 | 健康管理 | `scene_034` | 饮水/服药/习惯提醒 ★ |
| 6 | 出行助手 | `scene_039` | 行程规划器 ★ |
| 7 | 美食探店 | `scene_044` | 「今天吃什么」随机选择器 ★ |

## 任务 id 与难度（每场景 3 条）

| scene_id | vague | medium | complex |
|----------|-------|--------|---------|
| scene_006 | `q_scene_006_001` | `q_scene_006_002` | `q_scene_006_003` |
| scene_016 | `q_scene_016_003` | `q_scene_016_001` | `q_scene_016_002` |
| scene_024 | `q_scene_024_002` | `q_scene_024_003` | `q_scene_024_001` |
| scene_029 | `q_scene_029_001` | `q_scene_029_002` | `q_scene_029_003` |
| scene_034 | `q_scene_034_003` | `q_scene_034_001` | `q_scene_034_002` |
| scene_039 | `q_scene_039_002` | `q_scene_039_003` | `q_scene_039_001` |
| scene_044 | `q_scene_044_001` | `q_scene_044_002` | `q_scene_044_003` |

（上表列名表示该 `query_id` 对应的 `target_complexity`；具体以 jsonl 为准。）

## 复跑命令

```bash
# 只写 plan、不调 LLM
node scripts/plan-and-generate-7l1-scenes.js --skip-llm

# 完整生成（可改并发）
npm run generate:queries:7l1 -- --concurrency 2 --mode llm-openai
```

可选参数：`--input`（spec 路径）、`--plan-output`、`--output`、`--concurrency`。

## 说明

- `scene_039` 的 plan 里 `application_type` 可能为数据/推断产生的「旅行回忆应用」等，与 Excel 候选列表有关；若需严格对齐 L2，可改 spec 或单独写 plan。  
- 全文 query / persona 见 `raw_queries.7l1.jsonl` 各字段 `query_text`、`persona_spec`。
