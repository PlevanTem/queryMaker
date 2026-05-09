/**
 * 基于已有 L1 一级分类扩展 ~41 个新 L2 场景，生成补充 plan（每场景 3 复杂度 = 123 条任务），
 * 补齐到总量 ~500 条。
 *
 * 用法：
 *   node scripts/generate-extra-scenes.js [--skip-llm] [--output-dir <dir>]
 */
const path = require("path");
const {
  parseArgs,
  writeJsonl,
  writeJson,
  buildSeedPlan,
  ensureDir,
} = require("../mvp/query_factory_v2");
const { loadEnvForBatch, runBatch, autoTransportFromEnv } = require("./lib/llm-batch");

// 新 L2 场景定义 — 在已有 12 个 L1 分类下各扩展若干场景
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
  { l1: "出行助手", label: "签证/入境信息查询", examples: ["签证要求", "免签国家", "申请流程", "大使馆信息"], apps: ["签证信息查询应用", "入境政策查询应用"] },
  { l1: "出行助手", label: "货币换算/旅行预算 ★", examples: ["实时汇率", "多币种换算", "支出记录", "旅行预算规划"], apps: ["货币换算应用", "旅行预算应用", "出行记账应用"] },
  { l1: "出行助手", label: "景点/旅游攻略推荐", examples: ["热门景点", "用户评价", "最佳游览时间", "票价信息"], apps: ["旅游攻略推荐应用", "景点信息应用", "旅行指南应用"] },
  { l1: "出行助手", label: "公交/本地出行查询 ★", examples: ["实时公交", "换乘方案", "地铁线路图", "共享单车"], apps: ["公交查询应用", "地铁导航应用", "本地出行应用"] },

  // 美食探店 +4
  { l1: "美食探店", label: "美食地图/餐厅收藏 ★", examples: ["地图标注", "餐厅评分", "收藏夹", "附近推荐"], apps: ["美食地图应用", "餐厅收藏应用", "美食发现应用"] },
  { l1: "美食探店", label: "在线点餐/菜单浏览", examples: ["菜品详情", "规格选择", "加入购物车", "营养信息"], apps: ["在线点餐应用", "餐厅菜单应用", "扫码点餐应用"] },
  { l1: "美食探店", label: "食材管理/购物清单 ★", examples: ["食材库存", "保质期提醒", "采购清单", "食材分类"], apps: ["冰箱食材管理应用", "食材清单应用", "厨房管理应用"] },
  { l1: "美食探店", label: "外卖配送追踪", examples: ["订单状态", "配送地图", "预计时间", "骑手位置"], apps: ["外卖配送追踪应用", "外卖订单管理应用"] },

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
  { l1: "新闻资讯", label: "个性化资讯推荐/偏好设置 ★", examples: ["兴趣标签", "屏蔽关键词", "订阅源管理", "推荐解释"], apps: ["个性化资讯推荐应用", "信息流偏好设置应用"] },
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

async function main() {
  const rootDir = process.cwd();
  loadEnvForBatch(rootDir);

  const args = parseArgs(process.argv.slice(2));
  const skipLlm = args["skip-llm"] === true;
  const outputDir = args["output-dir"] || path.resolve(rootDir, "data/output/runs/extra_v1_20260507");
  const planPath = path.resolve(rootDir, "data/intermediate/generation_plan.extra.jsonl");

  // Build spec object from EXTRA_SCENES
  let nextId = 63; // continue from last existing scene_062
  const scenarios = EXTRA_SCENES.map(s => ({
    id: `scene_${String(nextId++).padStart(3, "0")}`,
    source_file: "extra_scenes_v1",
    source_sheet: "manual",
    source_row_id: nextId - 1,
    l1_scene: s.l1,
    l2_scene_raw: s.label,
    target_count: 10,
    notes: "extended scene",
    l2_scene_label: s.label,
    l2_scene_examples: s.examples,
    application_type_candidates: s.apps,
  }));

  const extraSpec = { total_scenarios: scenarios.length, scenarios };

  // Build plan: 1 task per complexity per scene = 3 tasks each → 41×3=123
  const plan = buildSeedPlan(extraSpec, { minSeed: 3, maxSeed: 3, initialFraction: 0.01 });

  ensureDir(path.dirname(planPath));
  writeJsonl(planPath, plan.tasks);
  console.log(`[extra] ${scenarios.length} 个新场景 → ${plan.total_tasks} 条任务  plan 写入：${planPath}`);
  plan.tasks.slice(0, 5).forEach(t => console.log(`  ${t.query_id}  L1=${t.l1_scene}  L2=${t.l2_scene_label}  xc=${t.target_complexity}`));

  if (skipLlm) { console.log("--skip-llm: 仅生成 plan。"); return; }

  const transport = autoTransportFromEnv({ transport: args.transport || "claude-cli", model: args.model });
  const concurrency = args.concurrency ? Number(args.concurrency) : 4;
  const maxRetries = args["max-retries"] ? Number(args["max-retries"]) : 3;

  await runBatch({
    planPath,
    outputDir,
    transport,
    concurrency,
    maxRetries,
    generatorTag: "claude-code-cli-subprocess",
    resume: args["no-resume"] !== true,
    logger: console.log,
  });
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
