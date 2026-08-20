
# Prelegal Project

## Overview

This is a SAAS product toallow users to draft legal agreements based on templates in the templates directory.  The user can use AI chat in order to establish what document they want and how to fill in the fields.  The available documents are covered in the catalog.json file in the project root, included here:  

@catalog.json

All eleven documents in the catalogue are supported. See Current State at the end of this file for what exists today.  

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

Four hard-won constraints, all measured (see `backend/src/prelegal/chat.py`):

- **One call cannot both talk and extract.** Asking a single strict-schema call for `{reply, updates}` returned replies like `"updates"` or `""` about three times in four — the model emits the fields first, and constrained decoding had already committed it to the prose. So the structured work and the prose are always separate calls, and the prose goes last so the reply knows what was just found. A drafting turn is three calls in two round trips: extraction and `reconsider()` together, then the reply.
- **Route around Novita, and sort by throughput.** Novita answers structured requests for this model with null content (0 usable in 3, against 21 in 21 elsewhere). Throughput sorting halved a turn from 12.2s to 6.2s.
- **Field order in a schema is decoding order.** The same lesson as the first bullet, one level down: a model cannot classify into a field it has already filled in. `DocumentChoice` asks for `askedFor` — the request in the user's own words — before `documentType` and `nearestMatch`, because with the two ids alone a request for a document Prelegal does not draft came back as two nulls rather than a nearest match, 6 times in 6. Put the field that states what was heard ahead of the fields that place it.
- **Strict mode needs the schema tightened.** `strict_schema` in `document_schema.py` forces every property into `required` and closes every object, because Pydantic omits both for optional fields. Optional survives as required-but-nullable.

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

The palette is defined as Tailwind tokens (`brand-navy`, `brand-blue`, `brand-purple`, `brand-yellow`, `brand-gray`) in `frontend/tailwind.config.ts`. Two components use them: `SignInForm` throughout, and `DocumentChat` for its accents only — navy message bubbles, blue focus rings on the composer and the catalogue cards, a yellow rule down the error banner. Everything else is still the prototype's slate: the cover page, the review form, the page chrome. `brand-purple` and `brand-gray` are unused. A real restyle has not happened, so do not read the current mix as a considered design.

## Current State

Implemented as of PL-6, merged to `main` as `07181e8` on 20 August 2026 (PR #7). PL-2 to PL-6 are Live. **PL-7 — "Support multiple users & final polish" — is the next ticket, still To Do**, and it is where the two big absences below get addressed: real authentication and persistence.

**Structure**

| Path | Holds |
| --- | --- |
| `backend/` | FastAPI app, uv project. Package is `src/prelegal/`. |
| `frontend/` | Next.js 16 / React 19, statically exported. |
| `templates/` | Common Paper templates. The only source of agreement wording. |
| `schemas/` | One JSON file per agreement, saying what its cover page needs. Read by both halves. |
| `scripts/` | Docker start/stop wrappers per platform. |

**`schemas/` is the single source of truth.** One JSON file per agreement describes every cover-page field: its key, kind (`text`, `date`, `years`, `choice`, `party`, `state`), label, the sentence the assistant uses to ask about it, and whether it is required. Both halves read those files — Python at import in `document_schema.py`, which builds the Pydantic model with `pydantic.create_model`; TypeScript at build time in `documents.server.ts`. **Adding a field means editing one JSON file and nothing else.** It used to mean editing `nda.ts` and `nda.py` together; both are gone.

The chat feature spans five files worth knowing about: `backend/src/prelegal/openrouter.py` (the only place that talks to the network), `chat.py` (prompts, the shape of a turn, choosing the agreement and reconsidering it), `document_schema.py` (loads the schemas, builds the models), `routers/chat.py`, and `frontend/src/lib/chat.ts` (the merge).

`required` is deliberately short in every schema. It drives `outstanding()`, which is what the assistant asks about, so marking all twenty fields of a licence agreement required would produce an interrogation rather than a conversation. Each agreement asks 11–15 questions.

**Routes**

- `/` sign-in screen
- `/app` the agreement creator, behind sign-in. One route for all eleven; the document is picked from the opening catalogue or settled in conversation, can be changed at any point, and is switched client-side.
- `/api/health`, `/api/auth/signup`, `/api/auth/login`, `/api/chat`

**Sign-in is not authentication.** Any email is accepted, unknown emails are registered on the way past, and passwords are discarded rather than stored. The users table has no password column. Real auth replaces `backend/src/prelegal/routers/auth.py` and `frontend/src/lib/session.ts`, which keeps the session in localStorage.

**Database** is dropped and recreated on every startup by the lifespan handler in `main.py`. Do not put anything in it that needs to survive a restart. Plain stdlib `sqlite3`, no ORM.

**The creator is chat-first, and now chooses the document too.** `/app` opens on the conversation and the catalogue, because which agreement is being drafted is itself something to talk about — but not something to guess at. A turn sent with a null `documentType` runs the choosing flow: it settles on one of the eleven, or — for something Prelegal cannot draft — says so and offers the nearest match, leaving `documentType` null until the user accepts. Once settled, the document appears beside the chat with the form folded into a collapsed "Review fields" panel. The form is not legacy — it is how a mishearing gets corrected without arguing with the assistant, and it is what keeps the page usable when there is no API key. Both write to the same `DocumentData` in `DocumentCreator`.

**The opening screen shows all eleven.** `Catalogue` in `DocumentChat.tsx` renders every agreement as a card — full `name`, not `shortName`, because this is where someone finds out what exists and "BAA" tells them nothing — and disappears once one is settled. Clicking opens the document immediately and then sends "I need a {name}." as an ordinary turn, so the conversation reads as though it had been typed and the assistant asks the first question. Opening before the round trip is deliberate: it is the only route into a document when `OPENROUTER_API_KEY` is absent, and the review form still works there.

The transcript does not auto-scroll while it holds only the greeting, or landing on the page would scroll past it to the end of the card list.

Until the cards existed, the catalogue was discoverable only by asking — and the prompts refused to answer. `SELECT_TALK_PROMPT` used to say "Never list every agreement. Name at most three", and "Show me the full list of templates" was answered with a refusal — naming three of eleven leaves the user believing Prelegal drafts three documents. Listing all of them is now the stated exception to the brevity rule. `SELECT_PROMPT` gained the matching rule: "what are my options?" is a question, not a choice, and used to open an NDA on whoever asked it. Both still matter with the cards on screen, because the conversation has to agree with what the page shows.

While no document is open, choosing substitutes for the extraction call rather than adding to it. Once one is open, `reconsider()` asks the same question again on every turn, so that "actually, make it a pilot agreement" changes the document instead of being answered as an NDA question — it used to be answered as an NDA question 3 times in 3. It reads the same transcript as the extraction and needs nothing from it, so the two run together under `asyncio.gather`: three calls, still two round trips, and the 5–7 second figure below still holds.

A change of agreement discards that turn's extracted fields — they are keyed to the schema being left behind — and the browser starts the new document empty. `reconsider()` returns None when the choice names the document already open, which is what keeps a normal turn normal. Measured three runs each: asked to change, 9 switches in 9 across three phrasings; carrying on, 6 in 6 with no false switch, including a message that mentioned another agreement in passing. The one case that is not solid is asking mid-conversation for a document Prelegal cannot draft — see Known defects.

Every agreement's Standard Terms are prerendered at build time, all eleven of them. The page is statically exported, so there is no server left by the time the user picks one.

**The drafting chat** (`/api/chat`) is stateless. The browser owns the agreement and sends the transcript plus the current fields every turn; the reply carries only the fields that turn learned, and `applyUpdates` in `frontend/src/lib/chat.ts` merges them. That is deliberate: a reply can then never overwrite a field edited in the form while the message was in flight. `applyUpdates` also drops values the model gets wrong — a `governingLaw` that is not a US state is discarded rather than written into the document, which is how an observed "Delphi" for Delaware stayed out.

Two behaviours to expect rather than treat as bugs: a turn takes roughly 5–7 seconds with no streaming, and the assistant still paraphrases its way into re-asking a settled field about one turn in eight.

**Tests**: `cd backend && uv run pytest` (155), `cd frontend && npm test` (86). Run `npm run lint` too — it catches React issues the build does not.

jsdom cannot see everything the browser can. The composer's caret used to be restored with `setTimeout(..., 0)`, which in Chrome fires about 5ms *before* React's re-render clears the textarea's `disabled` attribute, so `focus()` was silently dropped on every turn — the caret sat on `<body>` and the next answer had to start with a mouse click. Every jsdom test of it passed throughout, because Testing Library's `act` flushes the render first. It is a `useEffect` on `pending` now, which is ordered against the render by React rather than by luck. Anything else in this class needs a real browser to test.

**Gotchas**

- Docker build context is the repo root, not `frontend/`. The frontend reads `../templates/*.md` and `../schemas/*.json` while pages are generated, and the backend reads `schemas/` at import, so **both** stages need `schemas/` copied in and the backend stage sets `PRELEGAL_SCHEMAS_DIR`.
- `.ps1` scripts need PowerShell, `.sh` need Bash. In Git Bash on Windows, `./scripts/start-linux.sh` works fine.
- The start scripts need the Docker daemon already running, and do not say so. With Docker Desktop closed they fail with a raw `failed to connect to the docker API at npipe:...` from the CLI, which reads like a broken install rather than "start Docker". Worth a preflight check in the scripts.
- Windows PowerShell 5.1 turns native stderr into terminating errors, so the `.ps1` scripts check `$LASTEXITCODE` instead of setting `$ErrorActionPreference = "Stop"`. Keep it that way — `docker compose` writes progress to stderr.
- `.gitattributes` pins `.sh` to LF. A CR would break the shebang on mac and Linux.
- Async backend tests need `@pytest.mark.anyio`; the `anyio_backend` fixture that makes it work lives in `backend/tests/conftest.py`. There is no pytest-asyncio.
- `httpx2` is the HTTP client, and the import name is `httpx2`, not `httpx`. It is a runtime dependency now, not just a test one.

**Cover pages are generated for ten of the eleven.** Only `mutual-nda-coverpage.md` exists in `templates/`; Common Paper ships the others separately and they are not in this repo. Each other agreement's field set is therefore derived from the Variables its Standard Terms already mark up — the `keyterms_link`, `coverpage_link`, `orderform_link` and `businessterms_link` spans — which is the only statement here of what its cover page must carry. The wording around those fields is Prelegal's, not Common Paper's.

**Not built yet**: real authentication and persistence. The conversation is not persisted either — a reload starts a fresh chat, though the document is equally lost, so the two agree. All of this is PL-7's ground.

**Known defects**, found but not fixed, both reproduced:

- **Loading `/app/` directly signs you out.** A reload, a bookmark or a pasted link bounces to `/` even with a valid session. `RequireSession` reads `useSyncExternalStore`'s *server* snapshot — null — on the hydration commit, and its `useEffect` redirects before the client snapshot arrives. Signing in normally works because that is a client-side navigation with no hydration. Any client-side session check on a statically exported page has this shape, so PL-7's real sessions have to solve it rather than inherit it.
- **Asking mid-conversation for a document Prelegal cannot draft is unreliable.** `reconsider()` mostly returns a nearest match, but the model sometimes answers that the nearest match is the agreement already open, which is filtered out and the assistant carries on as if nothing was asked. The same request *before* a document is open is handled properly by `select_document`. Phrasing-sensitive, so measure over several runs before believing any change to it.
