# P3 · 社交媒体内容结构化提取提示词

> 用途：Stage 2 第三步，对 Reddit/ProductHunt/Twitter 爬取的原始内容进行 LLM 结构化提取。
> 使用方式：批量调用，每次传入一条原始社交媒体帖子/评论。

---

## 系统提示词（System Prompt）

```
你是一名产品研究分析师，专门从社交媒体讨论中提取 UI/UX 设计相关的产品洞察。
你需要从用户的自然语言讨论中识别出产品痛点、功能诉求、设计偏好等有价值的信息，
用于构建前端 UI 开发需求的训练数据。
```

---

## 用户提示词（User Prompt）

```
来源平台：{platform}  （reddit / producthunt / twitter）
行业类别：{industry_l2_name_zh}（{industry_l2_id}）
产品类型：{product_name_zh}（{product_id}）

以下是原始社交媒体内容：
---
标题/名称：{title}
正文/描述：{body}
热门评论（如有）：{top_comments}
---

请从上述内容中提取与"前端 UI 设计和开发"相关的结构化信息。

输出纯 JSON（无法提取时对应字段返回 null 或空数组）：
{
  "product_name": "具体产品或功能名称（如：Notion Calendar、Stripe Checkout）",
  "pain_points": [
    "用户明确表达的 UI/UX 痛点，每条≤40字，聚焦前端体验",
    "..."
  ],
  "feature_requests": [
    "用户期望的 UI 功能或交互改进，每条≤40字",
    "..."
  ],
  "tech_stack_mentions": [
    "提到的前端技术栈（React/Vue/Tailwind/CSS等）"
  ],
  "target_user": "该产品的主要目标用户描述（1句话）",
  "design_keywords": [
    "与 UI 风格相关的关键词（clean/minimal/dark/dashboard/mobile-first 等）"
  ],
  "competitor_references": [
    "提到的竞品或参考产品名称"
  ],
  "typical_use_case": "最典型的使用场景描述（1-2句话，可为 null）",
  "quality_score": 0.0,
  "quality_reason": "简述评分理由"
}

quality_score 评分标准（0-1）：
- 0.8-1.0：内容具体，有明确的 UI 痛点或功能诉求，可直接用于生成真实 Query
- 0.5-0.8：内容相关但较通用，需要一定推断
- 0.2-0.5：内容只是间接相关，UI 信息稀少
- 0.0-0.2：内容与 UI/前端设计基本无关，或质量太低

重要：
- 仅提取内容中明确表达的信息，不要添加你自己的推断
- 如果内容与 UI/前端设计无关，直接返回 {"quality_score": 0.1, "quality_reason": "内容与UI无关"}
- 仅输出 JSON，不要有任何其他文字
```

---

## 使用示例

**输入**（Reddit 帖子）:
```
平台：reddit
行业：saas.project_mgmt（项目管理）
产品：project_management_tool

标题：Why does every project management tool have such terrible mobile apps?
正文：I've tried Jira, Asana, Linear, Notion... they all feel like they just shrunk
      the desktop UI onto mobile. No native gestures, tiny tap targets, and loading
      times are awful. I just want to quickly check my tasks and add a comment
      without it feeling like I'm doing surgery on my phone.

评论1：Linear is the best of the bunch but still not great. At least it has keyboard
       shortcuts on desktop which is amazing.
评论2：The real issue is data density - these tools try to show too much info on mobile.
       Need different information architecture for mobile vs desktop.
```

**期望输出**:
```json
{
  "product_name": "Project Management Tools (Jira/Asana/Linear/Notion)",
  "pain_points": [
    "移动端只是桌面版缩小，没有原生手势交互",
    "按钮点击区域太小，操作困难",
    "移动端加载速度慢，体验差",
    "移动端和桌面端信息架构完全相同，不适合移动场景"
  ],
  "feature_requests": [
    "移动端专属信息架构设计，减少信息密度",
    "原生手势支持（滑动完成任务等）",
    "快速添加评论的简化操作流"
  ],
  "tech_stack_mentions": [],
  "target_user": "需要随时在移动端查看和更新任务的项目管理用户",
  "design_keywords": ["mobile-first", "native gestures", "data density", "tap targets"],
  "competitor_references": ["Jira", "Asana", "Linear", "Notion"],
  "typical_use_case": "用户在手机上快速查看当日任务并添加评论或更新状态",
  "quality_score": 0.92,
  "quality_reason": "明确的移动端UI痛点，具体的功能诉求，直接可用于生成移动端项目管理工具的Query"
}
```

---

## 批量处理策略

```python
# 使用并发批量处理降低耗时
import asyncio
from typing import Optional

async def extract_batch(
    items: list[dict],
    llm_client,
    batch_size: int = 50,
    quality_threshold: float = 0.4
) -> list[dict]:
    """
    批量提取，过滤低质量内容
    """
    results = []

    for i in range(0, len(items), batch_size):
        batch = items[i:i+batch_size]
        tasks = [extract_single(item, llm_client) for item in batch]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)

        for item, result in zip(batch, batch_results):
            if isinstance(result, Exception):
                continue
            if result and result.get("quality_score", 0) >= quality_threshold:
                # 合并原始元数据和提取结果
                merged = {**item, **result}
                results.append(merged)

    return results
```

---

## 特殊处理：ProductHunt 产品描述

ProductHunt 的内容结构不同（有 tagline/description/comments），使用变体提示词：

```
产品信息：
名称：{name}
一句话介绍（tagline）：{tagline}
详细描述：{description}
用户评论（前3条）：{comments}

请提取该产品的 UI 设计特征和用户诉求...
（其余格式与主提示词相同）
```
