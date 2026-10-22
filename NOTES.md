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

## Block B decisions
- **`registerUrl`:** Porkbun search, `https://porkbun.com/checkout/search?q=<domain>`. Checked live: the page renders the searched domain on the server. Namecheap's search URL returns 403 to non-browser clients, so I couldn't check it and didn't use it.
- **`checkDomains` keys** are the names exactly as passed in. Lookups use `normalizeName(name)`, so `"Get Rydo"` → `getrydo.dev`. A name that isn't domain-friendly gets `[]`. Duplicate tlds are deduped.
- **Concurrency:** one global limit of 4 lookups across all sessions, not per call.
- **Cache:** in memory, keyed by domain, holds the in-flight promise so the same domain is never fetched twice at once. `unknown` results aren't cached, so the next round retries them. No TTL (see the `ponytail:` comment).
- **GitHub:** 2 API calls per repo (repo info + README). `package.json` / `pyproject.toml` / `Cargo.toml` come from `raw.githubusercontent.com` on the default branch, which doesn't count against the 60/hour unauthenticated limit. README is capped at 8k chars and each manifest at 1.5k, then the total is trimmed to 12k.
- **URL parsing** also accepts `github.com/owner/repo` without `https://`, `www.`, and a trailing `.git`.
- **Error messages** (shown as is in `session.error`): "Not a GitHub repo URL, expected https://github.com/owner/repo", "Repo not found or private", "GitHub rate limit hit, try again later", "Couldn't reach GitHub, try again later", "The .md text is empty".
- **Live checks:** `pnpm tsx --env-file=.env scripts/check-lookups.ts`. I didn't add a package.json script because package.json is Step 0's file.

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

## Block D decisions
- **What the UI expects from Block C**: error responses are JSON `{ error: string }` (shown as is); feedback appends the user `ChatTurn` and the agent reply to `session.chat`; refined cards are put in front of `session.cards`; `generate` is allowed again from `error` when there are no cards yet (the inputs card unlocks for a retry).
- **Primitives:** `web/src/ui/index.tsx` holds the 5 primitives in one file. `Input` has a `TextArea` sibling for the .md paste box. Badges and pills use a 2px border (3px looked too heavy at that size); everything else is 3px.
- **Inputs card** stays visible after "Name it", read-only, showing `session.inputs` (so tld changes from feedback show up). Picking a third feel drops the oldest one.
- **No reload persistence:** a page reload starts over. Add `#<sessionId>` in the URL if that turns out to matter.
- **Desktop layout (feedback round):** two columns from `lg` (1024px). Left: header, source, inputs, results. Right (`aside`, 28rem, 34rem from `2xl`): logs on top, chat under it, sticky at `top-6` with height `100dvh - 3rem`, each panel half the height and scrolling inside itself; the chat form sits at the bottom of its panel. The header moved into the left column because above the grid it pushed the sticky column's bottom (the chat input) off screen at scroll 0. Below `lg` everything stacks: source, inputs, results, logs, chat (panels capped at 60vh).
- **Logs and chat always render,** with empty-state hints before a session or names exist. The chat input is disabled until there are cards.
- **Sizes:** body is 18px. `Badge` has a `big` prop for domain pills (Tailwind can't reliably override its padding/size through `className`). Available pills end in a black "register →" tag so the link reads as clickable. Name cards fill the column with `auto-fill, minmax(20rem, 1fr)`: 2 per row at 1280/1440, more on wider screens.
- **Log rows on phones** put the agent badge above the sentence; side by side the fixed-width badge left the text a narrow strip.

## Block A decisions
- **Logger:** passed through the Mastra request context (`requestContext.set('log', log)` in `run.ts`, read with `getLog()` in `workflows/common.ts`). Each run gets its own context, so concurrent sessions don't mix logs. Runs started from Studio have no logger and print to the console.
- **No workflow snapshots:** `run.ts` creates runs with `shouldPersistSnapshot: () => false`. With no storage configured, Mastra falls back to an in-memory store that would otherwise keep every run. Studio runs still persist (handy for inspecting them).
- **Agent models resolve per call** (`model: () => getModel(tier)`), so importing agents never needs env vars (tests, Studio build).
- **Supervisor is one agent with three task prompts** (analyze / plan / pick). Each task's rules and examples live in the step's prompt, not in the agent instructions.
- **Plan is enforced in code:** the namers are always exactly `inputs.feels`. Extra feels the model plans are dropped, and a chosen feel it leaves out gets an even share. Counts are capped at 10.
- **Namer failure is not fatal:** a namer that fails after its retry logs a `warn` and returns `[]`. The pick step fails the job only if no namer returned anything. Supervisor and feedback failures fail the job (the server shows the error).
- **Pick step guards:** dedupe (case-insensitive) and remove `avoid` words in code before the model sees the list. Picks the model made up are ignored, and if it picks fewer than 5, the rest are filled from the pool (with `meaning` as `whyItFits`).
- **Domain check:** names go through `normalizeName` before `checkDomains`. A card keeps its display name, and names that can't be domains get `domains: []`. "Nothing available" means no `available` result, so all-`unknown` names also get variants. At most one variant card per stuck name (the first suggestion with a free domain), placed right after its original. It copies the original's `from`/`meaning`/`whyItFits` and sets `variantOf`. Lookups go in rounds (every name's 1st suggestion, then the 2nd for names still stuck, and so on) with at most 6 lookups per round. The first live run showed 3 variants per name crowding the list and using up the cap on the first two names. A domain checker failure logs a `warn` and skips variants.
- **`alreadyUsed`** is always `[]` for namers, because `generateNames` has no previous cards in its signature. The feedback agent gets every name shown so far, and exact repeats it returns are dropped.
- **Feedback `tlds`** replaces `inputs.tlds` and is returned as the new `inputs`. `refineNames` returns only the new round's cards, as in the stub.
- **Feedback chat:** if the last `chat` turn is the same user message, it isn't repeated in the prompt. Block C can push the user turn either before or after calling.
- **Retries:** every workflow has `retryConfig: { attempts: 2, delay: 8000 }`, so a failed step runs up to twice more, 8 s apart. Google returned 503 "high demand" in both live trials, and one retry after 5 s was not enough. Namers catch their own errors (see above), so they don't use this. `run.ts` always throws a real `Error` with a readable message (Mastra can hand back a plain object).
- **Live trial (`scripts/try-agents.ts`)** was run with Block B's real `src/sources` + `src/domains` checked out into the working tree and not committed. With the stubs, all three repo fixtures read as the same fake text.

## Integration decisions
- **Merge:** `lookups` → `server` → `web` → `agents` on the `integration` branch. Every block's NOTES section is kept. `src/domains` and `src/sources` are Block B's real versions.
- **`whyItFits` contract change applied** (see `CONTRACT_CHANGES.md`, Done). `refine-names.ts` validates with `FeedbackOutputSchema` directly.
- **Mock API removed:** `web/mock-api.ts` is gone. The Vite `/api` proxy and the server both use `PORT || 3000`, so an empty `PORT=` still works.
- **Server tests** fake `src/mastra/run` in `app.test.ts` (short pause, fixed cards) now that `run.ts` calls real models. They never hit the network.
- **API backoff in `generateJson`:** a 429/500/502/503/504 from the model API is retried up to 3 times. On a 429 it waits for the `retryDelay` Google sends (+1 s), otherwise 8 s, 16 s, 24 s, capped at 60 s. The workflow `retryConfig` stays as the outer layer. Why: in the first live browser run, Google's free tier returned 429 (`GenerateContentInputTokensPerModelPerMinute-FreeTier`, 16k input tokens/min per model, "retryDelay": "46s") and 500s. The 8 s step retries burned all their attempts inside the same quota minute, and the namer gave up ("The namers did not come up with any names").
- **Free tier is the bottleneck:** a single session can trip the 16k tokens/min limit on `gemma-4-31b-it`, and 500s from that model are frequent. Expect multi-minute steps on the free tier. A paid key or a lower-traffic model would help more than code changes.
