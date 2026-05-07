# Stage 2 · 产品衍生 + 社交媒体挖掘

> **目标**：基于 Stage 1 的行业知识图谱，衍生具体产品/服务分类，再通过社交媒体数据采集，为每种产品类型建立真实的业务语境锚点数据库。

**理论支撑**: [R4] WebGen-Bench 3×13 分类法, [R11] Reddit/ProductHunt AI 挖掘实践

---

## 设计思路

**为什么需要社交媒体数据？**

纯 LLM 生成的产品描述存在"语言精致但语境虚假"问题——措辞工整、逻辑完备，却缺乏真实市场中的竞品对比、用户抱怨语气、特定产品名称等"接地气"特征。

社交媒体数据（Reddit/Twitter/ProductHunt）提供：
- **真实产品名称**：Notion、Linear、Figma 而非"任务管理工具"
- **用户原生语言**：带情绪色彩的需求表达，更贴近真实 Query 风格
- **竞品对比**："比 Jira 简洁"这类相对性描述
- **痛点具体化**："每次打开都要等 3 秒加载" 而非抽象的"性能不好"

---

## 产品类型衍生（Step 2.1）

### 参考分类法

基于 WebGen-Bench [R4] 的 **3 大类 × 13 小类**结构，扩展为面向 UI 设计的产品分类：

| 大类 | 小类（13 类） | 典型 UI 场景 |
|------|-------------|------------|
| **信息展示型** | 企业官网 | Landing Page、产品介绍、团队页 |
| | 内容博客 | 文章列表、详情页、搜索页 |
| | 数据展示 | Dashboard、报表、数据可视化 |
| | 个人主页 | Portfolio、简历、作品集 |
| **工具交互型** | 管理后台 | 用户管理、权限配置、设置页 |
| | 表单流程 | 注册、结账、多步骤向导 |
| | 搜索过滤 | 商品列表、招聘搜索、房源筛选 |
| | 实时协作 | 文档编辑器、白板、评论系统 |
| **交易服务型** | 电商购物 | 商品详情、购物车、支付页 |
| | 预订服务 | 酒店预订、餐厅订座、活动报名 |
| | 社交互动 | 动态流、评论区、私信界面 |
| | 媒体播放 | 视频播放器、音乐应用、直播间 |
| | 游戏/娱乐 | 游戏 HUD、积分榜、任务系统 |

### LLM 产品衍生提示词（简版）

```
给定行业: {industry_L2}（{industry_id}）
参考上述 13 种产品类型，为该行业列出最典型的 5-8 个具体产品形态。
要求：
- 具体到可以画出 UI 界面的粒度（如"医生端排班日历" 而非 "医疗系统"）
- 注明主要产品类型（13 类中的哪一类）
- 评估 UI 复杂度（low/medium/high）
输出: JSON
```

**输出**: `data/product_types/{industry_id}.json`

---

## 社交媒体搜索爬虫（Step 2.2）

### 平台选择与优先级

| 平台 | 优势 | 目标内容 | API/工具 |
|------|------|---------|---------|
| **Reddit** | 用户无意识、真实痛点密集 | r/SaaS, r/webdev, r/startups, r/ProductManagement | PRAW |
| **ProductHunt** | 新产品密度高、含功能描述 | 产品 tagline、maker comment、用户评论 | PH API |
| **Twitter/X** | 实时、开发者社区活跃 | `#buildinpublic`, `#indiedev`, `#ux` hashtag | snscrape / Apify |
| **GitHub Issues** | 工程师真实需求、具体功能描述 | 前端框架项目的 feature request | PyGitHub |

### 搜索标签策略

对每个 `(industry_L2, product_type)` 组合，生成搜索标签矩阵：

```python
def generate_search_tags(industry: str, product_type: str) -> list[str]:
    """LLM 生成该组合的社交媒体搜索标签"""
    # 示例输出（FinTech × 支付应用）:
    # ["payment app UX", "checkout flow design", "Stripe UI", "payment dashboard",
    #  "fintech mobile design", "r/fintech", "r/webdev payment"]
    pass
```

### Reddit 爬虫脚本

```python
import praw
import json
from pathlib import Path

def scrape_reddit(
    search_queries: list[str],
    subreddits: list[str],
    industry_id: str,
    product_type: str,
    limit: int = 100
) -> list[dict]:
    reddit = praw.Reddit(
        client_id="YOUR_CLIENT_ID",
        client_secret="YOUR_SECRET",
        user_agent="ui-query-pipeline/1.0"
    )

    results = []
    for subreddit_name in subreddits:
        subreddit = reddit.subreddit(subreddit_name)
        for query in search_queries:
            for post in subreddit.search(query, limit=limit, sort="relevance"):
                results.append({
                    "source": "reddit",
                    "platform_url": f"https://reddit.com{post.permalink}",
                    "title": post.title,
                    "body": post.selftext[:2000],
                    "score": post.score,
                    "num_comments": post.num_comments,
                    "top_comments": [
                        c.body[:500] for c in post.comments[:5]
                        if hasattr(c, 'body')
                    ],
                    "industry_id": industry_id,
                    "product_type": product_type,
                    "raw_query": query
                })

    return results

# 存储为 JSONL
def save_results(results: list[dict], path: str):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for item in results:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
```

### ProductHunt 抓取策略

ProductHunt 官方 API v2 支持按标签搜索产品：

```python
import httpx

PH_API_URL = "https://api.producthunt.com/v2/api/graphql"

QUERY = """
query SearchProducts($topic: String!, $after: String) {
  posts(topic: $topic, after: $after, order: VOTES) {
    edges {
      node {
        id
        name
        tagline
        description
        topics { edges { node { name } } }
        comments(first: 5) {
          edges { node { body } }
        }
      }
    }
    pageInfo { endCursor hasNextPage }
  }
}
"""

def fetch_producthunt(topic: str, api_token: str, pages: int = 3) -> list[dict]:
    headers = {"Authorization": f"Bearer {api_token}"}
    results = []
    cursor = None

    for _ in range(pages):
        resp = httpx.post(
            PH_API_URL,
            json={"query": QUERY, "variables": {"topic": topic, "after": cursor}},
            headers=headers
        )
        data = resp.json()["data"]["posts"]
        for edge in data["edges"]:
            node = edge["node"]
            results.append({
                "source": "producthunt",
                "name": node["name"],
                "tagline": node["tagline"],
                "description": node.get("description", ""),
                "comments": [c["node"]["body"] for c in node["comments"]["edges"]]
            })
        if not data["pageInfo"]["hasNextPage"]:
            break
        cursor = data["pageInfo"]["endCursor"]

    return results
```

---

## LLM 结构化提取（Step 2.3）

将爬取的原始社交媒体内容发给 LLM，提取结构化产品洞察：

**提示词**（见 `prompts/p3_social_extraction.md`）:

```
以下是来自 {platform} 关于 {industry}/{product_type} 的用户讨论:
---
{raw_content}
---
请提取以下结构化信息（JSON格式）:
{
  "product_name": "具体产品或功能名称（如有）",
  "pain_points": ["用户提到的痛点，每条≤30字"],
  "feature_requests": ["期望的功能，每条≤30字"],
  "tech_stack_mentions": ["提到的技术栈：React/Vue/Tailwind等"],
  "target_user": "目标用户描述",
  "design_keywords": ["UI相关关键词：clean/minimal/dashboard等"],
  "quality_score": 0.0~1.0  // 内容与UI设计的相关性评分
}
仅输出 JSON，不相关内容返回 null。
```

**过滤规则**:
- `quality_score < 0.4` → 丢弃
- `pain_points` 和 `feature_requests` 均为空 → 丢弃
- 内容长度 < 50 字 → 丢弃

---

## 数据库结构

```
data/social_db/
├── fintech/
│   ├── payment_app.jsonl       # (industry=fintech, product=支付应用) 的社交数据
│   ├── investment_dashboard.jsonl
│   └── ...
├── saas_b2b/
│   ├── crm_system.jsonl
│   └── ...
└── _index.json                  # 各文件的统计信息（条数、平均quality_score）
```

每条 JSONL 记录的完整 schema：

```json
{
  "id": "reddit_abc123",
  "source": "reddit",
  "industry_id": "fintech",
  "industry_L2": "fintech.payment",
  "product_type": "payment_app",
  "product_name": "Stripe Checkout",
  "pain_points": ["自定义样式太难", "移动端体验差"],
  "feature_requests": ["支持更多支付方式", "一键自动填充"],
  "tech_stack_mentions": ["React", "Stripe.js"],
  "target_user": "独立开发者/电商卖家",
  "design_keywords": ["clean", "minimal", "trust-building"],
  "quality_score": 0.82,
  "raw_url": "https://reddit.com/...",
  "crawled_at": "2026-03-29T08:00:00Z"
}
```

---

## 采集规模目标

| 平台 | 每个 (L2×产品类型) 目标条数 | 过滤后保留估计 |
|------|--------------------------|-------------|
| Reddit | 50-100 条原始帖子 | 30-60 条 |
| ProductHunt | 20-50 个产品 | 15-40 条 |
| Twitter | 30-60 条推文 | 10-20 条 |

**总估计**：50 个 L2 × 平均 5 个产品类型 × 55 条 = **约 13,750 条结构化社交数据**

---

## 执行脚本入口

```python
# scripts/run_social_crawl.py
from pathlib import Path
import json

def run_pipeline(industry_graph_path: str, output_dir: str):
    graph = json.load(open(industry_graph_path))

    for l1 in graph["industry_graph"]:
        for l2 in l1["sub_industries"]:
            # Step 2.1: 产品类型衍生（已存在则跳过）
            product_types = derive_product_types(l2)

            # Step 2.2: 社交媒体爬取
            for pt in product_types:
                tags = generate_search_tags(l2["name_en"], pt["name_en"])
                raw_reddit = scrape_reddit(tags, get_subreddits(l2), l2["id"], pt["id"])
                raw_ph = fetch_producthunt(pt["ph_topic"], PH_TOKEN)

                # Step 2.3: LLM 结构化提取 + 过滤
                structured = [extract_structured(r) for r in raw_reddit + raw_ph]
                filtered = [s for s in structured if s and s["quality_score"] >= 0.4]

                save_results(filtered, f"{output_dir}/{l1['id']}/{pt['id']}.jsonl")

if __name__ == "__main__":
    run_pipeline("data/industry_graph.json", "data/social_db")
```
