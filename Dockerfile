# The whole product in one image: the frontend is exported to static files and
# served by the FastAPI backend, so there is a single process on a single port.
#
# Build from the repository root — the frontend reads `templates/` at build
# time (see frontend/src/lib/templates.ts), which lives outside frontend/.

# --- Stage 1: export the frontend to static HTML ------------------------------
FROM node:24-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci

COPY templates/ templates/
COPY frontend/ frontend/
RUN cd frontend && npm run build

# --- Stage 2: the backend, serving the export ---------------------------------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PRELEGAL_STATIC_DIR=/srv/static \
    PRELEGAL_DB_PATH=/srv/data/prelegal.db

WORKDIR /srv

# Dependencies first, so editing application code does not re-resolve them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/src ./src
RUN uv sync --frozen --no-dev

COPY --from=frontend /build/frontend/out ./static

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD ["/opt/venv/bin/python", "-c", \
         "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]

CMD ["uv", "run", "--frozen", "--no-dev", "uvicorn", "prelegal.main:app", \
     "--host", "0.0.0.0", "--port", "8000"]
