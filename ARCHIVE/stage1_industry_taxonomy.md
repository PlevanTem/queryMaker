# Stage 1 · 行业知识图谱构建

> **目标**：利用多个 LLM 的海量世界知识，生成覆盖全域、优先级可信的行业三级分类体系，作为整个 Query 流水线的知识骨架。

**理论支撑**: [R9] LLM-ISIC Classification, [R10] IBB Industry Group Taxonomy

---

## 设计思路

单一 LLM 存在系统性行业偏见：
- **GPT-4o** 偏北美科技/SaaS/金融生态
- **Gemini** 偏谷歌产品体系、云计算、移动端
- **Claude** 偏专业服务、内容创作、医疗合规

通过让三个模型**独立生成**并进行 **Borda Count** 聚合排名，可降低单一偏见，获得更均衡的行业分布。

---

## 输出数据结构

```json
{
  "industry_graph": [
    {
      "id": "fintech",
      "name_zh": "金融科技",
      "name_en": "FinTech",
      "level": 1,
      "priority_score": 0.92,
      "borda_rank": 2,
      "sub_industries": [
        {
          "id": "fintech.payment",
          "name_zh": "支付与转账",
          "name_en": "Payment & Transfer",
          "level": 2,
          "ui_demand_score": 0.88,
          "product_types": [
            "支付收银台", "账单管理", "钱包应用", "跨境汇款界面"
          ]
        }
      ]
    }
  ]
}
```

**输出文件**: `.docs/ui_query_pipeline_claude/data/industry_graph.json`

---

## 执行流程

### Step 1.1 — 多 LLM 并行生成

**操作**: 向 GPT-4o、Claude、Gemini 分别发送以下提示词（见 `prompts/p1_industry_generation.md`），启用网络搜索工具。

**提示词核心结构**（完整版见 prompts 目录）:

```
你是全球行业分析师。
任务：基于你的世界知识 + 在线搜索，列出前端 UI 产品设计需求最旺盛的行业大类。
要求：
- 生成 L1 大类（≥15 个），每个大类附带 L2 子类（3-8 个）
- 按"该行业在互联网产品 UI 设计中的需求量"从高到低排序（1=最高）
- 输出纯 JSON，格式: [{rank, industry_id, name_zh, name_en, score, sub_industries[]}]
```

**每个模型独立运行，获取三份排名列表。**

---

### Step 1.2 — Borda Count 聚合排名

**算法原理**: 若共有 N 个候选行业，排名第 k 位的行业获得 N-k 分。将三个模型给出的分数求和，总分最高者综合排名最靠前。

**生成脚本** (`scripts/borda_count.py`):

```python
from collections import defaultdict
import json

def borda_count(rankings: list[list[dict]], top_k=50) -> list[dict]:
    """
    rankings: 三个模型各自的行业列表，每个元素含 industry_id + rank
    返回: 综合排名后的行业列表
    """
    scores = defaultdict(float)
    meta = {}

    for model_ranks in rankings:
        n = len(model_ranks)
        for item in model_ranks:
            iid = item["industry_id"]
            scores[iid] += (n - item["rank"])
            if iid not in meta:
                meta[iid] = item

    sorted_industries = sorted(scores.items(), key=lambda x: -x[1])
    result = []
    for rank, (iid, score) in enumerate(sorted_industries[:top_k], 1):
        entry = meta[iid].copy()
        entry["borda_score"] = score
        entry["borda_rank"] = rank
        result.append(entry)
    return result

if __name__ == "__main__":
    gpt_ranks = json.load(open("data/raw_ranks/gpt4o_industries.json"))
    claude_ranks = json.load(open("data/raw_ranks/claude_industries.json"))
    gemini_ranks = json.load(open("data/raw_ranks/gemini_industries.json"))

    merged = borda_count([gpt_ranks, claude_ranks, gemini_ranks])
    json.dump(merged, open("data/merged_ranks.json", "w"), ensure_ascii=False, indent=2)
    print(f"合并完成，共 {len(merged)} 个行业")
```

---

### Step 1.3 — LLM 层级扩展与聚类

在获得 L1 综合排名后，对 Top-50 行业逐一调用 LLM 扩展 L2 子类和 L3 产品类型：

**提示词（扩展模式）**:

```
给定行业: {industry_name}（{industry_id}）
任务：
1. 列出该行业下 4-8 个 L2 子行业（按 UI 产品需求量排序）
2. 对每个 L2 子行业列出 3-5 个典型 L3 产品类型（具体到产品形态，如"医院预约挂号H5"）
3. 为每个 L2 评估: ui_demand_score（0-1）, typical_design_complexity（low/medium/high）
输出: 纯 JSON
```

**最终合并**生成 `industry_graph.json`，三级结构完整。

---

### Step 1.4 — 知识图谱可视化（可选）

用 LLM 生成 D3.js 或 Mermaid 格式的知识图谱可视化脚本，用于人工审查行业覆盖情况。

---

## 预期 L1 行业大类（参考列表）

以下为预期输出的 15 个 L1 大类（实际由 LLM 生成，此处仅示例）：

| 排名 | 行业大类 | 代表产品场景 |
|------|---------|------------|
| 1 | 金融科技 FinTech | 支付、投资理财、银行、保险、记账 |
| 2 | 企业软件 SaaS/B2B | CRM、ERP、项目管理、BI 看板、OA |
| 3 | 电子商务 E-Commerce | 商城、选品、物流追踪、促销活动页 |
| 4 | 医疗健康 HealthTech | 患者门户、医疗记录、预约挂号、健康追踪 |
| 5 | 教育科技 EdTech | 在线课程、学习管理系统、测评平台 |
| 6 | 社交媒体 Social | 动态流、个人主页、通讯、短视频 |
| 7 | 生产力工具 Productivity | 任务管理、协作文档、日历、时间追踪 |
| 8 | 内容创作 Content Creation | 博客编辑器、设计工具、视频剪辑界面 |
| 9 | 游戏与娱乐 Gaming/Entertainment | 游戏 HUD、主播界面、社区、赛事 |
| 10 | 旅行出行 Travel | 机票/酒店预订、行程规划、地图导航 |
| 11 | 房产与建筑 Real Estate | 楼盘展示、VR 看房、租赁平台 |
| 12 | 餐饮与零售 Food/Retail | 点餐系统、外卖、库存管理、收银 |
| 13 | 招聘与人力 HR/Recruiting | 求职平台、简历构建器、绩效管理 |
| 14 | 物联网与制造 IoT/Industry | 设备监控面板、工厂管理系统 |
| 15 | Web3 与区块链 Web3 | 钱包、DeFi 界面、NFT 市场、DAO 治理 |

---

## 质量检查标准

- **覆盖度**: L1 ≥ 15 类，L2 每个 L1 下 ≥ 4 类，L3 每个 L2 下 ≥ 3 个具体产品形态
- **无重叠**: 使用 LLM 检查相邻节点是否存在概念重叠（如 FinTech.Payment 与 E-Commerce.Checkout 的边界）
- **UI 相关性**: 每个 L2 节点必须具备"可以画出 UI 界面"的明确产品形态，纯后端/基础设施类剔除

---

## 输出清单

| 文件 | 描述 |
|------|------|
| `data/raw_ranks/gpt4o_industries.json` | GPT-4o 原始排名 |
| `data/raw_ranks/claude_industries.json` | Claude 原始排名 |
| `data/raw_ranks/gemini_industries.json` | Gemini 原始排名 |
| `data/merged_ranks.json` | Borda Count 综合排名（L1） |
| `data/industry_graph.json` | 完整三级知识图谱 |
