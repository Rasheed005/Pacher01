"""
Standalone S-BERT semantic text-similarity service for Pacher.

Design notes:
  * This is a *standalone* service. It is called only by the Node backend
    (server-to-server), never by the browser, so it needs no CORS or auth.
  * If this service is down, the Node backend degrades gracefully — topic
    submission still works, similarity is just marked "unavailable". Nothing
    here can block the rest of the system.
  * The model is loaded once at startup from the local Hugging Face cache
    (already downloaded), so startup is offline and fast.

Endpoints:
  GET  /health       -> {status, model}
  POST /similarity   -> compare one text against a list of candidates
      body: { "text": "...", "candidates": [ {"id","title","text"}, ... ] }
      resp: { "topScore": 0.83, "matches": [ {"id","title","score"}, ... ] }
"""

import os
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer, util

MODEL_NAME = os.environ.get("SBERT_MODEL", "all-MiniLM-L6-v2")
HOST = os.environ.get("SBERT_HOST", "127.0.0.1")
PORT = int(os.environ.get("SBERT_PORT", "8000"))
MAX_MATCHES = int(os.environ.get("SBERT_MAX_MATCHES", "5"))

app = Flask(__name__)

print(f"[sbert] loading model '{MODEL_NAME}' from local cache ...", flush=True)
model = SentenceTransformer(MODEL_NAME)
print("[sbert] model ready", flush=True)


@app.get("/health")
def health():
    return jsonify(status="ok", model=MODEL_NAME)


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
    query_emb = model.encode(text, convert_to_tensor=True, normalize_embeddings=True)
    cand_emb = model.encode(cand_texts, convert_to_tensor=True, normalize_embeddings=True)
    scores = util.cos_sim(query_emb, cand_emb)[0].tolist()

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
