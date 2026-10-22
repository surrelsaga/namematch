# Handoff: Block A (agents + workflows)

## Done
- **6 agents** in `src/mastra/agents/index.ts`: supervisor and feedback on `MODEL_ID`, the namers and domain checker on `FAST_MODEL_ID`. Each has short rules and 2 or 3 examples, and every call goes through `generateJson`.
- **3 workflows** in `src/mastra/workflows/`:
  - `analyzeProject`: supervisor analyze.
  - `generateNames`: plan → `.parallel` of 3 namers → pick → `domainCheck`.
  - `refineNames`: feedback → `domainCheck` → `{ reply, cards, inputs }`.
- **Shared `domainCheck` step** (`domain-check.ts`): no tlds means no lookups. Otherwise it runs `checkDomains`, asks the domain checker for variants of names with nothing free (at most 6 lookups per round), and adds one variant card per name that has a free domain.
- **Real `run.ts`** with the frozen signatures. It passes the Logger through the Mastra request context.
- Everything is registered in `src/mastra/index.ts`. Studio (`pnpm mastra:dev`) lists all 6 agents and 3 workflows.
- **Tests:** `src/mastra/run.test.ts` uses fake agents and fake lookups, with no network. It covers:
  - only the chosen namers run
  - dedupe, avoid words, and filling up the picks
  - variant cards
  - a failing namer is skipped
  - refine returns the reply, new cards and new tlds
  - a supervisor failure is retried, then rejects
- **Live check:** `pnpm tsx --env-file=.env scripts/try-agents.ts [filter]` runs analyze → generate (.com .dev) → one feedback round ("shorter and punchier, and check .ai too") on every fixture.

## Done-when status
- **Sensible names for every fixture:** yes. Examples: log tool → Dbug, Tylx, Logzo. Todo app → paceo, Phewday. Excalidraw → Skrit, Inko, Chalkpop. Zod → Suretype, Typix, Xema. bat → prizm, bryt, flik.
- **Only the matching namers run:** yes. The plan is enforced in code, and the others log "Skipped, not in the chosen feel."
- **Feedback moves names in the asked direction:** yes. "Shorter" gave 3 to 4 letter names, and ".ai" was added to tlds every time.
- **No JSON failures after retry:** none seen in 11 fixture runs. The only failures were Google 503 "high demand" errors, now covered by step retries (2 retries, 8 s apart).

## Not done / for other blocks
- The live trials used **Block B's real `src/sources` and `src/domains`** checked out into the working tree, not committed. This branch still has the Step 0 stubs. Re-run `scripts/try-agents.ts` after B merges.
- Main-model calls are slow (about 30 to 90 s each, and a full generate is about 3 to 5 min). The UI spinner row matters.
- **Contract proposal** in `CONTRACT_CHANGES.md`: `whyItFits` on feedback names. A local workaround is in place, so nothing is blocked.

## Decisions (details in NOTES.md, "Block A decisions")
- Logger goes through the request context. Without one (Studio), logs go to the console.
- Runs don't persist snapshots, so the in-memory store doesn't grow.
- `refineNames` returns only the new round's cards. Block C puts them in front of `session.cards`.
- If the last `chat` turn equals `message`, it isn't repeated in the prompt, so C can append the user turn before or after the call.
- A namer failure logs a `warn` and is skipped. Supervisor and feedback failures (after retries) reject with a readable `Error`.
