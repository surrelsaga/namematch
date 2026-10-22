# Handoff: Block C (Server)

## Done
- `src/server/app.ts`: every route in PLAN section 5: health, create session (analyze runs in the background), `GET` with `?after=`, generate (`202`), feedback (`202`).
- In-memory session store, a per-session logger with increasing `i`, a background job runner that never crashes the server, and `409` when the session is busy or not ready for that step.
- Failed job → `status: 'error'`, `error` message, and a `warn` log line.
- zod validation of request bodies (`400`), body size limit (`413`), unknown session (`404`).
- `src/server/index.ts` serves the built `web/dist` with an SPA fallback.
- Tests (`src/server/app.test.ts`, using the real stubs): full create → generate → feedback flow, `409` while busy, error path, bad input.
- Checked end to end with curl against `pnpm start` (stubs, with tlds so the variant cards show up).
- `pnpm check` passes.

## Not done
- Session eviction or TTL (not needed yet).
- No contract changes needed. `CONTRACT_CHANGES.md` was not created.

## Decisions
See "Block C decisions" in `NOTES.md`. In short: status is the busy flag; log `i` starts at 1; feedback adds new cards to the front and appends the chat; errors show the thrown message as is; `web/dist` is served whenever it exists.

## For other blocks
- **A:** `refineNames` should return only the new round's cards (the server adds them to the front). Throw errors with plain messages, because users see them.
- **B:** `readSource` errors ("repo not found or private", …) reach the user as is through `session.error`.
- **D:** poll `GET /api/sessions/:id?after=<last i>`. While analyzing, the `409` from generate/feedback means "wait". After a feedback POST, the user's chat turn shows up right away.
- **E:** the start script runs from the repo root (static paths are relative to the working directory).
