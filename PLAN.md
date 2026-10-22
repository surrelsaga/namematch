# Nammit: Build Plan

App name: **Nammit**. Live at **nammit.tech**.

> Every Claude Code session reads this whole file before starting. It covers what we're building, the shared contracts, and what every block owns, so the code fits together at merge time. If something isn't in here, don't build it.

---

## 1. What we're building

A web app that names your project and checks if the domains are free.

1. User gives a **public GitHub repo URL** or **uploads/pastes a .md** describing the project.
2. **Supervisor** agent reads it and pre-fills 5 inputs. User confirms or edits.
3. Supervisor plans which **namer** agents to use (1 or 2 of 3) and what to ask them.
4. Namers return names; Supervisor picks the best 5.
5. If the user picked domains, names are looked up (RDAP). For names with nothing available, the **Domain checker** agent suggests variants, which are looked up too.
6. User sees name cards with domain status and register links.
7. User chats with the **Feedback** agent to adjust names; domain checks run again. Unlimited rounds.
8. Every step writes a plain-language log line the user sees live.

**Out of scope:** private repo access, trademark/social handle checks, domain extensions beyond the 5 below, logos, buying domains, accounts, a database, a graph view of agents.

---

## 2. Ground rules for the code

1. **Workflows route, agents decide.** Agents never call other agents or tools. A Mastra workflow calls agents in code based on their JSON output.
2. **Every agent returns JSON** through `generateJson` (zod validation, non-streaming, one retry). Don't use the API's schema/JSON mode.
3. **Domain lookups are plain code**, never done by an agent. Agents only see lookup results as facts passed in.
4. **No database.** Sessions live in a `Map` in memory. Agents are stateless; history is passed in each call.
5. **Logs are written by our code**, one plain sentence per step, through the `Logger` passed into every run. No jargon, no IDs, no emojis.
6. **One job per session at a time.** Never crash the server on a failed job.
7. Only the **5 extensions**: `.com .dev .app .tech .ai`. No domains picked = no lookups at all.

---

## 3. Architecture

```
Browser (React)  --HTTP JSON, polls-->  Node server (Hono)
                                          - session store (memory)
                                          - sources: GitHub API, .md text
                                          - Mastra: 6 agents, 3 workflows
                                          - domains: RDAP lookups
                                          - Sentry (added in Block E)
                                                 |
                                       Gemma 4 via Google's Gemini API
```

### Agents

| # | Agent | Model env | Job | Returns |
|---|---|---|---|---|
| 1 | Supervisor | `MODEL_ID` | analyze source + pre-fill inputs; plan namers; pick top 5 | JSON per task |
| 2 | Professional namer | `FAST_MODEL_ID` | credible, brandable names | `Candidate[]` |
| 3 | Short & cool namer | `FAST_MODEL_ID` | 4 to 7 letters, invented/blended | `Candidate[]` |
| 4 | Random & fun namer | `FAST_MODEL_ID` | playful, absurd, wordplay | `Candidate[]` |
| 5 | Domain checker | `FAST_MODEL_ID` | up to 3 variants per name with no available domain | `{ for, variants }[]` |
| 6 | Feedback | `MODEL_ID` | adjust/create names from user chat, short reply, optional new tlds | `{ reply, names, tlds? }` |

### Workflows

- **`analyzeProject`:** `supervisorAnalyze` → `{ profile, suggested }`
- **`generateNames`:** `supervisorPlan` → `.parallel([professional, shortCool, randomFun])` (each returns `[]` and logs "skipped" if not in the plan) → `supervisorPick` → `domainCheck` → `NameCard[]`
- **`refineNames`:** `feedback` → `domainCheck` → `{ reply, cards, inputs }`
- **`domainCheck` step (shared):** skip if no tlds → `checkDomains(names)` → Domain checker agent for names with zero available (max 6 variants per round) → `checkDomains(variants)` → add variants with at least one available as extra cards (`variantOf` set)

### Log line examples
```
supervisor     Read README.md and package.json. Looks like a CLI tool for developers.
supervisor     Using Short & cool (6 names) and Random & fun (4 names). Twist: "terminal vibes".
professional   Skipped, not in the chosen feel.
short-cool     Returned 6: rydo, pooli, zipr, kast, vynl, termo.
supervisor     Picked 5. Dropped "kast" (too close to an existing brand).
domain-checker rydo.dev taken, rydo.com taken. Suggesting variants.
domain-checker getrydo.dev available.
system         Done: 5 names, 3 with an available domain.
```

---

## 4. Contracts

**Frozen after Step 0.** Never edit these in a block (see section 12, rule 2).

### `src/shared/types.ts`
```ts
export type Kind = 'startup' | 'side-project' | 'dev-tool';
export type Feel = 'professional' | 'short-cool' | 'random-fun';
export type Audience = 'developers' | 'everyday' | 'businesses';
export const TLDS = ['com', 'dev', 'app', 'tech', 'ai'] as const;
export type Tld = (typeof TLDS)[number];

export type Source =
  | { kind: 'github'; url: string }
  | { kind: 'markdown'; text: string; filename?: string };

export interface SourceText { label: string; text: string }   // text trimmed to ~12k chars

export interface ProjectProfile {
  title?: string;
  summary: string;        // 1 to 2 plain sentences
  keywords: string[];     // 3 to 8
}

export interface NameInputs {
  kind: Kind;
  feels: Feel[];          // 1 or 2
  audience: Audience;
  keep: string[];         // may be empty
  avoid: string[];        // may be empty
  tlds: Tld[];            // 0 to 5; empty = no lookups
}

export interface NamingPlan {
  namers: { feel: Feel; count: number }[];   // 1 or 2 entries, total ~10
  twist: string;
  reasoning: string;                         // one sentence, for the log
}

export interface Candidate { name: string; from: Feel | 'feedback'; meaning: string }
export interface Pick { name: string; whyItFits: string }

export type DomainStatus = 'taken' | 'available' | 'unknown';
export interface DomainResult {
  tld: Tld;
  domain: string;         // "rydo.dev"
  status: DomainStatus;
  registerUrl?: string;   // only when available
}

export interface NameCard {
  id: string;
  name: string;
  from: Feel | 'feedback';
  meaning: string;
  whyItFits: string;
  domains: DomainResult[];   // empty when no tlds
  variantOf?: string;
  round: number;             // 1 = generate, 2+ = feedback rounds
}

export type Actor =
  | 'supervisor' | 'professional' | 'short-cool' | 'random-fun'
  | 'domain-checker' | 'feedback' | 'you' | 'system';

export interface LogLine {
  i: number;              // increasing per session
  at: string;             // ISO
  actor: Actor;
  text: string;
  level: 'info' | 'warn' | 'done';
}

export type Logger = (actor: Actor, text: string, level?: LogLine['level']) => void;

export interface ChatTurn { role: 'user' | 'agent'; text: string; at: string }

export type SessionStatus =
  | 'analyzing' | 'needs-inputs' | 'generating' | 'ready' | 'refining' | 'error';

export interface Session {
  id: string;
  status: SessionStatus;
  sourceLabel: string;
  profile?: ProjectProfile;
  suggested?: NameInputs;
  inputs?: NameInputs;
  cards: NameCard[];      // newest round first
  chat: ChatTurn[];
  logs: LogLine[];
  error?: string;
}

export type SessionView = Session;   // GET returns logs with i > after only
```

### `src/shared/schemas.ts`
Zod schemas for every agent output: analyze (`ProjectProfile` + `NameInputs`), `NamingPlan`, `Candidate[]`, `Pick[]`, variants, feedback output.

### Module signatures
```ts
// src/sources/index.ts   (Block B)
readSource(source: Source): Promise<SourceText>

// src/domains/index.ts   (Block B)
normalizeName(name: string): string | null      // null = not domain-friendly
checkDomains(names: string[], tlds: Tld[]): Promise<Record<string, DomainResult[]>>

// src/mastra/run.ts      (Block A)
analyzeProject(source: SourceText, log: Logger):
  Promise<{ profile: ProjectProfile; suggested: NameInputs }>
generateNames(profile: ProjectProfile, inputs: NameInputs, log: Logger):
  Promise<NameCard[]>
refineNames(ctx: { profile: ProjectProfile; inputs: NameInputs; cards: NameCard[];
                   chat: ChatTurn[]; message: string; round: number }, log: Logger):
  Promise<{ reply: string; cards: NameCard[]; inputs: NameInputs }>
```

---

## 5. API (Block C)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ ok: true }` |
| POST | `/api/sessions` | `{ source: Source }` | `{ sessionId }`, analyze runs in background |
| GET | `/api/sessions/:id?after=<i>` | | `SessionView` |
| POST | `/api/sessions/:id/generate` | `{ inputs: NameInputs }` | `202` |
| POST | `/api/sessions/:id/feedback` | `{ message: string }` | `202` |

- Busy session → `409`. Failed job → `status: 'error'`, `error`, a `warn` log line.
- `.md` is read in the browser and sent as text (max ~50 KB).
- In production the same server serves the built web app.

---

## 6. Domain lookups (Block B)

| TLD | RDAP base URL |
|---|---|
| .com | `https://rdap.verisign.com/com/v1/` |
| .dev | `https://pubapi.registry.google/rdap/` |
| .app | `https://pubapi.registry.google/rdap/` |
| .tech | `https://rdap.radix.host/rdap/` |
| .ai | `https://rdap.identitydigital.services/rdap/` |

- `GET {base}domain/{name}.{tld}`: `200` → `taken`, `404` → `available`, else or 5 s timeout → `unknown`.
- Max 4 lookups at once. Cache results in memory.
- `normalizeName`: lowercase, drop spaces/underscores, keep `a-z 0-9 -`, no leading/trailing `-`, 2 to 30 chars, else `null`.
- `registerUrl`: a registrar search URL with the domain pre-filled. Verify the format works.
- Known cases for tests: `get.tech` is taken; a long random string is available.

## 7. Source reading (Block B)

- **GitHub:** accept `https://github.com/owner/repo` (ignore extra path). Fetch repo info (description, topics, language), README, and `package.json` / `pyproject.toml` / `Cargo.toml` if present. Combine, trim to ~12k chars. Use `GITHUB_TOKEN` if set.
- **Markdown:** text as is, trimmed to ~12k chars.
- Clear errors: "repo not found or private", "GitHub rate limit hit, try again later".

---

## 8. Agent instructions (Block A)

All agents: short concrete instructions with 2 or 3 good examples, JSON only via `generateJson`.

- **Supervisor / analyze:** write `ProjectProfile` and best-guess `NameInputs` (tlds empty, keep/avoid empty unless obvious).
- **Supervisor / plan:** pick the namers matching `inputs.feels`, split ~10 names, one-line twist from project + audience + keep words. Startup + Professional in feels → lean Professional.
- **Supervisor / pick:** dedupe, drop names with `avoid` words or close to well-known brands, pick 5, write `whyItFits`, one sentence on what was dropped and why.
- **Namers** (input: profile, inputs, twist, count, `alreadyUsed`):
  - Professional: credible, sayable in a meeting, real words or clear compounds, no puns.
  - Short & cool: 4 to 7 letters, invented or blended, easy to type.
  - Random & fun: playful, absurd, wordplay, still sayable.
  - All: honor keep/avoid, never repeat `alreadyUsed`.
- **Domain checker:** up to 3 variants per taken name that keep it recognizable (get/try/use prefix, app/hq/labs suffix, small respelling).
- **Feedback:** 1 to 5 names following the request, a 1 to 2 sentence reply, updated `tlds` if the user asks for checks.

`generateJson(agent, prompt, schema)`: non-streaming call, take the final answer only, strip text/code fences around the JSON, zod validate, on failure retry once with the error appended, then throw.

---

## 9. UI (Block D)

Desktop first, usable on a phone. One page, stages appear top to bottom:

1. **Source card:** "Nammit" logo block (bold word on a yellow block with a shadow); tabs "GitHub repo" (URL) / "Upload .md" (file or paste); button "Read my project".
2. **Inputs card** (`needs-inputs`): "Here's what I understood: {summary}", then chips: What is it (3), Feel (3, pick 1 or 2), Who's it for (3); keep/avoid text inputs (optional); domain toggles .com .dev .app .tech .ai (optional, hint "leave empty to skip domain checks"); button "Name it".
3. **Results:** name cards (big mono name, namer badge, meaning, why it fits, domain pills: available = mint + register link, taken = grey, unknown = yellow, "variant of X" label), then the feedback chat.
- **Logs panel** beside results (below on mobile): colored agent badge + sentence per row, auto-scroll, spinner row while a job runs.
- **`useSession` hook** is the only poller: `?after=<last i>` every 1 s while a job runs, 5 s otherwise.

**Style (whole app): simple colorful neo-brutalism**
- Background `#FFF4E0`. Fills: yellow `#FFD23F`, pink `#FF6B9E`, mint `#3DDC97`, sky `#5BC0EB`, lilac `#B8A1FF`, orange `#FF8A3D`. Black `#111` text, borders, shadows.
- 3px black borders, shadow `4px 4px 0 #111`, radius 6px, chunky padding. Heavy font (Space Grotesk or Archivo Black), Space Mono for names/domains.
- Agent colors: Supervisor yellow, Professional sky, Short & cool mint, Random & fun pink, Domain checker orange, Feedback lilac.
- 5 primitives in `web/src/ui/` (`Card`, `Button`, `Chip`, `Input`, `Badge`); every screen uses only these. Button press shifts 2px and shrinks the shadow.
- No gradients, extra animations, illustrations or dark mode. ~1 hour on style, then features.

---

## 10. Repo layout and env

Single package, TypeScript, ES2022 modules, pnpm.

```
PLAN.md  CLAUDE.md  NOTES.md  .env.example  .claude/settings.json
src/shared/types.ts, schemas.ts        Step 0 (frozen)
src/mastra/index.ts                    Step 0, Block A registers agents/workflows
src/mastra/models.ts, generate-json.ts Step 0
src/mastra/agents/, workflows/, run.ts Block A
src/sources/                           Block B
src/domains/                           Block B
src/server/                            Block C
web/                                   Block D
instrument.mjs                         Block E
scripts/sanity.ts                      Step 0
fixtures/                              Step 0
```

```
GOOGLE_GENERATIVE_AI_API_KEY=
MODEL_PROVIDER=google
MODEL_ID=gemma-4-31b-it
FAST_MODEL_ID=gemma-4-26b-a4b-it
OLLAMA_BASE_URL=http://localhost:11434
GITHUB_TOKEN=
SENTRY_DSN=
PORT=3000
```

---

## 11. Blocks

| Block | What | Owns | Starts after |
|---|---|---|---|
| 0 | Foundation | everything in section 10 marked Step 0 | nothing |
| A | Agents + workflows | `src/mastra/agents`, `workflows`, `run.ts` | Step 0 |
| B | Domain + source lookups | `src/domains`, `src/sources` | Step 0 |
| C | Server | `src/server` | Step 0 |
| D | Web UI | `web/` | Step 0 |
| E | Sentry + deploy | `instrument.mjs`, start script, deploy config | A, B, C, D merged |

Worktrees: `git worktree add ../nammit-a -b agents` (same for `-b lookups`, `-b server`, `-b web`). Copy `.env` in, run `pnpm install`, use a different `PORT` each.

### Step 0: Foundation (on main, one session)
1. Single package: Vite + React + Tailwind in `web/`, Hono in `src/server/`, Mastra in `src/mastra/`. Scripts: `dev` (server + web, Vite proxies `/api`), `mastra:dev` (Studio), `build`, `start`, `test` (vitest), `typecheck`, `check` (typecheck + test + build).
2. `types.ts` and `schemas.ts` exactly as section 4.
3. `models.ts` (reads env), `generate-json.ts`, Mastra instance.
4. **Stubs with final signatures** for `readSource`, `normalizeName`, `checkDomains`, `analyzeProject`, `generateNames`, `refineNames`. They return realistic fake data and write fake log lines with short delays, so every block can run alone.
5. Server skeleton: `/api/health` + empty session map. Web skeleton: one page.
6. `fixtures/`: 2 sample `.md` project descriptions + 3 public repo URLs (a CLI tool, a web app, a library).
7. `scripts/sanity.ts`: one Gemma JSON call via `generateJson` (print result + time); RDAP `get.tech` (expect taken) and a random `.tech` (expect available); one GitHub README fetch.
8. `.env.example`, `.claude/settings.json` (allow pnpm, node, tsx, vitest, git, curl to localhost; `"attribution": { "commit": "", "pr": "" }`), `CLAUDE.md` ("read PLAN.md, find your block, follow section 12"), empty `NOTES.md`.
9. `pnpm check` passes. One test commit (e.g. `chore: test commit`) shows only Daniel's name. Push.

### Block A: Agents + workflows
- **Build:** the 6 agents (section 8), 3 workflows + shared `domainCheck` step (section 3), real `run.ts`. Pass the `Logger` into steps (Mastra request context or a closure; note the choice in NOTES.md). Register everything in `src/mastra/index.ts`.
- **Uses:** Block B's stubs until B merges.
- **Test:** `scripts/try-agents.ts` runs analyze → generate → one feedback round on every fixture and prints logs + cards. Also try in Mastra Studio.
- **Done when:** every fixture gives sensible names; only the namers matching the feel run; feedback moves names in the asked direction; no JSON failures after retry.

### Block B: Domain + source lookups
- **Build:** sections 6 and 7.
- **Test:** vitest for `normalizeName` and status mapping (mocked fetch), plus `scripts/check-lookups.ts` doing live checks on the known cases and the 3 fixture repos.
- **Done when:** the 5 TLDs return correct results for known cases, fixture repos read correctly, errors are clear.

### Block C: Server
- **Build:** section 5. Session store, background jobs calling `run.ts` and `readSource`, per-session busy flag, logger that appends `LogLine`s with increasing `i`, `?after=` filtering, error handling, serve `web/dist` in production.
- **Test:** API tests with stubs: create → poll → generate → poll → feedback → poll; `409` when busy; error path.
- **Done when:** the full flow works end to end via curl with stubs.

### Block D: Web UI
- **Build:** section 9, against the Step 0 server (stubs already produce fake logs and cards).
- **Test:** click through the full flow in a browser, check on a phone-sized window.
- **Done when:** full flow works and matches the style in section 9.

### Block E: Sentry + deploy
- **Sentry:** install `@sentry/node` and `@mastra/observability`; `instrument.mjs` with `Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 1.0 })`, skipped when `SENTRY_DSN` is empty; preload it in the start script (`--import ./instrument.mjs`). Confirm workflow, agent, model and fetch spans appear in Sentry → Explore → Agents.
- **Deploy (Render):** build `pnpm install --prod=false && pnpm build`, start = `pnpm start`, env vars from section 10. Custom domain: `nammit.tech`.
- **Done when:** traces show up for a full run, and the app runs the full flow at nammit.tech.

---

## 12. Merge order and session rules

**Merge order:** B → C → A → D → E.

1. Read this whole file first and know what the other blocks do.
2. Only edit files your block owns. **Never edit `src/shared/types.ts` or `schemas.ts`.** If a contract must change, write the proposal in `CONTRACT_CHANGES.md`, work around it, and keep going.
3. If stuck or unsure, make the most reasonable call, write it in `NOTES.md`, keep going. Don't wait for Daniel.
4. Everything must run and be testable alone (stubs, fixtures, mocks).
5. **Done** = `pnpm check` passes + your "done when" is true. Then write `HANDOFF-<block>.md`: done, not done, decisions made.
6. **Commits:** Daniel's name only (repo git config, never override). No co-author lines and no "Generated with" lines, in commits or PRs. One short plain line per message, lowercase, using the conventional prefix: `feat:`, `fix:`, `chore:`, `refactor:` (also `docs:` and `test:` when they fit). Examples: `feat: add domain lookup`, `fix: retry namer JSON once`, `chore: add env example`, `refactor: split source readers`. Small commits.
