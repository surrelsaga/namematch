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

## Block D decisions
- **Testing without Block C:** the Step 0 server only has `/api/health`, so `web/mock-api.ts` is a Vite dev plugin that fakes the section 5 API on top of the Step 0 stubs. Run `MOCK_API=1 pnpm exec vite --config web/vite.config.ts`. Off by default; the normal `/api` proxy is untouched. Delete it once Block C is merged.
- **What the UI expects from Block C** (the mock does the same): error responses are JSON `{ error: string }` (shown as is); feedback appends the user `ChatTurn` and the agent reply to `session.chat`; refined cards are put in front of `session.cards`; `generate` is allowed again from `error` when there are no cards yet (the inputs card unlocks for a retry).
- **Primitives:** `web/src/ui/index.tsx` holds the 5 primitives in one file. `Input` has a `TextArea` sibling for the .md paste box. Badges and pills use a 2px border (3px looked too heavy at that size); everything else is 3px.
- **Inputs card** stays visible after "Name it", read-only, showing `session.inputs` (so tld changes from feedback show up). Picking a third feel drops the oldest one.
- **No reload persistence:** a page reload starts over. Add `#<sessionId>` in the URL if that turns out to matter.
