# Handoff: Block D (Web UI)

## Done
- One-page UI per section 9: Source card (GitHub URL / .md upload or paste, 50 KB check, URL check), Inputs card (summary, kind/feel/audience chips, keep/avoid, tld toggles, "Name it"), Results (cards grouped by round, newest first: big mono name, namer badge, meaning, why it fits, domain pills mint/grey/yellow with register links, "variant of X"), feedback chat, Logs panel (colored actor badges, auto-scroll, spinner row; beside results on desktop, below on mobile).
- Style: neo-brutalist tokens in `web/src/index.css`, Space Grotesk + Space Mono, 5 primitives in `web/src/ui/index.tsx`, button press shift.
- `web/src/useSession.ts` is the only poller: `?after=<last i>`, every 1 s while analyzing/generating/refining, 5 s otherwise; merges new log lines only.
- `web/mock-api.ts`: dev-only fake API on the Step 0 stubs (`MOCK_API=1`) so the UI runs alone.
- Tests: `web/src/lib.test.ts` (feel toggle, list split, log merge). `pnpm check` passes.
- Click-through checked in headless Chrome at 1280px and 390px: GitHub flow → inputs → generate with tlds → results → feedback round 2, plus the markdown paste flow and the bad-URL message. No console errors, no horizontal scroll at phone width.

## Not done
- Not run against Block C's real server yet (it isn't merged). The expectations it must meet are in NOTES.md under "Block D decisions".
- Not tested on a real phone, only a 390px headless viewport.
- No reload persistence, no "start over" button (reload does that).

## Decisions
See NOTES.md, "Block D decisions". No contract changes needed.

## Try it
- With the mock: `MOCK_API=1 pnpm exec vite --config web/vite.config.ts`, then open the printed URL.
- With the real server (after C merges): `pnpm dev`.
