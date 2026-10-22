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
