"""Runtime configuration, read from the environment.

Defaults suit a local checkout; the Docker image overrides both paths.
"""

import os
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[2]

#: Where the SQLite file lives. Recreated from scratch on every startup.
DB_PATH = Path(os.environ.get("PRELEGAL_DB_PATH", _BACKEND_ROOT / "data" / "prelegal.db"))

#: The statically exported frontend. Absent in a bare checkout, which is fine:
#: the API still serves, only the UI is missing.
STATIC_DIR = Path(os.environ.get("PRELEGAL_STATIC_DIR", _BACKEND_ROOT / "static"))

#: The document schemas, shared with the frontend. One JSON file per agreement,
#: describing its cover page fields; see `document_schema.py`. They live at the
#: repository root because both halves of the product read them.
SCHEMAS_DIR = Path(
    os.environ.get("PRELEGAL_SCHEMAS_DIR", _BACKEND_ROOT.parent / "schemas")
)

#: Credentials for the chat model. Absent in a checkout without a .env, in
#: which case /api/chat reports itself unavailable and the form still works.
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

#: Structured outputs are essential here, so the model is pinned and routing is
#: restricted to providers that support them (see openrouter.py).
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b")

#: How long to wait on the model before giving up. Extraction turns run to a
#: few seconds; well past that means something is wrong upstream.
OPENROUTER_TIMEOUT_SECONDS = float(os.environ.get("OPENROUTER_TIMEOUT", "45"))

#: Providers to route around. See the note in openrouter.py: Novita answers
#: structured requests for this model with an empty message.
OPENROUTER_IGNORED_PROVIDERS = [
    name
    for name in os.environ.get("OPENROUTER_IGNORED_PROVIDERS", "novita").split(",")
    if name.strip()
]
