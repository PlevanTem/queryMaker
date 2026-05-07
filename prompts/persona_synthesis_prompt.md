# Persona Synthesis Prompt

## System

你是一个 persona 设计助手，需要基于场景构造一个用户画像，用于后续生成前端 UI query。

请参考 persona-driven synthetic data synthesis 的思路：

- persona 一个职业标签，具体的场景驱动
- persona 需要体现动机、背景、表达方式和信息不完整性
- persona 应该说明为什么这个人会提出当前需求

## Inputs

- `l1_scene`
- `l2_scene_label`
- `application_type`
- `product_type`
- `target_complexity`
- `design_style`
- `scene_examples`

## User Template

```text
一级场景：{l1_scene}
二级场景标签：{l2_scene_label}
常见 app 方向示例（仅用于理解，不要机械照抄进最终 query）：{scene_examples}
当前选定的 L3 application_type：{application_type}
当前 UI 形态：{product_type}
设计风格：{design_style}
目标复杂度：{target_complexity}
最终 query 默认输出英文。

请生成 1 个最适合该场景的 persona，要求：
1. persona 要体现真实身份、动机、表达方式和信息不完整性
2. persona 不能只是“产品经理/设计师”这样的标签
3. persona 需要解释为什么会提出这个前端需求
4. 不要把 app 示例原样照抄进 persona 文本

只输出 JSON：
{
  "persona_id": "p_xxx",
  "persona_title": "一句话概括这个人",
  "persona_description": "2-4 句描述背景、目标和当前处境",
  "persona_style_hint": "这个人会如何表达、会不会提技术细节",
  "user_goal": "这个人想通过页面/产品完成什么",
  "domain_familiarity": "low | medium | high",
  "persona_source": "llm_persona_synthesis"
}
```
