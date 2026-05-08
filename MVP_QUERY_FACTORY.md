# Query Factory V2

当前主链路已经升级为 v2：

`需求表格 -> 场景清洗 -> generation plan.v2 -> persona-driven query 生成 -> 评分 -> SQLite -> Dashboard`

## 目录约定

- `data/input/`: 原始输入
- `data/intermediate/scenario_spec.v2.json`: 解析后的场景规范
- `data/intermediate/generation_plan.v2.jsonl`: 首轮生成计划
- `data/intermediate/backfill_plan.v2.jsonl`: 补齐计划
- `data/output/raw_queries.v2.jsonl`: 生成结果
- `data/output/scored_queries.v2.jsonl`: 评分结果
- `data/db/queries_v2.sqlite`: SQLite 文件
- `data/reports_v2/dashboard.html`: 本地查看页面
- `data/reports_v2/summary.json`: 分布统计摘要

## 已实现命令

```bash
npm run parse:requirements
npm run plan:seed
npm run plan:backfill
npm run generate:queries
npm run score:queries
npm run import:queries
npm run build:dashboard
```

一键跑完整链路：

```bash
npm run run:mvp
```

## 默认行为

- 自动读取工作区内第一个 `.xlsx` 文件作为需求输入
- 默认产出 v2 场景 schema，不再直接把 `l2_scene_raw` 原样带入 query
- 首轮 plan 会显式覆盖 `vague / medium / complex`
- 默认 `generate:queries` 走 `persona-fallback`，即 persona-driven 主链路的本地可运行实现
- 如果后续接入 Cursor 或外部 LLM，可把 `generate:queries` 改成 `prompt-packets` 模式，输出 prompt 包交给模型执行

## 关键数据结构

### `scenario_spec.v2.json`

每个场景至少包含：

- `id`
- `l1_scene`
- `l2_scene_raw`
- `l2_scene_label`
- `l2_scene_examples`
- `application_type_candidates`
- `target_count`
- `source_row_id`

### `generation_plan.v2.jsonl`

每条任务至少包含：

- `query_id`
- `scene_id`
- `l1_scene`
- `l2_scene_label`
- `application_type`
- `product_type`（元数据；`constrained: true` 时才注入 LLM prompt）
- `constrained`（boolean；默认 `false`；补充生成时设为 `true`）
- `target_complexity`
- `design_style`
- `persona_seed`（同组 3 条任务共享，格式 `sha1(scene_id:app:groupIndex)`）

### `queries` 表

当前 v2 保留字段：

- `id`
- `scene_id`
- `query_text`
- `l1_scene`
- `l2_scene_label`
- `application_type`
- `product_type`
- `target_complexity`
- `persona_id`
- `persona_title`
- `persona_source`
- `design_style`
- `quality_score`
- `quality_pass`
- `complexity_level`
- `created_at`

## 当前限制

- persona-driven 链路当前默认走本地 deterministic fallback，以便离线可跑
- 评分当前仍为启发式版本，不是 LLM 评分
- Dashboard 是自包含静态 HTML，适合 5k 以内数据查看
- SQLite 基于 `sql.js` 落盘，不依赖本地 Python/编译环境

## 后续最自然的扩展

1. ~~把 `persona_synthesis_prompt` 和 `query_from_persona_prompt` 接到 Cursor 或外部 LLM~~ ✅ 已实现（`batch-generate-queries.js` + `scripts/lib/llm-batch.js`，支持 `claude-cli / openai / anthropic`）
2. 把 `score:queries` 接到精简版 `p5` 评分流程
3. 把 `plan:backfill` 从”按场景补齐”扩展到”按 application_type / complexity 热区补齐”

