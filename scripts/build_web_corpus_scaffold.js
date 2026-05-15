/**
 * build_web_corpus_scaffold.js
 *
 * 把「全网网站类型全景矩阵.md」编码成本仓库的 web 场景层数据结构：
 *   1. scripts/web_scene_spec.json     — 74 个 (user×use) cell 的 scenario spec
 *   2. scripts/corpus_data_web.json    — 74 个 L2 key 的 corpus scaffold（seed topics only）
 *   3. scripts/corpus_persona_map_web.json — 74 cell → persona id 映射
 *
 * 接下来由 expand_web_corpus_topics.js（独立脚本，LLM 调用）把每个 L2 的
 * seed topics 扩充到 ~30+。
 *
 * Usage: node scripts/build_web_corpus_scaffold.js
 */

const fs   = require("fs");
const path = require("path");

// ── 矩阵原始数据（直接从 md 表格转录，10 行 × 8 列） ────────────────────────
const USE_TYPES = [
  { key: "①",  zh: "展示型",  en: "showcase",  label_en: "Showcase"  },
  { key: "②",  zh: "内容型",  en: "publishing", label_en: "Publishing" },
  { key: "③",  zh: "营销型",  en: "marketing", label_en: "Marketing" },
  { key: "④",  zh: "商务型",  en: "commerce",  label_en: "Commerce"  },
  { key: "⑤",  zh: "预约型",  en: "booking",   label_en: "Booking"   },
  { key: "⑥",  zh: "学习型",  en: "learning",  label_en: "Learning"  },
  { key: "⑦",  zh: "社区型",  en: "community", label_en: "Community" },
  { key: "⑧",  zh: "工具型",  en: "utility",   label_en: "Utility"   },
];

const USER_TYPES = [
  "个人用户",
  "创作者",
  "自由职业 / 专业人士",
  "小微商户 / 本地服务业",
  "中大型企业 / 品牌",
  "初创公司 / SaaS 团队",
  "教育 / 培训机构",
  "媒体 / 出版机构",
  "文化 / 公益 / 政务组织",
  "开发者 / 技术团队",
];

// 矩阵：rows = user type, cols = use type; cell = seed topics array, [] = empty (—)
const MATRIX = [
  // 1. 个人用户
  [
    ["个人主页", "交互式简历", "年度回顾/纪念日站"],
    ["个人博客", "日记/生活记录", "家庭纪念册"],
    [], [], [],
    ["学习打卡站", "目标追踪站"],
    [],
    ["个人记账/追踪器 Web 版", "家庭工具站"],
  ],
  // 2. 创作者
  [
    ["作品集 Portfolio", "画廊/虚拟展厅", "艺术家主页", "摄影师作品站"],
    ["创作博客", "Newsletter 站", "创作日志", "灵感笔记本"],
    ["粉丝订阅落地页", "新作发布页", "众筹预售页"],
    ["印刷品/数字商品店", "付费作品", "周边商店"],
    ["约拍/约稿系统", "1v1 辅导预约"],
    ["创作教程站", "付费在线课程", "技法分享"],
    ["粉丝社群", "作品评论区", "会员专属站"],
    ["创作辅助工具", "素材管理站"],
  ],
  // 3. 自由职业 / 专业人士
  [
    ["专业主页", "案例集", "资质展示"],
    ["专业博客", "白皮书/洞察", "行业报告"],
    ["服务介绍落地页", "个人品牌站"],
    [],
    ["咨询预约系统", "会诊/问诊系统", "法律咨询预约"],
    ["Workshop/培训", "付费资源下载", "专业课程"],
    ["客户社群"],
    ["专业计算器", "自助评估工具"],
  ],
  // 4. 小微商户 / 本地服务业
  [
    ["门店官网", "品牌形象站", "环境/菜单展示", "婚礼主题站"],
    ["公告/新品上新", "门店故事", "品牌日志"],
    ["优惠活动页", "团购/拼团页", "节日 campaign", "开业引流页"],
    ["在线菜单", "小型电商", "外卖下单", "会员储值"],
    ["订座/预约服务", "上门服务预约", "试妆/咨询预约"],
    ["使用教程", "产品知识普及"],
    ["会员/粉丝圈", "大众点评入口"],
    ["选房/选座工具", "门店定位查询"],
  ],
  // 5. 中大型企业 / 品牌
  [
    ["企业官网", "品牌故事", "年报/ESG 报告", "文化展示站"],
    ["新闻中心", "企业博客", "投资者关系", "行业洞察"],
    ["产品发布页", "campaign 站", "周年庆专题", "渠道招募"],
    ["官方旗舰店", "B2B/B2C 电商", "经销商系统"],
    ["销售线索表单", "合作洽谈", "渠道申请"],
    ["企业大学", "员工培训门户", "产品手册"],
    ["客户社区", "用户案例站", "品牌粉丝圈"],
    ["客户自助服务", "产品配置器", "售后工单系统"],
  ],
  // 6. 初创公司 / SaaS 团队
  [
    ["融资/团队介绍", "品牌站", "关于页/Manifesto"],
    ["技术博客", "更新日志 Changelog", "成长故事"],
    ["SaaS 产品落地页", "Pricing 页", "功能对比页", "开发者宣传页"],
    ["订阅购买", "增值服务购买"],
    ["Demo 预约", "Sales 洽谈", "Waitlist 登记"],
    ["产品文档", "教程/学院", "最佳实践库"],
    ["用户论坛", "Discord/Slack 入口", "Feature Request"],
    ["SaaS 应用本体", "Dashboard", "数据分析台"],
  ],
  // 7. 教育 / 培训机构
  [
    ["学校/机构官网", "校园风采", "教师团队页"],
    ["校园新闻", "学术发表", "研究成果", "教育资讯"],
    ["招生页", "课程宣传", "公开课推广", "招生会报名"],
    ["课程购买", "教材/周边店", "证书购买"],
    ["开放日预约", "试听/咨询", "入学面试预约"],
    ["在线课程平台", "学习管理系统 LMS", "题库/模拟测试"],
    ["校友网络", "学生社区", "家长沟通群"],
    ["学生门户", "选课/排课系统", "考试/作业平台"],
  ],
  // 8. 媒体 / 出版机构
  [
    ["作者/编辑主页", "获奖档案", "品牌百年史"],
    ["新闻门户", "在线杂志", "特稿专栏", "播客节目站", "电子期刊"],
    ["订阅墙", "会员页", "活动宣传页"],
    ["付费订阅", "书籍/文创购买", "打赏系统"],
    ["采访预约"],
    ["知识专题站", "深度报道合集"],
    ["读者评论区", "UGC 投稿", "读者俱乐部"],
    ["RSS 聚合", "新闻搜索"],
  ],
  // 9. 文化 / 公益 / 政务组织
  [
    ["博物馆官网", "展览/艺术节", "建筑/古迹站", "宗教场所站"],
    ["历史档案", "研究发布", "倡议宣言", "公告通知"],
    ["筹款活动页", "倡议 campaign", "志愿者招募", "募捐专题"],
    ["纪念品商店", "门票销售", "捐赠通道", "会员续费"],
    ["参观预约", "活动报名", "导览预约"],
    ["科普教育资源", "数字档案馆", "开放课程"],
    ["志愿者社区", "议题讨论区", "信徒/会员圈"],
    ["公共服务门户", "办事大厅", "虚拟展览"],
  ],
  // 10. 开发者 / 技术团队
  [
    ["GitHub Profile", "开源项目主页", "技术 Portfolio", "个人技术品牌"],
    ["技术博客", "RFC/设计文档", "Changelog", "技术周刊"],
    ["开源项目 Landing", "Hackathon 站", "Dev Conference"],
    ["Donation/Sponsor", "Pro 版订阅"],
    [],
    ["技术文档/Wiki", "API 参考", "教程站", "交互式教材"],
    ["论坛/BBS", "Q&A 站", "Discord 入口", "开源社区"],
    ["实验性/交互站", "工具站/计算器", "资源聚合站", "Directory 站"],
  ],
];

// ── Persona mapping rules (semantic best-fit per cell) ────────────────────
// Use-type defaults first; user-type overrides where applicable.
const USE_TYPE_DEFAULT_PERSONA = {
  "showcase":   "curator",
  "publishing": "curator",
  "marketing":  "founder_like",
  "commerce":   "operator",
  "booking":    "operator",
  "learning":   "planner",
  "community":  "maker",
  "utility":    "operator",
};

// Per user_type overrides (key = user_type index 0-9, value = override map)
const USER_TYPE_OVERRIDES = {
  0: { showcase: "curator", publishing: "curator", learning: "planner", utility: "operator" }, // 个人
  1: { showcase: "curator", marketing: "founder_like", community: "maker", utility: "maker" },  // 创作者
  2: { showcase: "founder_like", publishing: "founder_like", marketing: "founder_like" },       // 自由职业 — identity matters
  3: { showcase: "operator", marketing: "operator", utility: "operator" },                       // 小微商户 — practical owner
  4: { showcase: "founder_like", publishing: "founder_like", marketing: "founder_like" },       // 中大型企业 — brand identity
  5: {                                                                                            // 初创公司
    showcase: "founder_like", publishing: "founder_like",
    marketing: "founder_like", community: "maker", utility: "operator",
  },
  6: { showcase: "planner", publishing: "planner", marketing: "planner", learning: "planner" }, // 教育 — structured
  7: { showcase: "curator", publishing: "curator", marketing: "curator" },                       // 媒体 — editorial
  8: { showcase: "curator", publishing: "curator", marketing: "founder_like" },                 // 文化/公益 — taste + cause
  9: { showcase: "maker", publishing: "maker", marketing: "maker", community: "maker", utility: "maker" }, // 开发者 — tinkerer
};

function pickPersonaForCell(userIdx, useTypeEn) {
  const overrides = USER_TYPE_OVERRIDES[userIdx] || {};
  return overrides[useTypeEn] || USE_TYPE_DEFAULT_PERSONA[useTypeEn] || "maker";
}

// ── Build outputs ────────────────────────────────────────────────────────
function main() {
  const root = process.cwd();
  const sceneSpec = {
    generated_at: new Date().toISOString(),
    version: "v2",
    source_file: "全网网站类型全景矩阵.md",
    source_sheet: "main_matrix",
    platform: "web",
    total_scenarios: 0,
    scenarios: [],
  };
  const corpusData   = {};
  const personaMap   = { version: 1, default: "maker", scheme: "web (user_type × use_type) → persona", map: {} };

  let cellIdx = 0;
  const usePerL1 = {};

  USER_TYPES.forEach((userType, ui) => {
    const userKey = userType.split(" / ")[0]; // shorter L1 label for grouping
    USE_TYPES.forEach((useType, ti) => {
      const seedTopics = MATRIX[ui][ti] || [];
      if (seedTopics.length === 0) return; // skip empty cells

      cellIdx += 1;
      const id = `web_${String(cellIdx).padStart(3, "0")}`;
      const l2Label = `${userKey} · ${useType.zh}`;
      const l2Raw   = `${userType} × ${useType.key} ${useType.zh}`;

      usePerL1[userKey] = (usePerL1[userKey] || 0) + 1;

      sceneSpec.scenarios.push({
        id,
        source_file: "全网网站类型全景矩阵.md",
        source_sheet: "main_matrix",
        source_row_id: ui * 8 + ti + 1,
        l1_scene: userKey,
        l2_scene_raw: l2Raw,
        l2_scene_label: l2Label,
        l2_scene_examples: seedTopics.slice(),
        application_type_candidates: seedTopics.map((t) => `${t}应用`),
        target_count: 7, // will be re-allocated by buildCorpusPlan flatPerL2 mode
        notes: "",
      });

      corpusData[l2Label] = {
        l2full: l2Raw,
        seed_count: seedTopics.length,
        topics: seedTopics.slice(), // start with seeds; will be expanded by LLM script
      };

      personaMap.map[l2Label] = pickPersonaForCell(ui, useType.en);
    });
  });

  sceneSpec.total_scenarios = sceneSpec.scenarios.length;

  fs.writeFileSync(
    path.join(root, "scripts/web_scene_spec.json"),
    JSON.stringify(sceneSpec, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "scripts/corpus_data_web.json"),
    JSON.stringify(corpusData, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "scripts/corpus_persona_map_web.json"),
    JSON.stringify(personaMap, null, 2) + "\n",
    "utf8",
  );

  console.log("✅ Web scaffold built");
  console.log("  Non-empty cells:", cellIdx);
  console.log("  Total seed topics:", Object.values(corpusData).reduce((s, c) => s + c.topics.length, 0));
  console.log("\nCells per user_type (L1):");
  Object.entries(usePerL1).forEach(([k, n]) => console.log(`  ${String(n).padStart(2)}  ${k}`));
  console.log("\nPersona distribution:");
  const personaCount = {};
  Object.values(personaMap.map).forEach((p) => (personaCount[p] = (personaCount[p] || 0) + 1));
  Object.entries(personaCount).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`  ${String(n).padStart(2)}  ${p}`));
  console.log("\nFiles:");
  console.log("  scripts/web_scene_spec.json");
  console.log("  scripts/corpus_data_web.json");
  console.log("  scripts/corpus_persona_map_web.json");
  console.log("\nNext step: after mobile 500 finishes, run expand_web_corpus_topics.js to grow seed topics to ~30 each via LLM, then `run-corpus.js --platform web ...`");
}

main();
