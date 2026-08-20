"""The Prelegal application: a JSON API under /api and the frontend at /.

The frontend is a static Next.js export, so one process serves both and there
is no cross-origin configuration to maintain.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import config, db
from .routers import auth, chat, documents, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Recreates the scratch database so every boot starts empty."""
    db.reset()
    yield


app = FastAPI(title="Prelegal", lifespan=lifespan)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(documents.router, prefix="/api")

# Mounted after the API routes, which Starlette matches first. `html=True`
# serves index.html for a directory path, which is how the exported /app/ route
# resolves. A bare checkout has no export yet; the API still serves without it.
if config.STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="frontend")
