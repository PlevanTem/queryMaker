// Repair JSON files where Haiku subagents emitted unescaped ASCII " inside Chinese strings.
// Strategy: line-based; on lines matching `  "query_text_zh": "<content>"<,?>`, escape inner ".

const fs   = require("fs");
const path = require("path");

const dir = "data/output/_translate_haiku";
const all = fs.readdirSync(dir).filter((f) => f.endsWith("_out.json"));

let fixedFiles = 0;
let fixedLines = 0;

for (const f of all) {
  const fp = path.join(dir, f);
  const text = fs.readFileSync(fp, "utf8");
  // Quick check: try parsing first; skip if already valid
  try { JSON.parse(text); continue; } catch {}

  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    // Match: <indent>"query_text_zh": "<content>"<optional comma><optional whitespace>
    const m = line.match(/^(\s*"query_text_zh":\s*")(.*)("\s*,?\s*)$/);
    if (!m) return line;
    let inner = m[2];
    // Escape any UNESCAPED " inside the inner content
    let s = "";
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '"' && (i === 0 || inner[i - 1] !== "\\")) {
        s += '\\"';
      } else {
        s += inner[i];
      }
    }
    if (s !== inner) {
      fixedLines++;
    }
    return m[1] + s + m[3];
  });

  const newText = out.join("\n");
  try {
    JSON.parse(newText);
    fs.writeFileSync(fp, newText, "utf8");
    fixedFiles++;
    console.log(`✅ repaired ${f}`);
  } catch (e) {
    console.log(`✗  still invalid ${f}: ${e.message.split("\n")[0].slice(0, 100)}`);
  }
}

console.log(`\nFixed ${fixedFiles} file(s), ${fixedLines} line(s) total`);
