# Handoff: Block E (Sentry + deploy)

## Done
- `instrument.mjs`: `Sentry.init` with `SENTRY_DSN` and `tracesSampleRate: 1.0`, skipped when the DSN is empty. Preloaded in `pnpm dev` and `pnpm start`.
- `@sentry/node` 11.8.0 and `@mastra/observability` 1.21.0 installed. Workflow, agent, model and fetch (Google API, RDAP, GitHub) spans reach Sentry. Polling and health `GET`s are not traced.
- `pnpm build && pnpm start` work from the repo root with `NODE_ENV=production`: they serve `web/dist` with the SPA fallback, use `PORT` from the env, and start without a `.env` file or a DSN.
- One full live flow with Sentry on: `fixtures/log-tool.md`, one feedback round, 605 s. Facts are in `SENTRY_NOTES.md`.
- No prompts, agents, workflows or server code changed.

## Not done
- Render service and the `nammit.tech` domain. Settings: build `pnpm install --prod=false && pnpm build`, start `pnpm start`, health check path `/api/health`, env vars from PLAN section 10 plus `NODE_ENV=production`. Leave `PORT` unset, Render sets it.
- The "full flow at nammit.tech" half of done-when (needs the deploy).

## Decisions
See NOTES.md, "Block E decisions".

## Verification (2026-10-22)
| Check | Result |
|---|---|
| `pnpm check` | pass |
| `NODE_ENV=production PORT=3999 pnpm start` | `/api/health` → `{"ok":true}`, `/` and `/some/route` → index.html, `/api/nope` → JSON 404 |
| start with no `.env` and no DSN | starts, health OK |
| `pnpm dev` | server on 3000 + Vite on 5173, health OK |
| full flow with Sentry | 3 traces (analyze, generate, feedback). Workflow, agent, chat and http.client spans all present, with tokens on chat/agent spans |
| `GET /api/*` filter | health and poll `GET`s not sent; `POST /api/sessions` and `GET /*` still sent |
