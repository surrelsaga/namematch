# Handoff: Block B (Domain + source lookups)

## Done
- `src/domains/index.ts`: real `normalizeName` and `checkDomains`. RDAP on the 5 TLDs (200 → taken, 404 → available, anything else or a 5 s timeout → unknown), max 4 lookups at once (global), in-memory cache, Porkbun `registerUrl` only when the domain is available.
- `src/sources/index.ts`: real `readSource`. GitHub reads repo info (description, topics, language), README, and `package.json` / `pyproject.toml` / `Cargo.toml`. Markdown is passed through trimmed. Text is trimmed to 12k. Clear error messages.
- Signatures are unchanged from section 4. No contract changes.

## Verification (2026-10-22)
All run live from this worktree.

1. **`pnpm check`** passes: typecheck, 19 tests in 5 files, build.
2. **`scripts/sanity.ts`**: with `--env-file=.env` all 3 checks pass (`get.tech taken, nammit-17cadl1xrc.tech available (1419 ms)`). Without `--env-file`, the RDAP and GitHub checks pass and the Gemma check fails with "MODEL_ID is not set". That only means the env wasn't loaded; it isn't a Block B issue.
3. **Real `checkDomains` on all 5 TLDs** (`scripts/check-lookups.ts`):

   | tld | google | xqzvplm7nammit |
   |---|---|---|
   | com | taken | available |
   | dev | taken | available |
   | app | taken | available |
   | tech | taken | available |
   | ai | taken | available |

   10 lookups in ~1.2 s. Register links only on available domains, e.g. `https://porkbun.com/checkout/search?q=xqzvplm7nammit.dev`.
   **Slow or failing servers:** a local server that accepts the connection and never answers → `unknown` in 5002 ms. A refused connection → `unknown` in 1 ms.
4. **Concurrency and cache:** 20 new domains at once peaked at exactly 4 in flight. Repeating the google/xqzvplm7nammit call made 0 new requests (0 ms). The unit tests also check that the same domain requested twice at once is fetched once, and that `unknown` is not cached.
5. **`normalizeName` on messy input:**

   | input | output |
   |---|---|
   | `'  My Cool  App  '` | `mycoolapp` |
   | `'ROCKET🚀ship'` | `rocketship` |
   | `'🚀🚀'` | null |
   | `'Café Olé'` | `cafeole` |
   | `'C++ & Co.'` | `cco` |
   | `'get_rydo-HQ'` | `getrydo-hq` |
   | `'-dash-'` | null |
   | `''` | null |
   | `'x'` | null |
   | 46-char sentence | null (over 30) |

   Fixed during verification: accented letters used to be dropped entirely (`Café Olé` → `cafol`). They now keep the base letter.
6. **`readSource`:**

   | source | label | chars | title | summary line |
   |---|---|---|---|---|
   | cli repo | sharkdp/bat | 9685 | # sharkdp/bat | Description: A cat(1) clone with wings. |
   | webapp repo | excalidraw/excalidraw | 9444 | # excalidraw/excalidraw | Description: Virtual whiteboard for sketching hand-drawn like diagrams |
   | library repo | colinhacks/zod | 9015 | # colinhacks/zod | Description: TypeScript-first schema validation with static type inference |
   | log-tool.md | log-tool.md | 333 | # Logs, but readable | A command line tool for developers that tails application logs and groups |
   | todo-app.md | todo-app.md | 340 | # Plan My Day | A tiny web app that turns a messy to-do list into a realistic plan for the day. |

   Errors: bad URL → "Not a GitHub repo URL, expected https://github.com/owner/repo"; missing/private repo → "Repo not found or private"; empty .md → "The .md text is empty".
7. **Files changed:** `src/domains/*`, `src/sources/*`, `scripts/check-lookups.ts` (named as Block B's script in section 11), `NOTES.md`, `HANDOFF-B.md`. Nothing else.
8. **Tests:**
   - `src/domains/index.test.ts`: normalizeName (basic + messy), status mapping and register links, no lookups for empty tlds or bad names, cache + unknown retry, in-flight dedupe, peak of 4, and a real hanging local server → unknown in 5 s.
   - `src/sources/index.test.ts`: markdown trim and empty error, both .md fixtures, combining info/README/manifests, the 12k cap with a huge README, URL parsing, and the not-found / rate-limit / network errors.
   - Live: `pnpm tsx --env-file=.env scripts/check-lookups.ts` prints the tables above.

## Skipped, mocked or guessed
- **Mocked:** all unit tests replace `fetch`. The timeout test uses real `fetch` and a real 5 s timer against a local server; only the URL is swapped. It adds ~5 s to `pnpm test`.
- **Not triggered live:** the GitHub rate-limit error (403 with `x-ratelimit-remaining: 0`, or 429). It's covered by a unit test only.
- **Not tested live:** a private repo. GitHub returns 404 for private repos without access, the same as a missing one, so the error message is the same.
- **Guessed:**
  - GitHub's rate-limit signals follow GitHub's docs and weren't observed live.
  - Registrar choice: Porkbun's search page was checked live to show the domain. Namecheap's was not usable (403 to scripts).
- **No TTL on the domain cache.** Fine for a single server process; add one if it runs for weeks.
- **Slow worst case:** with every RDAP server hanging, a call takes ceil(lookups / 4) × 5 s. Example: 10 names × 5 tlds = 50 lookups ≈ 65 s.

## Decisions
See "Block B decisions" in `NOTES.md`. Short version: Porkbun for register links, `checkDomains` result keys are the input names (lookups use the normalized name), manifests come from raw.githubusercontent to save API quota.

## For other blocks
- **Block C:** `readSource` throws `Error`s whose messages are meant for the user. Put `e.message` in `session.error` as is.
- **Block A:** `checkDomains` never throws (network failures become `unknown`). It returns `[]` for names `normalizeName` rejects, so filter those out or treat them as "no domain".
