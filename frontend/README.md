# Prelegal frontend

Next.js app for drafting pre-legal agreements. Currently home to the **Mutual
NDA creator** prototype (PL-3): fill in a short form, watch the agreement fill
in beside it, then download the finished document.

## Running locally

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000.

Other scripts: `npm run build` (production build), `npm start` (serve the
build), `npm run lint`.

## How the NDA is assembled

The agreement is built from the CC BY 4.0 [Common Paper](https://commonpaper.com)
templates in `../templates` (catalogued in `../catalog.json`) — that dataset is
the single source of truth for the wording:

- **Cover Page** — `src/components/NdaCoverPage.tsx` reproduces
  `templates/mutual-nda-coverpage.md` section by section, driven by typed form
  data rather than string substitution, so checkbox options and the two-party
  signature block render properly. Unanswered fields appear as the template's
  bracketed prompts, highlighted on screen.
- **Standard Terms** — `templates/mutual-nda.md` is read at build time
  (`src/lib/templates.ts`) and rendered verbatim by
  `src/components/StandardTerms.tsx`. That render happens on the server, so the
  markdown parser stays out of the client bundle.

Downloading uses a print stylesheet in `src/app/globals.css`: the **Download
NDA** button calls `window.print()`, app chrome is hidden, and the Standard
Terms begin on a fresh page. Choose *Save as PDF* in the print dialog.

## Layout

```
src/
  app/           layout, page (server: reads templates), global + print styles
  components/    NdaCreator (state + layout), NdaForm, NdaCoverPage, StandardTerms
  lib/           nda.ts (domain model), format.ts (dates, validation), templates.ts
```

## Not yet built

Persistence, authentication, the other agreement types in the catalogue, and
the planned FastAPI backend. Everything currently runs client-side; nothing is
sent anywhere.
