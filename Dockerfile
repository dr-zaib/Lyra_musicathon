# Hugging Face Spaces (Docker SDK) — lyra backend (FastAPI + engine).
# Builds ONLY the Python service (backend + engine + shared); web/ is ignored
# (the frontend lives on Vercel). Listens on 7860 (HF Spaces default port).
#
# On HF: create a Docker Space, add Secrets MUSIXMATCH_API_KEY + ANTHROPIC_API_KEY
# (read via os.environ — no .env needed), then push this repo to the Space.

FROM python:3.12-slim

# HF Spaces best practice: run as a non-root user with a writable home.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies first (better layer caching). requirements.txt is exported from uv.lock
# on a dev machine and pins the CUDA build of torch (nvidia-* + triton, ~5GB) — but this
# is a CPU Space, so strip the GPU-only deps and pull torch from the CPU wheel index.
COPY --chown=user backend/requirements.txt /app/backend/requirements.txt
RUN grep -ivE '^(nvidia-|triton)' /app/backend/requirements.txt \
      | sed 's/^torch==2.12.0$/torch==2.12.0+cpu/' \
      > /app/backend/requirements.cpu.txt \
 && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
      -r /app/backend/requirements.cpu.txt

# Bake the embedding model into the image so cold starts don't pay a ~420MB download.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-mpnet-base-v2')"

# App code: backend imports engine/ and shared/ via paths relative to its own files,
# so the three folders must sit side-by-side under /app.
COPY --chown=user backend/ /app/backend/
COPY --chown=user engine/ /app/engine/
COPY --chown=user shared/ /app/shared/

EXPOSE 7860
# --app-dir backend makes `app:app` importable; engine_bridge/app.py resolve engine &
# shared from /app via __file__-relative paths, so cwd doesn't matter.
CMD ["uvicorn", "app:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "7860"]
