/**
 * build-expand200-plan.js
 *
 * 对当前 plan 做发散性拓展，构造 200 条新任务，规范落盘：
 *
 *   Part A (82 tasks): 41 个 extra 场景第 2 轮，换用不同 product_type 和复杂度组合
 *   Part B (60 tasks): 20 个低覆盖原始场景（scene_039–058）
 *   Part C (58 tasks): 19 个全新领域场景
 *     — 覆盖当前盲区：fintech / healthcare / dev-tools / creative / IoT / pet / creator
 *
 * design_style 默认 null（由 LLM 自由发挥）。
 * 需要注入风格时使用 --design-styles 标志：
 *
 * 用法：
 *   node scripts/build-expand200-plan.js [--dry-run]
 *   node scripts/build-expand200-plan.js --design-styles "Dark,Glassmorphism,Cyberpunk"
 *   node scripts/build-expand200-plan.js --design-styles auto   # 按场景启发式推断
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const PLAN_OUT = path.join(ROOT, "data/intermediate/generation_plan.expand200.jsonl");
const RAW_OUT  = path.join(ROOT, "data/output/raw_queries.expand200.jsonl");
const SCORED_OUT = path.join(ROOT, "data/output/scored_queries.expand200.jsonl");

// ─── helpers ────────────────────────────────────────────────────────────────

function seed(sceneId, seq, salt = "") {
  return crypto.createHash("md5").update(`${sceneId}_${seq}_${salt}`).digest("hex").slice(0, 10);
}

function task(sceneId, l1, l2Label, l2Raw, examples, appType, productType, complexity, designStyle, seq, groupIndex, planType = "expand") {
  return {
    query_id: `q_${sceneId}_${String(seq).padStart(3, "0")}`,
    scene_id: sceneId,
    l1_scene: l1,
    l2_scene_label: l2Label,
    l2_scene_raw: l2Raw,
    l2_scene_examples: examples,
    application_type: appType,
    product_type: productType,
    target_complexity: complexity,
    design_style: designStyle || null,
    persona_seed: seed(sceneId, seq, planType),
    plan_type: planType,
    target_count_hint: 10,
  };
}

// ─── constants ───────────────────────────────────────────────────────────────

const DESIGN_STYLES = ["Dark", "Glassmorphism", "Vibrant", "Minimalism", "Material", "Neumorphism", "Luxury", "Cyberpunk"];
const COMPLEXITIES  = ["vague", "medium", "complex"];
const PRODUCT_TYPES = [
  "portfolio", "landing_page", "content_blog", "form_flow", "admin_panel",
  "search_filter", "dashboard", "social_feed", "realtime_collab",
  "booking_service", "game_hud", "media_player", "ecommerce_shop",
];

// extra scenes defined in generate-extra-scenes.js — reuse same definitions
const EXTRA_SCENES = [
  // 教育学习 +4
  { l1: "教育学习", label: "语言学习/口语练习 ★", examples: ["词汇练习", "口语跟读", "发音纠正", "单词配对"], apps: ["语言学习应用", "词汇练习应用", "口语练习应用"] },
  { l1: "教育学习", label: "在线课程/视频学习管理", examples: ["课程列表", "视频进度", "课件下载", "学习计划"], apps: ["在线课程应用", "学习视频播放应用", "课程管理应用"] },
  { l1: "教育学习", label: "错题本/学习笔记整理 ★", examples: ["错题收集", "知识点标注", "复习提醒", "分类归档"], apps: ["错题整理应用", "学习笔记应用", "错题复习应用"] },
  { l1: "教育学习", label: "亲子启蒙/儿童学习 ★", examples: ["识字游戏", "数字启蒙", "儿歌绘本", "亲子互动"], apps: ["亲子启蒙应用", "儿童识字应用", "儿童学习应用"] },
  // 办公效率 +4
  { l1: "办公效率", label: "会议记录/会议纪要 ★", examples: ["议程整理", "行动项追踪", "与会者管理", "纪要导出"], apps: ["会议记录应用", "会议纪要管理应用", "会议助手应用"] },
  { l1: "办公效率", label: "项目看板/任务追踪 ★", examples: ["看板视图", "进度条", "优先级标签", "里程碑管理"], apps: ["项目看板应用", "敏捷管理应用", "任务追踪应用"] },
  { l1: "办公效率", label: "知识库/内部文档协作", examples: ["Wiki 页面", "文档搜索", "权限管理", "版本历史"], apps: ["知识库应用", "内部文档协作应用", "企业 Wiki 应用"] },
  { l1: "办公效率", label: "周报/工作汇报模板 ★", examples: ["本周完成", "下周计划", "遇到问题", "关键指标"], apps: ["周报生成应用", "工作汇报应用", "进度汇报应用"] },
  // 健康管理 +3
  { l1: "健康管理", label: "心情日记/情绪追踪 ★", examples: ["情绪打卡", "日记记录", "心情趋势图", "情绪标签"], apps: ["心情日记应用", "情绪记录应用", "心理健康追踪应用"] },
  { l1: "健康管理", label: "冥想/呼吸练习 ★", examples: ["呼吸引导", "冥想计时", "背景音效", "练习历史"], apps: ["冥想计时应用", "呼吸练习应用", "正念冥想应用"] },
  { l1: "健康管理", label: "饮食计划/营养追踪 ★", examples: ["每日饮食记录", "卡路里统计", "营养素分析", "餐食计划"], apps: ["饮食计划应用", "营养摄入追踪应用", "健康饮食记录应用"] },
  // 出行助手 +4
  { l1: "出行助手", label: "签证/入境信息查询", examples: ["签证要求", "免签国家", "申请流程", "大使馆信息"], apps: ["签证信息查询应用", "入境政策查询应用", "旅行合规助手"] },
  { l1: "出行助手", label: "货币换算/旅行预算 ★", examples: ["实时汇率", "多币种换算", "支出记录", "旅行预算规划"], apps: ["货币换算应用", "旅行预算应用", "出行记账应用"] },
  { l1: "出行助手", label: "景点/旅游攻略推荐", examples: ["热门景点", "用户评价", "最佳游览时间", "票价信息"], apps: ["旅游攻略推荐应用", "景点信息应用", "旅行指南应用"] },
  { l1: "出行助手", label: "公交/本地出行查询 ★", examples: ["实时公交", "换乘方案", "地铁线路图", "共享单车"], apps: ["公交查询应用", "地铁导航应用", "本地出行应用"] },
  // 美食探店 +4
  { l1: "美食探店", label: "美食地图/餐厅收藏 ★", examples: ["地图标注", "餐厅评分", "收藏夹", "附近推荐"], apps: ["美食地图应用", "餐厅收藏应用", "美食发现应用"] },
  { l1: "美食探店", label: "在线点餐/菜单浏览", examples: ["菜品详情", "规格选择", "加入购物车", "营养信息"], apps: ["在线点餐应用", "餐厅菜单应用", "扫码点餐应用"] },
  { l1: "美食探店", label: "食材管理/购物清单 ★", examples: ["食材库存", "保质期提醒", "采购清单", "食材分类"], apps: ["冰箱食材管理应用", "食材清单应用", "厨房管理应用"] },
  { l1: "美食探店", label: "外卖配送追踪", examples: ["订单状态", "配送地图", "预计时间", "骑手位置"], apps: ["外卖配送追踪应用", "外卖订单管理应用", "实时订单应用"] },
  // 休闲游戏 +3
  { l1: "休闲游戏", label: "数独/益智拼图 ★", examples: ["难度等级", "提示功能", "错误标注", "计时挑战"], apps: ["数独应用", "益智拼图应用", "逻辑推理游戏"] },
  { l1: "休闲游戏", label: "在线棋牌/桌游", examples: ["象棋对弈", "围棋", "扑克牌", "骰子游戏"], apps: ["象棋应用", "在线棋牌应用", "桌游应用"] },
  { l1: "休闲游戏", label: "每日挑战/签到打卡游戏 ★", examples: ["每日任务", "连签奖励", "成就徽章", "排行榜"], apps: ["每日挑战应用", "签到打卡游戏", "成就系统应用"] },
  // 多媒体处理 +3
  { l1: "多媒体处理", label: "相册整理/照片分类 ★", examples: ["智能分组", "人物识别", "地点归类", "时间线视图"], apps: ["智能相册管理应用", "照片分类应用", "相册整理应用"] },
  { l1: "多媒体处理", label: "音乐播放/歌词同步", examples: ["播放列表", "歌词滚动", "均衡器", "离线下载"], apps: ["音乐播放应用", "歌词同步应用", "个人音乐库应用"] },
  { l1: "多媒体处理", label: "短视频制作/视频剪辑 ★", examples: ["剪辑时间轴", "滤镜特效", "字幕添加", "音乐配乐"], apps: ["短视频制作应用", "视频剪辑应用", "视频编辑器"] },
  // 新闻资讯 +4
  { l1: "新闻资讯", label: "话题聚合/专题页面 ★", examples: ["热点话题", "相关报道", "时间线", "深度分析"], apps: ["话题聚合应用", "新闻专题应用", "事件追踪应用"] },
  { l1: "新闻资讯", label: "评论/讨论社区", examples: ["评论列表", "点赞回复", "楼中楼", "举报管理"], apps: ["新闻评论社区应用", "读者互动应用", "讨论区应用"] },
  { l1: "新闻资讯", label: "个性化资讯推荐/偏好设置 ★", examples: ["兴趣标签", "屏蔽关键词", "订阅源管理", "推荐解释"], apps: ["个性化资讯推荐应用", "信息流偏好设置应用", "兴趣订阅管理应用"] },
  { l1: "新闻资讯", label: "财经/股市行情看板", examples: ["K线图", "涨跌幅", "自选股", "财经日历"], apps: ["财经资讯应用", "股市行情应用", "投资看板应用"] },
  // 购物消费 +4
  { l1: "购物消费", label: "优惠券/会员积分管理 ★", examples: ["可用优惠券", "积分余额", "兑换记录", "到期提醒"], apps: ["优惠券管理应用", "积分兑换应用", "会员权益应用"] },
  { l1: "购物消费", label: "价格历史/商品比价 ★", examples: ["价格走势图", "跨平台对比", "历史低价标注", "降价提醒"], apps: ["商品比价应用", "价格监控应用", "购物决策应用"] },
  { l1: "购物消费", label: "商品收藏/心愿单", examples: ["收藏列表", "分享心愿单", "库存提醒", "价格变动"], apps: ["购物心愿单应用", "商品收藏应用", "愿望清单应用"] },
  { l1: "购物消费", label: "二手买卖/闲置交易 ★", examples: ["商品发布", "议价聊天", "评价系统", "交易保障"], apps: ["二手交易应用", "闲置物品出售应用", "二手市场应用"] },
  // 实用工具 +3
  { l1: "实用工具", label: "二维码/名片工具 ★", examples: ["二维码生成", "扫描识别", "名片OCR", "批量导出"], apps: ["二维码生成应用", "名片扫描应用", "二维码工具应用"] },
  { l1: "实用工具", label: "个人记账/财务管理 ★", examples: ["收支记录", "分类统计", "月度报告", "预算提醒"], apps: ["个人记账应用", "家庭财务应用", "支出追踪应用"] },
  { l1: "实用工具", label: "密码管理/账号安全", examples: ["密码保存", "强度检测", "自动填充", "安全审计"], apps: ["密码管理应用", "账号安全应用", "密码库应用"] },
  // 交互方式 +2
  { l1: "交互方式", label: "Notifications & Alerts 通知与提醒 ★", examples: ["系统通知", "自定义提醒", "通知分组", "免打扰设置"], apps: ["通知中心应用", "提醒管理应用", "消息通知应用"] },
  { l1: "交互方式", label: "Onboarding & Setup 引导与配置", examples: ["新手教程", "步骤引导", "配置向导", "功能介绍"], apps: ["新用户引导应用", "产品配置向导", "功能引导应用"] },
  // 深度研究展示 +3
  { l1: "深度研究展示", label: "学术研究/论文展示 ★", examples: ["研究摘要", "引用统计", "可视化图表", "合著网络"], apps: ["学术研究展示应用", "论文展示应用", "研究成果主页"] },
  { l1: "深度研究展示", label: "数据报告/分析仪表盘", examples: ["关键指标", "趋势图表", "数据筛选", "导出报告"], apps: ["数据分析报告应用", "研究分析仪表盘应用", "数据可视化应用"] },
  { l1: "深度研究展示", label: "品牌/个人官网/介绍页 ★", examples: ["品牌故事", "团队介绍", "产品展示", "联系方式"], apps: ["品牌官网应用", "公司介绍页应用", "个人官网应用"] },
];

// 19 brand-new domain scenes (scene_104 onward)
const NEW_SCENES = [
  // Fintech
  { l1: "实用工具", label: "个人投资组合追踪", raw: "个人投资组合追踪（持仓概览、收益曲线、资产配置）", examples: ["持仓概览", "收益曲线", "资产配置", "风险评估"], apps: ["投资组合追踪应用", "理财数据应用", "资产管理应用"] },
  { l1: "实用工具", label: "家庭预算/账单管理", raw: "家庭预算/账单管理（月度预算、账单分类、超支预警）", examples: ["月度预算", "账单分类", "家庭成员共享", "超支预警"], apps: ["家庭账单管理应用", "预算规划应用", "家庭支出追踪应用"] },
  { l1: "实用工具", label: "税务计算/报税助手", raw: "税务计算/报税助手（收入录入、税额计算、退税查询）", examples: ["收入录入", "税额估算", "退税查询", "申报提醒"], apps: ["个税计算器应用", "报税助手应用", "税务管理应用"] },
  // Healthcare
  { l1: "健康管理", label: "症状自查/智能问诊", raw: "症状自查/智能问诊（症状选择、风险评估、就医建议）", examples: ["症状选择", "风险评估", "就医建议", "健康知识库"], apps: ["症状自查应用", "智能问诊应用", "健康评估工具"] },
  { l1: "健康管理", label: "医院/医生预约挂号", raw: "医院/医生预约挂号（科室选择、医生列表、预约时段）", examples: ["科室选择", "医生列表", "可预约时段", "候诊提醒"], apps: ["在线挂号应用", "医疗预约应用", "门诊预约管理应用"] },
  // Developer tools
  { l1: "办公效率", label: "代码片段/Snippet管理", raw: "代码片段/Snippet管理（代码收藏、标签分类、语法高亮）", examples: ["代码收藏", "标签分类", "语法高亮", "一键复制"], apps: ["代码片段管理应用", "Snippet库应用", "开发者工具应用"] },
  { l1: "办公效率", label: "API文档浏览/接口调试", raw: "API文档浏览/接口调试（接口列表、参数说明、调试请求）", examples: ["接口列表", "参数说明", "调试请求", "响应预览"], apps: ["API文档浏览器应用", "接口调试工具", "开发者文档应用"] },
  // Creative/Design
  { l1: "深度研究展示", label: "设计灵感/Moodboard收集", raw: "设计灵感/Moodboard收集（图片收集、主题分组、颜色提取）", examples: ["图片收集", "主题分组", "颜色提取", "分享协作"], apps: ["灵感收集应用", "Moodboard工具", "设计灵感板应用"] },
  { l1: "实用工具", label: "配色方案/色板生成工具", raw: "配色方案/色板生成工具（颜色生成、配色规则、导出格式）", examples: ["颜色生成", "和谐配色", "导出格式", "参考案例"], apps: ["配色方案应用", "色板生成器", "设计色彩工具"] },
  // Smart Home / IoT
  { l1: "实用工具", label: "智能家居控制面板", raw: "智能家居控制面板（设备列表、一键场景、能耗统计）", examples: ["设备列表", "一键场景", "能耗统计", "远程控制"], apps: ["智能家居控制应用", "家庭IoT面板", "智能设备管理应用"] },
  // Event / Planning
  { l1: "办公效率", label: "活动策划/邀请函生成", raw: "活动策划/邀请函生成（活动详情、邀请名单、电子邀请函）", examples: ["活动详情", "邀请名单", "电子邀请函", "报名确认"], apps: ["活动策划应用", "邀请函生成器", "活动管理应用"] },
  { l1: "办公效率", label: "在线白板/头脑风暴", raw: "在线白板/头脑风暴（便利贴墙、思维导图、实时协作）", examples: ["便利贴墙", "思维导图", "实时协作", "投票点赞"], apps: ["在线白板应用", "头脑风暴工具", "团队协作白板"] },
  // Pet care
  { l1: "健康管理", label: "宠物健康/成长记录", raw: "宠物健康/成长记录（疫苗记录、体重曲线、就医提醒）", examples: ["疫苗记录", "体重曲线", "饮食日志", "就医提醒"], apps: ["宠物健康记录应用", "宠物成长日记应用", "宠物管理应用"] },
  // Creator economy
  { l1: "新闻资讯", label: "内容创作者数据看板", raw: "内容创作者数据看板（播放量统计、粉丝增长、变现追踪）", examples: ["播放量统计", "粉丝增长", "变现追踪", "内容排行"], apps: ["创作者数据看板应用", "内容分析应用", "博主数据应用"] },
  // Social/Community
  { l1: "新闻资讯", label: "用户评测/晒单社区", raw: "用户评测/晒单社区（商品评测、图文晒单、评分互动）", examples: ["商品评测", "图文晒单", "评分系统", "用户互动"], apps: ["评测晒单社区应用", "用户评价平台", "商品测评应用"] },
  { l1: "新闻资讯", label: "专业问答/求助社区", raw: "专业问答/求助社区（提问发帖、最佳答案、悬赏机制）", examples: ["提问发帖", "最佳答案", "悬赏机制", "专家认证"], apps: ["专业问答社区应用", "求助平台应用", "知识问答应用"] },
  // Travel enhanced
  { l1: "出行助手", label: "旅行日记/足迹地图", raw: "旅行日记/足迹地图（打卡地点、足迹可视化、相册联动）", examples: ["打卡地点", "足迹可视化", "相册联动", "分享攻略"], apps: ["旅行足迹地图应用", "旅行日记应用", "足迹打卡应用"] },
  // Environmental
  { l1: "健康管理", label: "碳足迹/绿色生活追踪", raw: "碳足迹/绿色生活追踪（出行记录、饮食碳排、节能提醒）", examples: ["出行碳排", "饮食碳排", "节能提醒", "减碳排行"], apps: ["碳足迹追踪应用", "绿色生活记录应用", "环保行动应用"] },
  // Local services
  { l1: "出行助手", label: "本地服务/上门预约", raw: "本地服务/上门预约（服务分类、服务商列表、时间预约）", examples: ["服务分类", "服务商列表", "时间预约", "服务评价"], apps: ["本地服务预约应用", "上门服务平台", "到家服务应用"] },
];

// product_type assignment helpers
const PT_FOR_DOMAIN = {
  "实用工具": ["form_flow", "dashboard", "admin_panel"],
  "健康管理": ["dashboard", "content_blog", "form_flow"],
  "办公效率": ["admin_panel", "realtime_collab", "dashboard"],
  "新闻资讯": ["social_feed", "content_blog", "dashboard"],
  "出行助手": ["booking_service", "search_filter", "landing_page"],
  "多媒体处理": ["media_player", "portfolio", "admin_panel"],
  "休闲游戏": ["game_hud", "social_feed", "landing_page"],
  "美食探店": ["ecommerce_shop", "search_filter", "booking_service"],
  "购物消费": ["ecommerce_shop", "dashboard", "social_feed"],
  "教育学习": ["content_blog", "form_flow", "dashboard"],
  "深度研究展示": ["portfolio", "landing_page", "dashboard"],
  "交互方式": ["form_flow", "landing_page", "admin_panel"],
};

function ptForScene(l1, idx) {
  const pts = PT_FOR_DOMAIN[l1] || ["portfolio", "dashboard", "form_flow"];
  return pts[idx % pts.length];
}

// ─── Part A: Extra scene round 2 (82 tasks) ──────────────────────────────────

function pickStyle(designStyles, groupIndex) {
  if (!designStyles) return null;
  if (designStyles === "auto") return DESIGN_STYLES[groupIndex % DESIGN_STYLES.length] || null;
  if (Array.isArray(designStyles)) return designStyles[groupIndex % designStyles.length] || null;
  return null;
}

function buildPartA(designStyles = null) {
  const tasks = [];
  // extra scenes start at scene_063, round 1 used seqs 001-003
  // round 2: seq 004 and seq 005 (shifted complexities for divergence)
  let sceneNum = 63;
  EXTRA_SCENES.forEach((scene, i) => {
    const sceneId = `scene_${String(sceneNum + i).padStart(3, "0")}`;
    const compA = COMPLEXITIES[(i + 1) % 3];
    const compB = COMPLEXITIES[(i + 2) % 3];
    const appA = scene.apps[0];
    const appB = scene.apps[1 % scene.apps.length];
    const ptA = ptForScene(scene.l1, i + 1);
    const ptB = ptForScene(scene.l1, i + 2);
    const dsA = pickStyle(designStyles, i * 2);
    const dsB = pickStyle(designStyles, i * 2 + 1);

    tasks.push(task(sceneId, scene.l1, scene.label, scene.label, scene.examples,
      appA, ptA, compA, dsA, 4, i, "expand_r2"));
    tasks.push(task(sceneId, scene.l1, scene.label, scene.label, scene.examples,
      appB, ptB, compB, dsB, 5, i, "expand_r2"));
  });
  return tasks;
}

// ─── Part B: 20 underserved original scenes + design_style (60 tasks) ────────

// Scenes with lowest coverage (3-5 queries), from coverage analysis output
const PARTB_SCENES = [
  // scene_039-043 (5 queries each)
  { id: "scene_039", l1: "出行助手",  label: "行程规划器 ★",      examples: ["目的地选择","日程安排","交通搭配","预算估算"],   apps: ["行程规划应用","旅行计划应用","出行助手应用"] },
  { id: "scene_040", l1: "出行助手",  label: "打包清单/旅行准备",  examples: ["行李清单","物品分类","勾选确认","模板复用"],     apps: ["旅行打包清单应用","行李管理应用","出行准备应用"] },
  { id: "scene_041", l1: "出行助手",  label: "地图/路线导航",      examples: ["起终点设置","路线对比","实时导航","收藏地点"],   apps: ["路线导航应用","地图查询应用","出行路线应用"] },
  { id: "scene_042", l1: "出行助手",  label: "天气/实时信息查询",  examples: ["当前天气","7天预报","预警信息","体感温度"],       apps: ["天气查询应用","实时天气应用","气象信息应用"] },
  { id: "scene_043", l1: "出行助手",  label: "交通时刻/票价查询",  examples: ["出发站选择","时刻表","票价比较","购票跳转"],     apps: ["交通票价查询应用","时刻表应用","出行票务应用"] },
  // scene_044-062 (3-4 queries each)
  { id: "scene_044", l1: "美食探店",  label: "\"今天吃什么\"随机选择器 ★", examples: ["随机推荐","口味筛选","距离限制","结果展示"], apps: ["随机餐食推荐应用","今天吃什么应用","餐厅随机选择应用"] },
  { id: "scene_045", l1: "美食探店",  label: "食物热量/升糖查询 ★", examples: ["食物搜索","热量数值","营养成分","每日摄入汇总"], apps: ["热量查询应用","食物营养应用","卡路里数据库应用"] },
  { id: "scene_046", l1: "美食探店",  label: "菜谱生成/食材搭配",  examples: ["食材输入","菜谱匹配","步骤说明","营养分析"],   apps: ["菜谱生成应用","食材搭配应用","智能厨房应用"] },
  { id: "scene_047", l1: "美食探店",  label: "餐厅列表/点评浏览",  examples: ["餐厅列表","评分过滤","用户评论","图片预览"],   apps: ["餐厅点评应用","美食评价应用","餐厅发现应用"] },
  { id: "scene_048", l1: "休闲游戏",  label: "文字猜谜/知识竞赛 ★", examples: ["题目展示","选项作答","计时挑战","排行榜"],    apps: ["文字猜谜应用","知识竞赛游戏","问答挑战应用"] },
  { id: "scene_049", l1: "休闲游戏",  label: "抽签/转盘/随机决策 ★", examples: ["转盘动画","自定义选项","结果记录","多人模式"], apps: ["随机决策转盘应用","抽签工具应用","命运之轮应用"] },
  { id: "scene_050", l1: "休闲游戏",  label: "经典小游戏",         examples: ["游戏列表","排行榜","成就系统","好友挑战"],     apps: ["经典小游戏合集", "休闲游戏应用","迷你游戏应用"] },
  { id: "scene_051", l1: "休闲游戏",  label: "情绪减压/解压玩具",  examples: ["解压动画","触感反馈","情绪选择","放松引导"],   apps: ["解压玩具应用","情绪减压应用","放松互动应用"] },
  { id: "scene_052", l1: "多媒体处理", label: "图片编辑/滤镜/裁剪", examples: ["滤镜效果","裁剪工具","文字水印","导出分享"],  apps: ["图片编辑应用","滤镜美化应用","照片处理工具"] },
  { id: "scene_053", l1: "多媒体处理", label: "海报/简历/卡片模板 ★", examples: ["模板库","自定义元素","文字编辑","导出PNG/PDF"], apps: ["海报设计应用","简历模板应用","卡片生成器"] },
  { id: "scene_054", l1: "多媒体处理", label: "音视频播放界面",     examples: ["播放控制","进度条","画质选择","字幕切换"],     apps: ["视频播放器应用","音频播放应用","媒体中心应用"] },
  { id: "scene_055", l1: "多媒体处理", label: "内容创作工具",       examples: ["编辑画布","素材库","图层管理","发布分享"],     apps: ["内容创作工具应用","创作编辑器应用","设计创作应用"] },
  { id: "scene_056", l1: "新闻资讯",  label: "信息流/Feed 浏览",   examples: ["卡片列表","无限滚动","快速收藏","已读标记"],   apps: ["信息流浏览应用","资讯Feed应用","内容聚合应用"] },
  { id: "scene_057", l1: "新闻资讯",  label: "文章详情/阅读模式",  examples: ["正文排版","夜间模式","字号调节","收藏分享"],   apps: ["文章阅读应用","内容详情页应用","阅读体验应用"] },
  { id: "scene_058", l1: "新闻资讯",  label: "订阅/频道管理",      examples: ["订阅列表","新内容提醒","取消订阅","分组管理"], apps: ["内容订阅管理应用","频道管理应用","RSS应用"] },
];

function buildPartB(designStyles = null) {
  const tasks = [];
  PARTB_SCENES.forEach((scene, i) => {
    COMPLEXITIES.forEach((comp, ci) => {
      const seq = 10 + ci; // seqs 010, 011, 012 to avoid colliding with existing 001-009
      tasks.push(task(
        scene.id, scene.l1, scene.label, scene.label, scene.examples,
        scene.apps[ci % scene.apps.length],
        ptForScene(scene.l1, ci + 3),
        comp,
        pickStyle(designStyles, i * 3 + ci), // null when no --design-styles provided
        seq, i, "expand_b"
      ));
    });
  });
  return tasks;
}

// ─── Part C: 19 brand-new domain scenes (58 tasks) ───────────────────────────

function buildPartC(designStyles = null) {
  const tasks = [];
  let sceneNum = 104; // continue from scene_103

  // product_type mapping for new domains
  const ptNewDomain = {
    "个人投资组合追踪": ["dashboard", "landing_page", "admin_panel"],
    "家庭预算/账单管理": ["dashboard", "form_flow", "admin_panel"],
    "税务计算/报税助手": ["form_flow", "dashboard", "landing_page"],
    "症状自查/智能问诊": ["form_flow", "content_blog", "landing_page"],
    "医院/医生预约挂号": ["booking_service", "search_filter", "form_flow"],
    "代码片段/Snippet管理": ["admin_panel", "search_filter", "content_blog"],
    "API文档浏览/接口调试": ["content_blog", "admin_panel", "search_filter"],
    "设计灵感/Moodboard收集": ["portfolio", "social_feed", "admin_panel"],
    "配色方案/色板生成工具": ["landing_page", "form_flow", "portfolio"],
    "智能家居控制面板": ["dashboard", "admin_panel", "landing_page"],
    "活动策划/邀请函生成": ["form_flow", "landing_page", "booking_service"],
    "在线白板/头脑风暴": ["realtime_collab", "admin_panel", "social_feed"],
    "宠物健康/成长记录": ["dashboard", "content_blog", "portfolio"],
    "内容创作者数据看板": ["dashboard", "admin_panel", "social_feed"],
    "用户评测/晒单社区": ["social_feed", "ecommerce_shop", "content_blog"],
    "专业问答/求助社区": ["social_feed", "content_blog", "admin_panel"],
    "旅行日记/足迹地图": ["portfolio", "social_feed", "landing_page"],
    "碳足迹/绿色生活追踪": ["dashboard", "content_blog", "form_flow"],
    "本地服务/上门预约": ["booking_service", "search_filter", "ecommerce_shop"],
  };

  NEW_SCENES.forEach((scene, i) => {
    const sceneId = `scene_${String(sceneNum + i).padStart(3, "0")}`;
    const pts = ptNewDomain[scene.label] || ["portfolio", "dashboard", "form_flow"];

    COMPLEXITIES.forEach((comp, ci) => {
      tasks.push(task(
        sceneId, scene.l1, scene.label, scene.raw || scene.label, scene.examples,
        scene.apps[ci % scene.apps.length],
        pts[ci % pts.length],
        comp,
        pickStyle(designStyles, i * 3 + ci), // null when no --design-styles provided
        ci + 1, i, "expand_new"
      ));
    });
  });

  // +1 extra task to reach 58: scene_104 gets a 4th complexity variant
  const bonusSceneId = `scene_${String(sceneNum).padStart(3, "0")}`;
  const bonusScene = NEW_SCENES[0];
  tasks.push(task(
    bonusSceneId, bonusScene.l1, bonusScene.label, bonusScene.raw || bonusScene.label,
    bonusScene.examples, bonusScene.apps[0], "dashboard", "complex",
    pickStyle(designStyles, 0), // respect --design-styles if set
    4, 0, "expand_new"
  ));

  return tasks;
}

// ─── main ────────────────────────────────────────────────────────────────────

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJsonl(filePath, records) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, records.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

function parseCliArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      a[key] = (next && !next.startsWith("--")) ? (i++, next) : true;
    }
  }
  return a;
}

function resolveCliDesignStyles(raw) {
  if (!raw || raw === "false") return null;
  if (raw === "auto") return "auto";
  // comma-separated list, e.g. "Dark,Glassmorphism,Cyberpunk"
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const dryRun = cliArgs["dry-run"] === true;
  const runGen = cliArgs["run"] === true;

  // design_style injection: null by default (LLM chooses freely)
  const designStyles = resolveCliDesignStyles(cliArgs["design-styles"] || null);
  if (designStyles) {
    console.log(`[design-styles] 注入风格: ${Array.isArray(designStyles) ? designStyles.join(", ") : designStyles}`);
  }

  const partA = buildPartA(designStyles);
  const partB = buildPartB(designStyles);
  const partC = buildPartC(designStyles);
  const all = [...partA, ...partB, ...partC];

  console.log(`\n=== 发散性拓展 plan: ${all.length} 条任务 ===`);
  console.log(`  Part A (extra scenes round 2): ${partA.length}`);
  console.log(`  Part B (原始低覆盖场景): ${partB.length}`);
  console.log(`  Part C (19 全新领域场景): ${partC.length}`);

  // Verify uniqueness
  const ids = new Set(all.map(t => t.query_id));
  if (ids.size !== all.length) {
    console.error(`[warn] ${all.length - ids.size} 个 query_id 重复！`);
  }

  if (dryRun) {
    console.log("\n[dry-run] 前 10 条任务预览:");
    all.slice(0, 10).forEach(t =>
      console.log(`  ${t.query_id}  L1=${t.l1_scene}  L2=${t.l2_scene_label}  app=${t.application_type}  xc=${t.target_complexity}  ds=${t.design_style}`));
    console.log(`\n[dry-run] plan 未写入。`);
    return;
  }

  writeJsonl(PLAN_OUT, all);
  console.log(`\n[ok] plan 写入: ${PLAN_OUT}`);

  // Print sample
  console.log("\n前 6 条任务预览:");
  all.slice(0, 6).forEach(t =>
    console.log(`  ${t.query_id}  ${t.l1_scene} / ${t.l2_scene_label}  ${t.target_complexity}  ds=${t.design_style || "none"}`));
  console.log("...");
  console.log(`\n完成。如需生成 query，运行：`);
  console.log(`  node scripts/generate-queries.js --input data/intermediate/generation_plan.expand200.jsonl --output data/output/raw_queries.expand200.jsonl`);
  console.log(`然后评分：`);
  console.log(`  node scripts/score-queries.js --input data/output/raw_queries.expand200.jsonl --output data/output/scored_queries.expand200.jsonl`);

  if (runGen) {
    console.log("\n[--run] 启动生成 + 评分流程...");
    const { execSync } = require("child_process");
    execSync(
      `node scripts/generate-queries.js --input data/intermediate/generation_plan.expand200.jsonl --output data/output/raw_queries.expand200.jsonl`,
      { cwd: ROOT, stdio: "inherit" }
    );
    execSync(
      `node scripts/score-queries.js --input data/output/raw_queries.expand200.jsonl --output data/output/scored_queries.expand200.jsonl`,
      { cwd: ROOT, stdio: "inherit" }
    );
    console.log(`\n[done] scored_queries.expand200.jsonl 已生成。`);
  }
}

main();
