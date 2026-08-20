
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

The palette is defined as Tailwind tokens (`brand-navy`, `brand-blue`, `brand-purple`, `brand-yellow`, `brand-gray`) in `frontend/tailwind.config.ts`. **`frontend/src/lib/ui.ts` owns the app's look**: one `primaryButton`, one `input`, one `label`, one `card`, one `linkButton`. Change a role there, not in a component.

It exists because the same role had three answers: the primary button was `brand-navy` on sign-in and `slate-900` for Download and Send, and inputs focused to `brand-blue` in the chat composer but `slate-900` in the review form. Read as two products stitched together. If you add a component, import from `ui.ts` rather than writing the classes again — the first version of `ui.ts` claimed in its own docstring to have fixed those inconsistencies while four components still carried their own copies, which review caught.

`brand-purple` and `brand-gray` are still unused, and that is fine: an unused token beats a decorative one. The agreement itself is deliberately outside all of this — it keeps its paper look in both themes and in print, and takes its rules from `globals.css`.

## Current State

Implemented as of PL-7, merged to `main` as `41bab86` on 20 August 2026 (PR #8).

**Every ticket is Live and the backlog is empty** — PL-2 through PL-7, all merged. Anything from here is new work, so start by writing the ticket rather than looking for one.

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

- `/` sign-in and sign-up
- `/app` the agreement creator, behind sign-in. One route for all eleven; the document is picked from the opening catalogue or settled in conversation, can be changed at any point, and is switched client-side. `?open=<id>` reopens a saved one.
- `/documents` everything the signed-in user has drafted, behind sign-in
- `/api/health`, `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`
- `/api/chat` — **requires a bearer token**, being the one route that spends money per call
- `/api/documents` (POST, GET), `/api/documents/{id}` (GET), `/api/documents/{id}/fields` (PUT) — all require a bearer token

**Sign-in is real as of PL-7.** Passwords are hashed with `hashlib.scrypt` in `security.py` — standard library, no dependency — and verified on the way back in. Sign-in no longer registers an unknown email, and answers identically for a wrong password and an email it has never seen, so the errors cannot be used to find out who has an account.

A session is a row in `sessions`, not a column on the user, so signing in on a second device does not sign you out on the first. The token is opaque, never expires, and is sent as `Authorization: Bearer`; `dependencies.current_user` is the one place that resolves it. It is a plain `def`, which FastAPI runs in a threadpool, so it composes with the sync document routes and the async chat route without either knowing about the other.

What is deliberately not built: token expiry, rate limiting, password reset, email verification. The database is dropped on every restart, which ends every session anyway.

**Database** is dropped and recreated on every startup by the lifespan handler in `main.py`. Do not put anything in it that needs to survive a restart. Plain stdlib `sqlite3`, no ORM.

**The creator is chat-first, and now chooses the document too.** `/app` opens on the conversation and the catalogue, because which agreement is being drafted is itself something to talk about — but not something to guess at. A turn sent with a null `documentType` runs the choosing flow: it settles on one of the eleven, or — for something Prelegal cannot draft — says so and offers the nearest match, leaving `documentType` null until the user accepts. Once settled, the document appears beside the chat with the form folded into a collapsed "Review fields" panel. The form is not legacy — it is how a mishearing gets corrected without arguing with the assistant, and it is what keeps the page usable when there is no API key. Both write to the same `DocumentData` in `DocumentCreator`.

**The opening screen shows all eleven.** `Catalogue` in `DocumentChat.tsx` renders every agreement as a card — full `name`, not `shortName`, because this is where someone finds out what exists and "BAA" tells them nothing — and disappears once one is settled. Clicking opens the document immediately and then sends "I need a {name}." as an ordinary turn, so the conversation reads as though it had been typed and the assistant asks the first question. Opening before the round trip is deliberate: it is the only route into a document when `OPENROUTER_API_KEY` is absent, and the review form still works there.

The transcript does not auto-scroll while it holds only the greeting, or landing on the page would scroll past it to the end of the card list.

Until the cards existed, the catalogue was discoverable only by asking — and the prompts refused to answer. `SELECT_TALK_PROMPT` used to say "Never list every agreement. Name at most three", and "Show me the full list of templates" was answered with a refusal — naming three of eleven leaves the user believing Prelegal drafts three documents. Listing all of them is now the stated exception to the brevity rule. `SELECT_PROMPT` gained the matching rule: "what are my options?" is a question, not a choice, and used to open an NDA on whoever asked it. Both still matter with the cards on screen, because the conversation has to agree with what the page shows.

While no document is open, choosing substitutes for the extraction call rather than adding to it. Once one is open, `reconsider()` asks the same question again on every turn, so that "actually, make it a pilot agreement" changes the document instead of being answered as an NDA question — it used to be answered as an NDA question 3 times in 3. It reads the same transcript as the extraction and needs nothing from it, so the two run together under `asyncio.gather`: three calls, still two round trips, and the 5–7 second figure below still holds.

A change of agreement discards that turn's extracted fields — they are keyed to the schema being left behind — and the browser starts the new document empty. `reconsider()` returns None when the choice names the document already open, which is what keeps a normal turn normal. Measured three runs each: asked to change, 9 switches in 9 across three phrasings; carrying on, 6 in 6 with no false switch, including a message that mentioned another agreement in passing. The one case that is not solid is asking mid-conversation for a document Prelegal cannot draft — see the known defect below.

**The draft notice is part of the document, not the chrome.** `DRAFT_NOTICE` is rendered inside `DocumentCoverPage`, so it is on the page the user downloads and hands to the other side; chrome carries the same point in `AppShell`, but chrome does not travel. In print it drops its tint and keeps a border, because the tint does not survive a black-and-white printer. Verified by emulating print media: the notice renders, the header and the chat panel do not. It is not in `schemas/*.json` — it is identical for all eleven and is not something the drafting model should ever see, let alone rewrite.

**`AppShell`** gives both signed-in screens the same header, nav and notice. It owns identity and navigation only; a screen's own actions stay on the screen, which is why it takes an `actions` slot rather than a list of buttons.

Every agreement's Standard Terms are prerendered at build time, all eleven of them. The page is statically exported, so there is no server left by the time the user picks one.

**The drafting chat** (`/api/chat`) is stateless. The browser owns the agreement and sends the transcript plus the current fields every turn; the reply carries only the fields that turn learned, and `applyUpdates` in `frontend/src/lib/chat.ts` merges them. That is deliberate: a reply can then never overwrite a field edited in the form while the message was in flight. `applyUpdates` also drops values the model gets wrong — a `governingLaw` that is not a US state is discarded rather than written into the document, which is how an observed "Delphi" for Delaware stayed out.

Two behaviours to expect rather than treat as bugs: a turn takes roughly 5–7 seconds with no streaming, and the assistant still paraphrases its way into re-asking a settled field about one turn in eight.

**Two kinds of API call, and the difference matters.** `frontend/src/lib/api.ts` has `request`, which carries the session and reads a 401 as the session ending, and `anonymous`, which is for the two calls made in order to *get* a session and never sends one. Keeping them apart is not tidiness: when sign-in sent the stored token along, a wrong password came back 401 exactly like a rejected token, so anyone mistyping their password on a machine that was already signed in signed the existing user out. Add a new endpoint to `request` unless it is something you call before you have a session.

No call site attaches a token itself. Forgetting would look like a bug in the feature rather than in the plumbing.

**Documents save themselves.** `useAutosave` creates the record when an agreement is settled and rewrites it once the fields have been quiet for 800ms. There is no Save button on purpose: a draft that was filled in, downloaded and closed should still be in the list, and a Save button is the thing people do not press. `/documents` lists them; opening one goes to `/app?open=<id>`, which resumes that same row rather than forking a second.

Only `documentType` and the raw `data` are stored. `withToday` stays out of it — it fills empty required dates for display from the viewer's clock, and freezing that at save time would turn a date nobody chose into one they did.

The query string is read through the same no-op-subscribe idiom as the clock, **not** `useSearchParams`. That hook forces the page under a `<Suspense>` boundary: without one a statically prerendered page builds fine in development and fails the production build.

**Tests**: `cd backend && uv run pytest` (208), `cd frontend && npm test` (110). Run `npm run lint` too — it catches React issues the build does not, and on PL-7 it caught two real ones: `setState` inside an effect cascades renders, and a ref must not be written during render.

**The direct-load redirect is fixed.** `/app` used to bounce a signed-in user to the sign-in screen on a reload, a bookmark or a pasted link. `RequireSession` redirected whenever the session read as null, which during the hydration commit it always does — the store's server snapshot is null by definition. Hydration is now tracked as its own store, so "nobody is signed in" is distinguishable from "we have not looked yet". Any client-side session check on a statically exported page has this shape; keep the two apart.

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

**Not built yet**: the conversation is still not persisted — a reload starts a fresh chat, though the transcript is the disposable part and the validated fields are the artefact that is kept.

**Known defect**, reproduced and not fixed:

- **Asking mid-conversation for a document Prelegal cannot draft is unreliable.** `reconsider()` mostly returns a nearest match, but the model sometimes answers that the nearest match is the agreement already open, which is filtered out and the assistant carries on as if nothing was asked. The same request *before* a document is open is handled properly by `select_document`. Phrasing-sensitive, so measure over several runs before believing any change to it.
