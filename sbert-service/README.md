# Pacher — S-BERT similarity service

Standalone semantic text-similarity microservice for Pacher. It embeds a
research topic (title + abstract) and returns the closest existing topics by
cosine similarity. Embeddings use the `all-MiniLM-L6-v2` model run through a
lightweight **ONNX** runtime (`fastembed`) — **no PyTorch** — so the whole
service fits in a free ~512 MB host. It is called **only** by the Pacher
backend, server-to-server — never by a browser.

## Endpoints
- `GET /health` → `{ "status": "ok", "model": "all-MiniLM-L6-v2" }` — open, for liveness probes.
- `POST /similarity` — body `{ "text": "...", "candidates": [ {"id","title","text"} ] }`
  → `{ "topScore": 0.83, "matches": [ {"id","title","score"} ] }`

## Authentication
Because the service is reachable over the public internet, set an **`SBERT_KEY`**
secret on the host. Every request except `/health` must then present it as
`X-SBERT-Key: <key>` (or `Authorization: Bearer <key>`). The Pacher backend sends
this automatically when its own `SBERT_KEY` env var is set to the same value.
With no `SBERT_KEY` set, the service accepts all requests — local development only.

## Run it

### Local
```bash
pip install -r requirements.txt
python app.py            # serves on http://127.0.0.1:8000
```

### Render (free Web Service — the deploy target)
- **Runtime:** Python  •  **Root Directory:** `sbert-service`
- **Build Command:**
  `pip install -r requirements.txt && python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2', cache_dir='.fastembed_cache')"`
- **Start Command:**
  `gunicorn -b 0.0.0.0:$PORT app:app --workers 1 --threads 4 --timeout 120 --preload`
- **Health Check Path:** `/health`
- **Secret:** `SBERT_KEY` = the shared secret (must match the backend's `SBERT_KEY`).

The build step pre-fetches the ONNX model so the first request is fast; if it is
skipped, the model is fetched once on first startup and then cached. See
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for the full runbook.

### Docker (optional / portable)
```bash
docker build -t pacher-sbert .
docker run -p 8000:8000 -e SBERT_KEY=your-secret pacher-sbert
```
