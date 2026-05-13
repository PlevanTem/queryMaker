"""Generate the full interactive corpus HTML."""
import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/corpus_data.json', encoding='utf-8') as f:
    merged = json.load(f)

# L1 metadata
L1_META = [
  {"l1":"深度研究展示","color":"#6366f1","count":95,"ratio":0.19,
   "l2":["① 个人生活类","② 个人专业类","③ 办公/商务类","④ 文化/知识类"]},
  {"l1":"交互方式","color":"#f59e0b","count":80,"ratio":0.16,
   "l2":["① Adding & Creating","② Editing & Updating","③ Searching & Finding",
         "④ Selecting & Choosing","⑤ Filtering & Sorting","⑥ Deleting & Removing",
         "⑦ Editing Profile","⑧ Uploading & Downloading","⑨ Copying & Duplicating","⑩ Misc"]},
  {"l1":"实用工具","color":"#10b981","count":75,"ratio":0.15,
   "l2":["① 计算器/换算器","② 生活记录器","③ 社交辅助","④ 倒计时/纪念日",
         "⑤ 文本处理","⑥ 随机生成器","⑦ 无障碍辅助","⑧ 其他长尾微工具"]},
  {"l1":"教育学习","color":"#3b82f6","count":45,"ratio":0.09,
   "l2":["① 闪卡/单词记忆","② 备考自测/刷题","③ 学习打卡/进度追踪",
         "④ 课程目录/课堂界面","⑤ 知识速查/公式表"]},
  {"l1":"办公效率","color":"#8b5cf6","count":40,"ratio":0.08,
   "l2":["① 待办清单/任务管理","② 番茄钟/专注计时","③ 日程/倒计时",
         "④ 数据仪表盘/报表","⑤ 笔记/文档编辑"]},
  {"l1":"健康管理","color":"#ec4899","count":40,"ratio":0.08,
   "l2":["① 饮水/服药/习惯提醒","② 运动记录/健身计划","③ 体重/经期/睡眠追踪",
         "④ 健康数据看板","⑤ 冥想/呼吸练习"]},
  {"l1":"出行助手","color":"#14b8a6","count":35,"ratio":0.07,
   "l2":["① 行程规划器","② 打包清单/旅行准备","③ 地图/路线导航",
         "④ 天气/实时信息查询","⑤ 交通时刻/票价查询"]},
  {"l1":"美食探店","color":"#f97316","count":25,"ratio":0.05,
   "l2":["① 今天吃什么随机选择器","② 食物热量/升糖查询",
         "③ 菜谱生成/食材搭配","④ 餐厅列表/点评浏览"]},
  {"l1":"休闲游戏","color":"#a855f7","count":20,"ratio":0.04,
   "l2":["① 文字猜谜/知识竞赛","② 抽签/转盘/随机决策","③ 经典小游戏","④ 情绪减压/解压玩具"]},
  {"l1":"多媒体处理","color":"#ef4444","count":20,"ratio":0.04,
   "l2":["① 图片编辑/滤镜/裁剪","② 海报/简历/卡片模板","③ 音视频播放界面","④ 内容创作工具"]},
  {"l1":"新闻资讯","color":"#06b6d4","count":20,"ratio":0.04,
   "l2":["① 信息流/Feed浏览","② 文章详情/阅读模式","③ 订阅/频道管理","④ 搜索与筛选"]},
  {"l1":"购物消费","color":"#84cc16","count":5,"ratio":0.01,
   "l2":["① 商品详情/规格选择","② 购物车/结算","③ 订单/物流追踪"]},
]

# Build JS CORPUS array
corpus_js_parts = []
for meta in L1_META:
    children_parts = []
    for l2_key in meta["l2"]:
        if l2_key not in merged:
            continue
        d = merged[l2_key]
        topics_json = json.dumps(d["topics"], ensure_ascii=False)
        children_parts.append(
            f'    {{l2:{json.dumps(l2_key,ensure_ascii=False)},l2full:{json.dumps(d["l2full"],ensure_ascii=False)},topics:{topics_json}}}'
        )
    children_str = ',\n'.join(children_parts)
    corpus_js_parts.append(
        f'  {{l1:{json.dumps(meta["l1"],ensure_ascii=False)},color:"{meta["color"]}",count:{meta["count"]},ratio:{meta["ratio"]},\n'
        f'   children:[\n{children_str}\n  ]}}'
    )

corpus_js = 'const CORPUS = [\n' + ',\n'.join(corpus_js_parts) + '\n];'

total_topics = sum(len(merged[l2]["topics"]) for meta in L1_META for l2 in meta["l2"] if l2 in merged)

HTML = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Topic Corpus Plan — Full Interactive View</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root {{
  --bg:#0d1117; --surface:#161b22; --surface2:#21262d; --surface3:#2d333b;
  --border:#30363d; --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff;
  --radius:8px; --sidebar-w:270px;
}}
*{{box-sizing:border-box;margin:0;padding:0;}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC',sans-serif;
  background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden;}}

/* ── Header ── */
.hdr{{display:flex;align-items:center;gap:12px;padding:10px 18px;
  background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;}}
.hdr-title{{font-size:14px;font-weight:700;white-space:nowrap;}}
.hdr-badge{{font-size:11px;background:#1f6feb22;border:1px solid #1f6feb55;color:var(--accent);
  border-radius:20px;padding:2px 9px;white-space:nowrap;}}
.hdr-stats{{display:flex;gap:14px;flex-wrap:wrap;}}
.hdr-stat{{font-size:11px;color:var(--muted);white-space:nowrap;}}
.hdr-stat strong{{color:var(--text);}}
.search-wrap{{margin-left:auto;position:relative;flex-shrink:0;}}
.search-input{{background:var(--surface2);border:1px solid var(--border);color:var(--text);
  border-radius:6px;padding:6px 34px 6px 11px;font-size:12px;width:240px;outline:none;transition:border-color .15s;}}
.search-input:focus{{border-color:var(--accent);}}
.search-icon{{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px;pointer-events:none;}}
.search-clear{{position:absolute;right:9px;top:50%;transform:translateY(-50%);background:none;border:none;
  color:var(--muted);cursor:pointer;font-size:13px;padding:0;display:none;line-height:1;}}
.search-clear.show{{display:block;}}

/* ── Body layout ── */
.layout{{display:flex;flex:1;overflow:hidden;}}

/* ── Sidebar ── */
.sidebar{{width:var(--sidebar-w);border-right:1px solid var(--border);background:var(--surface);
  overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column;}}
.sidebar-hdr{{padding:10px 14px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;
  color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);flex-shrink:0;}}

.l1-group{{border-bottom:1px solid var(--border);}}
.l1-toggle{{display:flex;align-items:center;gap:7px;padding:9px 12px;cursor:pointer;user-select:none;
  transition:background .12s;}}
.l1-toggle:hover{{background:var(--surface2);}}
.l1-dot{{width:8px;height:8px;border-radius:50%;flex-shrink:0;}}
.l1-name{{font-size:12px;font-weight:600;flex:1;}}
.l1-cnt{{font-size:10px;color:var(--muted);background:var(--surface2);border-radius:10px;padding:1px 6px;}}
.l1-arrow{{font-size:9px;color:var(--muted);transition:transform .2s;flex-shrink:0;}}
.l1-group.open .l1-arrow{{transform:rotate(90deg);}}
.l1-dist{{height:2px;background:var(--border);margin:0 12px 2px;overflow:hidden;border-radius:1px;}}
.l1-dist-fill{{height:100%;border-radius:1px;transition:width .4s;}}
.l2-list{{display:none;padding-bottom:4px;}}
.l1-group.open .l2-list{{display:block;}}
.l2-item{{display:flex;align-items:center;justify-content:space-between;gap:5px;
  padding:5px 12px 5px 22px;font-size:11.5px;color:var(--muted);cursor:pointer;
  border-left:2px solid transparent;transition:all .12s;}}
.l2-item:hover{{color:var(--text);background:var(--surface2);}}
.l2-item.active{{color:var(--accent);border-left-color:var(--accent);background:#1f6feb11;}}
.l2-cnt-badge{{font-size:9px;background:var(--surface2);border-radius:8px;padding:0 5px;
  color:var(--muted);white-space:nowrap;flex-shrink:0;}}
.sidebar-footer{{margin-top:auto;border-top:1px solid var(--border);flex-shrink:0;}}
.analytics-btn{{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 14px;
  cursor:pointer;font-size:12px;color:var(--muted);transition:all .12s;}}
.analytics-btn:hover{{color:var(--accent);background:var(--surface2);}}
.analytics-btn.active{{color:var(--accent);background:#1f6feb11;border-top:1px solid #1f6feb44;}}

/* ── Main ── */
.main{{flex:1;overflow-y:auto;display:flex;flex-direction:column;min-width:0;}}

/* ── Corpus browse ── */
.browse-panel{{padding:18px 22px;flex:1;}}
.browse-hdr{{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}}
.browse-l1-chip{{font-size:11px;font-weight:600;border-radius:6px;padding:3px 9px;
  white-space:nowrap;flex-shrink:0;}}
.browse-l2-title{{font-size:14px;font-weight:600;flex:1;min-width:180px;}}
.browse-meta{{font-size:11px;color:var(--muted);white-space:nowrap;}}
.corpus-prompt{{background:#0a0d13;border:1px solid var(--border);border-radius:6px;
  padding:9px 13px;margin-bottom:12px;font-size:11px;color:var(--muted);
  font-family:'SFMono-Regular',Consolas,monospace;line-height:1.6;}}
.corpus-prompt .hi{{color:#79c0ff;}} .corpus-prompt .hl{{color:#ffa657;}}

/* ── Filters ── */
.filter-row{{display:flex;align-items:center;gap:7px;margin-bottom:12px;flex-wrap:wrap;}}
.filter-label{{font-size:11px;color:var(--muted);white-space:nowrap;flex-shrink:0;}}
.filter-chip{{font-size:11px;background:var(--surface2);border:1px solid var(--border);
  border-radius:20px;padding:3px 10px;cursor:pointer;color:var(--muted);transition:all .12s;white-space:nowrap;}}
.filter-chip:hover{{border-color:var(--accent);color:var(--accent);}}
.filter-chip.active{{border-color:var(--accent);color:var(--accent);background:#1f6feb15;}}
.result-count{{font-size:11px;color:var(--muted);margin-left:auto;white-space:nowrap;}}

/* ── Topic chips ── */
.topics-grid{{display:flex;flex-wrap:wrap;gap:6px;}}
.topic-chip{{font-size:12px;background:var(--surface2);border:1px solid var(--border);
  border-radius:20px;padding:4px 12px;color:var(--text);cursor:default;transition:all .12s;}}
.topic-chip:hover{{background:#1f6feb18;border-color:#1f6feb55;color:var(--accent);}}
.topic-chip.hl{{border-color:#f59e0b88;color:#fbbf24;background:#f59e0b10;}}
.topic-chip.dim{{opacity:.3;}}
.no-result{{color:var(--muted);font-size:13px;padding:16px 0;font-style:italic;}}
.empty-state{{display:flex;flex-direction:column;align-items:center;justify-content:center;
  flex:1;color:var(--muted);text-align:center;padding:60px 20px;gap:8px;}}
.empty-state .icon{{font-size:36px;margin-bottom:4px;}}
.empty-state h3{{font-size:15px;color:var(--text);}}
.empty-state p{{font-size:13px;}}

/* ── Analytics ── */
.analytics-panel{{padding:20px 22px;}}
.analytics-hdr{{margin-bottom:20px;}}
.analytics-hdr h2{{font-size:15px;font-weight:700;margin-bottom:4px;}}
.analytics-hdr p{{font-size:12px;color:var(--muted);}}
.charts-grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px;}}
@media(max-width:900px){{.charts-grid{{grid-template-columns:1fr;}}}}
.chart-card{{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;}}
.chart-card.full{{grid-column:1/-1;}}
.chart-title{{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;
  letter-spacing:.5px;margin-bottom:12px;}}
.heat-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;}}
.heat-item{{background:var(--surface2);border:1px solid var(--border);border-radius:6px;
  padding:7px 10px;display:flex;align-items:center;gap:8px;cursor:pointer;transition:border-color .12s;}}
.heat-item:hover{{border-color:var(--accent);}}
.heat-dot{{width:6px;height:6px;border-radius:50%;flex-shrink:0;}}
.heat-l1{{font-size:9px;color:var(--muted);flex-shrink:0;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}}
.heat-l2{{font-size:11px;flex:1;line-height:1.3;min-width:0;}}
.heat-bar-wrap{{width:36px;flex-shrink:0;}}
.heat-bar{{height:4px;background:var(--border);border-radius:2px;overflow:hidden;}}
.heat-bar-fill{{height:100%;border-radius:2px;}}
.heat-cnt{{font-size:10px;color:var(--muted);white-space:nowrap;text-align:right;}}
.prog-bar-wrap{{margin-bottom:14px;}}
.prog-label{{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:5px;}}
.prog-track{{height:8px;background:var(--border);border-radius:4px;overflow:hidden;}}
.prog-fill{{height:100%;border-radius:4px;transition:width .4s;}}
.wf-grid{{display:flex;flex-direction:column;gap:4px;max-height:320px;overflow-y:auto;}}
.wf-row{{display:flex;align-items:center;gap:8px;}}
.wf-word{{font-size:11px;width:100px;flex-shrink:0;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}}
.wf-bar-wrap{{flex:1;}}
.wf-bar{{height:16px;background:var(--border);border-radius:3px;overflow:hidden;}}
.wf-fill{{height:100%;border-radius:3px;}}
.wf-cnt{{font-size:10px;color:var(--muted);width:26px;flex-shrink:0;text-align:right;}}
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-title">Topic Corpus Plan</div>
  <div class="hdr-badge">Full · 61 L2 · {total_topics:,} topics</div>
  <div class="hdr-stats">
    <div class="hdr-stat"><strong>12</strong> L1 场景</div>
    <div class="hdr-stat"><strong>61</strong> L2 子场景</div>
    <div class="hdr-stat"><strong>{total_topics:,}</strong> topics ({total_topics//61}/L2)</div>
    <div class="hdr-stat">→ <strong>18,300</strong> full (300/L2)</div>
  </div>
  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input class="search-input" id="searchInput" type="text" placeholder="搜索 topic corpus…" style="padding-left:26px">
    <button class="search-clear" id="searchClear">✕</button>
  </div>
</div>

<div class="layout">
  <div class="sidebar">
    <div class="sidebar-hdr">L1 · L2 场景导航</div>
    <div id="sidebarNav"></div>
    <div class="sidebar-footer">
      <div class="analytics-btn" id="analyticsBtn" onclick="showAnalytics()">
        <span>📊</span><span>数据分析视图</span>
      </div>
    </div>
  </div>
  <div class="main" id="mainPanel">
    <div class="empty-state">
      <div class="icon">🗂</div>
      <h3>选择左侧 L2 场景</h3>
      <p>点击任意子场景浏览 topic corpus，支持搜索与筛选</p>
      <p style="margin-top:8px;font-size:11px;opacity:.6">或点击底部「数据分析视图」查看全局统计</p>
    </div>
  </div>
</div>

<script>
{corpus_js}

// ── Flat topic list ──────────────────────────────────────────
const allTopics = [];
CORPUS.forEach(l1 => l1.children.forEach(l2 => l2.topics.forEach(t =>
  allTopics.push({{text:t, l1:l1.l1, l2:l2.l2, l2full:l2.l2full, color:l1.color}})
)));

// ── State ────────────────────────────────────────────────────
const state = {{activeL1:null, activeL2:null, searchQ:'', filterKw:'all', view:'browse'}};

// ── Stop words ───────────────────────────────────────────────
const STOP = new Set(['with','and','for','the','a','an','of','in','on','at','to','by','from',
  'as','or','via','per','its','is','are','be','has','have','this','that','each','all','no','not',
  'can','new','after','before','into','over','through','up','out','get','go','add','set','use',
  'make','take','view','app','mode','tool','screen','page','panel','card','flow','list',
  'form','data','log','type','level','time','date','step']);

function wordFreq(topics) {{
  const freq = {{}};
  topics.forEach(t => t.split(/[\\s\\-\\/&,.()+]+/).forEach(w => {{
    const lw = w.toLowerCase().replace(/[^a-z]/g,'');
    if (lw.length > 3 && !STOP.has(lw)) freq[lw] = (freq[lw]||0) + 1;
  }}));
  return freq;
}}

// ── Build sidebar ─────────────────────────────────────────────
function buildSidebar() {{
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';
  CORPUS.forEach(l1 => {{
    const isOpen = l1.l1 === state.activeL1 || (state.view === 'browse' && !state.activeL1 && CORPUS.indexOf(l1) === 0);
    const grp = document.createElement('div');
    grp.className = 'l1-group' + (isOpen ? ' open' : '');
    grp.innerHTML = `
      <div class="l1-toggle" onclick="toggleL1(this.parentElement,'${{l1.l1}}')">
        <div class="l1-dot" style="background:${{l1.color}}"></div>
        <div class="l1-name">${{l1.l1}}</div>
        <div class="l1-cnt">${{l1.count}}</div>
        <div class="l1-arrow">▶</div>
      </div>
      <div class="l1-dist">
        <div class="l1-dist-fill" style="background:${{l1.color}};width:${{l1.ratio*100}}%"></div>
      </div>
      <div class="l2-list">
        ${{l1.children.map(l2 => `
          <div class="l2-item ${{state.activeL2===l2.l2?'active':''}}"
               onclick="selectL2('${{l1.l1}}','${{l2.l2.replace(/'/g,"\\\\'")}}',${{CORPUS.indexOf(l1)}})">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${{l2.l2}}</span>
            <span class="l2-cnt-badge">${{l2.topics.length}}</span>
          </div>`).join('')}}
      </div>`;
    nav.appendChild(grp);
  }});
}}

function toggleL1(grp, l1name) {{
  const wasOpen = grp.classList.contains('open');
  grp.classList.toggle('open');
}}

// ── Select L2 ─────────────────────────────────────────────────
function selectL2(l1name, l2name, l1idx) {{
  state.activeL1 = l1name; state.activeL2 = l2name;
  state.view = 'browse'; state.filterKw = 'all';
  document.getElementById('analyticsBtn').classList.remove('active');
  buildSidebar();
  // Ensure the group is open
  const groups = document.querySelectorAll('.l1-group');
  if (groups[l1idx]) groups[l1idx].classList.add('open');
  renderBrowse();
}}

// ── Render corpus browse ──────────────────────────────────────
function renderBrowse() {{
  const l1data = CORPUS.find(x => x.l1 === state.activeL1);
  const l2data = l1data?.children.find(x => x.l2 === state.activeL2);
  if (!l2data) return;
  const q = state.searchQ.toLowerCase();
  const kw = state.filterKw;
  const freq = wordFreq(l2data.topics);
  const topKws = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([k])=>k);
  let topics = l2data.topics;
  if (kw !== 'all') topics = topics.filter(t => t.toLowerCase().includes(kw));
  const displayTopics = q ? topics : topics;
  const filterChips = ['all',...topKws].map(w =>
    `<span class="filter-chip ${{kw===w?'active':''}}" onclick="setFilter('${{w}}')">${{w==='all'?'全部':w}}</span>`
  ).join('');
  const visCount = q ? topics.filter(t=>t.toLowerCase().includes(q)).length : topics.length;
  document.getElementById('mainPanel').innerHTML = `
    <div class="browse-panel">
      <div class="browse-hdr">
        <div class="browse-l1-chip" style="background:${{l1data.color}}22;border:1px solid ${{l1data.color}}55;color:${{l1data.color}}">${{l1data.l1}}</div>
        <div class="browse-l2-title">${{l2data.l2full}}</div>
        <div class="browse-meta">${{l2data.topics.length}} topics · 目标 300</div>
      </div>
      <div class="corpus-prompt"><span class="hi">Generate 300 topic corpus</span> for mini program / mobile app of the scene:
<span class="hl">${{l1data.l1}}</span> × <span class="hl">${{l2data.l2}}</span>. Each topic should reflect a unique task purpose,
functionality, or use case, covering diverse domains (healthcare, education, finance, entertainment,
e-commerce, tourism, tech, art, sports, social impact…) via creative imagination.</div>
      <div class="filter-row">
        <span class="filter-label">关键词筛选：</span>
        ${{filterChips}}
        <span class="result-count" id="resultCount">${{visCount}} 条显示</span>
      </div>
      <div class="topics-grid" id="topicsGrid">
        ${{renderTopicChips(topics, q)}}
      </div>
    </div>`;
}}

function renderTopicChips(topics, q) {{
  if (!topics.length) return '<div class="no-result">没有匹配的 topic</div>';
  return topics.map(t => {{
    const isHl = q && t.toLowerCase().includes(q);
    const isDim = q && !isHl;
    return `<div class="topic-chip ${{isHl?'hl':''}} ${{isDim?'dim':''}}">${{t}}</div>`;
  }}).join('');
}}

function setFilter(kw) {{
  state.filterKw = kw;
  renderBrowse();
}}

// ── Search ────────────────────────────────────────────────────
function renderSearch() {{
  const q = state.searchQ.toLowerCase();
  if (!q) {{ if (state.activeL2) renderBrowse(); return; }}
  const matched = allTopics.filter(t => t.text.toLowerCase().includes(q));
  // Group by L1
  const byL1 = {{}};
  matched.forEach(t => {{ if (!byL1[t.l1]) byL1[t.l1]=[]; byL1[t.l1].push(t); }});
  document.getElementById('mainPanel').innerHTML = `
    <div class="browse-panel">
      <div class="browse-hdr">
        <div class="browse-l2-title">🔍 搜索：<strong style="color:var(--accent)">${{state.searchQ}}</strong></div>
        <div class="browse-meta">${{matched.length}} 条匹配 / ${{allTopics.length}} 总计</div>
      </div>
      ${{Object.entries(byL1).map(([l1name, items]) => {{
        const l1d = CORPUS.find(x=>x.l1===l1name);
        return `<div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:600;color:${{l1d?.color||'#888'}};margin-bottom:8px;
               display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${{l1d?.color||'#888'}};display:inline-block"></span>
            ${{l1name}} <span style="color:var(--muted);font-weight:400">(${{items.length}})</span></div>
          <div class="topics-grid">
            ${{items.map(t=>`<div class="topic-chip hl" title="${{t.l2full}}">${{t.text}}
              <span style="font-size:10px;color:#8b949e;margin-left:3px">${{t.l2}}</span></div>`).join('')}}
          </div></div>`;
      }}).join('')}}
    </div>`;
}}

// ── Analytics ─────────────────────────────────────────────────
let charts = {{}};
function showAnalytics() {{
  state.view = 'analytics'; state.activeL2 = null;
  document.getElementById('analyticsBtn').classList.add('active');
  buildSidebar();
  const freq = wordFreq(allTopics.map(t=>t.text));
  const top40 = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,40);
  const maxFreq = top40[0]?.[1] || 1;
  document.getElementById('mainPanel').innerHTML = `
    <div class="analytics-panel">
      <div class="analytics-hdr">
        <h2>数据分析视图</h2>
        <p>{total_topics:,} topics · 61 L2 · 12 L1 — corpus 分布、词频与覆盖度分析</p>
      </div>
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-title">L1 场景样本分布（500 samples）</div>
          <div style="position:relative;height:220px"><canvas id="cL1Dist"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">L2 子场景数 / L1</div>
          <div style="position:relative;height:220px"><canvas id="cL2Cnt"></canvas></div>
        </div>
        <div class="chart-card full">
          <div class="chart-title">Top 40 词频分布（全量 {total_topics:,} topics）</div>
          <div class="wf-grid" id="wfGrid"></div>
        </div>
        <div class="chart-card full">
          <div class="chart-title">Corpus 覆盖进度（当前 {total_topics//61}/L2 · 目标 300/L2）</div>
          <div id="progBars"></div>
        </div>
        <div class="chart-card full">
          <div class="chart-title">L1 · L2 Corpus 分布热力表（点击跳转）</div>
          <div class="heat-grid" id="heatGrid"></div>
        </div>
      </div>
    </div>`;
  renderAnalytics(top40, maxFreq);
}}

function renderAnalytics(top40, maxFreq) {{
  Object.values(charts).forEach(c=>c&&c.destroy()); charts={{}};
  const l1Labels = CORPUS.map(x=>x.l1);
  const l1Colors = CORPUS.map(x=>x.color);
  charts.l1 = new Chart(document.getElementById('cL1Dist'), {{
    type:'doughnut',
    data:{{labels:l1Labels,datasets:[{{data:CORPUS.map(x=>x.count),backgroundColor:l1Colors,borderWidth:1,borderColor:'#0d1117'}}]}},
    options:{{responsive:true,maintainAspectRatio:false,plugins:{{
      legend:{{position:'right',labels:{{color:'#8b949e',font:{{size:10}},boxWidth:10,padding:6}}}},
      tooltip:{{callbacks:{{label:ctx=>` ${{ctx.label}}: ${{ctx.raw}} (${{(ctx.raw/500*100).toFixed(0)}}%)`}}}}
    }}}}
  }});
  charts.l2 = new Chart(document.getElementById('cL2Cnt'), {{
    type:'bar',
    data:{{labels:l1Labels,datasets:[{{label:'L2数',data:CORPUS.map(x=>x.children.length),backgroundColor:l1Colors,borderRadius:4}}]}},
    options:{{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{{legend:{{display:false}}}},
      scales:{{x:{{ticks:{{color:'#8b949e'}},grid:{{color:'#21262d'}}}},
               y:{{ticks:{{color:'#8b949e',font:{{size:10}}}},grid:{{color:'#21262d'}}}}}}
    }}
  }});
  // Word freq bars
  const wfGrid = document.getElementById('wfGrid');
  wfGrid.innerHTML = top40.map(([w,cnt]) => `
    <div class="wf-row">
      <div class="wf-word" title="${{w}}">${{w}}</div>
      <div class="wf-bar-wrap"><div class="wf-bar">
        <div class="wf-fill" style="width:${{(cnt/maxFreq*100).toFixed(1)}}%;background:#58a6ff88"></div>
      </div></div>
      <div class="wf-cnt">${{cnt}}</div>
    </div>`).join('');
  // Progress bars
  const progEl = document.getElementById('progBars');
  progEl.innerHTML = CORPUS.map(l1 => `
    <div class="prog-bar-wrap">
      <div class="prog-label">
        <span style="color:${{l1.color}}">${{l1.l1}}</span>
        <span>${{l1.children.length * 40}} / ${{l1.children.length * 300}} topics (${{l1.children.length}} L2 × 40/${{l1.children.length}} L2 × 300)</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${{(40/300*100).toFixed(1)}}%;background:${{l1.color}}88"></div></div>
    </div>`).join('');
  // Heat grid
  const heatEl = document.getElementById('heatGrid');
  heatEl.innerHTML = '';
  CORPUS.forEach((l1,li) => l1.children.forEach(l2 => {{
    const pct = (l2.topics.length/300*100).toFixed(0);
    const item = document.createElement('div');
    item.className='heat-item';
    item.innerHTML=`
      <div class="heat-dot" style="background:${{l1.color}}"></div>
      <div style="flex:1;min-width:0">
        <div class="heat-l1">${{l1.l1}}</div>
        <div class="heat-l2" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${{l2.l2full}}</div>
      </div>
      <div>
        <div class="heat-bar-wrap"><div class="heat-bar">
          <div class="heat-bar-fill" style="width:${{pct}}%;background:${{l1.color}}99"></div>
        </div></div>
        <div class="heat-cnt">${{l2.topics.length}}/300</div>
      </div>`;
    item.addEventListener('click',()=>selectL2(l1.l1,l2.l2,li));
    heatEl.appendChild(item);
  }}));
}}

// ── Search events ─────────────────────────────────────────────
const si = document.getElementById('searchInput');
const sc = document.getElementById('searchClear');
si.addEventListener('input', e => {{
  state.searchQ = e.target.value;
  sc.className = 'search-clear' + (state.searchQ?' show':'');
  if (state.searchQ) renderSearch();
  else if (state.activeL2) renderBrowse();
  else document.getElementById('mainPanel').innerHTML =
    `<div class="empty-state"><div class="icon">🗂</div><h3>选择左侧 L2 场景</h3><p>点击任意子场景浏览 topic corpus</p></div>`;
}});
sc.addEventListener('click', () => {{
  state.searchQ=''; si.value=''; sc.className='search-clear';
  if (state.activeL2) renderBrowse();
  else document.getElementById('mainPanel').innerHTML =
    `<div class="empty-state"><div class="icon">🗂</div><h3>选择左侧 L2 场景</h3><p>点击任意子场景浏览 topic corpus</p></div>`;
}});

// ── Init ──────────────────────────────────────────────────────
buildSidebar();
// Auto-open first L1
document.querySelector('.l1-group')?.classList.add('open');
</script>
</body>
</html>'''

out_path = 'data/output/corpus_plan_v2.html'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(HTML)

size = len(HTML.encode('utf-8'))
print(f"Written: {out_path}")
print(f"File size: {size/1024:.1f} KB")
print(f"Total topics in JS: {total_topics}")
