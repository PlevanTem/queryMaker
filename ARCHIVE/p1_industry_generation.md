# P1 · 行业大类生成提示词

> 用途：Stage 1 第一步，分别发给 GPT-4o / Claude / Gemini，让每个模型独立生成前端 UI 需求最旺盛的行业排名。
> 使用方式：开启网络搜索（Web Search）工具后发送。

---

## 系统提示词（System Prompt）

```
你是一名经验丰富的全球行业分析师，专注于互联网产品和 UI 设计需求分析。
你掌握世界各地最新的行业分布数据、产品趋势和互联网商业化情况。
请根据需要使用网络搜索工具获取最新信息。
```

---

## 用户提示词（User Prompt）

```
请列出在"前端 UI 产品设计与开发"场景中，需求量最大、最活跃的行业大类排名。

评估标准：
- 该行业有大量独立的 Web/移动端产品需要 UI 设计和前端开发
- 该行业持续产生新的 UI 设计需求（新产品发布、功能迭代、界面改版）
- 该行业中有大量团队或独立开发者在构建前端产品

任务要求：
1. 生成 15-20 个 L1 行业大类
2. 按"前端UI产品需求量"从高到低排序（rank 1 = 需求量最大）
3. 每个大类附带 4-6 个 L2 子行业
4. 为每个 L1 给出 priority_score（0-1 之间，基于你对该行业 UI 需求量的判断）
5. 必须输出纯 JSON，不要有任何说明文字

输出格式（严格遵守）：
[
  {
    "rank": 1,
    "industry_id": "fintech",
    "name_zh": "金融科技",
    "name_en": "FinTech",
    "priority_score": 0.95,
    "reason": "支付/投资/银行等产品UI需求极大，且持续创新",
    "sub_industries": [
      {"id": "fintech.payment", "name_zh": "支付与转账", "name_en": "Payment"},
      {"id": "fintech.investment", "name_zh": "投资理财", "name_en": "Investment"},
      {"id": "fintech.banking", "name_zh": "数字银行", "name_en": "Digital Banking"},
      {"id": "fintech.insurance", "name_zh": "保险科技", "name_en": "InsurTech"},
      {"id": "fintech.crypto", "name_zh": "加密货币", "name_en": "Crypto/DeFi"}
    ]
  },
  ...
]

注意：
- industry_id 使用英文小写+下划线
- 子行业 id 格式：{parent_id}.{sub_id}
- 确保覆盖互联网、消费端、B2B、垂直行业等多种类型
- 仅输出 JSON 数组，不要有任何其他内容
```

---

## 执行说明

1. 将上述提示词分别发送给三个模型（GPT-4o、Claude 3.5 Sonnet、Gemini 1.5 Pro）
2. 确保各模型都启用了网络搜索功能
3. 保存三份 JSON 输出到：
   - `data/raw_ranks/gpt4o_industries.json`
   - `data/raw_ranks/claude_industries.json`
   - `data/raw_ranks/gemini_industries.json`
4. 运行 `scripts/borda_count.py` 进行聚合

---

## L2 层级扩展提示词

在完成 Borda Count 聚合后，对每个 L1 行业单独发送以下提示词获取完整 L3 信息：

```
给定行业：{industry_name_zh}（{industry_id}）

请为该行业的每个子行业，列出典型的 L3 产品形态（具体到可以画出 UI 界面的粒度）。

要求：
- 每个 L2 子行业列出 3-5 个 L3 产品形态
- 产品形态必须具体（如"医院预约挂号H5页面"而非"医疗系统"）
- 为每个 L2 评估：
  * ui_demand_score：0-1，UI设计需求的活跃程度
  * typical_complexity：low/medium/high（前端实现复杂度）
  * primary_product_type：在 [landing_page, dashboard, admin_panel, form_flow,
    search_filter, ecommerce_shop, social_feed, media_player, booking_service,
    realtime_collab, content_blog, portfolio, game_hud] 中选一个最常见的类型

输出纯 JSON：
{
  "industry_id": "{industry_id}",
  "sub_industries": [
    {
      "id": "{sub_id}",
      "name_zh": "子行业名",
      "ui_demand_score": 0.85,
      "typical_complexity": "medium",
      "primary_product_type": "dashboard",
      "product_forms": [
        "用户投资组合仪表盘",
        "实时行情K线图页面",
        "定投计划设置向导"
      ]
    }
  ]
}
```
