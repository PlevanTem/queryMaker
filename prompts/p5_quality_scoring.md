# P5 · 数据质量评分提示词

> 用途：Stage 4 自动质检，对每条 Query 进行三维度质量评分，同时完成多维标签打标。
> 使用方式：批量调用（每批 50 条），两个任务合并在一次调用中节省 API 成本。

---

## 系统提示词（System Prompt）

```
你是一名数据质量评审专家，专门评估前端 UI 开发需求数据集的质量。
你需要从真实性、具体性、差异性三个维度对 Query 进行评分，
同时提取 Query 的结构化标签，用于数据集检索和分析。
你的评分标准严格客观，避免给出虚高分数。
```

---

## 用户提示词（User Prompt）— 合并评分+打标

```
请对以下前端 UI 开发需求 Query 进行质量评分和标签提取。

Query 内容：
---
{query_text}
---

元数据（仅供参考）：
- 行业：{industry_l2_name}
- 产品类型：{product_type_name}
- 用户角色：{user_role}
- 设计风格：{design_style}

## 任务一：质量评分

请从以下三个维度各给出 1-5 分的整数评分：

### 维度1：真实性（Authenticity）1-5分
评估该 Query 是否像真实用户自然发出的需求，而非模板生成的机械文字。

5分：完全像真实用户发出，有自然口语化表达，可能有不完整句子或行业术语
4分：较真实，语言自然，偶有模板感但不明显
3分：基本真实，但有轻微的模板化痕迹
2分：模板痕迹明显，重复使用固定句式
1分：明显是机器生成，高度格式化，缺乏真实感

### 维度2：具体性（Specificity）1-5分
评估需求是否足够具体，可以直接指导前端开发。

5分：非常具体，有明确的页面名称、组件需求、交互描述，可直接开始编码
4分：比较具体，有清晰的功能描述，稍加澄清即可开始
3分：中等具体，有基本方向但细节不够
2分：较模糊，只有大致方向，需要大量澄清
1分：非常抽象，几乎无法从中提取可实施的需求

### 维度3：差异性（Diversity）1-5分
评估该 Query 与同类需求的区分度（基于你对该行业/产品类型常见需求的了解）。

5分：独特的场景或需求角度，在同类数据中很少见
4分：有一定独特性，场景比较具体
3分：较常见但不是最泛化的需求
2分：比较普通，与大多数同类需求相似
1分：完全通用，在任何行业都可以发出的泛化需求

## 任务二：多维标签打标

同时提取以下标签：

- complexity_level：simple（单组件，无复杂状态）/ medium（多组件，有交互）/ complex（完整页面+数据流+动效）
- component_types：涉及的 UI 组件，从以下选择（可多选）：
  [navbar, sidebar, card, table, chart, form, input, button, modal, tabs,
   carousel, dropdown, tooltip, toast, avatar, badge, pagination, calendar,
   timeline, progress, skeleton, empty_state, hero, footer, search_bar,
   data_grid, kanban, rich_text_editor, image_upload, video_player, map]
- has_data_viz：true/false（是否涉及图表/数据可视化）
- mobile_responsive：true/false/null（true=明确要求响应式，null=未提及）
- tech_stack：提到的技术栈（可多选）：
  [React, Vue, Angular, Next.js, Nuxt, Svelte, TypeScript, JavaScript,
   Tailwind, CSS Modules, SCSS, Framer Motion, GSAP, Three.js, D3.js,
   Shadcn, Radix, MUI, Ant Design, Chakra UI, 其他]
- interaction_types：涉及的交互（可多选）：
  [click, hover, drag, scroll, animation, form_submit, real_time_update,
   filter_sort, search, multi_step, infinite_scroll, keyboard_shortcut, gestures]
- explicit_style：true/false（是否明确提到了设计风格名称或风格描述词）
- reference_product：提到的参考产品/竞品名称（如"像 Notion 那样"），无则 null
- query_type：greenfield（从零构建）/ modification（修改已有）/ component（单组件）/ page（完整页面）
- estimated_dev_hours：前端开发工作量估计（小时），整数：[2, 4, 8, 16, 32, 40+]

## 输出格式

仅输出纯 JSON：
{
  "quality_scores": {
    "authenticity": 4,
    "specificity": 4,
    "diversity": 3,
    "total": 3.8,
    "reasoning": "语言自然（真实性4），需求清晰可实施（具体性4），场景略常见（差异性3）"
  },
  "labels": {
    "complexity_level": "medium",
    "component_types": ["card", "chart", "table"],
    "has_data_viz": true,
    "mobile_responsive": null,
    "tech_stack": ["React", "Tailwind"],
    "interaction_types": ["click", "filter_sort"],
    "explicit_style": false,
    "reference_product": null,
    "query_type": "page",
    "estimated_dev_hours": 8
  }
}

total 计算公式：authenticity × 0.4 + specificity × 0.4 + diversity × 0.2
```

---

## 评分校准示例（Few-Shot）

在提示词中加入以下校准示例，提高评分一致性：

```
## 评分示例（用于校准你的标准）

示例 A（高质量，total≈4.5）：
Query: "帮我做个加密货币交易所的订单薄组件，要显示买卖双方的挂单列表，
        价格从中间价格向两端扩散，买单绿色/卖单红色，数量用进度条宽度表示，
        每秒更新一次，用 React + WebSocket，高度固定 600px 支持内部滚动"
→ 真实性5（口语化，有具体技术细节）| 具体性5（可直接编码）| 差异性4（场景较独特）

示例 B（中等质量，total≈3.2）：
Query: "帮我做一个电商网站的商品列表页，支持筛选和排序，
        每个商品卡片显示图片、价格和购买按钮"
→ 真实性4（语言自然）| 具体性3（细节不足）| 差异性2（极其常见）

示例 C（低质量，total≈1.5）：
Query: "请帮我设计一个界面美观、用户友好的管理系统，
        功能完善，性能优良，符合现代设计趋势"
→ 真实性2（机械感强）| 具体性1（无任何可实施信息）| 差异性2（完全通用）
```

---

## 批量处理脚本

```python
import json
import asyncio

async def score_and_label_batch(
    queries: list[dict],
    llm_client,
    batch_size: int = 50
) -> list[dict]:
    """
    批量评分+打标，将两个任务合并为一次 LLM 调用
    """
    results = []

    for i in range(0, len(queries), batch_size):
        batch = queries[i:i+batch_size]
        tasks = []

        for q in batch:
            prompt = build_scoring_prompt(q)
            tasks.append(llm_client.complete_async(prompt))

        batch_results = await asyncio.gather(*tasks, return_exceptions=True)

        for q, result in zip(batch, batch_results):
            if isinstance(result, Exception):
                q["quality_score"] = None
                q["labels"] = None
            else:
                parsed = parse_json_safe(result)
                if parsed:
                    q["quality_score"] = parsed["quality_scores"]["total"]
                    q["score_authenticity"] = parsed["quality_scores"]["authenticity"]
                    q["score_specificity"] = parsed["quality_scores"]["specificity"]
                    q["score_diversity"] = parsed["quality_scores"]["diversity"]
                    q["scoring_reason"] = parsed["quality_scores"]["reasoning"]
                    q.update(parsed["labels"])

            results.append(q)

        print(f"已处理 {min(i + batch_size, len(queries))}/{len(queries)} 条")
        await asyncio.sleep(1)  # 避免速率限制

    return results


def filter_by_quality(
    queries: list[dict],
    threshold: float = 2.5
) -> tuple[list[dict], list[dict]]:
    """
    按质量阈值分类
    返回 (通过的, 隔离的)
    """
    passed = [q for q in queries if q.get("quality_score", 0) >= threshold]
    quarantine = [q for q in queries if q.get("quality_score", 0) < threshold]

    print(f"质检结果：{len(passed)} 通过 / {len(quarantine)} 隔离")
    return passed, quarantine
```

---

## 质检报告模板

质检完成后，生成以下统计摘要：

```python
def generate_quality_report(scored_queries: list[dict]) -> dict:
    scores = [q["quality_score"] for q in scored_queries if q.get("quality_score")]

    return {
        "total": len(scored_queries),
        "scored": len(scores),
        "distribution": {
            "excellent_4plus": sum(1 for s in scores if s >= 4.0),
            "good_3to4": sum(1 for s in scores if 3.0 <= s < 4.0),
            "acceptable_2p5to3": sum(1 for s in scores if 2.5 <= s < 3.0),
            "quarantine_below2p5": sum(1 for s in scores if s < 2.5)
        },
        "avg_score": sum(scores) / len(scores) if scores else 0,
        "pass_rate": sum(1 for s in scores if s >= 2.5) / len(scores) if scores else 0
    }
```
