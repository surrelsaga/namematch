# Handoff: Block D (Web UI)

## Feedback round (after merge)
- **Subtitle** is now "Name your project and check if the domains are available." No "free" wording left in the UI.
- **Bigger:** page uses up to 1800px; body text 18px; larger chips, buttons, inputs, headings, name cards (5xl names), log rows and chat bubbles. Domain pills are bigger and available ones end in a black "register →" tag that opens the registrar.
- **Layout:** desktop is two columns. Left: source, inputs, names (grouped by round, newest first). Right, sticky: logs on top, chat thread under it, each scrolling inside its own panel, chat input pinned at the bottom, so it stays on screen however many rounds there are. Before names exist the chat shows "Chat opens when names are ready." with the input disabled. Phone (390px) stacks source, inputs, results, logs, chat with no sideways scroll.
- **Checked** in headless Chrome at 1280x800, 1440x900 and 390px: chat input on screen at both the top and the bottom of the page after 5 rounds, no console errors, no horizontal overflow. Results and chat were checked with a throwaway mock server in the session scratchpad (not committed); the real server was used for the first ~25 s (analyze step, logs and spinner).
- **Needs another block:** nothing.
- **Note:** the middle commit (`feat: bigger text...`) doesn't typecheck alone, because `Chat` moved to its own file in the next commit. The branch head passes `pnpm check`.

## Done
- One-page UI per section 9: Source card (GitHub URL / .md upload or paste, 50 KB check, URL check), Inputs card (summary, kind/feel/audience chips, keep/avoid, tld toggles, "Name it"), Results (cards grouped by round, newest first: big mono name, namer badge, meaning, why it fits, domain pills mint/grey/yellow with register links, "variant of X"), feedback chat, Logs panel (colored actor badges, auto-scroll, spinner row; beside results on desktop, below on mobile).
- Style: neo-brutalist tokens in `web/src/index.css`, Space Grotesk + Space Mono, 5 primitives in `web/src/ui/index.tsx`, button press shift.
- `web/src/useSession.ts` is the only poller: `?after=<last i>`, every 1 s while analyzing/generating/refining, 5 s otherwise; merges new log lines only.
- Tests: `web/src/lib.test.ts` (feel toggle, list split, log merge). `pnpm check` passes.
- Click-through checked in headless Chrome at 1280px and 390px: GitHub flow → inputs → generate with tlds → results → feedback round 2, plus the markdown paste flow and the bad-URL message. No console errors, no horizontal scroll at phone width.

## Not done
- Not run against Block C's real server yet (it isn't merged). The expectations it must meet are in NOTES.md under "Block D decisions".
- Not tested on a real phone, only a 390px headless viewport.
- No reload persistence, no "start over" button (reload does that).

## Decisions
See NOTES.md, "Block D decisions". No contract changes needed.

## Try it
- With the real server (after C merges): `pnpm dev`.
