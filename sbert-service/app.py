"""
Standalone S-BERT semantic text-similarity service for Pacher.

Design notes:
  * This is a *standalone* service, called only by the Node backend
    (server-to-server), never by the browser — so no CORS. When it runs on a
    public host, set SBERT_KEY and the backend presents it (X-SBERT-Key /
    Bearer); with SBERT_KEY unset (local dev / private networking) auth is off.
  * If this service is down, the Node backend degrades gracefully — topic
    submission still works, similarity is just marked "unavailable". Nothing
    here can block the rest of the system.
  * Embeddings run on a lightweight ONNX runtime via `fastembed` (no PyTorch),
    so the whole service fits comfortably in ~512 MB of RAM — small enough for a
    free web host. The model is the same all-MiniLM-L6-v2 as before, so scores
    are equivalent. The ONNX weights are fetched once (at build time if
    pre-warmed, otherwise on first startup) and then cached, so steady-state
    startup is offline and fast.

Endpoints:
  GET  /health       -> {status, model}          (always open)
  POST /similarity   -> compare one text against a list of candidates
      body: { "text": "...", "candidates": [ {"id","title","text"}, ... ] }
      resp: { "topScore": 0.83, "matches": [ {"id","title","score"}, ... ] }
"""

import hmac
import os

import numpy as np
from flask import Flask, request, jsonify
from fastembed import TextEmbedding

# Friendly label reported by /health (kept identical to the old service so the
# admin monitor shows the same model name). The fastembed identifier is the
# fully-qualified Hugging Face repo id for the very same model.
MODEL_LABEL = os.environ.get("SBERT_MODEL", "all-MiniLM-L6-v2")
MODEL_ID = MODEL_LABEL if "/" in MODEL_LABEL else f"sentence-transformers/{MODEL_LABEL}"

HOST = os.environ.get("SBERT_HOST", "127.0.0.1")
PORT = int(os.environ.get("SBERT_PORT", "8000"))
MAX_MATCHES = int(os.environ.get("SBERT_MAX_MATCHES", "5"))
# Where fastembed stores the downloaded ONNX model. Default keeps it inside the
# service directory so a build-time pre-warm and the runtime share one cache.
CACHE_DIR = os.environ.get(
    "FASTEMBED_CACHE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fastembed_cache"),
)
# Optional shared secret. When set (public host, e.g. a free Render web service)
# every request except /health must present it. Unset locally -> auth disabled.
SBERT_KEY = os.environ.get("SBERT_KEY", "").strip()

app = Flask(__name__)


def _authorized(req):
    """Constant-time shared-secret check.

    SBERT_KEY unset -> always authorized (local dev / private networking).
    SBERT_KEY set   -> require it via 'X-SBERT-Key' or 'Authorization: Bearer'.
    """
    if not SBERT_KEY:
        return True
    presented = req.headers.get("X-SBERT-Key", "")
    if not presented:
        auth = req.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            presented = auth[len("Bearer ") :]
    return bool(presented) and hmac.compare_digest(presented, SBERT_KEY)


@app.before_request
def _guard():
    # /health stays open so the platform + admin monitor can probe liveness.
    if request.path == "/health":
        return None
    if not _authorized(request):
        return jsonify(error="unauthorized"), 401


print(f"[sbert] loading ONNX model '{MODEL_ID}' (cache: {CACHE_DIR}) ...", flush=True)
model = TextEmbedding(model_name=MODEL_ID, cache_dir=CACHE_DIR)
print("[sbert] model ready", flush=True)


def _embed(texts):
    """Return L2-normalized embeddings as an np.ndarray of shape [n, dim].

    fastembed yields one vector per input text; we normalize explicitly so a
    dot product equals cosine similarity — matching the previous
    sentence-transformers `normalize_embeddings=True` behaviour.
    """
    vecs = np.asarray(list(model.embed(list(texts))), dtype=np.float32)
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # guard against a zero vector -> no divide-by-zero
    return vecs / norms


@app.get("/health")
def health():
    return jsonify(status="ok", model=MODEL_LABEL)


@app.post("/similarity")
def similarity():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    candidates = data.get("candidates")

    if not text:
        return jsonify(error="`text` is required"), 400
    if candidates is None or not isinstance(candidates, list):
        return jsonify(error="`candidates` must be a list"), 400

    # Keep only candidates that carry some text to compare against.
    valid = [c for c in candidates if isinstance(c, dict) and (c.get("text") or c.get("title"))]
    if not valid:
        return jsonify(topScore=0.0, matches=[])

    # Encode the query and all candidate texts (title + abstract when provided).
    cand_texts = [(c.get("text") or c.get("title")) for c in valid]
    query_emb = _embed([text])[0]
    cand_emb = _embed(cand_texts)
    scores = cand_emb @ query_emb  # cosine similarity: all vectors are unit-norm

    matches = [
        {
            "id": c.get("id"),
            "title": c.get("title") or (c.get("text") or "")[:80],
            "score": round(float(s), 4),
        }
        for c, s in zip(valid, scores)
    ]
    matches.sort(key=lambda m: m["score"], reverse=True)
    top = matches[0]["score"] if matches else 0.0

    return jsonify(topScore=top, matches=matches[:MAX_MATCHES])


if __name__ == "__main__":
    # threaded=True lets the single Node caller and health checks overlap.
    app.run(host=HOST, port=PORT, threaded=True)
