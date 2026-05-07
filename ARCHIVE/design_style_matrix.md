# 横切轴 · 设计风格分类法与行业适配矩阵

> **目标**：建立 UI 设计风格的标准化分类体系，并为每种风格定义适配的行业场景和约束条件，作为 Stage 3 Taxonomy Matrix 的第四维度。

**理论背景**：现有前端代码生成基准（Design2Code、WebUIBench）均未将设计风格作为独立评估维度，导致模型无法针对特定审美语境进行专项训练和评估。

---

## 设计风格分类法（10 种）

### 1. 玻璃拟态 Glassmorphism

**视觉特征**: 毛玻璃背景模糊（`backdrop-filter: blur`）、半透明面板（`rgba` + 低透明度）、微弱白色边框、柔和阴影、背景可见性强

**CSS 核心特征**:
```css
background: rgba(255, 255, 255, 0.15);
backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.2);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
border-radius: 16px;
```

**适配场景**: SaaS 仪表盘、AI 工具、科技产品、金融科技（消费端）、活动/节日页面

**禁用场景**: 无障碍要求高的医疗/政务、密集数据表格（对比度不足）

**关键词**: `frosted glass`, `translucent`, `layered`, `depth`, `backdrop blur`

---

### 2. 软质拟态 Neumorphism（Soft UI）

**视觉特征**: 与背景同色系的凸起/凹陷效果（双侧阴影）、极低对比度、柔和渐变、圆形按钮、触觉感

**CSS 核心特征**:
```css
background: #e0e5ec;
box-shadow: 9px 9px 16px #b8bec7, -9px -9px 16px #ffffff;
border-radius: 12px;
```

**适配场景**: 健康/冥想应用、个人理财储蓄、智能家居控制、可穿戴设备界面

**禁用场景**: 高信息密度场景、老年用户产品（对比度太低）

**关键词**: `soft shadow`, `embossed`, `tactile`, `low contrast`, `monochromatic`

---

### 3. 新暴力美学 Neubrutalism

**视觉特征**: 粗黑边框（2-4px）、高饱和鲜艳色块、复古或怪诞配色（黄+黑、粉+蓝）、不规则布局、错位阴影

**CSS 核心特征**:
```css
border: 3px solid #000000;
box-shadow: 4px 4px 0px #000000;
background: #FFE500;
font-weight: 800;
```

**适配场景**: 创意工具/设计平台、独立媒体/博客、艺术作品集、个人品牌官网、青年文化产品

**禁用场景**: 金融/医疗/企业级 B2B（缺乏信任感）

**关键词**: `bold border`, `flat shadow`, `brutalist`, `high contrast`, `raw`

---

### 4. 极简主义 Minimalism

**视觉特征**: 大量留白、黑白灰主色调、字体驱动的层级、极少装饰元素、单一强调色

**CSS 核心特征**:
```css
color: #111111;
background: #ffffff;
font-family: 'Inter', sans-serif;
/* 仅用 margin/padding 建立层级，无多余装饰 */
```

**适配场景**: 高端电商、金融服务（桌面）、企业官网、法律/咨询、奢侈品（文字版）、作品集

**禁用场景**: 游戏/娱乐（太单调）、需要吸引注意力的促销页面

**关键词**: `white space`, `typography-first`, `monochrome`, `clean`, `spacious`

---

### 5. 质感设计 Material Design

**视觉特征**: 卡片系统、阴影层级（elevation）、Google 色彩规范、图标系统、波纹效果（ripple）

**CSS/框架特征**: Google Material Design 3 规范，Vuetify/MUI 组件库风格

**适配场景**: 移动端 Android 应用、生产力工具（Google Workspace 风格）、企业内部工具、跨平台应用

**禁用场景**: 需要独特品牌感的产品（风格过于标准化）

**关键词**: `card`, `elevation`, `ripple`, `FAB`, `material you`

---

### 6. 数据厚重 Data-Dense

**视觉特征**: 高密度信息布局、多列表格、迷你图表（sparkline）、状态指示器、色彩编码数据、紧凑间距

**典型产品**: Bloomberg Terminal 风、Grafana、运营后台、监控大屏

**适配场景**: B2B 数据分析、运营/监控后台、金融交易平台、物流/供应链管理、BI 工具

**禁用场景**: 消费级应用（用户体验过于专业化）

**关键词**: `dense layout`, `data table`, `sparkline`, `KPI card`, `monitoring`

---

### 7. 暗黑模式专业版 Dark Mode Pro

**视觉特征**: 深灰（非纯黑）背景（#0D1117 或 #1A1A2E）、亮色代码高亮、低饱和强调色、高对比文字

**适配场景**: 开发者工具（IDE、Terminal、API Docs）、代码编辑器、媒体播放、创意软件（Adobe 风格）

**禁用场景**: 医疗/政务/教育（正式场景需明亮界面）

**关键词**: `dark theme`, `code editor`, `low light`, `developer tool`, `high contrast text`

---

### 8. 赛博朋克/霓虹 Cyberpunk/Neon

**视觉特征**: 深黑/深蓝背景、荧光色（青绿 #00FFFF、洋红 #FF00FF、电紫）、网格背景、像素感/故障艺术、未来主义字体

**适配场景**: 游戏平台/游戏 HUD、Web3/加密货币、元宇宙/VR 相关、电竞直播界面

**禁用场景**: B2B 企业、医疗、金融信任类产品

**关键词**: `neon glow`, `grid background`, `glitch`, `cyberpunk`, `web3`

---

### 9. 奢华编辑 Luxury Editorial

**视觉特征**: 衬线字体（Didot、Playfair Display）、金色/香槟色强调、大面积高清图片、极致留白、低调精致排版

**适配场景**: 奢侈品/珠宝/手表品牌、高端酒店/度假村、时尚/美妆品牌、私人银行/财富管理

**禁用场景**: 技术工具类产品（不匹配产品调性）

**关键词**: `serif typography`, `gold accent`, `luxury`, `editorial`, `full-bleed image`

---

### 10. 活泼社交 Vibrant Social

**视觉特征**: 高饱和彩虹色系、圆润大号圆角、丰富动效、表情/插画元素、卡片化内容流、强调互动反馈

**适配场景**: 社交媒体、短视频、青少年向产品、游戏化学习、社区论坛

**禁用场景**: B2B、金融、医疗（降低严肃性）

**关键词**: `colorful`, `rounded`, `animated`, `social feed`, `emoji`, `gamification`

---

## 行业-风格适配权重矩阵

> 权重范围 0-5：0=不适用，1=勉强可用，3=常见，5=最佳匹配

| 行业 L1 | Glassmorphism | Neumorphism | Neubrutalism | Minimalism | Material | Data-Dense | Dark Mode | Cyberpunk | Luxury | Vibrant |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 金融科技 | 4 | 3 | 1 | 5 | 3 | 5 | 2 | 1 | 3 | 1 |
| 企业 SaaS | 5 | 1 | 1 | 5 | 4 | 5 | 4 | 0 | 1 | 1 |
| 电子商务 | 3 | 2 | 3 | 4 | 3 | 2 | 2 | 1 | 4 | 4 |
| 医疗健康 | 2 | 5 | 0 | 5 | 4 | 3 | 1 | 0 | 2 | 2 |
| 教育科技 | 3 | 2 | 2 | 3 | 5 | 2 | 2 | 1 | 1 | 5 |
| 社交媒体 | 4 | 2 | 3 | 2 | 3 | 1 | 3 | 3 | 1 | 5 |
| 生产力工具 | 3 | 2 | 1 | 5 | 4 | 4 | 5 | 0 | 1 | 2 |
| 内容创作 | 3 | 2 | 5 | 4 | 2 | 1 | 4 | 2 | 3 | 3 |
| 游戏/娱乐 | 3 | 1 | 3 | 1 | 2 | 2 | 5 | 5 | 1 | 5 |
| 旅行出行 | 4 | 2 | 2 | 4 | 4 | 2 | 2 | 0 | 4 | 3 |
| 房产建筑 | 3 | 1 | 2 | 5 | 3 | 3 | 2 | 0 | 4 | 2 |
| 餐饮零售 | 3 | 2 | 3 | 4 | 3 | 2 | 2 | 0 | 3 | 4 |
| 招聘人力 | 2 | 1 | 2 | 5 | 4 | 3 | 2 | 0 | 2 | 2 |
| IoT/制造 | 3 | 1 | 1 | 3 | 3 | 5 | 5 | 3 | 1 | 1 |
| Web3/区块链 | 4 | 1 | 3 | 3 | 1 | 3 | 5 | 5 | 2 | 3 |
| 奢侈品 | 3 | 1 | 2 | 5 | 1 | 0 | 2 | 0 | 5 | 1 |

---

## 风格采样权重计算

在 Stage 3 组合采样时，按以下方式将矩阵权重转为概率：

```python
import numpy as np

def get_style_weights(industry_l1: str, style_matrix: dict) -> dict:
    """
    从适配矩阵提取行业对应的风格采样权重（归一化为概率）
    """
    raw_weights = style_matrix[industry_l1]  # e.g. {"Glassmorphism": 4, "Neumorphism": 3, ...}

    # 过滤掉权重为0的风格
    valid = {k: v for k, v in raw_weights.items() if v > 0}

    # Softmax 归一化（temperature=0.5 增强高权重风格的概率）
    values = np.array(list(valid.values()), dtype=float)
    exp_v = np.exp(values / 0.5)
    probs = exp_v / exp_v.sum()

    return dict(zip(valid.keys(), probs.tolist()))
```

---

## 设计风格 × 行业场景示例 Query

以下为每种风格在典型行业下的 Query 示例，供理解"风格维度"如何影响 Query 语言：

**Glassmorphism × SaaS 仪表盘**:
> "帮我做一个 SaaS 分析平台的主仪表盘，使用玻璃拟态风格，卡片用毛玻璃半透明效果，背景是渐变紫蓝色网格，显示用户活跃度、收入趋势、和最近事件三个模块"

**Neumorphism × 健康应用**:
> "设计一个冥想计时器组件，软质拟态风格，浅灰背景上的凸起圆形按钮，有内嵌的进度环，颜色用薰衣草紫，整体要有触觉感和平静感"

**Neubrutalism × 创意作品集**:
> "做一个设计师作品集首页，新暴力美学风格，黑色粗边框卡片，配色用荧光黄和黑色，项目卡片有 4px 错位阴影，hover 时错位消失产生按下效果"

**Minimalism × 金融服务**:
> "实现一个个人投资组合概览页，极简风格，白底黑字，仅用一个强调色（墨绿色），字体层级驱动，资产分布用简洁环形图，避免任何装饰性元素"

**Cyberpunk × Web3**:
> "构建 DeFi 流动性挖矿的操作界面，赛博朋克风格，深黑背景配霓虹青绿色，数据用发光文字效果，按钮有霓虹光晕，背景加斜网格纹"

**Data-Dense × 运营后台**:
> "做一个电商运营后台的实时订单监控页，数据厚重风格，表格密集但清晰，用颜色区分订单状态（红/黄/绿），顶部有 6 个 KPI 迷你卡，要能快速扫视找到异常数据"

---

## 在 Stage 3 中的应用

风格维度的使用规则：
1. **按适配矩阵权重采样**，高适配分的风格被选中概率更高
2. **用户角色影响风格权重**：UI设计师更可能提出非主流风格（Neubrutalism/Cyberpunk）；产品经理倾向主流风格（Minimalism/Material）
3. **风格信息注入 Persona 提示词**：作为 `设计偏好` 字段，但不强制要求每条 Query 都显式提及风格名称——有时通过隐含描述（"要有毛玻璃效果"）体现更自然
