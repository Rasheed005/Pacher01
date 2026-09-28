# Image for the standalone S-BERT similarity service (lightweight ONNX / fastembed,
# no PyTorch). Not required on Render's native Python runtime — kept so the service
# also runs with a plain `docker run` and stays portable. The ONNX model is fetched
# at build time so the container starts offline and fast.
FROM python:3.11-slim

# Run as a non-root user; keep the model cache under its writable HOME.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    FASTEMBED_CACHE=/home/user/app/.fastembed_cache
WORKDIR /home/user/app

# Small, stable deps layer first (better build caching).
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .

# Bake the ONNX model into the cache at build time (same dir app.py reads), so
# the container starts offline and the first request is fast.
ARG SBERT_MODEL=sentence-transformers/all-MiniLM-L6-v2
RUN python -c "import os; from fastembed import TextEmbedding; TextEmbedding(model_name='${SBERT_MODEL}', cache_dir=os.environ['FASTEMBED_CACHE'])"

# The host injects PORT (Render) or defaults to 8000 for a local `docker run`.
# One worker keeps a single copy of the (small) ONNX model in memory.
ENV SBERT_HOST=0.0.0.0
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:${PORT:-8000} app:app --workers 1 --threads 4 --timeout 120 --preload"]
