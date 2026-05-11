#!/usr/bin/env node
/**
 * build-free200-plan.js
 *
 * 生成 200 条全新任务计划 —— design_style 全部设为 null，由 LLM 自由发挥。
 * 复杂度分布：vague:medium = 1:2（无 complex）
 *
 * Part A (100 tasks): 已有 25 个场景，使用 expand200 未覆盖的 product_type 组合
 * Part B (100 tasks): 20 个全新 L2 场景（fintech / dev-tools / creator / wellness / civic / sustainability）
 *
 * Persona 共享策略（--persona-scope）：
 *   scene  [默认] 同一 scene 内所有 task 共享一个 persona（llm-batch 缓存复用，只调一次 LLM）
 *   task          每条 task 独立生成 persona（更多样，但费时费钱）
 *
 * ⚠️  不要把 globalSeq 或任何 task 级别的值混入 persona_seed hash，
 *     否则会退化为 task 模式——这是历史上犯过的错误。
 *
 * 用法：
 *   node scripts/build-free200-plan.js [--dry-run]
 *   node scripts/build-free200-plan.js --persona-scope task   # 每条独立 persona
 */

const path = require("path");
const fs   = require("fs");
const crypto = require("crypto");

const ROOT     = path.resolve(__dirname, "..");
const PLAN_OUT = path.join(ROOT, "data/intermediate/generation_plan.free200.jsonl");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const PERSONA_SCOPE_IDX = args.indexOf("--persona-scope");
const PERSONA_SCOPE = PERSONA_SCOPE_IDX !== -1 ? args[PERSONA_SCOPE_IDX + 1] : "scene";
if (!["scene", "task"].includes(PERSONA_SCOPE)) {
  console.error(`[FATAL] --persona-scope must be "scene" or "task", got: ${PERSONA_SCOPE}`);
  process.exit(1);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// persona_seed 计算规则：
//   scene 模式（默认）：hash 只含 sceneId，同 scene 内所有 task 得到相同 seed
//                       → llm-batch 缓存复用，一个 scene 只调一次 LLM
//   task  模式        ：hash 含 sceneId + seq，每条 task 得到独立 seed
//                       → 每条都新建 persona，多样但耗时
//
// ⚠️  严禁在 scene 模式下把 seq / globalSeq / query_id 等 task 级变量混入 hash。
function makePersonaSeed(sceneId, seq) {
  if (PERSONA_SCOPE === "task") {
    return crypto.createHash("md5").update(`free_${sceneId}_${seq}`).digest("hex").slice(0, 10);
  }
  // default: scene
  return crypto.createHash("md5").update(`free_${sceneId}`).digest("hex").slice(0, 10);
}

// 按全局顺序以 1:2 比例分配 vague/medium，每 3 条中第 1 条为 vague
function makeComplexityAssigner() {
  let idx = 0;
  return () => (idx++ % 3 === 0 ? "vague" : "medium");
}

const nextComplexity = makeComplexityAssigner();
let globalSeq = 1;

function task(sceneId, l1, l2Label, examples, appType, productType) {
  const seq = globalSeq++;
  return {
    query_id:           `q_${sceneId}_${String(seq).padStart(3, "0")}`,
    scene_id:           sceneId,
    l1_scene:           l1,
    l2_scene_label:     l2Label,
    l2_scene_examples:  examples,
    application_type:   appType,
    product_type:       productType,
    target_complexity:  nextComplexity(),
    design_style:       null,
    persona_seed:       makePersonaSeed(sceneId, seq),
    plan_type:          "free",
    target_count_hint:  10,
  };
}

// ─── Part A: 已有场景，换用 expand200 未覆盖的 product_type 组合 ───────────
// 每个场景 4 个 product_type，复杂度由全局分配器决定

const PART_A_SCENES = [
  // 教育学习
  { id: "scene_fa_01", l1: "教育学习",  label: "语言学习/口语练习 ★",      examples: ["词汇练习","口语跟读","发音纠正","单词配对"],         app: "语言学习应用",         products: ["landing_page","search_filter","game_hud","booking_service"] },
  { id: "scene_fa_02", l1: "教育学习",  label: "错题本/学习笔记整理 ★",    examples: ["错题收集","知识点标注","复习提醒","分类归档"],         app: "错题整理应用",         products: ["search_filter","dashboard","social_feed","admin_panel"] },
  { id: "scene_fa_03", l1: "教育学习",  label: "亲子启蒙/儿童学习 ★",      examples: ["识字游戏","数字启蒙","儿歌绘本","亲子互动"],           app: "亲子启蒙应用",         products: ["landing_page","game_hud","content_blog","portfolio"] },
  // 办公效率
  { id: "scene_fa_04", l1: "办公效率",  label: "项目看板/任务追踪 ★",      examples: ["看板视图","进度条","优先级标签","里程碑管理"],         app: "项目看板应用",         products: ["dashboard","form_flow","landing_page","social_feed"] },
  { id: "scene_fa_05", l1: "办公效率",  label: "周报/工作汇报模板 ★",      examples: ["本周完成","下周计划","遇到问题","关键指标"],           app: "工作汇报应用",         products: ["form_flow","content_blog","portfolio","social_feed"] },
  { id: "scene_fa_06", l1: "办公效率",  label: "API文档浏览/接口调试",     examples: ["接口列表","参数说明","测试请求","响应示例"],           app: "API文档工具",          products: ["search_filter","admin_panel","dashboard","realtime_collab"] },
  // 健康管理
  { id: "scene_fa_07", l1: "健康管理",  label: "心情日记/情绪追踪 ★",      examples: ["情绪打卡","日记记录","心情趋势图","情绪标签"],         app: "心情日记应用",         products: ["form_flow","portfolio","landing_page","social_feed"] },
  { id: "scene_fa_08", l1: "健康管理",  label: "饮食计划/营养追踪 ★",      examples: ["每日饮食记录","卡路里统计","营养素分析","餐食计划"],   app: "饮食计划应用",         products: ["search_filter","ecommerce_shop","form_flow","dashboard"] },
  { id: "scene_fa_09", l1: "健康管理",  label: "症状自查/智能问诊",        examples: ["症状选择","风险评估","就医建议","科室推荐"],           app: "健康自查应用",         products: ["form_flow","landing_page","search_filter","admin_panel"] },
  // 出行助手
  { id: "scene_fa_10", l1: "出行助手",  label: "行程规划器 ★",             examples: ["日程安排","景点串联","时间分配","多人协同"],           app: "行程规划应用",         products: ["realtime_collab","form_flow","dashboard","admin_panel"] },
  { id: "scene_fa_11", l1: "出行助手",  label: "货币换算/旅行预算 ★",      examples: ["实时汇率","多币种换算","支出记录","旅行预算规划"],     app: "旅行预算应用",         products: ["landing_page","admin_panel","form_flow","dashboard"] },
  { id: "scene_fa_12", l1: "出行助手",  label: "天气/实时信息查询",        examples: ["7天预报","空气质量","UV指数","降雨概率"],             app: "天气查询应用",         products: ["landing_page","media_player","dashboard","content_blog"] },
  // 美食探店
  { id: "scene_fa_13", l1: "美食探店",  label: "美食地图/餐厅收藏 ★",      examples: ["地图标注","餐厅评分","收藏夹","附近推荐"],             app: "美食地图应用",         products: ["social_feed","ecommerce_shop","landing_page","search_filter"] },
  { id: "scene_fa_14", l1: "美食探店",  label: "食材管理/购物清单 ★",      examples: ["食材库存","保质期提醒","采购清单","食材分类"],         app: "冰箱食材管理应用",     products: ["form_flow","search_filter","dashboard","admin_panel"] },
  // 休闲游戏
  { id: "scene_fa_15", l1: "休闲游戏",  label: "数独/益智拼图 ★",          examples: ["难度等级","提示功能","错误标注","计时挑战"],           app: "数独应用",             products: ["landing_page","dashboard","social_feed","portfolio"] },
  { id: "scene_fa_16", l1: "休闲游戏",  label: "文字猜谜/知识竞赛 ★",      examples: ["题目展示","倒计时","答题反馈","排行榜"],               app: "知识竞赛应用",         products: ["realtime_collab","game_hud","landing_page","social_feed"] },
  // 多媒体处理
  { id: "scene_fa_17", l1: "多媒体处理", label: "相册整理/照片分类 ★",     examples: ["智能分组","人物识别","地点归类","时间线视图"],         app: "智能相册管理应用",     products: ["admin_panel","search_filter","dashboard","portfolio"] },
  { id: "scene_fa_18", l1: "多媒体处理", label: "海报/简历/卡片模板 ★",    examples: ["模板库","拖拽编辑","导出格式","品牌配色"],             app: "模板设计应用",         products: ["ecommerce_shop","landing_page","social_feed","portfolio"] },
  // 新闻资讯
  { id: "scene_fa_19", l1: "新闻资讯",  label: "财经/股市行情看板",        examples: ["实时行情","K线图","涨跌榜","自选股"],                 app: "股市行情应用",         products: ["landing_page","social_feed","search_filter","realtime_collab"] },
  { id: "scene_fa_20", l1: "新闻资讯",  label: "个性化资讯推荐/偏好设置 ★", examples: ["兴趣标签","关键词过滤","阅读历史","推送频率"],        app: "资讯推荐应用",         products: ["form_flow","admin_panel","landing_page","dashboard"] },
  // 购物消费
  { id: "scene_fa_21", l1: "购物消费",  label: "二手买卖/闲置交易 ★",      examples: ["商品发布","聊天议价","信用评分","同城配送"],           app: "二手交易应用",         products: ["landing_page","realtime_collab","admin_panel","form_flow"] },
  { id: "scene_fa_22", l1: "购物消费",  label: "价格历史/商品比价 ★",      examples: ["价格走势图","全网比价","降价提醒","优惠预测"],         app: "比价工具应用",         products: ["dashboard","search_filter","landing_page","content_blog"] },
  // 实用工具
  { id: "scene_fa_23", l1: "实用工具",  label: "密码管理/账号安全",        examples: ["密码保险箱","强度检测","一键填充","泄露提醒"],         app: "密码管理应用",         products: ["landing_page","admin_panel","form_flow","dashboard"] },
  { id: "scene_fa_24", l1: "实用工具",  label: "智能家居控制面板",         examples: ["设备状态","场景模式","定时控制","能耗统计"],           app: "智能家居应用",         products: ["dashboard","realtime_collab","landing_page","admin_panel"] },
  { id: "scene_fa_25", l1: "实用工具",  label: "配色方案/色板生成工具",    examples: ["调色板生成","颜色提取","对比度检测","导出代码"],       app: "设计配色应用",         products: ["portfolio","landing_page","social_feed","content_blog"] },
];

// ─── Part B: 20 个全新场景，每场景 5 个 product_type ─────────────────────────

const PART_B_SCENES = [
  // Fintech / 金融科技
  { id: "scene_fb_01", l1: "金融科技",    label: "加密货币/数字资产管理",       examples: ["资产总览","持仓分析","交易记录","Gas费追踪"],           app: "数字资产管理应用",     products: ["dashboard","search_filter","admin_panel","realtime_collab","landing_page"] },
  { id: "scene_fb_02", l1: "金融科技",    label: "个人贷款/分期计算器 ★",       examples: ["还款计划","利率对比","申请表单","资质预评估"],           app: "贷款计算应用",         products: ["form_flow","landing_page","dashboard","ecommerce_shop","admin_panel"] },
  { id: "scene_fb_03", l1: "金融科技",    label: "企业费控/报销管理 ★",         examples: ["票据上传","审批流程","预算看板","合规检查"],             app: "费控报销应用",         products: ["admin_panel","form_flow","dashboard","realtime_collab","landing_page"] },
  // Developer Tools / 开发者工具
  { id: "scene_fb_04", l1: "开发者工具",  label: "CI/CD 流水线监控 ★",          examples: ["构建状态","测试覆盖率","部署历史","错误日志"],           app: "CI/CD监控应用",        products: ["dashboard","realtime_collab","admin_panel","search_filter","content_blog"] },
  { id: "scene_fb_05", l1: "开发者工具",  label: "低代码/可视化表单搭建 ★",     examples: ["拖拽组件","字段配置","逻辑条件","数据绑定"],             app: "低代码表单工具",       products: ["admin_panel","form_flow","dashboard","realtime_collab","landing_page"] },
  { id: "scene_fb_06", l1: "开发者工具",  label: "错误追踪/崩溃分析 ★",         examples: ["异常堆栈","影响用户数","版本分布","一键复现"],           app: "错误追踪应用",         products: ["dashboard","search_filter","realtime_collab","admin_panel","content_blog"] },
  // Creator Economy / 创作者经济
  { id: "scene_fb_07", l1: "创作者经济",  label: "内容创作者数据分析 ★",        examples: ["粉丝增长","视频播放量","收益报告","最佳发布时段"],       app: "创作者数据应用",       products: ["dashboard","content_blog","admin_panel","social_feed","portfolio"] },
  { id: "scene_fb_08", l1: "创作者经济",  label: "付费订阅/会员专区管理 ★",     examples: ["订阅等级","独家内容","收益分成","订阅者管理"],           app: "付费订阅管理应用",     products: ["ecommerce_shop","admin_panel","landing_page","dashboard","social_feed"] },
  { id: "scene_fb_09", l1: "创作者经济",  label: "直播间/互动工具 ★",           examples: ["弹幕管理","打赏排行","连麦申请","直播预约"],             app: "直播互动工具",         products: ["realtime_collab","game_hud","social_feed","dashboard","landing_page"] },
  // Wellness / 身心健康
  { id: "scene_fb_10", l1: "身心健康",    label: "心理咨询预约/匹配 ★",         examples: ["咨询师档案","预约日历","匿名评价","付款方式"],           app: "心理咨询预约应用",     products: ["booking_service","form_flow","search_filter","landing_page","portfolio"] },
  { id: "scene_fb_11", l1: "身心健康",    label: "正念冥想课程/社群 ★",         examples: ["课程目录","每日打卡","社群讨论","进度勋章"],             app: "冥想课程应用",         products: ["content_blog","social_feed","landing_page","form_flow","dashboard"] },
  { id: "scene_fb_12", l1: "身心健康",    label: "睡眠追踪/助眠工具 ★",         examples: ["睡眠评分","鼾声检测","白噪音","智能闹钟"],               app: "睡眠追踪应用",         products: ["dashboard","media_player","form_flow","landing_page","content_blog"] },
  // Civic / 市政服务
  { id: "scene_fb_13", l1: "市政服务",    label: "政府服务/网上办事大厅 ★",     examples: ["办件查询","材料清单","进度跟踪","网上申报"],             app: "政务服务应用",         products: ["form_flow","search_filter","admin_panel","landing_page","dashboard"] },
  { id: "scene_fb_14", l1: "市政服务",    label: "社区公告/业主论坛 ★",         examples: ["公告列表","投票表决","报修工单","停车管理"],             app: "社区物业应用",         products: ["social_feed","admin_panel","realtime_collab","form_flow","dashboard"] },
  // Sustainability / 可持续生活
  { id: "scene_fb_15", l1: "可持续生活",  label: "碳足迹计算/减排追踪 ★",       examples: ["出行碳排放","饮食碳足迹","减排目标","减排排行"],         app: "碳足迹追踪应用",       products: ["dashboard","form_flow","content_blog","landing_page","social_feed"] },
  { id: "scene_fb_16", l1: "可持续生活",  label: "二手/可持续购物指南 ★",       examples: ["品牌评级","可持续认证","二手商品","环保替代品"],         app: "可持续购物应用",       products: ["ecommerce_shop","search_filter","content_blog","landing_page","social_feed"] },
  // Pet / 宠物生活
  { id: "scene_fb_17", l1: "宠物生活",    label: "宠物健康档案/疫苗提醒 ★",     examples: ["体检记录","疫苗日历","用药提醒","体重变化"],             app: "宠物健康管理应用",     products: ["dashboard","form_flow","admin_panel","landing_page","content_blog"] },
  { id: "scene_fb_18", l1: "宠物生活",    label: "宠物寄养/上门服务预约 ★",     examples: ["服务商资质","预约日历","实时视频","评价系统"],           app: "宠物服务预约应用",     products: ["booking_service","landing_page","search_filter","realtime_collab","ecommerce_shop"] },
  // 职业成长
  { id: "scene_fb_19", l1: "职业成长",    label: "技能评估/职业测评 ★",         examples: ["能力雷达图","岗位匹配度","学习路径","认证考试"],         app: "职业技能测评应用",     products: ["form_flow","dashboard","portfolio","landing_page","content_blog"] },
  { id: "scene_fb_20", l1: "职业成长",    label: "简历制作/求职管理 ★",         examples: ["简历模板","投递记录","面试准备","Offer对比"],             app: "求职管理应用",         products: ["portfolio","admin_panel","form_flow","landing_page","dashboard"] },
];

// ─── assemble plan ────────────────────────────────────────────────────────────

const tasks = [];

for (const scene of PART_A_SCENES) {
  for (const pt of scene.products) {
    tasks.push(task(scene.id, scene.l1, scene.label, scene.examples, scene.app, pt));
  }
}

for (const scene of PART_B_SCENES) {
  for (const pt of scene.products) {
    tasks.push(task(scene.id, scene.l1, scene.label, scene.examples, scene.app, pt));
  }
}

// ─── validation & stats ───────────────────────────────────────────────────────

console.log(`[build-free200-plan] total tasks: ${tasks.length}  persona-scope: ${PERSONA_SCOPE}`);

const cx = { vague: 0, medium: 0, complex: 0 };
tasks.forEach(t => cx[t.target_complexity] = (cx[t.target_complexity] || 0) + 1);
console.log(`[build-free200-plan] complexity: vague=${cx.vague} medium=${cx.medium} complex=${cx.complex || 0}`);
console.log(`[build-free200-plan] vague:medium ratio = 1:${(cx.medium/cx.vague).toFixed(2)}`);

const pt = {};
tasks.forEach(t => { pt[t.product_type] = (pt[t.product_type] || 0) + 1; });
console.log("[build-free200-plan] product_type distribution:");
Object.entries(pt).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

if (DRY_RUN) {
  console.log("[dry-run] skipping file write.");
  process.exit(0);
}

const dir = path.dirname(PLAN_OUT);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(PLAN_OUT, tasks.map(t => JSON.stringify(t)).join("\n") + "\n", "utf8");
console.log(`[build-free200-plan] written → ${PLAN_OUT}`);
