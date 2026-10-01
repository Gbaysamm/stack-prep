# Production image for the API and the worker (ADR-0010).
# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t score-pilot-api .

FROM ghcr.io/astral-sh/uv:0.7.20 AS uv

FROM python:3.13-slim AS builder
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /srv

COPY pyproject.toml uv.lock ./
COPY packages/engine packages/engine
COPY apps/api apps/api
# With the free Kokoro voice (app/kokoro_voice.py): onnxruntime and a bundled espeak, no apt.
RUN uv sync --frozen --no-dev --no-editable --extra kokoro

# The migration SQL ships with the image so `app.cli migrate` can run against it.
COPY database database

FROM python:3.13-slim AS runtime
RUN useradd --create-home --uid 10001 app
# Where the lessons' audio is kept. Made here and owned by the app user, so the volume
# mounted over it starts out writable by the process that fills it.
RUN mkdir -p /srv/speech && chown app:app /srv/speech
# Where the Kokoro voice's model (about 350 MB) is downloaded on first use, also a volume so a
# new image does not fetch it again.
RUN mkdir -p /srv/kokoro && chown app:app /srv/kokoro
WORKDIR /srv
COPY --from=builder --chown=app:app /srv/.venv /srv/.venv
COPY --from=builder --chown=app:app /srv/database /srv/database
# The figures students are shown. Asset rows store repo-relative paths, so they keep the same
# path under /srv, which ASSET_ROOT then names as the root.
COPY --chown=app:app docs/questions/utme/mathematics/figures/svg /srv/docs/questions/utme/mathematics/figures/svg
ENV PATH="/srv/.venv/bin:$PATH" PYTHONUNBUFFERED=1 MIGRATIONS_DIR=/srv/database/migrations \
    ASSET_ROOT=/srv SPEECH_CACHE_DIR=/srv/speech KOKORO_DIR=/srv/kokoro
USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4)"

# Override the command to run the worker: arq app.worker.WorkerSettings
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
