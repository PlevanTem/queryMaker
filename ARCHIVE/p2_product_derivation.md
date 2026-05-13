# P2 · 产品分类衍生提示词

> 用途：Stage 2 第一步，对每个 L2 行业关键词，衍生出具体的产品/服务分类及其 UI 特征。
> 使用方式：批量调用，每次传入一个 L2 行业。

---

## 系统提示词（System Prompt）

```
你是一名资深产品设计顾问，熟悉各行业的数字化产品形态和 UI/UX 设计特点。
你的任务是为给定行业生成具体可设计的产品分类，帮助构建前端代码生成训练数据集。
```

---

## 用户提示词（User Prompt）

```
行业信息：
- 行业ID：{industry_l2_id}
- 行业名称：{industry_l2_name_zh}（{industry_l2_name_en}）
- 所属大类：{industry_l1_name_zh}

参考产品类型列表（13类，从中选择最适合的）：
landing_page（官网/落地页）| content_blog（内容/博客）| dashboard（数据仪表盘）|
portfolio（作品集/展示）| admin_panel（管理后台）| form_flow（表单/流程）|
search_filter（搜索+过滤）| realtime_collab（实时协作）| ecommerce_shop（电商购物）|
booking_service（预订服务）| social_feed（社交动态）| media_player（媒体播放）|
game_hud（游戏/娱乐界面）

任务：
为上述行业生成 5-8 个最有代表性的产品形态，每个产品形态都应能独立成为一个 UI 设计项目。

每个产品形态需包含：
1. product_id：英文小写，如 "investment_portfolio_dashboard"
2. name_zh：中文名称，如 "个人投资组合仪表盘"
3. name_en：英文名称
4. primary_type：从上述 13 类中选择最匹配的一类
5. ui_demand_score：0-1，该产品形态在市场上的 UI 需求活跃度
6. complexity：low/medium/high（前端实现复杂度）
7. key_components：该产品的核心 UI 组件列表（3-6个），如 ["折线图", "账户卡片", "交易记录表格"]
8. design_challenges：该产品的典型 UI 设计挑战（1-2条），如 ["实时数据更新的视觉反馈", "复杂数据的可读性"]
9. ph_topic：在 ProductHunt 上搜索该类产品的最佳话题词（英文），如 "personal finance"
10. reddit_subreddits：适合搜索该类产品讨论的 subreddit 列表（2-4个），如 ["r/personalfinance", "r/financialindependence"]

输出纯 JSON（不要有任何其他内容）：
{
  "industry_l2_id": "{industry_l2_id}",
  "products": [
    {
      "product_id": "...",
      "name_zh": "...",
      "name_en": "...",
      "primary_type": "dashboard",
      "ui_demand_score": 0.88,
      "complexity": "medium",
      "key_components": ["...", "..."],
      "design_challenges": ["...", "..."],
      "ph_topic": "...",
      "reddit_subreddits": ["r/...", "r/..."]
    }
  ]
}
```

---

## 使用示例

**输入**:
```json
{
  "industry_l2_id": "fintech.investment",
  "industry_l2_name_zh": "投资理财",
  "industry_l2_name_en": "Investment & Wealth Management",
  "industry_l1_name_zh": "金融科技"
}
```

**期望输出片段**:
```json
{
  "industry_l2_id": "fintech.investment",
  "products": [
    {
      "product_id": "portfolio_dashboard",
      "name_zh": "个人投资组合仪表盘",
      "name_en": "Investment Portfolio Dashboard",
      "primary_type": "dashboard",
      "ui_demand_score": 0.90,
      "complexity": "high",
      "key_components": ["资产配置环形图", "收益率折线图", "持仓列表", "盈亏统计卡片"],
      "design_challenges": ["实时数据更新不闪烁", "正负盈亏的颜色语义明确"],
      "ph_topic": "investment tracker",
      "reddit_subreddits": ["r/personalfinance", "r/financialindependence", "r/investing"]
    }
  ]
}
```

---

## 批量执行策略

```python
# 批量调用示例
async def derive_all_products(industry_graph: dict, llm_client) -> dict:
    all_products = {}

    for l1 in industry_graph["industry_graph"]:
        for l2 in l1["sub_industries"]:
            prompt = build_product_derivation_prompt(l1, l2)
            result = await llm_client.complete_async(prompt)
            products = parse_json_safe(result)
            all_products[l2["id"]] = products
            await asyncio.sleep(0.5)  # 避免速率限制

    return all_products
```
