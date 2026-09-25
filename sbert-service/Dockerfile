# Production image for the standalone S-BERT similarity service.
# The model is baked into the image at build time so the container starts fully
# offline and fast (matches app.py's "load from local cache" assumption).
FROM python:3.11-slim

# Small, stable layer for deps first (better build caching).
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the sentence-transformers model into the image cache at build time.
# SBERT_MODEL defaults to all-MiniLM-L6-v2; keep this in sync with the runtime env.
ARG SBERT_MODEL=all-MiniLM-L6-v2
ENV SBERT_MODEL=${SBERT_MODEL}
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${SBERT_MODEL}')"

COPY . .

# Render (and most PaaS) inject $PORT; default to 8000 for local `docker run`.
# --preload loads the model once in the master before forking workers.
# One worker keeps the ~1-2GB model in a single copy; threads handle the
# low-volume, server-to-server call pattern.
ENV SBERT_HOST=0.0.0.0
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:${PORT:-8000} app:app --workers 1 --threads 4 --timeout 120 --preload"]
