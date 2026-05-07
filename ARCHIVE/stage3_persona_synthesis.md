# Stage 3 · Persona 角色扮演查询合成

> **目标**：以 4D Taxonomy Matrix 为组合框架，将 Stage 1 的行业知识、Stage 2 的社交媒体真实语境、设计风格矩阵三者注入 LLM 角色扮演，合成高质量、多样化的前端 UI 开发需求查询数据。

**理论支撑**: [R5] Persona Hub（10亿 Persona 合成数据），[R6] PERSONA Benchmark（角色扮演质量验证）

---

## 核心公式

```
Query = f(Industry_L2, Product_Type, User_Role, Design_Style)
         ↑ Stage 1      ↑ Stage 2     ↑ 固定维度   ↑ 风格矩阵
```

理论组合空间：**50 × 13 × 6 × 10 = 39,000 个独立场景象限**

实际由分层采样控制，目标生成量：**10,000 - 30,000 条**原始 Query

---

## Taxonomy Matrix 四维详解

### 维度一：Industry_L2（~50 个，来自 Stage 1）

L2 层级示例（每个 L1 下约 4-8 个）：

```
fintech.payment        # 支付与转账
fintech.investment     # 投资理财
fintech.banking        # 数字银行
fintech.insurance      # 保险科技
saas.crm               # 客户关系管理
saas.project_mgmt      # 项目管理
saas.bi_analytics      # 商业智能分析
saas.hr_tools          # 人力资源管理
ecommerce.marketplace  # 综合电商市场
ecommerce.d2c          # 品牌直销商城
health.patient_portal  # 患者门户
health.fitness         # 运动健身追踪
...
```

### 维度二：Product_Type（13 类，来自 WebGen-Bench [R4] + Stage 2 扩展）

| 类型 ID | 名称 | 特征 |
|---------|------|------|
| `landing_page` | 企业/产品官网 | 营销导向，转化率优先 |
| `content_blog` | 内容/博客平台 | 文章流、搜索、标签 |
| `dashboard` | 数据仪表盘 | 图表、KPI、实时更新 |
| `portfolio` | 个人/作品集 | 展示性、视觉驱动 |
| `admin_panel` | 管理后台 | 表格、权限、批量操作 |
| `form_flow` | 表单/多步骤流程 | 注册、结账、申请 |
| `search_filter` | 搜索+过滤列表 | 商品、招聘、房源 |
| `realtime_collab` | 实时协作工具 | 文档、白板、评论 |
| `ecommerce_shop` | 电商购物 | 商品详情、购物车、支付 |
| `booking_service` | 预订服务 | 日历、座位、时间槽 |
| `social_feed` | 社交动态流 | 帖子、评论、互动 |
| `media_player` | 媒体播放 | 视频/音频、进度条、列表 |
| `game_hud` | 游戏/娱乐界面 | HUD、积分榜、任务 |

### 维度三：User_Role（6 类）

| 角色 | 技术背景 | 表达风格特征 |
|------|---------|------------|
| 产品经理 PM | 低-中 | 重业务逻辑、用户故事、功能边界，较少提技术细节 |
| 独立开发者 IndieHacker | 高 | 技术栈明确（React/Tailwind），注重实现可行性，口语化 |
| 创始人/CEO Founder | 低 | 强调品牌调性、竞品对比、整体感受，需求较宏观 |
| UI设计师 Designer | 中 | 关注视觉细节、交互动效、设计系统规范，使用设计术语 |
| 全栈工程师 FullStack | 高 | 关注组件复用性、API 集成、状态管理，需求精确 |
| 外包需求方 Client | 低 | 类比参考（"像 Airbnb 那样"）、描述模糊、需要引导 |

### 维度四：Design_Style（10 种，按行业权重采样）

见 `design_style_matrix.md`。注意：
- 风格不一定显式命名（"玻璃拟态"），可以是隐含描述
- 10% 概率采样"风格混合"（如极简 + 暗黑）

---

## Persona 提示词模板

完整版见 `prompts/p4_persona_query_gen.md`，以下为核心骨架：

```
## 系统角色设定

你是一个 {user_role_desc}，当前正在开发一款 {industry_L2} 领域的 {product_type} 产品。

## 背景信息（来自真实社交媒体数据）

产品背景：{social_context}
[social_context 从 Stage 2 社交数据库中随机抽取一条相关记录注入，包含产品名称、用户痛点、功能诉求]

## 设计偏好

{design_style_instruction}
[根据 Design_Style 维度注入具体风格描述，有 30% 概率省略（模拟未明确设计风格的真实需求）]

## 任务

以第一人称，向一个 AI 编程助手发送一条真实的前端 UI 开发需求。

要求：
1. 具体到页面名称或组件名称
2. 包含关键交互或数据展示需求（至少 2 个具体点）
3. 字数在 50-200 字之间
4. 语气和表达风格符合你的角色（{user_role_style_hint}）
5. 不要解释你在做什么，直接输出用户发送的那条消息

## 输出

仅输出那条用户消息，不加任何前缀或说明。
```

---

## User_Role 风格提示词（role_style_hint）

```python
ROLE_STYLE_HINTS = {
    "pm": (
        "产品经理风格：用用户故事框架（As a user, I want...改成中文），"
        "关注业务逻辑和功能范围，避免技术术语，可能会说'参考竞品XX的做法'"
    ),
    "indie_hacker": (
        "独立开发者风格：直接说技术栈（React/Next.js/Tailwind），"
        "口语化，可能说'帮我搞个...'，关注实现效率"
    ),
    "founder": (
        "创始人风格：强调品牌感和整体印象，"
        "爱用'高端感'/'有质感'/'像某某公司那样'等模糊描述"
    ),
    "designer": (
        "UI设计师风格：使用设计术语（8px grid、色彩令牌、微交互、Framer Motion），"
        "关注视觉细节和动效，可能提供精确的颜色值或字体名称"
    ),
    "fullstack": (
        "全栈工程师风格：需求精确，关注状态管理和数据流，"
        "可能提到'这个组件要支持...'、'数据从API获取格式是...'"
    ),
    "client": (
        "外包需求方风格：描述模糊，爱用参考链接或竞品对比，"
        "可能说'就像X网站那样'，需要AI帮助理解和细化"
    )
}
```

---

## 分层采样策略

参考 Persona Hub [R5] 的核心洞察：**均匀采样会导致数据分布失真**，高权重行业/产品会被欠采，小众场景过采。

### 采样权重来源

```python
def compute_sampling_weights(industry_graph: dict, style_matrix: dict) -> dict:
    """
    为每个 (Industry_L2, Product_Type, User_Role, Design_Style) 四元组
    计算采样概率
    """
    weights = {}

    for l2 in all_l2_industries:
        # 行业权重：来自 Stage 1 的 Borda Count 归一化
        industry_w = l2["borda_score"] / total_borda

        for pt in get_product_types(l2):
            # 产品类型权重：来自 Stage 2 的 ui_demand_score
            pt_w = pt["ui_demand_score"]

            for role in USER_ROLES:
                # 角色权重：基于行业特性（B2B行业PM权重更高，消费端Founder权重更高）
                role_w = get_role_weight(l2["id"], role)

                for style in DESIGN_STYLES:
                    # 风格权重：来自 design_style_matrix.md 的适配权重
                    style_w = style_matrix[l2["l1_id"]][style]

                    key = (l2["id"], pt["id"], role, style)
                    weights[key] = industry_w * pt_w * role_w * style_w

    # 归一化为概率
    total = sum(weights.values())
    return {k: v / total for k, v in weights.items()}
```

### 目标数量规划

| 采样层级 | 说明 | 目标条数/象限 |
|---------|------|------------|
| Top-10 行业 × 常见产品 | 权重最高区间 | 8-15 条/象限 |
| 中等行业 × 主流产品 | 中等权重区间 | 3-8 条/象限 |
| 小众行业 × 非主流产品 | 低权重但必须覆盖 | 1-3 条/象限 |

**总目标**：去重前约 15,000-25,000 条原始 Query

---

## 多轮对话变体（10% 比例生成）

参考 FronTalk [R3] 的多轮基准，对 10% 的象限额外生成多轮版本：

```python
MULTI_TURN_PROMPT = """
第一轮已生成了以下需求：
{turn1_query}

现在，作为同一个用户，追加一条修改/补充需求（模拟真实开发迭代），要求：
- 可以是修改设计风格、增加功能、调整交互细节
- 体现"看到初版效果后的真实反馈"语气
- 50-150字
"""
```

---

## 生成执行脚本

```python
# scripts/run_persona_synthesis.py
import json
import random
from pathlib import Path

def synthesize_queries(
    industry_graph_path: str,
    social_db_path: str,
    style_matrix_path: str,
    output_dir: str,
    total_target: int = 20000,
    llm_client = None
):
    industry_graph = json.load(open(industry_graph_path))
    style_matrix = json.load(open(style_matrix_path))

    weights = compute_sampling_weights(industry_graph, style_matrix)
    combos = list(weights.keys())
    probs = list(weights.values())

    # 分层采样组合
    sampled_combos = random.choices(combos, weights=probs, k=total_target)

    results = []
    for industry_l2, product_type, user_role, design_style in sampled_combos:
        # 从社交数据库获取上下文
        social_ctx = get_social_context(social_db_path, industry_l2, product_type)

        # 构建 Persona 提示词
        prompt = build_persona_prompt(
            industry_l2=industry_l2,
            product_type=product_type,
            user_role=user_role,
            design_style=design_style,
            social_context=social_ctx
        )

        # 调用 LLM 生成 Query
        query_text = llm_client.complete(prompt)

        results.append({
            "query": query_text,
            "industry_l2": industry_l2,
            "product_type": product_type,
            "user_role": user_role,
            "design_style": design_style,
            "social_context_id": social_ctx.get("id"),
            "is_multi_turn": False,
            "generated_at": get_timestamp()
        })

    # 按行业分区存储
    save_by_industry(results, output_dir)
    print(f"生成完成：{len(results)} 条原始 Query")
```

---

## 输出格式

```json
{
  "id": "q_fintech_payment_pm_glassmorphism_0042",
  "query": "我们在做一个消费端支付应用的收银台页面，希望采用玻璃拟态风格，背景是深蓝色渐变，支付方式选择卡片要有毛玻璃效果。需要包含：支付方式切换（信用卡/支付宝/微信）、金额输入框（大号字体展示）、安全标识、确认支付按钮（全宽圆角）。用 React + Tailwind 实现。",
  "industry_l2": "fintech.payment",
  "product_type": "form_flow",
  "user_role": "indie_hacker",
  "design_style": "Glassmorphism",
  "social_context_id": "reddit_abc123",
  "is_multi_turn": false,
  "turn_index": null,
  "generated_at": "2026-03-29T10:00:00Z"
}
```

---

## 输出目录结构

```
data/raw_queries/
├── fintech/
│   ├── fintech.payment.jsonl
│   ├── fintech.investment.jsonl
│   └── ...
├── saas/
│   └── ...
└── _manifest.json   # 各文件条数统计
```
