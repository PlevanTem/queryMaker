const fs = require("fs");
const path = require("path");

const {
  COMPLEXITY_LEVELS,
  buildPersonaSpec,
  inferProductTypes,
  inferStyles,
  writeJson,
  writeJsonl,
  ensureDirForFile,
} = require("../mvp/query_factory");

const TOTAL_PROMPTS = 5000;
const OUTPUT_PREFIX = "prompts_5k.extended.v1";

const PRODUCT_LABELS_ZH = {
  landing_page: "落地页",
  content_blog: "内容平台",
  dashboard: "数据看板",
  portfolio: "作品展示站",
  admin_panel: "管理后台",
  form_flow: "多步骤表单流程",
  search_filter: "搜索筛选界面",
  realtime_collab: "实时协作界面",
  ecommerce_shop: "电商购物界面",
  booking_service: "预约流程",
  social_feed: "社交信息流",
  media_player: "媒体播放界面",
  game_hud: "游戏交互界面",
};

const STYLE_LABELS_ZH = {
  Glassmorphism: "偏玻璃拟态一点",
  Neumorphism: "用柔和拟物的感觉",
  Neubrutalism: "做得更大胆直接、边框感更强",
  Minimalism: "尽量极简、留白多一些",
  Material: "交互反馈要清晰一些，接近 Material",
  "Data-Dense": "信息密度可以高一点，但不要乱",
  Dark: "整体走暗色风格",
  Cyberpunk: "可以带一点霓虹科技感",
  Luxury: "高级感和杂志感要更强",
  Vibrant: "颜色可以更鲜明活泼",
  unspecified: "风格先不用定死",
};

const L1_EXPANSIONS = {
  深度研究展示: ["专题策展应用", "案例研究展示应用", "时间线叙事应用", "沉浸式故事应用", "长页阅读应用"],
  交互方式: ["任务处理应用", "流程操作应用", "通用工作台应用", "状态管理应用"],
  实用工具: ["效率微工具应用", "快捷助手应用", "轻量实用工具应用", "多功能工具箱应用"],
  教育学习: ["学习辅助应用", "练习复盘应用", "知识整理应用", "备考陪练应用"],
  办公效率: ["工作效率应用", "团队协作应用", "任务推进应用", "信息整理应用"],
  健康管理: ["健康习惯应用", "身体状态记录应用", "日常健康助手应用", "健康陪伴应用"],
  出行助手: ["出行规划应用", "旅途助手应用", "路线安排应用", "行前准备应用"],
  美食探店: ["吃喝决策应用", "探店助手应用", "饮食推荐应用", "菜单浏览应用"],
  休闲游戏: ["轻娱乐应用", "互动小游戏应用", "减压互动应用", "随机玩法应用"],
  多媒体处理: ["创作编辑应用", "内容加工应用", "多媒体工作台应用", "模板编辑应用"],
  新闻资讯: ["内容浏览应用", "资讯聚合应用", "文章阅读应用", "订阅阅读应用"],
  购物消费: ["购买决策应用", "消费流程应用", "订单管理应用", "商品浏览应用"],
};

const KEYWORD_EXPANSIONS = [
  { pattern: /旅行|行程|打包/u, values: ["旅行规划应用", "旅程记录应用", "路线收藏应用"] },
  { pattern: /地图|导航|路线/u, values: ["路线导航应用", "出行地图应用", "地点探索应用"] },
  { pattern: /天气|实时信息/u, values: ["天气信息应用", "实时提醒应用", "出行资讯应用"] },
  { pattern: /票价|时刻|交通/u, values: ["交通查询应用", "班次查询应用", "票务信息应用"] },
  { pattern: /相册|回忆|成长/u, values: ["记忆整理应用", "照片故事应用", "成长档案应用"] },
  { pattern: /作品集|Portfolio|简历/u, values: ["个人展示应用", "职业形象应用", "案例作品应用"] },
  { pattern: /品牌|传记|历史|科普/u, values: ["知识叙事应用", "专题内容应用", "故事化阅读应用"] },
  { pattern: /创建|新建/u, values: ["内容创建应用", "快速录入应用", "新建流程应用"] },
  { pattern: /编辑|更新/u, values: ["内容编辑应用", "资料维护应用", "版本更新应用"] },
  { pattern: /搜索|查找/u, values: ["全局检索应用", "信息搜索应用", "搜索结果应用"] },
  { pattern: /选择|选取/u, values: ["选择决策应用", "候选对比应用", "项目挑选应用"] },
  { pattern: /筛选|排序/u, values: ["筛选面板应用", "排序浏览应用", "结果整理应用"] },
  { pattern: /删除|移除/u, values: ["内容清理应用", "批量管理应用", "回收站管理应用"] },
  { pattern: /上传|下载/u, values: ["文件传输应用", "资料同步应用", "资源管理应用"] },
  { pattern: /复制|副本/u, values: ["模板复制应用", "内容复用应用", "副本管理应用"] },
  { pattern: /计算器|换算/u, values: ["换算工具应用", "数值计算应用", "快速测算应用"] },
  { pattern: /记录器|纪念日|倒计时/u, values: ["时间记录应用", "里程碑提醒应用", "计划纪念应用"] },
  { pattern: /文本/u, values: ["文本优化应用", "写作辅助应用", "内容处理应用"] },
  { pattern: /随机/u, values: ["随机决策应用", "抽选工具应用", "灵感生成应用"] },
  { pattern: /无障碍/u, values: ["辅助访问应用", "可达性工具应用", "关怀辅助应用"] },
  { pattern: /闪卡|单词|刷题|备考/u, values: ["背诵训练应用", "题库练习应用", "学习复习应用"] },
  { pattern: /进度|打卡/u, values: ["习惯养成应用", "学习打卡应用", "进展记录应用"] },
  { pattern: /课程|课堂/u, values: ["课程学习应用", "课堂管理应用", "学习目录应用"] },
  { pattern: /待办|任务/u, values: ["任务管理应用", "项目推进应用", "事项跟踪应用"] },
  { pattern: /番茄钟|专注/u, values: ["专注计时应用", "效率专注应用", "时间块管理应用"] },
  { pattern: /仪表盘|报表|看板/u, values: ["数据看板应用", "指标追踪应用", "分析报表应用"] },
  { pattern: /笔记|文档/u, values: ["笔记整理应用", "文档协作应用", "知识笔记应用"] },
  { pattern: /饮水|服药|习惯/u, values: ["习惯提醒应用", "健康提醒应用", "每日打卡应用"] },
  { pattern: /运动|健身/u, values: ["运动计划应用", "训练记录应用", "健身跟练应用"] },
  { pattern: /体重|经期|睡眠/u, values: ["身体数据应用", "周期追踪应用", "睡眠记录应用"] },
  { pattern: /冥想|呼吸/u, values: ["情绪调节应用", "呼吸训练应用", "放松练习应用"] },
  { pattern: /吃什么|热量|菜谱|餐厅/u, values: ["饮食决策应用", "探店浏览应用", "食谱规划应用"] },
  { pattern: /猜谜|知识竞赛|抽签|转盘|小游戏/u, values: ["互动挑战应用", "随机娱乐应用", "轻游戏应用"] },
  { pattern: /图片|海报|模板|内容创作/u, values: ["视觉创作应用", "模板制作应用", "图文编辑应用"] },
  { pattern: /音视频|播放/u, values: ["媒体播放应用", "音视频浏览应用", "内容播放应用"] },
  { pattern: /信息流|文章|订阅|频道/u, values: ["资讯阅读应用", "订阅浏览应用", "内容发现应用"] },
  { pattern: /商品|购物车|订单|物流/u, values: ["购物流程应用", "订单跟踪应用", "商品选购应用"] },
];

const SCENE_LENSES = [
  {
    pattern: /深度研究展示|品牌|传记|历史|科普|作品集|相册|故事/u,
    audiences: ["第一次打开产品的新访客", "想快速建立认知的人", "需要沉浸式浏览内容的人"],
    goals: ["把内容讲清楚", "让人愿意继续往下看", "让重点信息更容易被理解"],
    modules: ["封面导语", "章节导航", "重点内容卡片", "时间线或目录", "详情展开区"],
    interactions: ["章节定位", "分段折叠展开", "卡片切换", "锚点跳转", "横向内容浏览"],
    states: ["空内容占位", "加载中的骨架屏", "长内容折叠状态", "移动端收起导航"],
  },
  {
    pattern: /搜索|筛选|排序|选择|查找/u,
    audiences: ["带着明确目标来找信息的人", "需要在大量结果里快速判断的人", "不想反复试错的普通用户"],
    goals: ["更快找到目标", "降低筛选成本", "让结果状态更清楚"],
    modules: ["搜索输入区", "筛选面板", "结果列表", "推荐区", "空结果提示"],
    interactions: ["即时搜索反馈", "筛选项联动", "结果排序切换", "历史记录回填", "标签快速清除"],
    states: ["无结果状态", "加载中状态", "筛选过多提示", "网络异常重试"],
  },
  {
    pattern: /任务|待办|进度|打卡|习惯|提醒|计划/u,
    audiences: ["想把事情安排清楚的人", "需要每天重复使用的人", "希望减少遗漏的人"],
    goals: ["把流程理顺", "让优先级更明确", "让每天的动作更省心"],
    modules: ["今日概览", "任务列表", "分组区", "进度统计", "提醒设置"],
    interactions: ["拖拽调整顺序", "勾选完成", "快速新建", "批量编辑", "提醒开关"],
    states: ["已完成收起", "逾期提示", "空列表引导", "同步失败反馈"],
  },
  {
    pattern: /健康|运动|睡眠|饮食|冥想|服药/u,
    audiences: ["在做长期自我管理的人", "希望记录趋势的人", "需要轻提醒但不想被打扰的人"],
    goals: ["让记录更轻量", "把趋势看得更直观", "提升持续使用意愿"],
    modules: ["今日数据", "趋势图", "提醒区", "打卡入口", "历史记录"],
    interactions: ["快速记录", "周期切换", "目标调整", "异常提示", "趋势对比"],
    states: ["未记录提醒", "目标达成反馈", "数据缺失提示", "异常波动提醒"],
  },
  {
    pattern: /图片|海报|模板|内容创作|编辑|播放/u,
    audiences: ["想快速做出内容的人", "对效率和预览很敏感的人", "一边编辑一边调整的人"],
    goals: ["提高创作效率", "让预览更直观", "减少来回切换成本"],
    modules: ["素材区", "编辑区", "预览区", "模板区", "导出设置"],
    interactions: ["拖拽替换", "实时预览", "版本回退", "模板切换", "导出确认"],
    states: ["素材为空", "保存中提示", "导出完成反馈", "格式不支持提示"],
  },
  {
    pattern: /商品|购物|订单|物流/u,
    audiences: ["要快速完成下单的人", "需要比对商品信息的人", "下单后想追踪进度的人"],
    goals: ["减少决策成本", "让流程更顺", "关键信息别藏太深"],
    modules: ["商品信息区", "规格选择", "购物车摘要", "订单状态", "物流进度"],
    interactions: ["规格切换", "数量调整", "步骤确认", "状态追踪", "异常订单处理"],
    states: ["缺货提醒", "价格变化提示", "支付失败反馈", "物流异常提示"],
  },
];

function hashText(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function pickSeeded(list, seed, offset = 0) {
  if (!list || !list.length) return null;
  const value = parseInt(hashText(`${seed}:${offset}`).slice(0, 8), 16);
  return list[value % list.length];
}

function unique(items) {
  return [...new Set(items.filter(Boolean).map((item) => cleanText(item)))];
}

function cleanText(text) {
  return String(text || "")
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/u, "")
    .replace(/[★]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureAppName(name) {
  const text = cleanText(name);
  if (!text) return "";
  if (/(应用|工具|平台|系统|中心|空间|工作台|助手|引擎|门户|站)$/u.test(text)) {
    return text;
  }
  return `${text}应用`;
}

function splitLabelTokens(label) {
  return cleanText(label)
    .replace(/[（）()]/g, " ")
    .split(/[\/、,&]| and | And |\s+-\s+|\s+/u)
    .map((item) => cleanText(item))
    .filter((item) => item && item.length >= 2 && !/^(新建|编辑|搜索|选择|筛选|删除|上传|复制|其他)$/u.test(item));
}

function expandApplicationTypes(scene) {
  const sourceText = `${scene.l1_scene} ${scene.l2_scene_label} ${(scene.l2_scene_examples || []).join(" ")}`;
  const expanded = [];
  const sourceByName = new Map();

  function pushMany(values, source) {
    for (const value of values || []) {
      const app = ensureAppName(value);
      if (!app) continue;
      if (!sourceByName.has(app)) {
        sourceByName.set(app, source);
        expanded.push(app);
      }
    }
  }

  pushMany(scene.application_type_candidates, "xlsx_candidate");
  pushMany(
    (scene.l2_scene_examples || []).flatMap((example) => [
      example,
      `${example}应用`,
      `${example}工具`,
      `${example}展示`,
      `${example}记录`,
    ]),
    "l2_example_extension",
  );
  pushMany(splitLabelTokens(scene.l2_scene_label).map((token) => `${token}应用`), "label_token_extension");
  pushMany(L1_EXPANSIONS[scene.l1_scene] || [], "l1_extension");
  for (const rule of KEYWORD_EXPANSIONS) {
    if (rule.pattern.test(sourceText)) {
      pushMany(rule.values, "keyword_extension");
    }
  }
  if (expanded.length < 6) {
    pushMany(
      [
        `${scene.l2_scene_label}应用`,
        `${scene.l2_scene_label}工具`,
        `${scene.l2_scene_label}平台`,
        `${scene.l1_scene}应用`,
      ],
      "fallback_extension",
    );
  }

  return expanded.slice(0, 12).map((name) => ({
    name,
    source: sourceByName.get(name) || "unknown",
  }));
}

function expandProductTypes(scene, applicationType) {
  const source = `${scene.l1_scene} ${scene.l2_scene_label} ${applicationType}`;
  const base = inferProductTypes(scene.l1_scene, scene.l2_scene_label, applicationType);
  const extras = [];

  if (/展示|作品|故事|阅读|相册|传记|品牌|长文/u.test(source)) extras.push("portfolio", "landing_page", "content_blog");
  if (/搜索|筛选|选择|查找/u.test(source)) extras.push("search_filter", "dashboard");
  if (/任务|进度|提醒|打卡|管理/u.test(source)) extras.push("dashboard", "admin_panel", "form_flow");
  if (/购物|订单|物流|票价|预约/u.test(source)) extras.push("ecommerce_shop", "booking_service", "form_flow");
  if (/游戏|猜谜|转盘/u.test(source)) extras.push("game_hud");
  if (/音视频|播放/u.test(source)) extras.push("media_player");
  if (/协作|文档/u.test(source)) extras.push("realtime_collab");
  if (/社交|信息流|点评/u.test(source)) extras.push("social_feed");

  return unique([...base, ...extras]);
}

function expandStyles(scene, applicationType) {
  const source = `${scene.l1_scene} ${scene.l2_scene_label} ${applicationType}`;
  const base = inferStyles(scene.l1_scene, scene.l2_scene_label, applicationType).filter(Boolean);
  const extras = [null];

  if (/展示|品牌|故事|作品/u.test(source)) extras.push("Luxury", "Minimalism", "Glassmorphism");
  if (/数据|报表|筛选|查找|任务/u.test(source)) extras.push("Data-Dense", "Material", "Dark");
  if (/成长|宝宝|学习|健康|习惯/u.test(source)) extras.push("Vibrant", "Minimalism", "Neumorphism");
  if (/游戏|随机|互动/u.test(source)) extras.push("Cyberpunk", "Vibrant", "Neubrutalism");
  if (/工具|编辑|创建|管理/u.test(source)) extras.push("Material", "Minimalism");

  return unique([...extras, ...base]).slice(0, 6);
}

function allocateCounts(scenarios, totalPrompts) {
  const totalWeight = scenarios.reduce((sum, scene) => sum + Number(scene.target_count || 1), 0);
  const provisional = scenarios.map((scene) => {
    const exact = (Number(scene.target_count || 1) / totalWeight) * totalPrompts;
    return {
      id: scene.id,
      floor: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let assigned = provisional.reduce((sum, item) => sum + item.floor, 0);
  provisional
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, totalPrompts - assigned)
    .forEach((item) => {
      item.floor += 1;
    });

  return Object.fromEntries(provisional.map((item) => [item.id, item.floor]));
}

function getSceneLens(scene, applicationType) {
  const source = `${scene.l1_scene} ${scene.l2_scene_label} ${applicationType}`;
  const matched = SCENE_LENSES.find((item) => item.pattern.test(source));
  if (matched) return matched;
  return {
    audiences: ["第一次使用这个界面的人", "希望快速完成任务的人", "不想学习成本太高的人"],
    goals: ["把流程说清楚", "让浏览更顺畅", "让重点动作更好找"],
    modules: ["核心信息区", "列表或卡片区", "详情区", "快捷操作区", "状态反馈区"],
    interactions: ["主按钮操作", "二级筛选", "展开收起", "切换视图", "反馈提示"],
    states: ["空状态", "加载状态", "失败重试", "移动端收起布局"],
  };
}

function styleSentence(style) {
  return STYLE_LABELS_ZH[style || "unspecified"] || `${style} 风格`;
}

function productLabel(productType) {
  return PRODUCT_LABELS_ZH[productType] || productType;
}

function buildVaguePrompt(task, seed) {
  const openers = [
    "我想做一个",
    "我在准备做一个",
    "想请你帮我设计一个",
    "我需要一个",
    "帮我先搭一个",
  ];
  const needs = [
    "先把核心信息讲清楚就行",
    "重点是看起来顺手、别太复杂",
    "我更在意第一眼能不能快速理解",
    "先保证结构清楚，后面再慢慢补细节",
    "希望打开以后就知道该往哪里看",
  ];
  const endings = [
    "最好手机上看也自然一点。",
    "先偏轻量一点，别做得太重。",
    "整体浏览节奏舒服就可以。",
    "不要太花，重点内容容易扫到就好。",
    "操作别绕，普通用户一看就会用最好。",
  ];
  const priorities = [
    "我会更关注首屏是不是干净",
    "我更在意主要动作是不是够明显",
    "内容分组先不要太碎",
    "先把阅读顺序理顺最重要",
    "先别堆太多功能入口",
    "主信息和辅助信息要拉开层级",
    "希望用户不用解释就知道怎么开始",
    "我不想看到太重的学习成本",
    "信息密度可以低一点",
    "先把进入页面后的第一步动作设计清楚",
    "我希望重点内容能自然落到视线中心",
    "先保证浏览顺序别乱",
  ];

  return `${pickSeeded(openers, seed, 1)}${task.application_type}的${productLabel(task.product_type)}，${pickSeeded(needs, seed, 2)}。${styleSentence(task.design_style)}，${pickSeeded(endings, seed, 3)} ${pickSeeded(priorities, seed, 4)}。`;
}

function buildMediumPrompt(task, seed, lens) {
  const goals = [
    "我想先把入口价值讲明白",
    "我希望首页先建立清晰的认知",
    "我更在意信息结构是不是一眼能看懂",
    "我想让用户不用想太多就能开始操作",
  ];
  const devices = [
    "移动端和桌面端都要顺手",
    "手机上也要保持层级清楚",
    "小屏下不要显得拥挤",
    "不同尺寸下都别破坏主要阅读顺序",
  ];
  const priorities = [
    "我希望主要按钮和次要操作不要抢焦点",
    "我想让第一次使用的人也能很快找到下一步",
    "内容区之间最好有明确节奏，不要一股脑堆在一起",
    "重要信息需要能被快速扫到，次要信息再慢慢展开",
    "我不希望用户反复来回跳转才能完成一个小动作",
    "请把页面的停顿点和继续阅读点设计清楚",
    "我希望用户看完首屏就知道这个页面值不值得继续往下看",
    "别让页面看起来像模板拼接，至少要有一个明显记忆点",
    "如果内容会继续增加，结构也要能继续容纳下去",
    "我更看重效率，不想让交互显得拖沓",
    "请让用户在扫读和细看之间切换得自然一点",
    "希望信息区块之间有明显主次，不要平均用力",
  ];
  const moduleA = pickSeeded(lens.modules, seed, 4);
  const moduleB = pickSeeded(lens.modules, seed, 5);
  const interaction = pickSeeded(lens.interactions, seed, 6);

  return `我在做一个${task.application_type}的${productLabel(task.product_type)}，${pickSeeded(goals, seed, 1)}。页面里我至少想放一个${moduleA}和一个${moduleB}，并且把${interaction}做得明显一些。${styleSentence(task.design_style)}，${pickSeeded(devices, seed, 2)}。${pickSeeded(priorities, seed, 7)}。`;
}

function buildComplexPrompt(task, seed, lens) {
  const audience = pickSeeded(lens.audiences, seed, 1);
  const goal = pickSeeded(lens.goals, seed, 2);
  const moduleA = pickSeeded(lens.modules, seed, 3);
  const moduleB = pickSeeded(lens.modules, seed, 4);
  const moduleC = pickSeeded(lens.modules, seed, 5);
  const interactionA = pickSeeded(lens.interactions, seed, 6);
  const interactionB = pickSeeded(lens.interactions, seed, 7);
  const stateA = pickSeeded(lens.states, seed, 8);
  const stateB = pickSeeded(lens.states, seed, 9);
  const densityNotes = [
    "信息可以多一点，但层级一定要稳",
    "模块可以丰富，但主次关系必须明确",
    "内容会持续增长，所以不要只适配首屏",
    "希望既能快速扫读，也能支持继续深看",
  ];
  const extraNotes = [
    "我不想只是堆卡片，希望每个区块的进入路径和退出路径都想清楚。",
    "请把状态反馈和操作后的可预期性考虑进去，不要只做静态排版。",
    "如果会出现长内容或长列表，滚动中的定位感一定要保住。",
    "视觉上可以有记忆点，但不要为了花哨牺牲理解效率。",
  ];
  const priorityNotes = [
    "如果需要做重点推荐区，请让它和常规内容区的权重区别足够明显。",
    "我希望页面不是只有展示，还要能支持后续的判断、比较或继续操作。",
    "请提前考虑信息量上涨后的扩展性，不要只适配少量示例数据。",
    "如果会有多种内容类型混排，最好从规则上先区分清楚再排版。",
    "我希望用户在任何位置都知道自己当前所处层级，不想出现迷路感。",
    "请把首次进入、继续浏览、准备离开这几个阶段的体验都顺一下。",
    "不要只关注主流程，边缘状态和低频操作也要有合理落点。",
    "如果要加动效，希望它能服务于切换和定位，而不是只是装饰。",
  ];

  return [
    `我想做一个面向${audience}的${task.application_type}${productLabel(task.product_type)}，核心目标是${goal}。`,
    `请把结构至少拆成${moduleA}、${moduleB}、${moduleC}这几个层次，不要只给一个平铺页面。`,
    `交互上我希望重点考虑${interactionA}和${interactionB}，另外 ${stateA}、${stateB} 这些状态也要有对应反馈。`,
    `${styleSentence(task.design_style)}，${pickSeeded(densityNotes, seed, 10)}。`,
    `${pickSeeded(extraNotes, seed, 11)} ${pickSeeded(priorityNotes, seed, 12)} 同时要兼顾响应式，尤其是手机上信息收放、按钮层级和浏览节奏。`,
  ].join(" ");
}

function buildPromptText(task) {
  const seed = `${task.id}:${task.application_type}:${task.product_type}:${task.design_style || "unspecified"}`;
  const lens = getSceneLens(task, task.application_type);
  if (task.target_complexity === "vague") return buildVaguePrompt(task, seed);
  if (task.target_complexity === "complex") return buildComplexPrompt(task, seed, lens);
  return buildMediumPrompt(task, seed, lens);
}

function buildTasks(spec, countsByScene) {
  const tasks = [];

  for (const scene of spec.scenarios) {
    const targetCount = countsByScene[scene.id] || 0;
    const applicationTypes = expandApplicationTypes(scene);
    const complexities = [...COMPLEXITY_LEVELS];

    for (let i = 0; i < targetCount; i += 1) {
      const candidate = applicationTypes[i % applicationTypes.length];
      const productTypes = expandProductTypes(scene, candidate.name);
      const styles = expandStyles(scene, candidate.name);
      const productType = productTypes[i % productTypes.length];
      const designStyle = styles[i % styles.length] || null;
      const targetComplexity = complexities[(i + scene.source_row_id) % complexities.length];

      tasks.push({
        id: `q5k_${scene.id}_${String(i + 1).padStart(4, "0")}`,
        scene_id: scene.id,
        l1_scene: scene.l1_scene,
        l2_scene_label: scene.l2_scene_label,
        l2_scene_raw: scene.l2_scene_raw,
        l2_scene_examples: scene.l2_scene_examples || [],
        application_type: candidate.name,
        application_type_source: candidate.source,
        product_type: productType,
        target_complexity: targetComplexity,
        design_style: designStyle,
        persona_seed: hashText(`${scene.id}:${candidate.name}:${productType}:${targetComplexity}:${i}`),
        target_count_hint: scene.target_count,
      });
    }
  }

  return tasks;
}

function buildRecords(tasks) {
  const createdAt = new Date().toISOString();
  return tasks.map((task) => {
    const persona = buildPersonaSpec({
      query_id: task.id,
      persona_seed: task.persona_seed,
      target_complexity: task.target_complexity,
      application_type: task.application_type,
      l2_scene_label: task.l2_scene_label,
    });
    const queryText = buildPromptText(task);

    return {
      id: task.id,
      scene_id: task.scene_id,
      l1_scene: task.l1_scene,
      l2_scene_label: task.l2_scene_label,
      l2_scene_raw: task.l2_scene_raw,
      application_type: task.application_type,
      application_type_source: task.application_type_source,
      product_type: task.product_type,
      target_complexity: task.target_complexity,
      design_style: task.design_style,
      created_at: createdAt,
      generator_mode: "extended-5k-generator",
      persona_id: persona.persona_id,
      persona_title: persona.persona_title,
      persona_source: persona.persona_source,
      persona_spec: persona,
      query_text: queryText,
      query_length: queryText.length,
    };
  });
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(filePath, rows) {
  if (!rows.length) {
    ensureDirForFile(filePath);
    fs.writeFileSync(filePath, "", "utf8");
    return;
  }
  const columns = [
    "id",
    "scene_id",
    "l1_scene",
    "l2_scene_label",
    "application_type",
    "application_type_source",
    "product_type",
    "target_complexity",
    "design_style",
    "persona_title",
    "query_text",
  ];
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((key) => escapeCsv(row[key])).join(",")),
  ];
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function countBy(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildSummary(records, countsByScene, spec) {
  const uniquePrompts = new Set(records.map((item) => item.query_text)).size;
  return {
    generated_at: new Date().toISOString(),
    total_prompts: records.length,
    unique_prompts: uniquePrompts,
    unique_prompt_ratio: Number((uniquePrompts / records.length).toFixed(4)),
    original_target_sum: spec.scenarios.reduce((sum, scene) => sum + Number(scene.target_count || 0), 0),
    expanded_l3_application_types: new Set(records.map((item) => item.application_type)).size,
    by_l1_scene: countBy(records, (row) => row.l1_scene),
    by_l2_scene_label: countBy(records, (row) => row.l2_scene_label),
    by_application_type_source: countBy(records, (row) => row.application_type_source),
    by_product_type: countBy(records, (row) => row.product_type),
    by_target_complexity: countBy(records, (row) => row.target_complexity),
    by_design_style: countBy(records, (row) => row.design_style || "unspecified"),
    allocated_counts_by_scene: countsByScene,
  };
}

function main() {
  const rootDir = process.cwd();
  const specPath = path.resolve(rootDir, "data/intermediate/scenario_spec.v2.json");
  const planPath = path.resolve(rootDir, `data/intermediate/${OUTPUT_PREFIX}.plan.jsonl`);
  const jsonlPath = path.resolve(rootDir, `data/output/${OUTPUT_PREFIX}.jsonl`);
  const csvPath = path.resolve(rootDir, `data/output/${OUTPUT_PREFIX}.csv`);
  const summaryPath = path.resolve(rootDir, `data/output/${OUTPUT_PREFIX}.summary.json`);

  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const countsByScene = allocateCounts(spec.scenarios, TOTAL_PROMPTS);
  const tasks = buildTasks(spec, countsByScene);
  const records = buildRecords(tasks);
  const summary = buildSummary(records, countsByScene, spec);

  writeJsonl(planPath, tasks);
  writeJsonl(jsonlPath, records);
  writeCsv(csvPath, records);
  writeJson(summaryPath, summary);

  console.log(`已生成 5K 提示词：${records.length} 条`);
  console.log(`唯一 prompt：${summary.unique_prompts} 条`);
  console.log(`唯一率：${summary.unique_prompt_ratio}`);
  console.log(`扩展后 L3 application_type：${summary.expanded_l3_application_types} 个`);
  console.log(`JSONL：${jsonlPath}`);
  console.log(`CSV：${csvPath}`);
  console.log(`Summary：${summaryPath}`);
}

main();
