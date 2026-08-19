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
