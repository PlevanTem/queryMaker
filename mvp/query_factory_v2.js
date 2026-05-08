const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const XLSX = require("xlsx");
const initSqlJs = require("sql.js");

let envLoaded = false;
let proxyDispatcherInstalled = false;

const PRODUCT_TYPE_LABELS = {
  landing_page: "官网/落地页",
  content_blog: "内容/博客平台",
  dashboard: "数据仪表盘",
  portfolio: "作品集/展示",
  admin_panel: "管理后台",
  form_flow: "表单/流程",
  search_filter: "搜索+过滤",
  realtime_collab: "实时协作",
  ecommerce_shop: "电商购物",
  booking_service: "预订服务",
  social_feed: "社交动态",
  media_player: "媒体播放",
  game_hud: "游戏/娱乐界面",
};

const DESIGN_STYLES = [
  null,
  "Glassmorphism",
  "Neumorphism",
  "Neubrutalism",
  "Minimalism",
  "Material",
  "Data-Dense",
  "Dark",
  "Cyberpunk",
  "Luxury",
  "Vibrant",
];

const COMPLEXITY_LEVELS = ["vague", "medium", "complex"];

const STYLE_HINTS = {
  Glassmorphism: "整体偏玻璃拟态风格，卡片有毛玻璃层次和背景透视感",
  Neumorphism: "视觉偏软质拟态，元素像从背景里浮起来一样",
  Neubrutalism: "风格偏新粗野，边框、阴影和对比感更强",
  Minimalism: "尽量极简，留白充足，信息层级清楚",
  Material: "遵循 Material 风格，交互反馈明确",
  "Data-Dense": "信息密度高，适合快速扫读和操作",
  Dark: "使用深色主题，重点信息高对比突出",
  Cyberpunk: "风格偏霓虹赛博感，视觉冲击更强",
  Luxury: "更像高质感杂志专题，排版精致且有留白",
  Vibrant: "整体更活泼，颜色饱和度较高",
};

const PERSONA_ARCHETYPES = [
  {
    id: "maker",
    title: "正在自己动手做产品的人",
    styles: {
      vague: "说法比较口语，只会给出大方向和感受。",
      medium: "会说清楚目标，并补充一两个结构或交互要求。",
      complex: "会把目标、展示内容和关键交互讲得比较完整。",
    },
  },
  {
    id: "planner",
    title: "在整理需求和表达想法的人",
    styles: {
      vague: "更像先说希望达到什么效果，不会一次给很多细节。",
      medium: "会从用户视角说明目标，并点出少量核心细节。",
      complex: "会把功能边界、展示顺序和体验目标讲得很清楚。",
    },
  },
  {
    id: "curator",
    title: "在整理内容与展示方式的人",
    styles: {
      vague: "更在意整体感觉和内容呈现，不太讲技术。",
      medium: "会同时关注内容组织方式和浏览节奏。",
      complex: "会明确说明内容结构、导航和浏览行为。",
    },
  },
  {
    id: "operator",
    title: "需要把信息管理得更高效的人",
    styles: {
      vague: "更强调想解决的问题，不会给出完整方案。",
      medium: "会补充一两个和效率有关的要求。",
      complex: "会清楚提出筛选、状态、反馈和异常场景要求。",
    },
  },
  {
    id: "founder_like",
    title: "在追求产品感觉和记忆点的人",
    styles: {
      vague: "会先描述想要的气质和整体方向。",
      medium: "会给出感觉和重点模块的组合要求。",
      complex: "会同时给出风格、品牌感和多个功能模块要求。",
    },
  },
];

const APPLICATION_HINTS = [
  { keywords: ["旅行", "行程"], applicationType: "旅行回忆应用" },
  { keywords: ["相册", "照片"], applicationType: "年度相册应用" },
  { keywords: ["画作", "作品"], applicationType: "画作展示应用" },
  { keywords: ["宝宝", "成长"], applicationType: "成长记录应用" },
  { keywords: ["摄影"], applicationType: "摄影作品集应用" },
  { keywords: ["简历", "求职"], applicationType: "求职展示应用" },
  { keywords: ["提案", "介绍页"], applicationType: "项目介绍应用" },
  { keywords: ["年报", "成果"], applicationType: "成果展示应用" },
  { keywords: ["刷题", "备考"], applicationType: "刷题练习应用" },
  { keywords: ["打卡", "进度"], applicationType: "进度追踪应用" },
  { keywords: ["仪表盘", "报表", "数据"], applicationType: "数据看板应用" },
  { keywords: ["日程", "待办", "任务"], applicationType: "任务管理应用" },
  { keywords: ["地图", "路线"], applicationType: "路线导航应用" },
  { keywords: ["天气"], applicationType: "天气信息应用" },
  { keywords: ["热量", "食物"], applicationType: "饮食记录应用" },
  { keywords: ["游戏", "猜谜", "竞赛"], applicationType: "休闲互动应用" },
  { keywords: ["图片编辑", "滤镜"], applicationType: "图片编辑应用" },
  { keywords: ["海报", "模板"], applicationType: "模板制作应用" },
  { keywords: ["资讯", "阅读", "文章"], applicationType: "资讯阅读应用" },
  { keywords: ["商品", "购物车", "订单"], applicationType: "购物流程应用" },
];

const PRODUCT_TYPE_HINTS = [
  { keywords: ["展示", "作品集", "相册", "回忆", "简历", "成长", "画作"], productTypes: ["portfolio", "landing_page"] },
  { keywords: ["仪表盘", "报表", "数据", "分析", "看板"], productTypes: ["dashboard", "admin_panel"] },
  { keywords: ["列表", "筛选", "搜索", "查询"], productTypes: ["search_filter", "admin_panel"] },
  { keywords: ["任务", "待办", "日程", "管理"], productTypes: ["admin_panel", "dashboard"] },
  { keywords: ["报名", "预约", "时间段", "行程", "票价"], productTypes: ["booking_service", "form_flow"] },
  { keywords: ["商品", "购物", "订单", "结算"], productTypes: ["ecommerce_shop", "form_flow"] },
  { keywords: ["文章", "阅读", "知识", "资讯"], productTypes: ["content_blog", "landing_page"] },
  { keywords: ["社交", "互动", "动态"], productTypes: ["social_feed", "realtime_collab"] },
  { keywords: ["音频", "视频", "播放"], productTypes: ["media_player", "content_blog"] },
  { keywords: ["编辑", "上传", "创建"], productTypes: ["form_flow", "admin_panel"] },
  { keywords: ["游戏", "猜谜", "竞赛"], productTypes: ["game_hud", "social_feed"] },
];

const STYLE_KEYWORDS = [
  { keywords: ["专业", "办公", "商务", "效率"], styles: ["Minimalism", "Material", "Data-Dense"] },
  { keywords: ["生活", "旅行", "相册", "成长", "展示"], styles: ["Luxury", "Glassmorphism", "Vibrant"] },
  { keywords: ["知识", "文化", "阅读", "资讯"], styles: ["Minimalism", "Luxury", "Material"] },
  { keywords: ["健康", "冥想"], styles: ["Neumorphism", "Minimalism", "Dark"] },
  { keywords: ["游戏", "娱乐"], styles: ["Cyberpunk", "Vibrant", "Neubrutalism"] },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonl(filePath, rows) {
  ensureDirForFile(filePath);
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, payload ? `${payload}\n` : "", "utf8");
}

function loadLocalEnv(rootDir = process.cwd()) {
  if (envLoaded) {
    return;
  }
  envLoaded = true;
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(rootDir, name);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) {
        continue;
      }
      const key = match[1];
      let value = match[2] || "";
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function readWindowsInternetProxy() {
  if (process.platform !== "win32") {
    return null;
  }
  try {
    const enabledOutput = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable"],
      { encoding: "utf8" },
    );
    if (!/0x1\b/u.test(enabledOutput)) {
      return null;
    }
    const serverOutput = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer"],
      { encoding: "utf8" },
    );
    const match = serverOutput.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/u);
    if (!match) {
      return null;
    }
    const proxy = cleanText(match[1]);
    if (!proxy) {
      return null;
    }
    return /^https?:\/\//iu.test(proxy) ? proxy : `http://${proxy}`;
  } catch {
    return null;
  }
}

function applySystemNetworkEnv(options = {}) {
  const useSystemProxy = cleanText(options.useSystemProxy || process.env.PACKY_USE_SYSTEM_PROXY || "1") !== "0";
  if (useSystemProxy && !process.env.HTTP_PROXY && !process.env.HTTPS_PROXY) {
    const proxy = readWindowsInternetProxy();
    if (proxy) {
      process.env.HTTP_PROXY = proxy;
      process.env.HTTPS_PROXY = proxy;
    }
  }

  const allowInsecureTls = cleanText(options.allowInsecureTls || process.env.PACKY_ALLOW_INSECURE_TLS || "0") === "1";
  if (allowInsecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl && !proxyDispatcherInstalled) {
    try {
      const { ProxyAgent, setGlobalDispatcher } = require("undici");
      const agentOpts = { uri: proxyUrl };
      if (allowInsecureTls) {
        agentOpts.requestTls = { rejectUnauthorized: false };
      }
      setGlobalDispatcher(new ProxyAgent(agentOpts));
      proxyDispatcherInstalled = true;
    } catch {
      // undici not available; fall back to env-based proxy hint
      if (!process.env.NODE_USE_ENV_PROXY) {
        process.env.NODE_USE_ENV_PROXY = "1";
      }
    }
  }
}

function cleanText(value) {
  return String(value ?? "").replace(/\r/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeKey(text) {
  return cleanText(text).toLowerCase();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
}

function pickSeeded(items, seed, offset = 0) {
  if (!items.length) {
    return null;
  }
  const digest = crypto.createHash("sha1").update(`${seed}:${offset}`).digest("hex");
  const value = Number.parseInt(digest.slice(0, 8), 16);
  return items[value % items.length];
}

function rotate(items, offset = 0) {
  if (!items.length) {
    return [];
  }
  const index = ((offset % items.length) + items.length) % items.length;
  return items.slice(index).concat(items.slice(0, index));
}

function autoDetectWorkbook(rootDir) {
  const files = fs.readdirSync(rootDir).filter((file) => file.toLowerCase().endsWith(".xlsx"));
  if (!files.length) {
    throw new Error("未找到 xlsx 输入文件，请通过 --input 指定。");
  }
  return path.join(rootDir, files[0]);
}

function fillMergedCells(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  const merges = worksheet["!merges"] || [];
  for (const merge of merges) {
    const value = rows[merge.s.r]?.[merge.s.c] ?? "";
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      rows[row] = rows[row] || [];
      for (let col = merge.s.c; col <= merge.e.c; col += 1) {
        if (!cleanText(rows[row][col])) {
          rows[row][col] = value;
        }
      }
    }
  }
  return rows.map((row) => row.map((cell) => cleanText(cell)));
}

function detectHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const keys = row.map(normalizeKey);
    return keys.some((key) => key.includes("一级场景")) && keys.some((key) => key.includes("二级场景"));
  });
}

function skipSceneRow({ l1Scene, l2Scene }) {
  const joined = `${l1Scene} ${l2Scene}`;
  if (!cleanText(joined)) {
    return true;
  }
  const normalized = normalizeKey(joined);
  return normalized.includes("一级场景") || normalized.includes("二级场景") || normalized.includes("合计") || normalized === "总计";
}

function parseRawRequirements(inputPath) {
  const workbook = XLSX.readFile(inputPath, { cellStyles: false, cellHTML: false, cellNF: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = fillMergedCells(worksheet);
  const headerIndex = detectHeaderIndex(rows);

  if (headerIndex === -1) {
    throw new Error("未识别到需求表头，至少需要包含“一级场景”和“二级场景”。");
  }

  const headers = rows[headerIndex].map(normalizeKey);
  const l1Index = headers.findIndex((header) => header.includes("一级场景"));
  const l2Index = headers.findIndex((header) => header.includes("二级场景"));
  const countIndex = headers.findIndex((header) => header.includes("预计"));

  let currentL1 = "";
  const rowsOut = [];

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rawL1 = cleanText(row[l1Index]);
    const rawL2 = cleanText(row[l2Index]);
    currentL1 = rawL1 || currentL1;

    const item = {
      id: `scene_${String(rowIndex + 1).padStart(3, "0")}`,
      source_file: path.basename(inputPath),
      source_sheet: sheetName,
      source_row_id: rowIndex + 1,
      l1_scene: currentL1,
      l2_scene_raw: rawL2,
      target_count: parseNumber(row[countIndex]),
      notes: "",
    };

    if (skipSceneRow({ l1Scene: item.l1_scene, l2Scene: item.l2_scene_raw })) {
      continue;
    }
    if (!item.l1_scene || !item.l2_scene_raw) {
      continue;
    }

    rowsOut.push(item);
  }

  return {
    generated_at: new Date().toISOString(),
    version: "v2",
    source_file: inputPath,
    source_sheet: sheetName,
    total_scenarios: rowsOut.length,
    rows: rowsOut,
  };
}

function splitSceneText(rawL2Scene) {
  const text = cleanText(rawL2Scene).replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "");
  const match = text.match(/^([^（(]+)[（(]([^）)]+)[）)]$/);
  if (!match) {
    return {
      label: text,
      examples: [],
    };
  }

  return {
    label: cleanText(match[1]),
    examples: match[2].split(/[、,，]/).map(cleanText).filter(Boolean),
  };
}

function inferApplicationTypeCandidates(l1Scene, l2SceneLabel, l2Examples) {
  const candidates = [];
  for (const example of l2Examples) {
    candidates.push(normalizeApplicationType(example));
  }
  const searchText = `${l1Scene} ${l2SceneLabel} ${l2Examples.join(" ")}`;
  for (const hint of APPLICATION_HINTS) {
    if (hint.keywords.some((keyword) => searchText.includes(keyword))) {
      candidates.push(hint.applicationType);
    }
  }
  if (!candidates.length) {
    candidates.push(normalizeApplicationType(l2SceneLabel));
  }
  return [...new Set(candidates)];
}

function normalizeApplicationType(text) {
  const cleaned = cleanText(text).replace(/类$/u, "");
  if (!cleaned) {
    return "通用内容应用";
  }
  if (cleaned.endsWith("应用") || cleaned.endsWith("页面")) {
    return cleaned;
  }
  return `${cleaned}应用`;
}

function normalizeScenarioRows(rawSpec) {
  const scenarios = rawSpec.rows.map((row) => {
    const scene = splitSceneText(row.l2_scene_raw);
    return {
      ...row,
      l2_scene_label: scene.label,
      l2_scene_examples: scene.examples,
      application_type_candidates: inferApplicationTypeCandidates(row.l1_scene, scene.label, scene.examples),
    };
  });

  return {
    generated_at: rawSpec.generated_at,
    version: "v2",
    source_file: rawSpec.source_file,
    source_sheet: rawSpec.source_sheet,
    total_scenarios: scenarios.length,
    scenarios,
  };
}

function parseRequirementsFromWorkbook(inputPath) {
  return normalizeScenarioRows(parseRawRequirements(inputPath));
}

function inferProductTypes(l1Scene, l2SceneLabel, applicationType) {
  const searchText = `${l1Scene} ${l2SceneLabel} ${applicationType}`;
  const hits = [];
  for (const hint of PRODUCT_TYPE_HINTS) {
    if (hint.keywords.some((keyword) => searchText.includes(keyword))) {
      hits.push(...hint.productTypes);
    }
  }
  const unique = [...new Set(hits)];
  return unique.length ? unique : ["portfolio", "dashboard", "form_flow"];
}

function inferStyles(l1Scene, l2SceneLabel, applicationType) {
  const searchText = `${l1Scene} ${l2SceneLabel} ${applicationType}`;
  const hits = [null];
  for (const hint of STYLE_KEYWORDS) {
    if (hint.keywords.some((keyword) => searchText.includes(keyword))) {
      hits.push(...hint.styles);
    }
  }
  return [...new Set(hits)];
}

function computeSeedCount(targetCount, options = {}) {
  const minSeed = Number(options.minSeed ?? 3);
  const maxSeed = Number(options.maxSeed ?? 9);
  const fraction = Number(options.initialFraction ?? 0.15);
  if (!targetCount) {
    return minSeed;
  }
  return Math.max(minSeed, Math.min(maxSeed, Math.round(targetCount * fraction)));
}

function buildSeedPlan(spec, options = {}) {
  const tasks = [];
  const N = COMPLEXITY_LEVELS.length;
  spec.scenarios.forEach((scenario, scenarioIndex) => {
    const count = computeSeedCount(scenario.target_count, options);
    const applicationTypes = rotate(scenario.application_type_candidates, scenarioIndex);
    const complexities = rotate(COMPLEXITY_LEVELS, scenarioIndex);

    for (let i = 0; i < count; i += 1) {
      const groupIndex = Math.floor(i / N);
      const applicationType = applicationTypes[groupIndex % applicationTypes.length];
      const productTypes = inferProductTypes(scenario.l1_scene, scenario.l2_scene_label, applicationType);
      const styles = inferStyles(scenario.l1_scene, scenario.l2_scene_label, applicationType);
      const targetComplexity = complexities[i % N];
      const productType = productTypes[groupIndex % productTypes.length];
      const designStyle = styles[groupIndex % styles.length];
      tasks.push({
        query_id: `q_${scenario.id}_${String(i + 1).padStart(3, "0")}`,
        scene_id: scenario.id,
        l1_scene: scenario.l1_scene,
        l2_scene_label: scenario.l2_scene_label,
        l2_scene_raw: scenario.l2_scene_raw,
        l2_scene_examples: scenario.l2_scene_examples,
        application_type: applicationType,
        product_type: productType,
        constrained: false,
        target_complexity: targetComplexity,
        design_style: designStyle,
        persona_seed: hashText(`${scenario.id}:${applicationType}:${groupIndex}`),
        plan_type: "seed",
        target_count_hint: scenario.target_count,
      });
    }
  });

  return {
    generated_at: new Date().toISOString(),
    version: "v2",
    total_tasks: tasks.length,
    tasks,
  };
}

function buildBackfillPlan(spec, existingQueries, options = {}) {
  const countsByScene = countBy(existingQueries, (row) => row.scene_id || sceneIdFromQuery(row, spec));
  const complexityByScene = {};
  for (const query of existingQueries) {
    const sceneId = query.scene_id || sceneIdFromQuery(query, spec);
    if (!sceneId) {
      continue;
    }
    complexityByScene[sceneId] = complexityByScene[sceneId] || {};
    const key = query.target_complexity || "unknown";
    complexityByScene[sceneId][key] = (complexityByScene[sceneId][key] || 0) + 1;
  }

  const minPerScene = Number(options.minPerScene ?? 6);
  const tasks = [];

  spec.scenarios.forEach((scenario, scenarioIndex) => {
    const currentCount = countsByScene[scenario.id] || 0;
    const desiredCount = scenario.target_count || minPerScene;
    const gap = Math.max(0, desiredCount - currentCount);
    if (!gap) {
      return;
    }
    const applicationTypes = rotate(scenario.application_type_candidates, currentCount + scenarioIndex);
    const complexities = rotate(COMPLEXITY_LEVELS, currentCount + scenarioIndex);
    const baseGroup = Math.floor(currentCount / N);

    for (let i = 0; i < gap; i += 1) {
      const groupIndex = Math.floor(i / N);
      const applicationType = applicationTypes[groupIndex % applicationTypes.length];
      const productTypes = inferProductTypes(scenario.l1_scene, scenario.l2_scene_label, applicationType);
      const styles = inferStyles(scenario.l1_scene, scenario.l2_scene_label, applicationType);
      tasks.push({
        query_id: `q_${scenario.id}_${String(currentCount + i + 1).padStart(3, "0")}`,
        scene_id: scenario.id,
        l1_scene: scenario.l1_scene,
        l2_scene_label: scenario.l2_scene_label,
        l2_scene_raw: scenario.l2_scene_raw,
        l2_scene_examples: scenario.l2_scene_examples,
        application_type: applicationType,
        product_type: productTypes[groupIndex % productTypes.length],
        constrained: false,
        target_complexity: complexities[i % N],
        design_style: styles[groupIndex % styles.length],
        persona_seed: hashText(`${scenario.id}:${applicationType}:${baseGroup + groupIndex}`),
        plan_type: "backfill",
        target_count_hint: scenario.target_count,
        gap_after_snapshot: gap,
      });
    }
  });

  return {
    generated_at: new Date().toISOString(),
    version: "v2",
    total_tasks: tasks.length,
    tasks,
  };
}

function leastCoveredKey(keys, counts, offset = 0) {
  const ranked = [...keys].sort((a, b) => {
    const delta = (counts[a] || 0) - (counts[b] || 0);
    if (delta !== 0) {
      return delta;
    }
    return keys.indexOf(a) - keys.indexOf(b);
  });
  return ranked[offset % ranked.length];
}

function sceneIdFromQuery(query, spec) {
  const hit = spec.scenarios.find(
    (scene) =>
      scene.l1_scene === query.l1_scene &&
      scene.l2_scene_label === (query.l2_scene_label || query.l2_scene) &&
      scene.application_type_candidates.includes(query.application_type || query.applicationType || ""),
  );
  return hit?.id || null;
}

function getComplexityInstruction(level = "medium") {
  const instructions = {
    vague: "Keep it intentionally vague. The user should only describe a broad goal or feeling in 2-3 short sentences.",
    medium: "Make it clearly more specific than vague: include a clear intent plus one or two concrete constraints, modules, or UI details in one concise paragraph.",
    complex: "Make it substantially more detailed than medium: include multiple explicit requirements about target users, goals, visual style, modules, interactions, states, responsiveness, or animation. It should read like a long paragraph or a structured block.",
  };
  return instructions[level] || instructions.medium;
}

function getDesignStyleInstruction(style) {
  return style ? STYLE_HINTS[style] || style : "未显式指定设计风格，可根据场景自然推断。";
}

function getEnglishProductTypeLabel(productType) {
  const labels = {
    landing_page: "landing page",
    content_blog: "content platform",
    dashboard: "dashboard",
    portfolio: "portfolio site",
    admin_panel: "admin panel",
    form_flow: "multi-step form flow",
    search_filter: "search and filter interface",
    realtime_collab: "real-time collaboration interface",
    ecommerce_shop: "e-commerce experience",
    booking_service: "booking flow",
    social_feed: "social feed",
    media_player: "media player",
    game_hud: "game HUD",
  };
  return labels[productType] || productType;
}

function getEnglishStyleInstruction(style) {
  const instructions = {
    Glassmorphism: "Use a glassmorphism visual style with translucent layered cards.",
    Neumorphism: "Use a soft neumorphism style with subtle raised surfaces.",
    Neubrutalism: "Use a neubrutalism style with bold borders and strong contrast.",
    Minimalism: "Keep the interface minimal with generous whitespace and clear hierarchy.",
    Material: "Follow a Material-inspired visual system with clear feedback states.",
    "Data-Dense": "Make the layout information-dense and easy to scan quickly.",
    Dark: "Use a dark theme with strong contrast on key information.",
    Cyberpunk: "Use a neon cyberpunk-inspired visual direction.",
    Luxury: "Make it feel editorial and premium with refined spacing and typography.",
    Vibrant: "Use a vibrant visual direction with more saturated colors.",
  };
  return style ? instructions[style] || `Use a ${style} visual direction.` : "No fixed visual style is required.";
}

function getEnglishApplicationLabel(applicationType) {
  const replacements = [
    ["旅行回忆", "travel memories"],
    ["年度相册", "annual photo album"],
    ["画作展示", "art showcase"],
    ["宝宝成长", "baby growth"],
    ["成长记录", "growth journal"],
    ["设计师Portfolio", "designer portfolio"],
    ["求职简历", "resume"],
    ["求职展示", "job-seeking showcase"],
    ["摄影作品集", "photography portfolio"],
    ["客户提案", "client proposal"],
    ["项目介绍", "project overview"],
    ["成果展示", "achievement showcase"],
    ["产品介绍页", "product showcase"],
    ["项目成果/年报", "project recap and annual report"],
    ["科普长文", "educational long-form content"],
    ["人物传记", "biography content"],
    ["品牌故事", "brand story content"],
    ["历史事件", "historical story content"],
    ["新建与创建", "creation workflow"],
    ["编辑与更新", "editing workflow"],
    ["搜索与查找", "search workflow"],
    ["选择与选取", "selection workflow"],
    ["筛选与排序", "filtering and sorting workflow"],
    ["删除与移除", "deletion workflow"],
    ["编辑个人资料", "profile editing"],
    ["上传与下载", "upload and download workflow"],
    ["复制与副本", "duplication workflow"],
    ["计算器/换算器", "calculator and converter"],
    ["生活记录器", "life tracker"],
    ["社交辅助", "social assistant"],
    ["倒计时/纪念日", "countdown and anniversary tracker"],
    ["文本处理", "text tools"],
    ["随机生成器", "random generator"],
    ["无障碍辅助", "accessibility assistant"],
    ["其他长尾微工具", "niche utility tools"],
    ["闪卡/单词记忆", "flashcards and vocabulary study"],
    ["刷题练习", "practice quizzes"],
    ["进度追踪", "progress tracking"],
    ["课程目录/课堂界面", "course overview"],
    ["知识速查/公式表", "quick reference"],
    ["任务管理", "task management"],
    ["番茄钟/专注计时", "pomodoro timer"],
    ["数据看板", "data dashboard"],
    ["笔记/文档编辑", "note and document editing"],
    ["饮水/服药/习惯提醒", "habit and reminder tracking"],
    ["运动记录/健身计划", "fitness tracking"],
    ["体重/经期/睡眠追踪", "health tracking"],
    ["冥想/呼吸练习", "meditation and breathing"],
    ["路线导航", "route navigation"],
    ["天气信息", "weather information"],
    ["交通时刻/票价查询", "transit schedules and fares"],
    ["今天吃什么", "meal chooser"],
    ["饮食记录", "meal tracking"],
    ["菜谱生成/食材搭配", "recipe planning"],
    ["餐厅列表/点评浏览", "restaurant browsing"],
    ["休闲互动", "casual interaction"],
    ["图片编辑", "image editing"],
    ["模板制作", "template creation"],
    ["音视频播放界面", "media playback"],
    ["内容创作工具", "content creation"],
    ["资讯阅读", "news reading"],
    ["购物流程", "shopping flow"],
    ["深度研究展示", "in-depth showcase"],
    ["办公/商务类", "business use cases"],
    ["文化/知识类", "culture and knowledge"],
    ["个人生活类", "personal life"],
    ["个人专业类", "personal professional work"],
    ["类", ""],
    ["应用", ""],
    ["★", ""],
    ["其他", "miscellaneous"],
  ];

  let text = cleanText(applicationType);
  for (const [source, target] of replacements) {
    text = text.split(source).join(target);
  }
  text = text.replace(/[（）()]/g, " ");
  text = text.replace(/\s*\/\s*/g, " and ");
  text = text.replace(/\s+/g, " ").trim();
  return text || "the product";
}

function buildPersonaSynthesisPrompt(task) {
  return [
    "你是一个 persona 设计助手，需要先基于场景合成一个真实用户画像，再用于生成前端 UI query。",
    "请参考 persona-driven synthetic data synthesis 的思路：persona 应该是场景驱动的真实人，不是固定职业标签。",
    "",
    "## 场景输入",
    `一级场景：${task.l1_scene}`,
    `二级场景标签：${task.l2_scene_label}`,
    task.l2_scene_examples?.length
      ? `该场景常见 app 方向示例（仅用于理解，不要机械照抄进最终 query）：${task.l2_scene_examples.join("、")}`
      : "该场景没有额外 app 方向示例。",
    `当前选定的 L3 application_type：${task.application_type}`,
    task.constrained ? `当前 UI 形态：${PRODUCT_TYPE_LABELS[task.product_type] || task.product_type}` : null,
    `设计风格：${getDesignStyleInstruction(task.design_style)}`,
    `目标复杂度：${task.target_complexity}`,
    `复杂度要求：${getComplexityInstruction(task.target_complexity)}`,
    "最终 query 默认输出英文。",
    "",
    "## 你的任务",
    "请生成 1 个最适合该场景的 persona，要求：",
    "1. persona 要体现真实身份、动机、表达方式和信息不完整性。",
    "2. persona 该场景下真实需要",
    "3. persona 要解释为什么会提出这个页面或组件需求。",
    "4. 不要把二级场景括号中的示例整段复制到 persona 文本中。",
    "",
    "## 输出格式",
    JSON.stringify(
      {
        persona_id: "p_xxx",
        persona_title: "角色标签一句话概括这个人",
        persona_description: "2-4 句描述背景、动机和当前处境",
        persona_style_hint: "这个人会如何表达、会不会给细节、会不会提技术",
        user_goal: "这个人想通过页面/产品完成什么",
        domain_familiarity: "low | medium | high",
        persona_source: "llm_persona_synthesis",
      },
      null,
      2,
    ),
  ].filter(Boolean).join("\n");
}

function buildPersonaSpec(task) {
  const archetype = pickSeeded(PERSONA_ARCHETYPES, task.persona_seed) || PERSONA_ARCHETYPES[0];
  const familiarity = task.target_complexity === "complex" ? "high" : task.target_complexity === "medium" ? "medium" : "low";
  const example = task.application_type.replace(/应用$/u, "");
  return {
    persona_id: `persona_${hashText(`${task.query_id}:${task.persona_seed}`)}`,
    persona_title: `${example}相关内容的真实使用者`,
    persona_description: `这是一个正在围绕“${task.l2_scene_label}”整理或表达内容的人。Ta 当前更关注如何把“${example}”相关内容做成更清晰、更顺手的线上体验，而不是先写完整文档。Ta 属于${archetype.title}，会基于自己的处境来提出需求。`,
    persona_style_hint: archetype.styles[task.target_complexity] || archetype.styles.medium,
    user_goal: `希望把“${example}”相关内容承载成更适合浏览、展示或管理的界面。`,
    domain_familiarity: familiarity,
    persona_source: "deterministic_persona_fallback",
  };
}

function buildQueryPromptFromPersona(task, persona) {
  return [
    "你现在要扮演给定的 persona，向 AI 编程助手发送一条前端 UI 开发需求。",
    "输出只能是那条用户消息query指令，不要解释你是谁，不要输出 JSON。",
    "",
    "## Inputs",
    "### Persona",
    `persona_title：${persona.persona_title}`,
    `persona_description：${persona.persona_description}`,
    `persona_style_hint：${persona.persona_style_hint}`,
    `user_goal：${persona.user_goal}`,
    `domain_familiarity：${persona.domain_familiarity}`,
    "",
    "### 场景背景",
    `一级场景：${task.l1_scene}`,
    `二级场景标签：${task.l2_scene_label}`,
    `当前选定的 L3 application_type：${task.application_type}`,
    task.constrained ? `当前 UI 形态（参考方向）：${PRODUCT_TYPE_LABELS[task.product_type] || task.product_type}` : null,
    task.l2_scene_examples?.length
      ? `常见 app 方向示例（仅参考，按二级场景随机衍生，不要重复）：${task.l2_scene_examples.join("、")}`
      : "该场景没有额外 app 示例。",
    `设计风格：${getDesignStyleInstruction(task.design_style)}`,
    `Query目标复杂度：${task.target_complexity}`,
    "",
    "## 输出要求",
    "1. 基于 Inputs 和场景背景以Persona角色的第一人称视角输出一条英文 query",
    "2. query 语气必须符合 persona，不要泄露、照抄Inputs",
    "3. Write like a real person typing into a chat box",
    "4. Allow incomplete thoughts, mid-sentence pivots, casual grammar, filler words",
    "5. Express constraints implicitly: say \"for my mom's 60th birthday\" instead of \"target audience: elderly female\".",
    "6. Include situation triggers naturally e.x. \"I need it to help me ...\" etc.",
    "7. Mix imperatives, questions, statements, and half-finished thoughts.",
    "8. Avoid repetitive structures across queries.",
    "9. Vary sentence count based on Query目标复杂度 from 20 ~ 500 words，参考下述三种specificity规格：",
    "- vague: the user barely describes what they want; the system must infer a lot. Keep it to 2-3 short sentences.",
    "- medium: some clear intent plus one or two constraints or details. Keep it as one concise paragraph.",
    "- complex: multiple explicit requirements about target user, goal, design style, functionalities, interactions, states, responsiveness, animation, or other relevant descriptions. It should be much more detailed than medium, ideally a long paragraph or structured requirement block.",
    "",
    "## Few-shot Examples（仅作为长度与结构参考，不要照抄主题/语言）",
    "下面三段展示了 vague / medium / complex 三种复杂度下，真实用户写出来的 query 大致长什么样。注意它们的篇幅、信息密度和结构差异：",
    "",
    "<vague>",
    "构建一个集成CRM数据的内部销售分析仪表板。",
    "</vague>",
    "",
    "<medium>",
    "Act as an expert kids' game designer and web developer. Help me build a tool that turns simple ideas into detailed prompts for kid-friendly web games. Output the prompt in short, medium, detail versions. Allow options for picking different game type, styles, and complexity",
    "</medium>",
    "",
    "<complex>",
    "Help me build a mobile app called Tag along — a small social app for friend circles, hobby groups, and company crews to plan things together. Vibe: fun, warm, young. Look: round buttons, round avatars, colors that are playful but soft (coral, sunshine yellow, mint, sky blue, lavender, off-white background). Bottom bar with 5 tabs, the middle one is a round red +:",
    "1. Feed — list of upcoming plans, with a row of interest pills at the top (hiking, coffee, yoga...) so I can filter; show a \"For you\" section that matches my interests.",
    "2. Wall — an Instagram-style photo wall: big photo + caption + likes + comments. If a post is about a plan, show a small event card under it with a \"Join\" button.",
    "3. +-when I tap it, pop up two choices: post a photo or create an event.",
    "4. Ranks — a leaderboard. Rules: hosting an event = 50 pts, posting on the wall = 20 pts, joining an event = 10 pts. Top 3 get medals.",
    "5. Profile — my avatar, name, a one-word vibe, three little prompts (anthem / perfect Sunday / hot take), my interests, the events I've hosted or am going to, and all the photo posts I've made. Other people's profiles look the same but read-only.",
    "Core action on every event: two pill buttons — Coming and Not Coming. Tapping one drops my name into that list. No RSVP form. From the event page I can also send a friend a small nudge if they haven't replied, and react with vibes (Hyped / I'm in / Maybe / Saving spot / FOMO). Keep all data on the phone — no third-party login, no payments, no push notifications. Please pre-fill some demo users and events so the app feels alive the moment I open it.",
    "</complex>",
    "",
    "注意：示例只是用于校准\"长度感 / 结构感 / 信息密度\"，请保持你的 query 与示例话题完全无关，且最终输出仍默认英文（vague 也用英文，不要因为示例是中文就跟着输出中文）。",
  ].filter(Boolean).join("\n");
}

function synthesizeQueryFromPersona(task, persona) {
  const styleSentence = getEnglishStyleInstruction(task.design_style);
  const appLabel = getEnglishApplicationLabel(task.application_type);
  const productLabel = task.constrained ? getEnglishProductTypeLabel(task.product_type) : null;

  if (task.target_complexity === "vague") {
    return productLabel
      ? `I want a ${productLabel} for ${appLabel}. Keep it simple and easy to browse. It should feel clean on mobile too.`
      : `I want something for ${appLabel}. Keep it simple and easy to browse. It should feel clean on mobile too.`;
  }

  if (task.target_complexity === "complex") {
    const uiRef = productLabel ? `a mobile-first, responsive ${productLabel}` : "a mobile-first, responsive interface";
    return `Please help me design ${uiRef} for ${appLabel}. ${styleSentence} The experience should feel polished rather than generic, and I want the layout, visual hierarchy, and interaction flow to clearly support browsing, comparison, and deeper exploration.

Key requirements:
1. The hero section should explain the value immediately and include a strong primary CTA.
2. The main content area should include multiple clearly separated modules, such as featured content, categorized sections, and deeper detail views.
3. Important interactions should be explicitly designed, including navigation changes, reveal or expand behavior, empty states, and clear hover or tap feedback.
4. Please consider responsive behavior carefully so the same experience still feels smooth and readable on smaller screens.
5. If motion is used, it should improve orientation and storytelling rather than feel purely decorative.`;
  }

  const uiRef = productLabel ? `an elegant ${productLabel}` : "an elegant interface";
  return `Please build ${uiRef} for ${appLabel}. ${styleSentence} I want a clear hero section, a structured main content area, and one useful supporting interaction such as quick filtering or expand-for-details. The overall experience should feel organized and easy to scan.`;
}

function buildTemplateQuery(task) {
  const appLabel = getEnglishApplicationLabel(task.application_type);
  const productLabel = task.constrained ? getEnglishProductTypeLabel(task.product_type) : null;
  return productLabel
    ? `I want a ${productLabel} for ${appLabel} with a clear structure and easy-to-scan content.`
    : `I want something for ${appLabel} with a clear structure and easy-to-scan content.`;
}

function normalizeOpenAiBaseUrl(baseUrl) {
  const normalized = cleanText(baseUrl || "https://www.packyapi.com/v1").replace(/\/+$/u, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function normalizeAnthropicBaseUrl(baseUrl) {
  return cleanText(baseUrl || "https://www.packyapi.com").replace(/\/+$/u, "").replace(/\/v1$/u, "");
}

function resolveLlmConfig(options = {}, mode = "llm-openai") {
  loadLocalEnv();
  applySystemNetworkEnv(options.network || options.llm || {});
  const llmOptions = options.llm || {};
  const useAnthropic = ["llm-anthropic", "claude-code", "anthropic-cc", "packy-cc"].includes(mode);
  const apiKey = cleanText(
    llmOptions.apiKey ||
      (useAnthropic
        ? process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || process.env.PACKY_API_KEY
        : process.env.PACKY_API_KEY || process.env.OPENAI_API_KEY),
  );
  const model = cleanText(
    llmOptions.model ||
      (useAnthropic
        ? process.env.ANTHROPIC_MODEL || process.env.PACKY_MODEL || process.env.LLM_MODEL
        : process.env.PACKY_MODEL || process.env.OPENAI_MODEL || process.env.LLM_MODEL) ||
      "claude-3-5-sonnet-20240620",
  );
  const baseUrl = useAnthropic
    ? normalizeAnthropicBaseUrl(
        llmOptions.baseUrl || process.env.ANTHROPIC_BASE_URL || process.env.PACKY_BASE_URL || "https://www.packyapi.com",
      )
    : normalizeOpenAiBaseUrl(
        llmOptions.baseUrl || process.env.PACKY_BASE_URL || process.env.OPENAI_BASE_URL || "https://www.packyapi.com/v1",
      );
  const concurrency = Math.max(
    1,
    Number(llmOptions.concurrency || process.env.PACKY_CONCURRENCY || process.env.LLM_CONCURRENCY || 3),
  );
  const timeoutMs = Math.max(
    1000,
    Number(llmOptions.timeoutMs || process.env.PACKY_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 120000),
  );
  const maxRetries = Math.max(
    0,
    Number(llmOptions.maxRetries || process.env.PACKY_MAX_RETRIES || process.env.LLM_MAX_RETRIES || 2),
  );

  if (!apiKey) {
    throw new Error(
      useAnthropic
        ? "缺少 Anthropic/Claude Code 鉴权令牌。请设置 ANTHROPIC_AUTH_TOKEN、ANTHROPIC_API_KEY 或 PACKY_API_KEY。"
        : "缺少 LLM API Key。请设置 PACKY_API_KEY 或 OPENAI_API_KEY；base_url 默认使用 https://www.packyapi.com/v1 。",
    );
  }

  return {
    provider: useAnthropic ? "anthropic" : "openai-compatible",
    apiKey,
    model,
    baseUrl,
    concurrency,
    timeoutMs,
    maxRetries,
    httpProxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null,
    allowInsecureTls: process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0",
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFences(text) {
  return cleanText(String(text || "").replace(/^```(?:json)?/iu, "").replace(/```$/u, ""));
}

/**
 * 从可能含多段、markdown、前后噪声的文本中，截取第一个**括号平衡**的 JSON 对象
 *（避免 first `{` + last `}` 截断到不完整片段；兼容 Gemini/思考型模型把 JSON 放在 reasoning 中的情况。）
 */
function extractBalancedJsonObject(text) {
  const cleaned = stripCodeFences(String(text || ""));
  const start = cleaned.indexOf("{");
  if (start === -1) {
    throw new Error(`未从模型输出中找到「{」：${cleaned.slice(0, 200)}`);
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }
  throw new Error(`未从模型输出中提取到完整 JSON 对象：${cleaned.slice(0, 200)}`);
}

/**
 * 合并 OpenAI 兼容体中的正文与「思考/推理」通道。部分网关下 Gemini 的正式输出在 reasoning_* 中且 content 为截断或空。
 */
function extractMessageText(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message;
  const parts = [];

  const push = (s) => {
    if (typeof s === "string" && s.length) {
      parts.push(s);
    }
  };

  if (typeof choice?.text === "string") {
    push(choice.text);
  }

  if (!message) {
    return parts.join("\n\n");
  }

  const { content } = message;
  if (typeof content === "string") {
    push(content);
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === "string") {
        push(item);
      } else if (item && typeof item === "object") {
        const t = item.type;
        if (t === "text" || t === "output_text") {
          push(item.text || item.content);
        }
        if (t === "reasoning" || t === "thinking") {
          push(item.text || item.summary || item.content);
        }
      }
    }
  }

  for (const key of ["reasoning_content", "reasoning", "thinking", "refusal"]) {
    push(message[key]);
  }

  // 少数网关/代理把补充文本放在与 message 平级的 choice 上
  for (const key of ["reasoning", "reasoning_content"]) {
    if (typeof choice?.[key] === "string") {
      push(choice[key]);
    }
  }

  return parts.join("\n\n");
}

async function callOpenAiCompatibleChat(messages, config, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 环境不支持 fetch，无法调用真实 LLM。");
  }

  const payload = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.7,
  };
  if (options.maxTokens) {
    payload.max_tokens = options.maxTokens;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`LLM 请求失败：${response.status} ${text.slice(0, 500)}`);
      }
      const json = JSON.parse(text);
      return {
        raw: json,
        text: extractMessageText(json),
      };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < config.maxRetries) {
        await sleep(800 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function extractAnthropicMessageText(payload) {
  const content = payload?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item?.type === "text") {
        return item.text || "";
      }
      return item?.content || "";
    })
    .join("");
}

async function callAnthropicCompatibleMessages(messages, config, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 环境不支持 fetch，无法调用真实 LLM。");
  }

  const payload = {
    model: config.model,
    max_tokens: options.maxTokens || 1024,
    messages,
  };
  if (options.temperature !== undefined) {
    payload.temperature = options.temperature;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          Authorization: `Bearer ${config.apiKey}`,
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`LLM 请求失败：${response.status} ${text.slice(0, 500)}`);
      }
      const json = JSON.parse(text);
      return {
        raw: json,
        text: extractAnthropicMessageText(json),
      };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < config.maxRetries) {
        await sleep(800 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function tryParsePersonaJsonFromModelText(text) {
  const raw = String(text || "");
  const candidates = [raw];
  for (const chunk of raw.split(/\n{2,}/u)) {
    const t = chunk.trim();
    if (t && !candidates.includes(t)) {
      candidates.push(t);
    }
  }
  let lastError = null;
  for (const c of candidates) {
    try {
      return JSON.parse(extractBalancedJsonObject(c));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("无法从模型输出解析 persona JSON");
}

function normalizePersonaSpec(task, text) {
  const fallback = buildPersonaSpec(task);
  try {
    const parsed = tryParsePersonaJsonFromModelText(text);
    return {
      persona_id: cleanText(parsed.persona_id) || fallback.persona_id,
      persona_title: cleanText(parsed.persona_title) || fallback.persona_title,
      persona_description: cleanText(parsed.persona_description) || fallback.persona_description,
      persona_style_hint: cleanText(parsed.persona_style_hint) || fallback.persona_style_hint,
      user_goal: cleanText(parsed.user_goal) || fallback.user_goal,
      domain_familiarity: ["low", "medium", "high"].includes(cleanText(parsed.domain_familiarity))
        ? cleanText(parsed.domain_familiarity)
        : fallback.domain_familiarity,
      persona_source: "llm_persona_synthesis",
      llm_raw_text: cleanText(text),
    };
  } catch (error) {
    return {
      ...fallback,
      persona_source: "llm_persona_synthesis_fallback",
      llm_raw_text: cleanText(text),
      llm_parse_error: error.message,
    };
  }
}

function normalizeQueryOutput(text) {
  return stripCodeFences(String(text || ""))
    .replace(/^["']|["']$/g, "")
    .trim();
}

async function generateQueryRecordWithLlm(task, base, config) {
  const personaPromptText = buildPersonaSynthesisPrompt(task);
  const caller =
    config.provider === "anthropic" ? callAnthropicCompatibleMessages : callOpenAiCompatibleChat;
  const personaResult = await caller(
    [
      {
        role: "user",
        content:
          "You are a reliable persona synthesis assistant. Return a single JSON object only, with no markdown fences and no extra commentary.\n\n" +
          personaPromptText,
      },
    ],
    config,
    // 思考/推理型模型会占用大量 completion budget；过小的 max 会导致 content 仅截断、JSON 无法闭合
    { temperature: 0.8, maxTokens: 4096 },
  );

  const personaSpec = normalizePersonaSpec(task, personaResult.text);
  const queryPromptText = buildQueryPromptFromPersona(task, personaSpec);
  const queryResult = await caller(
    [
      {
        role: "user",
        content:
          "You are an instruction generator. Output only the final user query text, with no markdown fences, labels, or explanations.\n\n" +
          queryPromptText,
      },
    ],
    config,
    { temperature: 0.95, maxTokens: 4096 },
  );

  const queryText = normalizeQueryOutput(queryResult.text);
  if (!queryText) {
    throw new Error(`LLM 未返回有效 query：${task.query_id}`);
  }

  return {
    ...base,
    persona_id: personaSpec.persona_id,
    persona_title: personaSpec.persona_title,
    persona_source: personaSpec.persona_source,
    persona_spec: personaSpec,
    persona_prompt_text: personaPromptText,
    query_prompt_text: queryPromptText,
    query_text: queryText,
    llm_provider: config.provider,
    llm_base_url: config.baseUrl,
    llm_model: config.model,
    llm_usage: {
      persona: personaResult.raw?.usage || null,
      query: queryResult.raw?.usage || null,
    },
  };
}

/**
 * 在固定 persona_spec 下仅调用第二步 LLM 生成 query（用于同一锚点 id 补齐其余 target_complexity）。
 */
async function generateQueryRecordWithLlmQueryOnly(task, base, config, personaSpec, frozenPersonaPromptText) {
  const caller =
    config.provider === "anthropic" ? callAnthropicCompatibleMessages : callOpenAiCompatibleChat;
  const queryPromptText = buildQueryPromptFromPersona(task, personaSpec);
  const queryResult = await caller(
    [
      {
        role: "user",
        content:
          "You are an instruction generator. Output only the final user query text, with no markdown fences, labels, or explanations.\n\n" +
          queryPromptText,
      },
    ],
    config,
    { temperature: 0.95, maxTokens: 4096 },
  );

  const queryText = normalizeQueryOutput(queryResult.text);
  if (!queryText) {
    throw new Error(`LLM 未返回有效 query：${task.query_id}`);
  }

  const auditPersonaPrompt =
    typeof frozenPersonaPromptText === "string" && frozenPersonaPromptText.trim()
      ? `[persona 冻结自锚点记录，本次未重新调用 persona LLM]\n${frozenPersonaPromptText}`
      : buildPersonaSynthesisPrompt(task);

  return {
    ...base,
    persona_id: personaSpec.persona_id,
    persona_title: personaSpec.persona_title,
    persona_source: personaSpec.persona_source,
    persona_spec: { ...personaSpec },
    persona_prompt_text: auditPersonaPrompt,
    query_prompt_text: queryPromptText,
    query_text: queryText,
    llm_provider: config.provider,
    llm_base_url: config.baseUrl,
    llm_model: config.model,
    llm_usage: {
      persona: null,
      query: queryResult.raw?.usage || null,
    },
  };
}

/**
 * 对每条已生成的 raw 记录：复用其 persona_spec，为 COMPLEXITY_LEVELS 中「非当前 target_complexity」各生成一条 query。
 * @param {Array<object>} anchorRows - 形如 generateQueryRecords 产出的行，须含 id、target_complexity、persona_spec 及场景字段
 */
async function supplementAnchoredPersonaQueries(anchorRows, options = {}) {
  const mode = options.mode || "llm-openai";
  if (!["llm-openai", "real-llm", "packy-openai", "llm-anthropic", "claude-code", "anthropic-cc", "packy-cc"].includes(mode)) {
    throw new Error(`supplementAnchoredPersonaQueries 仅支持真实 LLM 模式，当前：${mode}`);
  }
  const llmConfig = resolveLlmConfig(options, mode);
  const generatedAt = new Date().toISOString();
  const work = [];

  for (const row of anchorRows) {
    const personaSpec = row.persona_spec;
    if (!personaSpec || !personaSpec.persona_id) {
      throw new Error(`锚点记录 ${row.id || row.query_id || "?"} 缺少 persona_spec，无法复用`);
    }
    const current = row.target_complexity;
    for (const target of COMPLEXITY_LEVELS) {
      if (target === current) {
        continue;
      }
      work.push({ row, target });
    }
  }

  return mapWithConcurrency(work, llmConfig.concurrency, async ({ row, target }) => {
    const anchorId = row.id || row.query_id;
    const newId = `${anchorId}__xc__${target}`;
    const task = {
      query_id: newId,
      scene_id: row.scene_id,
      l1_scene: row.l1_scene,
      l2_scene_label: row.l2_scene_label,
      l2_scene_examples: row.l2_scene_examples,
      l2_scene_raw: row.l2_scene_raw,
      application_type: row.application_type,
      product_type: row.product_type,
      constrained: true,
      design_style: row.design_style,
      target_complexity: target,
      persona_seed: row.persona_seed || `anchored_${anchorId}`,
    };

    const base = {
      id: newId,
      scene_id: row.scene_id,
      l1_scene: row.l1_scene,
      l2_scene_label: row.l2_scene_label,
      application_type: row.application_type,
      product_type: row.product_type,
      target_complexity: target,
      design_style: row.design_style,
      created_at: generatedAt,
      generator_mode: mode,
      query_variant: "anchored_persona_xc_supplement",
      persona_anchor_query_id: anchorId,
      persona_anchor_target_complexity: row.target_complexity,
    };

    return generateQueryRecordWithLlmQueryOnly(
      task,
      base,
      llmConfig,
      { ...row.persona_spec },
      row.persona_prompt_text,
    );
  });
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => runWorker());
  await Promise.all(runners);
  return results;
}

async function generateQueryRecords(plan, options = {}) {
  const mode = options.mode || "persona-fallback";
  const generatedAt = new Date().toISOString();
  const syncRows = plan.tasks.map((task) => {
    const base = {
      id: task.query_id,
      scene_id: task.scene_id,
      l1_scene: task.l1_scene,
      l2_scene_label: task.l2_scene_label,
      application_type: task.application_type,
      product_type: task.product_type,
      target_complexity: task.target_complexity,
      design_style: task.design_style,
      created_at: generatedAt,
      generator_mode: mode,
    };

    if (mode === "prompt-packets") {
      return {
        ...base,
        persona_prompt_text: buildPersonaSynthesisPrompt(task),
        query_prompt_text: "",
        query_text: "",
      };
    }

    const personaSpec = buildPersonaSpec(task);
    const queryPromptText = buildQueryPromptFromPersona(task, personaSpec);
    const queryText = mode === "template-fallback" ? buildTemplateQuery(task) : synthesizeQueryFromPersona(task, personaSpec);

    return {
      ...base,
      persona_id: personaSpec.persona_id,
      persona_title: personaSpec.persona_title,
      persona_source: personaSpec.persona_source,
      persona_spec: personaSpec,
      persona_prompt_text: buildPersonaSynthesisPrompt(task),
      query_prompt_text: queryPromptText,
      query_text: queryText,
    };
  });

  if (mode === "persona-fallback" || mode === "template-fallback" || mode === "prompt-packets") {
    return syncRows;
  }

  if (!["llm-openai", "real-llm", "packy-openai", "llm-anthropic", "claude-code", "anthropic-cc", "packy-cc"].includes(mode)) {
    throw new Error(`不支持的生成模式：${mode}`);
  }

  const llmConfig = resolveLlmConfig(options, mode);
  return mapWithConcurrency(plan.tasks, llmConfig.concurrency, async (task, index) => {
    const base = {
      id: task.query_id,
      scene_id: task.scene_id,
      l1_scene: task.l1_scene,
      l2_scene_label: task.l2_scene_label,
      application_type: task.application_type,
      product_type: task.product_type,
      target_complexity: task.target_complexity,
      design_style: task.design_style,
      created_at: generatedAt,
      generator_mode: mode,
      llm_task_index: index,
    };
    return generateQueryRecordWithLlm(task, base, llmConfig);
  });
}

function inferActualComplexity(text) {
  const normalized = cleanText(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const long = wordCount >= 70;
  const hasStructuredBlock = /key requirements:|[0-9]\./i.test(normalized);
  const interactionCount =
    (
      normalized.match(
        /click|expand|toggle|filter|sort|navigation|detail|empty state|mobile|responsive|feedback|timeline|card|hover|tap|cta|module|section/gi,
      ) || []
    ).length;
  if (hasStructuredBlock || long || interactionCount >= 5) {
    return "complex";
  }
  if (wordCount >= 28 || interactionCount >= 2) {
    return "medium";
  }
  return "vague";
}

function scoreQueryRecord(record) {
  const text = cleanText(record.query_text);
  const hasStyle = Boolean(record.design_style);
  const hasSpecificMarkers =
    /page|interface|hero|card|list|table|button|chart|flow|filter|search|detail|modal|timeline|navigation|cta|responsive|section|module/gi.test(
      text,
    );
  const actualComplexity = inferActualComplexity(text);

  let authenticity = 3;
  if (!/^please help me make.{0,10}$/i.test(text)) authenticity += 1;
  if (text.length >= 45) authenticity += 1;

  let specificity = 2;
  if (hasSpecificMarkers) specificity += 1;
  if (actualComplexity !== "vague") specificity += 1;
  if (/[,:;]|[0-9]\./.test(text)) specificity += 1;

  let diversity = 2;
  if (hasStyle) diversity += 1;
  if (record.application_type && !record.application_type.startsWith("通用")) diversity += 1;
  if (record.persona_title) diversity += 1;

  authenticity = clampScore(authenticity);
  specificity = clampScore(specificity);
  diversity = clampScore(diversity);

  const total = Number((authenticity * 0.4 + specificity * 0.4 + diversity * 0.2).toFixed(2));
  return {
    ...record,
    quality_score: total,
    quality_pass: total >= 2.8,
    complexity_level: actualComplexity,
  };
}

function clampScore(value) {
  return Math.max(1, Math.min(5, value));
}

function scoreQueryRecords(rows) {
  return rows.map(scoreQueryRecord);
}

let sqlPromise = null;

async function loadSqlJs() {
  if (!sqlPromise) {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    sqlPromise = initSqlJs({
      locateFile: (file) => (file === "sql-wasm.wasm" ? wasmPath : file),
    });
  }
  return sqlPromise;
}

async function openDatabase(dbPath) {
  const SQL = await loadSqlJs();
  const exists = fs.existsSync(dbPath);
  const db = exists ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  ensureSchema(db);
  return db;
}

function ensureSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS queries (
      id TEXT PRIMARY KEY,
      scene_id TEXT,
      query_text TEXT NOT NULL,
      l1_scene TEXT NOT NULL,
      l2_scene_label TEXT NOT NULL,
      application_type TEXT NOT NULL,
      product_type TEXT NOT NULL,
      target_complexity TEXT NOT NULL,
      persona_id TEXT,
      persona_title TEXT,
      persona_source TEXT,
      design_style TEXT,
      quality_score REAL,
      quality_pass INTEGER,
      complexity_level TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_runs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      total_planned INTEGER NOT NULL,
      total_generated INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imported_requirements (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      source_row_id INTEGER NOT NULL,
      l1_scene TEXT NOT NULL,
      l2_scene_raw TEXT NOT NULL,
      l2_scene_label TEXT NOT NULL,
      l2_scene_examples_json TEXT NOT NULL,
      application_type_candidates_json TEXT NOT NULL,
      target_count INTEGER,
      created_at TEXT NOT NULL
    );
  `);
}

function runInsert(db, sql, values) {
  const stmt = db.prepare(sql);
  try {
    for (const row of values) {
      stmt.run(row);
    }
  } finally {
    stmt.free();
  }
}

async function importIntoDatabase({ dbPath, requirementsSpec, queries, mode = "persona-fallback" }) {
  const db = await openDatabase(dbPath);
  const importedAt = new Date().toISOString();

  runInsert(
    db,
    `INSERT OR REPLACE INTO imported_requirements
      (id, source_file, source_sheet, source_row_id, l1_scene, l2_scene_raw, l2_scene_label, l2_scene_examples_json, application_type_candidates_json, target_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    requirementsSpec.scenarios.map((scene) => [
      scene.id,
      scene.source_file,
      scene.source_sheet,
      scene.source_row_id,
      scene.l1_scene,
      scene.l2_scene_raw,
      scene.l2_scene_label,
      JSON.stringify(scene.l2_scene_examples),
      JSON.stringify(scene.application_type_candidates),
      scene.target_count,
      importedAt,
    ]),
  );

  runInsert(
    db,
    `INSERT OR REPLACE INTO queries
      (id, scene_id, query_text, l1_scene, l2_scene_label, application_type, product_type, target_complexity, persona_id, persona_title, persona_source, design_style, quality_score, quality_pass, complexity_level, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    queries.map((query) => [
      query.id,
      query.scene_id,
      query.query_text,
      query.l1_scene,
      query.l2_scene_label,
      query.application_type,
      query.product_type,
      query.target_complexity,
      query.persona_id ?? null,
      query.persona_title ?? null,
      query.persona_source ?? null,
      query.design_style,
      query.quality_score ?? null,
      query.quality_pass ? 1 : 0,
      query.complexity_level ?? null,
      query.created_at,
    ]),
  );

  const runId = `run_${hashText(`${importedAt}:${queries.length}:${mode}`)}`;
  runInsert(
    db,
    `INSERT OR REPLACE INTO generation_runs
      (id, mode, total_planned, total_generated, created_at)
      VALUES (?, ?, ?, ?, ?)`,
    [[runId, mode, queries.length, queries.length, importedAt]],
  );

  persistDatabase(db, dbPath);
  db.close();
  return { runId, importedAt, totalQueries: queries.length };
}

function persistDatabase(db, dbPath) {
  ensureDirForFile(dbPath);
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

async function queryRows(dbPath, sql) {
  const db = await openDatabase(dbPath);
  const result = db.exec(sql);
  const rows = result.length ? mapExecRows(result[0]) : [];
  db.close();
  return rows;
}

function mapExecRows(execResult) {
  return execResult.values.map((valueRow) => {
    const row = {};
    execResult.columns.forEach((column, index) => {
      row[column] = valueRow[index];
    });
    return row;
  });
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) ?? "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildSummary(queries) {
  const averageQuality =
    queries.length > 0
      ? Number((queries.reduce((sum, query) => sum + (Number(query.quality_score) || 0), 0) / queries.length).toFixed(2))
      : 0;

  const targetVsActual = {};
  for (const query of queries) {
    const key = `${query.target_complexity || "unknown"} -> ${query.complexity_level || "unknown"}`;
    targetVsActual[key] = (targetVsActual[key] || 0) + 1;
  }

  return {
    total_queries: queries.length,
    average_quality: averageQuality,
    by_l1_scene: countBy(queries, (row) => row.l1_scene),
    by_l2_scene_label: countBy(queries, (row) => row.l2_scene_label),
    by_application_type: countBy(queries, (row) => row.application_type),
    by_product_type: countBy(queries, (row) => row.product_type),
    by_target_complexity: countBy(queries, (row) => row.target_complexity),
    by_actual_complexity: countBy(queries, (row) => row.complexity_level || "unknown"),
    by_design_style: countBy(queries, (row) => row.design_style || "unspecified"),
    by_persona_source: countBy(queries, (row) => row.persona_source || "unspecified"),
    target_complexity_vs_actual_complexity: targetVsActual,
  };
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBars(title, data) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  const rows = entries
    .map(
      ([label, value]) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(label)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (value / max) * 100)}%"></div></div>
          <div class="bar-value">${value}</div>
        </div>`,
    )
    .join("");
  return `<section class="card"><h3>${escapeHtml(title)}</h3>${rows || '<div class="empty">暂无数据</div>'}</section>`;
}

function buildDashboardHtml({ queries, summary }) {
  const payload = JSON.stringify({ queries, summary }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Query Factory Dashboard V2</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f5f7fb; color: #1b2430; }
    .page { max-width: 1500px; margin: 0 auto; padding: 24px; }
    .hero { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .metric, .card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 6px rgba(12, 20, 33, 0.08); }
    .metric .label { color: #607086; font-size: 13px; }
    .metric .value { font-size: 28px; font-weight: 700; margin-top: 8px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
    .filters { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
    select, input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d7deea; border-radius: 8px; background: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #eef2f7; text-align: left; vertical-align: top; }
    th { background: #f8fafc; color: #4e5d6c; }
    .bar-row { display: grid; grid-template-columns: 180px 1fr 44px; gap: 12px; align-items: center; margin: 10px 0; }
    .bar-track { background: #edf2f7; height: 10px; border-radius: 999px; overflow: hidden; }
    .bar-fill { background: linear-gradient(90deg, #4f46e5, #06b6d4); height: 100%; border-radius: 999px; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef4ff; color: #274690; font-size: 12px; }
    .empty { color: #7a8797; }
    @media (max-width: 1100px) { .hero, .grid, .filters { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 720px) { .hero, .grid, .filters { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="page">
    <h1>Query Factory Dashboard V2</h1>
    <div class="hero">
      <div class="metric"><div class="label">总 Query 数</div><div class="value" id="totalQueries">0</div></div>
      <div class="metric"><div class="label">平均质量分</div><div class="value" id="averageQuality">0</div></div>
      <div class="metric"><div class="label">一级场景数</div><div class="value" id="l1Count">0</div></div>
      <div class="metric"><div class="label">L3 应用类型数</div><div class="value" id="applicationTypeCount">0</div></div>
    </div>
    <div class="grid" id="chartGrid"></div>
    <div class="card">
      <h3>过滤器</h3>
      <div class="filters">
        <select id="filterL1"><option value="">全部一级场景</option></select>
        <select id="filterApp"><option value="">全部 application_type</option></select>
        <select id="filterTargetComplexity"><option value="">全部目标复杂度</option></select>
        <select id="filterProduct"><option value="">全部产品形态</option></select>
        <select id="filterStyle"><option value="">全部风格</option></select>
        <input id="filterKeyword" placeholder="搜索 query 文本">
      </div>
      <div class="empty" id="tableCount"></div>
    </div>
    <div class="card">
      <h3>Query 列表</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>一级场景</th>
            <th>二级场景标签</th>
            <th>application_type</th>
            <th>产品形态</th>
            <th>persona</th>
            <th>目标复杂度</th>
            <th>实际复杂度</th>
            <th>质量分</th>
            <th>Query</th>
          </tr>
        </thead>
        <tbody id="queryTableBody"></tbody>
      </table>
    </div>
  </div>
  <script>
    const DATA = ${payload};
    const tableBody = document.getElementById("queryTableBody");
    const chartGrid = document.getElementById("chartGrid");
    const filterL1 = document.getElementById("filterL1");
    const filterApp = document.getElementById("filterApp");
    const filterTargetComplexity = document.getElementById("filterTargetComplexity");
    const filterProduct = document.getElementById("filterProduct");
    const filterStyle = document.getElementById("filterStyle");
    const filterKeyword = document.getElementById("filterKeyword");
    const tableCount = document.getElementById("tableCount");

    function uniqueValues(items, key) {
      return [...new Set(items.map((item) => item[key] || "unspecified"))].sort();
    }
    function fillSelect(select, values) {
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value === "unspecified" ? "" : value;
        option.textContent = value === "unspecified" ? "未指定" : value;
        select.appendChild(option);
      });
    }
    function escapeHtmlClient(text) {
      return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
    function renderBarsClient(title, data) {
      const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
      const max = entries.length ? entries[0][1] : 1;
      const rows = entries.map(([label, value]) => {
        const width = Math.max(8, (value / max) * 100);
        return '<div class="bar-row"><div class="bar-label">' + escapeHtmlClient(label) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + width + '%"></div></div><div class="bar-value">' + value + '</div></div>';
      }).join("");
      return '<section class="card"><h3>' + escapeHtmlClient(title) + '</h3>' + (rows || '<div class="empty">暂无数据</div>') + '</section>';
    }
    function renderMetrics(summary) {
      document.getElementById("totalQueries").textContent = summary.total_queries;
      document.getElementById("averageQuality").textContent = summary.average_quality;
      document.getElementById("l1Count").textContent = Object.keys(summary.by_l1_scene).length;
      document.getElementById("applicationTypeCount").textContent = Object.keys(summary.by_application_type).length;
    }
    function renderCharts(summary) {
      const configs = [
        ["按一级场景分布", summary.by_l1_scene],
        ["按二级场景标签分布", summary.by_l2_scene_label],
        ["按 application_type 分布", summary.by_application_type],
        ["按产品形态分布", summary.by_product_type],
        ["按目标复杂度分布", summary.by_target_complexity],
        ["按实际复杂度分布", summary.by_actual_complexity],
        ["按 persona 来源分布", summary.by_persona_source],
        ["按设计风格分布", summary.by_design_style],
      ];
      chartGrid.innerHTML = configs.map(([title, data]) => renderBarsClient(title, data)).join("");
    }
    function currentFilters() {
      return {
        l1: filterL1.value,
        app: filterApp.value,
        targetComplexity: filterTargetComplexity.value,
        product: filterProduct.value,
        style: filterStyle.value,
        keyword: filterKeyword.value.trim().toLowerCase(),
      };
    }
    function applyFilters() {
      const filters = currentFilters();
      const filtered = DATA.queries.filter((query) => {
        if (filters.l1 && query.l1_scene !== filters.l1) return false;
        if (filters.app && query.application_type !== filters.app) return false;
        if (filters.targetComplexity && query.target_complexity !== filters.targetComplexity) return false;
        if (filters.product && query.product_type !== filters.product) return false;
        if (filters.style && (query.design_style || "") !== filters.style) return false;
        if (filters.keyword && !String(query.query_text || "").toLowerCase().includes(filters.keyword)) return false;
        return true;
      });
      tableBody.innerHTML = filtered.map((query) => {
        return '<tr>' +
          '<td>' + escapeHtmlClient(query.id) + '</td>' +
          '<td>' + escapeHtmlClient(query.l1_scene) + '</td>' +
          '<td>' + escapeHtmlClient(query.l2_scene_label) + '</td>' +
          '<td>' + escapeHtmlClient(query.application_type) + '</td>' +
          '<td>' + escapeHtmlClient(query.product_type) + '</td>' +
          '<td>' + escapeHtmlClient(query.persona_title || "") + '</td>' +
          '<td><span class="tag">' + escapeHtmlClient(query.target_complexity || "") + '</span></td>' +
          '<td><span class="tag">' + escapeHtmlClient(query.complexity_level || "") + '</span></td>' +
          '<td>' + escapeHtmlClient(query.quality_score ?? "") + '</td>' +
          '<td>' + escapeHtmlClient(query.query_text || "") + '</td>' +
        '</tr>';
      }).join("");
      tableCount.textContent = '当前显示 ' + filtered.length + ' / ' + DATA.queries.length + ' 条 Query';
    }
    fillSelect(filterL1, uniqueValues(DATA.queries, "l1_scene"));
    fillSelect(filterApp, uniqueValues(DATA.queries, "application_type"));
    fillSelect(filterTargetComplexity, uniqueValues(DATA.queries, "target_complexity"));
    fillSelect(filterProduct, uniqueValues(DATA.queries, "product_type"));
    fillSelect(filterStyle, uniqueValues(DATA.queries, "design_style"));
    [filterL1, filterApp, filterTargetComplexity, filterProduct, filterStyle].forEach((element) => element.addEventListener("change", applyFilters));
    filterKeyword.addEventListener("input", applyFilters);
    renderMetrics(DATA.summary);
    renderCharts(DATA.summary);
    applyFilters();
  </script>
</body>
</html>`;
}

async function buildDashboardAssets(dbPath, outputDir) {
  ensureDir(outputDir);
  const queries = await queryRows(
    dbPath,
    `SELECT id, scene_id, query_text, l1_scene, l2_scene_label, application_type, product_type, target_complexity, persona_id, persona_title, persona_source, design_style, quality_score, quality_pass, complexity_level, created_at
     FROM queries
     ORDER BY created_at DESC, id ASC`,
  );
  const summary = buildSummary(queries);
  const html = buildDashboardHtml({ queries, summary });
  const summaryPath = path.join(outputDir, "summary.json");
  const dashboardPath = path.join(outputDir, "dashboard.html");
  writeJson(summaryPath, summary);
  fs.writeFileSync(dashboardPath, html, "utf8");
  return { queries, summary, summaryPath, dashboardPath };
}

module.exports = {
  PRODUCT_TYPE_LABELS,
  DESIGN_STYLES,
  COMPLEXITY_LEVELS,
  parseArgs,
  autoDetectWorkbook,
  parseRawRequirements,
  normalizeScenarioRows,
  parseRequirementsFromWorkbook,
  buildSeedPlan,
  buildBackfillPlan,
  buildPersonaSynthesisPrompt,
  buildPersonaSpec,
  buildQueryPromptFromPersona,
  generateQueryRecords,
  supplementAnchoredPersonaQueries,
  scoreQueryRecords,
  importIntoDatabase,
  buildDashboardAssets,
  readJson,
  readJsonl,
  writeJson,
  writeJsonl,
  ensureDir,
  ensureDirForFile,
  queryRows,
  splitSceneText,
  inferApplicationTypeCandidates,
  inferProductTypes,
  inferStyles,
};
