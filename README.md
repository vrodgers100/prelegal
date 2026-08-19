# prelegal

A platform for drafting pre-legal agreements from vetted templates.

## Status: In progress

Under active development and **not yet ready for use**. Sign-in is a placeholder:
any email is accepted and no password is checked.

**Target completion date: 23 August 2026**

## Getting started

Requires Docker.

```bash
scripts/start-mac.sh       # macOS
scripts/start-linux.sh     # Linux
scripts/start-windows.ps1  # Windows
```

Then open <http://localhost:8000>. Use the matching `stop-*` script to shut down.

## Project structure

| Path | What it holds |
| --- | --- |
| `backend/` | FastAPI app (uv project). Serves `/api` and hosts the frontend. |
| `frontend/` | Next.js app, statically exported at build time. |
| `templates/` | Common Paper agreement templates, the source of all wording. |
| `catalog.json` | Index of the available templates. |
| `scripts/` | Start and stop scripts per platform. |

Everything runs as one container on port 8000: the frontend is exported to
static files and served by the backend, so there is no second port or origin.

The SQLite database is recreated empty on every start. It is a scratch store
until real authentication lands.

## Development

```bash
# Frontend
cd frontend && npm install
npm run dev     # dev server on :3000; set NEXT_PUBLIC_API_BASE=http://localhost:8000
npm test        # vitest
npm run lint

# Backend
cd backend
uv run pytest
uv run uvicorn prelegal.main:app --reload
```

API docs are at <http://localhost:8000/docs> while the app is running.

## License

See [LICENSE](LICENSE). Templates are Common Paper, CC BY 4.0 — see
[`templates/LICENSE.txt`](templates/LICENSE.txt).
