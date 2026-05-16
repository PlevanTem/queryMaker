#!/usr/bin/env node
/**
 * Pull verbatim samples from public web-codegen datasets via HF Datasets Server.
 * Writes data/external/<dataset_slug>/samples.jsonl — one {id, text, source} per line.
 *
 * Datasets covered:
 *   - HuggingFaceM4/WebSight       (config=v0.1, split=train, field=text)
 *   - MBZUAI/Web2Code              (config=default, split=train, field=conversations[0].value)
 *   - luzimu/WebGen-Bench          (config=default, split=test, field=instruction)
 *   - microsoft/MM-WebGen-Bench    (config=default, split=test, field=input)
 *
 * No paraphrasing. If the dataset doesn't expose the natural-language field
 * we expect, the row is dropped with a console warning.
 */

const fs = require('fs');
const path = require('path');

const N = 100;
const OUT_ROOT = path.join(__dirname, '..', '..', 'data', 'external');

const DATASETS = [
  {
    slug: 'websight',
    hf: 'HuggingFaceM4/WebSight',
    config: 'v0.2',
    split: 'train',
    // The natural-language side is `llm_generated_idea`; `text` is the HTML.
    extract: row => row?.llm_generated_idea || null,
  },
  {
    slug: 'web2code',
    hf: 'MBZUAI/Web2Code',
    config: 'default',
    split: 'train',
    extract: row => {
      // conversations is a list of {from, value}; take the first human turn
      const convs = row?.conversations;
      if (!Array.isArray(convs)) return null;
      const human = convs.find(c => c?.from === 'human');
      return human?.value || convs[0]?.value || null;
    },
  },
  {
    slug: 'webgen-bench',
    hf: 'luzimu/WebGen-Bench',
    config: 'default',
    split: 'test',
    extract: row => row?.instruction || row?.input || null,
  },
  {
    slug: 'mm-webgen-bench',
    hf: 'microsoft/MM-WebGen-Bench',
    config: 'default',
    split: 'test',
    extract: row => row?.input || null,
  },
];

async function fetchRows(dataset, config, split, offset, length) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${dataset} ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (!j.rows) throw new Error(`${dataset}: no rows in response`);
  return j.rows.map(r => r.row);
}

async function pull(ds) {
  console.log(`\n[${ds.slug}] pulling ${N} rows from ${ds.hf} (${ds.config}/${ds.split})`);
  const outDir = path.join(OUT_ROOT, ds.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'samples.jsonl');

  // HF datasets-server max length per call is 100, so one call is enough
  const rows = await fetchRows(ds.hf, ds.config, ds.split, 0, N);
  const lines = [];
  let kept = 0, dropped = 0;
  for (let i = 0; i < rows.length; i++) {
    const text = ds.extract(rows[i]);
    if (typeof text !== 'string' || !text.trim()) { dropped++; continue; }
    lines.push(JSON.stringify({
      id: `${ds.slug}_${String(i).padStart(4, '0')}`,
      source: ds.hf,
      config: ds.config,
      split: ds.split,
      text: text.trim(),
    }));
    kept++;
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log(`  → ${outPath}  ·  kept ${kept} / dropped ${dropped}`);
  return { slug: ds.slug, kept, dropped };
}

(async () => {
  const results = [];
  for (const ds of DATASETS) {
    try {
      results.push(await pull(ds));
    } catch (e) {
      console.error(`  ✗ ${ds.slug} FAILED:`, e.message);
      results.push({ slug: ds.slug, error: e.message });
    }
  }
  console.log('\n=== summary ===');
  results.forEach(r => console.log(' ', JSON.stringify(r)));
})();
