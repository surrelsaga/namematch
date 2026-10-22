# Handoff: Block C (Server)

## Done
- `src/server/app.ts`: every route in PLAN section 5: health, create session (analyze runs in the background), `GET` with `?after=`, generate (`202`), feedback (`202`).
- In-memory session store, a per-session logger with increasing `i`, a background job runner that never crashes the server, and `409` when the session is busy or not ready for that step.
- Failed job → `status: 'error'`, `error` message, and a `warn` log line from `system`.
- zod validation of request bodies (`400`), 100 KB body limit (`413`), unknown session (`404`).
- `src/server/index.ts` serves the built `web/dist` with an SPA fallback, plus a JSON `404` for unknown `/api/*` paths.

## Verification (2026-10-22, against the Step 0 stubs)
| Check | Result |
|---|---|
| `pnpm check` | pass: typecheck, 9 tests (5 server route tests, 33 assertions), build |
| `pnpm dev` + curl: health | `{"ok":true}` |
| create session, github (`https://github.com/sharkdp/bat`) | `{sessionId}` → `needs-inputs`, label `sharkdp/bat` |
| create session, markdown (`logr.md`) | `{sessionId}` → `needs-inputs`, label `logr.md` |
| poll with `?after=` | `after=2` returned only lines 3–10; `after=10` right after generate returned `[]`; after feedback returned only lines 11–14 |
| generate (tlds com, dev) | `202` → 6 cards incl. `getkast (variant of kast)` with domain results |
| feedback | `202` → 2 round-2 cards in front, chat `user` + `agent` turns, `you` log line |
| status flow | analyzing → needs-inputs → generating → ready → refining → ready (seen by polling) |
| unknown session | `404 {"error":"session not found"}` |
| bad body (bad url, not JSON, bad inputs, blank message) | `400` with the zod message |
| generate / feedback while generating | `409 {"error":"session is busy"}` |
| generate before analyze finished | `409` (also covered in vitest) |
| stub that throws | `status: "error"`, `error` = the thrown message, `warn` log line; `/api/health` and new sessions still work afterward |
| `pnpm build && pnpm start` | one port (3003): `/` HTML, `/assets/*.js` JS, `/some/route` → index.html, `/api/health` JSON, `POST /api/sessions` works, `/api/nope` → JSON 404 |
| files changed | only `src/server/*`, `NOTES.md`, `HANDOFF-C.md` |

## Skipped, mocked, guessed
- **Mocked:** for the curl error test, a throwing stub was made with a Node loader hook outside the repo (in the session scratchpad) that wraps `analyzeProject`, because the stubs never throw and stub files belong to other blocks. The vitest error test uses `vi.mock` on `../mastra/run` instead. Both mocks wrap the real stubs, and nothing in the repo has a test-only switch.
- **Guessed:** generate can run again from `ready` or `error` and replaces `cards` (the chat is kept). The markdown cap is 60k chars (the plan says ~50 KB). The feedback message cap is 2k chars. The thrown error message is shown to the user as is.
- **Skipped:** session eviction or TTL (sessions live until restart, marked `ponytail:` in `app.ts`). Real (non-stub) runs: they wait on Blocks A and B.
- No contract changes needed. `CONTRACT_CHANGES.md` was not created.

## Decisions
See "Block C decisions" in `NOTES.md`.

## For other blocks
- **A:** `refineNames` should return only the new round's cards (the server adds them to the front). Throw errors with plain messages, because users see them in `session.error`.
- **B:** `readSource` errors ("repo not found or private", …) reach the user as is.
- **D:** poll `GET /api/sessions/:id?after=<last i>` (`i` starts at 1). A `409` means wait. After a feedback POST, the user's chat turn shows up right away and the agent's turn arrives when the job is `ready`. `400`/`409`/`404` bodies are `{ error: string }`.
- **E:** the start script must run from the repo root (static paths are relative to the working directory). The server serves `web/dist` whenever it exists.
