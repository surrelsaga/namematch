# Notes

## Step 0 decisions
- **Model wiring:** `models.ts` returns the Mastra model-router string `google/<id>` (reads `GOOGLE_GENERATIVE_AI_API_KEY`), or an AI SDK Ollama model (`ollama-ai-provider-v2`) when `MODEL_PROVIDER=ollama`. The Ollama path is untested (no local Ollama).
- **Studio:** `pnpm mastra:dev` runs on port 4111 (`PORT=4111` inline) because `.env` has `PORT=3000`, which is the API server's port.
- **pnpm:** `pnpm-workspace.yaml` allows the esbuild build script (pnpm 12 blocks it otherwise).
- **Mastra instance:** `src/mastra/index.ts` is empty on purpose. Block A registers agents and workflows.
- **Stubs:** live in `src/mastra/run.ts`, `src/domains/index.ts`, `src/sources/index.ts`. `normalizeName` already follows section 6; Block B can keep or replace it. Fake domain rules: `.com` taken, `kast` taken everywhere, `zipr.ai` unknown, everything else available. `generateNames` adds one `getkast` variant card when domains are chosen, so `variantOf` can be tried in the UI.
- **`refineNames` stub returns only the new round's cards** (not the whole list). Block C puts them in front of `session.cards`. Block A: keep this unless Daniel says otherwise.
- **Extra schemas (additive, types.ts unchanged):** `PickResultSchema` = `{ picks: Pick[], dropped: string }` so the supervisor can return the "what was dropped" sentence for the log; `PicksSchema` is the plain `Pick[]`. `AnalyzeOutputSchema`, `VariantsSchema`, `FeedbackOutputSchema` as in section 4.
- **`generateJson`** takes the agent's final `text`, strips fences and surrounding chatter, zod validates, retries once with the error appended.
- **Logger:** stubs take it as an argument. Block A decides Mastra request context vs closure and notes it here.

## Observed
- First sanity run: Google rejected the key in `.env` ("API key not valid"); after Daniel updated it, all 3 checks pass.
- Latency: a tiny JSON call took ~11 s on `gemma-4-26b-a4b-it` (fast) and ~84 s on `gemma-4-31b-it` (main) in one run. Block A should expect slow supervisor calls and the UI needs the spinner row.

## Block C decisions
- **Busy flag = session status.** `analyzing`, `generating` and `refining` count as busy and return `409`. No separate flag.
- **Logs:** `i` starts at 1, so `?after=0` (or no `after`) returns every line.
- **Generate** needs a read profile (`409` otherwise) and is allowed again from `ready` or `error`; it replaces `cards`. **Feedback** needs cards (`409` otherwise). The round is the highest card round + 1, new cards go in front, the user's message is logged as actor `you`, and the user's chat turn is added right away (the agent's reply is added when the job finishes). `chat` passed to `refineNames` is the history *before* the current message.
- **Errors:** a failed job sets `status: 'error'` and puts the thrown message in `error` plus a `warn` line from `system`, so Block A/B errors should be plain sentences. The process never crashes on a failed job.
- **Limits:** request body is capped at 100 KB (`413`), markdown text at 60k chars, feedback message at 2k chars. Bad bodies → `400` with the zod message.
- **Static:** `src/server/index.ts` serves `web/dist` (with an `index.html` fallback) whenever `web/dist/index.html` exists, without checking `NODE_ENV`. In dev, Vite on its own port still handles the UI.
- **Sessions are never evicted** (marked `ponytail:` in `app.ts`). Add a TTL sweep if memory becomes a problem on Render.
