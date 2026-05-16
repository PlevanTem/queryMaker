#!/usr/bin/env python
"""
Intra-dataset spread test for ui-queryMaker.

Embeds all v7 mobile 500 queries with sentence-transformers/all-MiniLM-L6-v2
(ONNX), runs van der Maaten's reference t-SNE, tags each point with its
structural metadata (L1 / L2 / persona / style / complexity).

The question this answers:
  "Does the pre-defined Excel requirements distribution (12 L1 × 61 L2 ×
   2,440 corpus topics) actually surface in the generated query embeddings,
   or do the queries collapse to a single shape regardless of topic?"

If queries cluster cleanly by L1 → corpus channel anchoring carries through
to the semantic layer. If they're jumbled → mode collapse despite the spec.

Output: data/output/quality_report/tsne_ours.json
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tsne as _tsne_mod

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "models" / "all-MiniLM-L6-v2"
OUT_PATH  = ROOT / "data" / "output" / "quality_report" / "tsne_ours.json"
# v9 = latest pipeline (Stage 4 positive-framing + Layer-A state). Combining
# mobile (12 topic L1s) + web (10 business-segment L1s) gives 22 L1s and ~596
# queries — the broadest intra-dataset spread test we can run on current data.
QUERY_FILES = [
    ROOT / "data" / "output" / "corpus_run_v9_mobile_300" / "queries.jsonl",
    ROOT / "data" / "output" / "corpus_run_v9_web_300"    / "queries.jsonl",
]

MAX_LEN = 256
EMB_DIM = 384


def load_queries(path: Path):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            if o.get("error"): continue
            text = o.get("query_text")
            if not isinstance(text, str) or not text.strip(): continue
            rows.append({
                "id": o.get("id"),
                "text": text.strip(),
                "l1": o.get("l1_scene") or "—",
                "l2": o.get("l2_scene_label") or "—",
                "persona": o.get("corpus_persona_id") or "—",
                "style": o.get("design_style") or "—",
                "complexity": o.get("target_complexity") or "—",
            })
    return rows


def load_model():
    print(f"Loading ONNX model from {MODEL_DIR / 'onnx' / 'model.onnx'}")
    session = ort.InferenceSession(
        str(MODEL_DIR / "onnx" / "model.onnx"),
        providers=["CPUExecutionProvider"],
    )
    in_names  = [i.name for i in session.get_inputs()]
    out_names = [o.name for o in session.get_outputs()]
    tok = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
    tok.enable_truncation(max_length=MAX_LEN)
    tok.enable_padding(length=MAX_LEN)
    return session, tok, in_names, out_names


def mean_pool(h, mask):
    m = mask[..., None].astype(np.float32)
    summed = (h * m).sum(axis=1)
    counts = np.clip(m.sum(axis=1), 1e-9, None)
    return summed / counts


def l2_norm(x):
    n = np.linalg.norm(x, axis=1, keepdims=True)
    return x / np.clip(n, 1e-12, None)


def embed(session, tok, in_names, out_names, texts, batch=16):
    embs = np.zeros((len(texts), EMB_DIM), dtype=np.float32)
    for s in range(0, len(texts), batch):
        chunk = texts[s:s + batch]
        enc = tok.encode_batch(chunk)
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        am  = np.array([e.attention_mask for e in enc], dtype=np.int64)
        tt  = np.zeros_like(ids)
        feed = {n: v for n, v in [("input_ids", ids), ("attention_mask", am), ("token_type_ids", tt)] if n in in_names}
        h = session.run(out_names, feed)[0]
        embs[s:s + len(chunk)] = l2_norm(mean_pool(h, am).astype(np.float32))
        print(f"  embedded {s + len(chunk)}/{len(texts)}", end="\r")
    print()
    return embs


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for p in QUERY_FILES:
        chunk = load_queries(p)
        print(f"  {p.relative_to(ROOT)} → {len(chunk)} rows")
        # tag platform so we can disambiguate v9 mobile vs v9 web in the JSON
        for r in chunk:
            r.setdefault("platform", "mobile" if "mobile" in str(p) else "web")
        rows.extend(chunk)
    print(f"loaded {len(rows)} rows total")

    # quick L1 distribution sanity
    from collections import Counter
    l1c = Counter(r["l1"] for r in rows)
    print("L1 distribution (top):")
    for k, v in l1c.most_common(): print(f"  {k:20s}  {v:4d}")

    t0 = time.time()
    session, tok, in_names, out_names = load_model()
    X = embed(session, tok, in_names, out_names, [r["text"] for r in rows])
    print(f"  embeddings {X.shape}  ·  took {time.time()-t0:.1f}s")

    t0 = time.time()
    print("Running t-SNE (perplexity=30, initial_dims=50)...")
    Y = _tsne_mod.tsne(X.astype(np.float64), no_dims=2, initial_dims=50, perplexity=30.0)
    print(f"  done · took {time.time()-t0:.1f}s")

    def rescale(v):
        lo, hi = v.min(), v.max()
        rng = hi - lo if hi > lo else 1.0
        return 2 * (v - lo) / rng - 1
    xn = rescale(Y[:, 0]); yn = rescale(Y[:, 1])

    points = []
    for i, r in enumerate(rows):
        points.append({
            "x": round(float(xn[i]), 4),
            "y": round(float(yn[i]), 4),
            "l1": r["l1"],
            "l2": r["l2"],
            "persona": r["persona"],
            "style": r["style"],
            "complexity": r["complexity"],
            "platform": r.get("platform", "—"),
            "t": r["text"][:60],
        })

    out = {
        "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": [str(p.relative_to(ROOT)) for p in QUERY_FILES],
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2 (ONNX)",
        "tsne_perplexity": 30.0,
        "tsne_initial_dims": 50,
        "n_total": len(points),
        "l1_distribution": dict(l1c),
        "points": points,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\n→ {OUT_PATH}")


if __name__ == "__main__":
    main()
