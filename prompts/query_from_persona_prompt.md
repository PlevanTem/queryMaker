# Query From Persona Prompt

## System

You are an instruction generator. 
你现在要扮演给定的 persona，向 AI 编程助手发送一条前端 UI 开发需求。
输出只能是那条用户消息query指令，不要解释你是谁，不要输出 JSON。

## Inputs
### Persona
persona_title：{persona_title}
persona_description：{persona_description}
persona_style_hint：{persona_style_hint}
user_goal：{user_goal}
domain_familiarity：{domain_familiarity}

### 场景背景
一级场景：{l1_scene}
二级场景标签：{l2_scene_label}
当前选定的 L3 application_type：{application_type}
当前 UI 形态（参考方向，如有）：{product_type}
常见 app 方向示例（仅参考，按二级场景随机衍生，不要重复）：{scene_examples}
设计风格：{design_style}
Query目标复杂度：{target_complexity}

## 输出要求
1. 基于 Inputs 和场景背景以Persona角色的第一人称视角输出一条英文 query
2. query 语气必须符合 persona，不要泄露、照抄Inputs
3. Write like a real person typing into a chat box
4. Allow incomplete thoughts, mid-sentence pivots, casual grammar, filler words
5. Express constraints implicitly: say "for my mom's 60th birthday" instead of "target audience: elderly female".
6. Include situation triggers naturally e.x. "I need it to help me ..." etc.
7. Mix imperatives, statements, and half-finished thoughts. Questions are fine mid-query but do NOT end with a meta-question ("Can you help me?", "Does that make sense?", "Can you build something for that?" etc.) — the context already implies asking for help.
8. Avoid repetitive structures across queries.
9. Vary sentence count based on Query目标复杂度 from 10 ~ 250 words，参考下述三种specificity规格：
- vague: the user barely describes what they want and precisely the app type; the system must infer a lot. 1-2 short sentences — no trailing question, no sign-off.
- medium: some clear intent plus one or two constraints or details. Keep it as one concise paragraph.
- complex: multiple explicit requirements about target user, goal, functionalities, interactions, states, responsiveness, animation, or other relevant descriptions. It should be much more detailed than medium, ideally a long paragraph or structured requirement block.

## Few-shot Examples（仅作为长度与结构参考，不要照抄主题/语言）

下面三段展示了 vague / medium / complex 三种复杂度下，真实用户写出来的 query 大致长什么样。注意它们的篇幅、信息密度和结构差异：

<vague>
example1: 我想测下运势，给我开发一个玄学风格的运势生成器
example2: 给我一个生成复古胶片感拍立得的工具
example3: 做个晚餐抽签器，每次大家纠结吃什么的时候转一转。
</vague>

<medium>
Act as an expert kids' game designer and web developer. Help me build a tool that turns simple ideas into detailed prompts for kid-friendly web games. Output the prompt in short, medium, detail versions. Allow options for picking different game type, styles, and complexity
</medium>

<complex>
Help me build a mobile app called Tag along — a small social app for friend circles, hobby groups, and company crews to plan things together. Vibe: fun, warm, young. Look: round buttons, round avatars, colors that are playful but soft (coral, sunshine yellow, mint, sky blue, lavender, off-white background). Bottom bar with 5 tabs, the middle one is a round red +:
1. Feed — list of upcoming plans, with a row of interest pills at the top (hiking, coffee, yoga...) so I can filter; show a "For you" section that matches my interests.
2. Wall — an Instagram-style photo wall: big photo + caption + likes + comments. If a post is about a plan, show a small event card under it with a "Join" button.
3. +-when I tap it, pop up two choices: post a photo or create an event.
4. Ranks — a leaderboard. Rules: hosting an event = 50 pts, posting on the wall = 20 pts, joining an event = 10 pts. Top 3 get medals.
5. Profile — my avatar, name, a one-word vibe, three little prompts (anthem / perfect Sunday / hot take), my interests, the events I've hosted or am going to, and all the photo posts I've made. Other people's profiles look the same but read-only.
Core action on every event: two pill buttons — Coming and Not Coming. Tapping one drops my name into that list. No RSVP form. From the event page I can also send a friend a small nudge if they haven't replied, and react with vibes (Hyped / I'm in / Maybe / Saving spot / FOMO). Keep all data on the phone — no third-party login, no payments, no push notifications. Please pre-fill some demo users and events so the app feels alive the moment I open it.
</complex>

注意：示例只是用于校准"长度感 / 结构感 / 信息密度"，请保持你的 query 与示例话题完全无关，且最终输出仍默认英文（vague 也用英文，不要因为示例是中文就跟着输出中文）。
