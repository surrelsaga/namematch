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

## Block A decisions
- **Logger:** passed through the Mastra request context (`requestContext.set('log', log)` in `run.ts`, read with `getLog()` in `workflows/common.ts`). Each run gets its own context, so concurrent sessions don't mix logs. Runs started from Studio have no logger and print to the console.
- **No workflow snapshots:** `run.ts` creates runs with `shouldPersistSnapshot: () => false`. With no storage configured, Mastra falls back to an in-memory store that would otherwise keep every run. Studio runs still persist (handy for inspecting them).
- **Agent models resolve per call** (`model: () => getModel(tier)`), so importing agents never needs env vars (tests, Studio build).
- **Supervisor is one agent with three task prompts** (analyze / plan / pick). Each task's rules and examples live in the step's prompt, not in the agent instructions.
- **Plan is enforced in code:** the namers are always exactly `inputs.feels`. Extra feels the model plans are dropped, and a chosen feel it leaves out gets an even share. Counts are capped at 10.
- **Namer failure is not fatal:** a namer that fails after its retry logs a `warn` and returns `[]`. The pick step fails the job only if no namer returned anything. Supervisor and feedback failures fail the job (the server shows the error).
- **Pick step guards:** dedupe (case-insensitive) and remove `avoid` words in code before the model sees the list. Picks the model made up are ignored, and if it picks fewer than 5, the rest are filled from the pool (with `meaning` as `whyItFits`).
- **Domain check:** names go through `normalizeName` before `checkDomains`. A card keeps its display name, and names that can't be domains get `domains: []`. "Nothing available" means no `available` result, so all-`unknown` names also get variants. Variant cards come right after their original, copy its `from`/`meaning`/`whyItFits`, and set `variantOf`. At most 6 variant lookups per round. A domain checker failure logs a `warn` and skips variants.
- **`alreadyUsed`** is always `[]` for namers, because `generateNames` has no previous cards in its signature. The feedback agent gets every name shown so far, and exact repeats it returns are dropped.
- **Feedback `tlds`** replaces `inputs.tlds` and is returned as the new `inputs`. `refineNames` returns only the new round's cards, as in the stub.
- **Feedback chat:** if the last `chat` turn is the same user message, it isn't repeated in the prompt. Block C can push the user turn either before or after calling.
