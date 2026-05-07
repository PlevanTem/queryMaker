const path = require("path");
const {
  parseArgs,
  readJsonl,
  splitSceneText,
  buildPersonaSynthesisPrompt,
  buildPersonaSpec,
  buildQueryPromptFromPersona,
  generateQueryRecords,
} = require("../mvp/query_factory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const inputPath = path.resolve(rootDir, args.input || "data/intermediate/generation_plan.v2.jsonl");
  const taskIndex = Number(args.index || 0);
  const mode = args.mode || "persona-fallback";

  const tasks = readJsonl(inputPath);
  const task = { ...tasks[taskIndex] };

  if (!task) {
    throw new Error(`未找到第 ${taskIndex} 条任务。`);
  }

  if (!task.l2_scene_label && task.l2_scene) {
    const scene = splitSceneText(task.l2_scene);
    task.l2_scene_label = scene.label;
    task.l2_scene_examples = scene.examples;
  }
  if (!task.application_type) {
    task.application_type = (task.l2_scene_examples && task.l2_scene_examples[0]) || task.l2_scene_label || "通用内容应用";
  }
  if (!task.target_complexity) {
    task.target_complexity = args.complexity || "medium";
  }
  if (!task.persona_seed) {
    task.persona_seed = `seed_${task.query_id}`;
  }

  const scene = {
    label: task.l2_scene_label,
    examples: task.l2_scene_examples || [],
  };
  const personaPrompt = buildPersonaSynthesisPrompt(task);
  const personaSpec = buildPersonaSpec(task);
  const queryPrompt = buildQueryPromptFromPersona(task, personaSpec);
  const generated = await generateQueryRecords({ tasks: [task] }, { mode });

  const payload = {
    task,
    cleaned_scene_context: scene,
    persona_generation_input: personaPrompt,
    persona_output: personaSpec,
    query_generation_input: queryPrompt,
    query_output: generated[0]?.query_text || "",
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
