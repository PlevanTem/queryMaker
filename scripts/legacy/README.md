# scripts/legacy/

Historical one-off scripts kept here for reference. **Use the replacements below for any new work.**

| Legacy script | Replaced by | Why archived |
|---|---|---|
| `test-sample5.js` | `scripts/batch-generate-queries.js` (with `--sample-n 5`) | First iteration, used the now-blocked `mode: claude-code` HTTP path against packy-cc gateway. Falls back to `persona-fallback` template; not useful for real LLM runs. |
| `test-sample5-cli.js` | `scripts/batch-generate-queries.js` (transport `claude-cli`) | Working spike that proved subprocess-based CLI calling. Logic was generalized into `scripts/lib/llm-batch.js`; this file does only one shape (5 scenes × 3 complexities) without resume / errors.json / config.json. |
| `fill-missing.js` | `scripts/batch-generate-queries.js` (rerun with `--output-dir <same>`) | The new batch script defaults to `--resume`: rerunning the same `--output-dir` automatically picks up missing rows. No separate fill step needed. |
| `build-comparison-html.js` | `scripts/build-query-comparison.js` | Old version had hardcoded paths for the three sample5 runs. New script accepts arbitrary `--run-dir` / `--runs` and renders any number of datasets side-by-side. |

These files still run as-is, but they:

- duplicate utilities now centralized in `scripts/lib/llm-batch.js` and `mvp/query_factory_v2.js`,
- don't share the standardized output layout (`plan.json` / `raw_queries.jsonl` / `errors.json` / `stats.json` / `config.json`),
- and are skipped by `npm run …` scripts.

If you find yourself needing to revive any of them, prefer extending the lib module instead.
