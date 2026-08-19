
# Prelegal Project

## Overview

This is a SAAS product toallow users to draft legal agreements based on templates in the templates directory.  The user can use AI chat in order to establish what document they want and how to fill in the fields.  The available documents are covered in the catalog.json file in the project root, included here:  

@catalog.json

Only the Mutual NDA document is supported so far. See Current State at the end of this file for what exists today.  

## Development Process
When instructed to build a feature:  

1. Use yoiur Atlassian tools to read the feature instructions from Jira   
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thiroughly test the feature wih unit tests and integration tests and fix any issues
4. Submit a PR using your github tools  

## AI Design
When writing code to make calls to LLMs, communicate via OpenRouter to the gpt-oss-120b model.  Inference provider can be any free tool.  You should use Structured Outputs so you can interpret the results and populate fields in the legal document.    

There is an OPENROUTER_API_KEY in the .env file in the project root. `docker-compose.yml` passes it in; without it `/api/chat` answers 503 and the form still works.

Note there is no `:free` tier for `openai/gpt-oss-120b` — only the 20b model has one. Calls cost roughly $0.03 per million prompt tokens, so "any free provider" is read as "let OpenRouter pick", not "must cost nothing".

Three hard-won constraints, all measured (see `backend/src/prelegal/chat.py`):

- **One call cannot both talk and extract.** Asking a single strict-schema call for `{reply, updates}` returned replies like `"updates"` or `""` about three times in four — the model emits the fields first, and constrained decoding had already committed it to the prose. A turn is two calls: extract, then reply, in that order so the reply knows what was just found.
- **Route around Novita, and sort by throughput.** Novita answers structured requests for this model with null content (0 usable in 3, against 21 in 21 elsewhere). Throughput sorting halved a turn from 12.2s to 6.2s.
- **Strict mode needs the schema tightened.** `strict_schema` in `nda.py` forces every property into `required` and closes every object, because Pydantic omits both for optional fields. Optional survives as required-but-nullable.

Overridable by environment, all with working defaults: `OPENROUTER_MODEL`, `OPENROUTER_TIMEOUT`, `OPENROUTER_IGNORED_PROVIDERS`.

## Technical Design
The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLlite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
The frontend is statically exported and served by FastAPI. This works, so keep it: one process, one port, no cross-origin setup. It rules out server-side rendering at request time, so anything needing per-request server rendering has to revisit this choice.  
There should be scripts in scripts/ for:  
```bash
# mac
scripts/start-mac.sh     # start
scripts/stop-mac.sh      # stop

#linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1  
scripts/stop-windows.ps1
```

The whole app is available at http://localhost:8000 — the frontend at `/`, the API under `/api`, and its docs at `/docs`.

## Color Scheme

Accent Yellow: #ecad0a  
Blue Primary: #209dd7  
Purple Secondary: #753991  
Dark Navy: #032147  
Gray Text: #888888

The palette is defined as Tailwind tokens (`brand-navy`, `brand-blue`, `brand-purple`, `brand-yellow`, `brand-gray`) in `frontend/tailwind.config.ts`. Only the sign-in screen uses them so far; the NDA creator and the drafting chat are still on the prototype's slate palette and have yet to be restyled.

## Current State

Implemented as of PL-5 (19 August 2026).

**Structure**

| Path | Holds |
| --- | --- |
| `backend/` | FastAPI app, uv project. Package is `src/prelegal/`. |
| `frontend/` | Next.js 16 / React 19, statically exported. |
| `templates/` | Common Paper templates. The only source of agreement wording. |
| `scripts/` | Docker start/stop wrappers per platform. |

The chat feature spans five files worth knowing about: `backend/src/prelegal/openrouter.py` (the only place that talks to the network), `chat.py` (prompts and the two-call turn), `nda.py` (the Pydantic mirror of `NdaData`, which doubles as the structured-output schema), `routers/chat.py`, and `frontend/src/lib/chat.ts` (the merge). Adding a cover-page field means touching `frontend/src/lib/nda.ts` **and** `nda.py` — the schema has to be declared server-side, so the shape genuinely lives in two places.

**Routes**

- `/` sign-in screen
- `/app` the Mutual NDA creator, behind sign-in
- `/api/health`, `/api/auth/signup`, `/api/auth/login`, `/api/chat`

**Sign-in is not authentication.** Any email is accepted, unknown emails are registered on the way past, and passwords are discarded rather than stored. The users table has no password column. Real auth replaces `backend/src/prelegal/routers/auth.py` and `frontend/src/lib/session.ts`, which keeps the session in localStorage.

**Database** is dropped and recreated on every startup by the lifespan handler in `main.py`. Do not put anything in it that needs to survive a restart. Plain stdlib `sqlite3`, no ORM.

**The creator is chat-first.** `/app` opens on the conversation, with the old form folded into a collapsed "Review fields" panel beneath it. The form is not legacy — it is how a mishearing gets corrected without arguing with the assistant, and it is what keeps the page usable when there is no API key. Both write to the same `NdaData` in `NdaCreator`.

**The drafting chat** (`/api/chat`) is stateless. The browser owns the agreement and sends the transcript plus the current fields every turn; the reply carries only the fields that turn learned, and `applyUpdates` in `frontend/src/lib/chat.ts` merges them. That is deliberate: a reply can then never overwrite a field edited in the form while the message was in flight. `applyUpdates` also drops values the model gets wrong — a `governingLaw` that is not a US state is discarded rather than written into the document, which is how an observed "Delphi" for Delaware stayed out.

Two behaviours to expect rather than treat as bugs: a turn takes roughly 5–7 seconds with no streaming, and the assistant still paraphrases its way into re-asking a settled field about one turn in eight.

**Tests**: `cd backend && uv run pytest` (50), `cd frontend && npm test` (63). Run `npm run lint` too — it catches React issues the build does not.

**Gotchas**

- Docker build context is the repo root, not `frontend/`. `frontend/src/lib/templates.ts` reads `../templates/*.md` while pages are generated, so the node stage needs both directories.
- `.ps1` scripts need PowerShell, `.sh` need Bash. In Git Bash on Windows, `./scripts/start-linux.sh` works fine.
- Windows PowerShell 5.1 turns native stderr into terminating errors, so the `.ps1` scripts check `$LASTEXITCODE` instead of setting `$ErrorActionPreference = "Stop"`. Keep it that way — `docker compose` writes progress to stderr.
- `.gitattributes` pins `.sh` to LF. A CR would break the shebang on mac and Linux.
- Async backend tests need `@pytest.mark.anyio`; the `anyio_backend` fixture that makes it work lives in `backend/tests/conftest.py`. There is no pytest-asyncio.
- `httpx2` is the HTTP client, and the import name is `httpx2`, not `httpx`. It is a runtime dependency now, not just a test one.

**Not built yet**: all templates other than the Mutual NDA, real authentication, and persistence. The conversation itself is not persisted either — a reload starts a fresh chat, though the document is equally lost, so the two agree.
