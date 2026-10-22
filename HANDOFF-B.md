# Handoff: Block B (Domain + source lookups)

## Done
- `src/domains/index.ts`: real `normalizeName` and `checkDomains`. RDAP on the 5 TLDs (200 → taken, 404 → available, anything else or a 5 s timeout → unknown), max 4 lookups at once (global), in-memory cache, Porkbun `registerUrl` only when the domain is available.
- `src/sources/index.ts`: real `readSource`. GitHub reads repo info (description, topics, language), README, and `package.json` / `pyproject.toml` / `Cargo.toml`. Markdown is passed through trimmed. Text is trimmed to 12k. Clear error messages.
- Tests: `src/domains/index.test.ts` (normalizeName, status mapping, register links, cache, concurrency limit) and `src/sources/index.test.ts` (markdown, combining, URL parsing, error paths), all with mocked fetch.
- `scripts/check-lookups.ts`: live checks. Run with `pnpm tsx --env-file=.env scripts/check-lookups.ts`. Last run all passed: `get.*` taken and a random name available on all 5 TLDs, cached repeat in 0 ms, all 3 fixture repos read (bat: README + Cargo.toml, excalidraw and zod: README + package.json), missing repo → "Repo not found or private".
- `pnpm check` passes.

## Not done
- No TTL on the domain cache. Fine for a single server process; add one if it runs for weeks.
- The rate-limit message is covered by a unit test only, not triggered live.

## Decisions
See "Block B decisions" in `NOTES.md`. Short version: Porkbun for register links, `checkDomains` result keys are the input names (lookups use the normalized name), manifests come from raw.githubusercontent to save API quota.

## For other blocks
- Signatures are unchanged from section 4. No contract changes.
- **Block C:** `readSource` throws `Error`s whose messages are meant for the user. Put `e.message` in `session.error` as is.
- **Block A:** `checkDomains` never throws (network failures become `unknown`). It returns `[]` for names `normalizeName` rejects, so filter those out or treat them as "no domain".
