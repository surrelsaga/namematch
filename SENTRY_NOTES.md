# Sentry notes

## Setup
- `@sentry/node` 11.8.0 + `@mastra/observability` 1.21.0. `instrument.mjs` at the repo root calls `Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 1.0, environment: NODE_ENV })`, and does nothing when `SENTRY_DSN` is empty.
- Preloaded with `--import ./instrument.mjs` in `pnpm dev` (server only) and `pnpm start`.
- No Mastra-side config. Sentry 11's built-in Mastra integration adds its own exporter to the `Mastra` instance when `@mastra/observability` is installed. `@mastra/sentry` is not used: it calls `Sentry.init` itself and conflicts with the built-in integration.
- Span streaming is on (the v11 default). Spans are sent as they end, so background jobs that outlive their `POST` (202) keep their spans, in the `POST`'s trace.
- `GET /api/*` (session polling, health check) is not traced, via `httpIntegration({ ignoreIncomingRequests })`. `ignoreSpans` does not drop `http.server` spans under streaming.
- Prompts and model outputs are recorded on the spans (Sentry's default for gen_ai). To turn that off: `dataCollection: { genAI: { inputs: false, outputs: false } }`.

## What a run looks like in Sentry
One trace per job, rooted at the `POST` that started it:

```
POST /api/sessions/:id/generate           http.server (ends at once, 202)
└ invoke_agent generateNames              gen_ai.invoke_agent  (workflow run)
  ├ invoke_agent Supervisor               gen_ai.invoke_agent  (agent run, tokens rolled up)
  │ └ chat gemma-4-31b-it                 gen_ai.chat          (model call, tokens)
  │   └ POST generativelanguage.googleapis.com   http.client  (one per HTTP attempt, status code)
  ├ invoke_agent Short & cool namer ...
  └ GET rdap.verisign.com / pubapi.registry.google / ...      http.client (RDAP lookups)
```

Workflow *steps* are not exported as spans (the integration skips them). Their children hang off the workflow span. GitHub fetches (`api.github.com`, `raw.githubusercontent.com`) show up as `http.client` spans the same way. This run used a `.md`, so it has none.

Where to look:
- **Explore → Traces**: search `span.op:gen_ai.invoke_agent`, or open a trace by id (below).
- **Explore → Agents**: agent runs, model calls, token use, duration per agent and model.
- Filter `span.op:http.client span.description:*generativelanguage*` with `http.response.status_code:>=500` to see the API retries.

## Run 1 (2026-10-22, local, `NODE_ENV=production`, free-tier Gemini API)
`fixtures/log-tool.md` → analyze → generate (feel short-cool, tlds .com .dev) → one feedback round ("Make them shorter and punchier, and check .ai too."). Driven over HTTP against `pnpm start`. Times come from the spans sent to Sentry (copied locally with a `beforeEnvelope` hook).

Traces:
- analyze `70b3b3383dd244a5958a1d8b66d7944d`
- generate `9e5644313de841a8b693de18c829fea6`
- feedback `aeb51bd297cf47f3b3e884e593d1788c`

Also in the project: an earlier partial run (killed during generate) and a short filter check (`POST /api/sessions` 400, `GET /*`). This run's server started before the `GET /api/*` filter was added, so its ~300 `GET /api/sessions/:id` polling transactions were sent too. Later runs don't send them.

**Total: 605 s.** Analyze 40 s, generate 294 s, feedback round 267 s.

### Time per agent call
| Phase | Agent (model) | Time | Tokens in / out (reasoning) | Notes |
|---|---|---|---|---|
| analyze | Supervisor analyze (31b) | 40.4 s | 609 / 613 (522) | |
| generate | Supervisor plan (31b) | 28.0 s, failed | none | 3 HTTP 500s (10.6 s, 10.6 s, 0.8 s) |
| | *backoff* | 8 s | | `generateJson` API retry |
| | Supervisor plan (31b) | 35.9 s | 431 / 547 (494) | |
| | Short & cool namer (26b) | 112.2 s | 444 / 4898 (4630) | 2 HTTP 500s, then a 104.4 s call |
| | Supervisor pick (31b) | 49.7 s | 487 / 961 (830) | |
| | RDAP, 10 lookups | ~1.6 s | | |
| | Domain checker (26b) | 8.4 s, failed | none | 3 HTTP 500s |
| | *backoff* | 8 s | | `generateJson` API retry |
| | Domain checker (26b) | 40.8 s | 287 / 1733 (1631) | 1 HTTP 500, then a 37.0 s call |
| feedback | Feedback (31b) | 108.1 s | 714 / 2541 (2382) | 1 HTTP 500 (15 s), then 90.1 s. The reply failed zod (`names[4].whyItFits` missing) |
| | Feedback (31b), JSON retry | 122.4 s | 1054 / 2064 (1828) | 1 HTTP 503 (37 s), then 82.3 s |
| | RDAP + Domain checker (26b) | 34.1 s | 314 / 1560 (1466) | |

Tokens across the run: 4,340 in, 14,917 out. 92% of the output was reasoning tokens (13,783 of 14,917). The visible JSON replies were 180 to 884 chars.

### Retries
- **No 429s this run.** Model API calls: 19 HTTP attempts, 8 × 200, 10 × 500, 1 × 503.
- There are two retry layers, both visible as extra `http.client` spans under one `chat` span:
  1. The AI SDK inside `agent.generate` (default `maxRetries: 2`, ~3 s apart). It handled the namer's two 500s and the single 500/503 in the domain checker and feedback calls.
  2. `generateJson`'s API backoff (8 s), when all 3 SDK attempts fail. That happened twice (Supervisor plan, Domain checker). In Sentry, the first `invoke_agent` span then has status `error`, and a second one follows.
- One JSON retry (Feedback, missing `whyItFits`) cost 122 s.
- The workflow-level `retryConfig` never fired.
- RDAP: 45 lookups, all answered (31 × 200 taken, 14 × 404 available, 0 unknown), the slowest took 1.37 s.

### Slowest steps
1. Feedback round, 230 s in the Feedback agent: two full calls because of the JSON retry.
2. Short & cool namer, 112 s: one 104 s call with 4,898 output tokens, 95% of them reasoning.
3. Supervisor plan, 72 s: 28 s of 500s plus the 8 s backoff before a 36 s call.
4. Domain checker (generate), 57 s: 500s plus the backoff, then 41 s.
5. Supervisor pick, 50 s.

RDAP and HTTP handling are negligible. Almost all the time is model latency, much of it spent on reasoning tokens, plus 500 retries.

## Run 2 (after thinking limits) (2026-10-23, local, `NODE_ENV=production`, free-tier Gemini API)
Same flow as Run 1: `fixtures/log-tool.md` → analyze → generate (short-cool, .com .dev) → one feedback round ("Make them shorter and punchier, and check .ai too."), over HTTP against the production server with `SENTRY_DSN` set. Times and tokens come from the spans sent to Sentry (copied locally with a `beforeEnvelope` hook in a preload file that isn't committed).

Traces:
- analyze `b483c30532b24e4bbe8358280ff56dbd`
- generate `d7794f76083d4b45a523ca3b6427bc2c`
- feedback `9152b7fa07d648a482c01a7c72c48bf1`

Also in the project: an earlier attempt from before the namer `from` fix (analyze `f696b0d5350c49178a388053d3688912`, generate `2cb73a0258bb457b95aa9e30b579f2bf`, feedback `eecbf2644e5e476fa18ad1e9d072b2f6`, 206 s). Its namer reply put the twist in `"from"`, failed zod, and needed a JSON retry plus three 500s (27 s in the namer). That led to the fix below.

**Total: 187 s** (Run 1: 605 s). Analyze 32 s, generate 99 s, feedback round 56 s.

### What changed
- **Thinking off** (`thinkingLevel: "minimal"`) for the three namers, the domain checker and Supervisor analyze. It's set once per agent with `defaultOptions.providerOptions`, and analyze passes it per call.
- **Supervisor plan, Supervisor pick and Feedback keep Gemma's default thinking.** The plan was "low" for these, but Gemma 4 doesn't accept it (see below), so the only choices are on or off. With thinking off for these too, the fixture trial let weaker feedback names through (see NOTES.md), and name quality comes first.
- **Feedback prompt:** the rules and both examples now show `whyItFits` on every name. No feedback JSON retries in this run or in the 10 fixture runs.
- **Namer replies** are validated without `"from"`. The step sets it to the namer's feel anyway.

### What Gemma 4 accepts (tested with `scripts/try-thinking.ts`, one Short & cool namer call)
| `thinkingConfig` | Time | Output tokens | Reasoning tokens |
|---|---|---|---|
| none (default) | 79.4 s, 78.8 s | ~3,700 | 3,341, 3,530 |
| `thinkingLevel: "minimal"` | 5.1 s, 4.7 s | 173, 178 | 0 |
| `thinkingLevel: "high"` | 146.6 s, 97.2 s | 6,899, 4,563 | 6,731, 4,387 |
| `thinkingLevel: "low"` or `"medium"` | 400 | | "Thinking level is not supported for this model." |
| `thinkingBudget: 0` or `512` | 400 | | "Thinking budget is not supported for this model." |

The same holds for `gemma-4-31b-it` (`low` and `medium` → 400, `minimal` → 0 reasoning tokens). Google's Gemma docs only name "high" (on) and "minimal" (off). The default behaves like "high". No `thought_signature` errors: each call is a single turn.

### Time per agent call
| Phase | Agent (model) | Thinking | Time | Tokens in / out (reasoning) | Run 1 |
|---|---|---|---|---|---|
| analyze | Supervisor analyze (31b) | off | 31.9 s | 609 / 92 (0) | 40.4 s, 613 out (522) |
| generate | Supervisor plan (31b) | on | 28.6 s | 432 / 444 (389) | 72 s with 500s and backoff, 547 out (494) |
| | Short & cool namer (26b) | off | 6.8 s | 447 / 275 (0) | 112.2 s, 4898 out (4630) |
| | Supervisor pick (31b) | on | 57.4 s | 495 / 1240 (1115) | 49.7 s, 961 out (830) |
| | RDAP, 20 lookups | | ~0.5 s per round | | |
| | Domain checker (26b) | off | 3.7 s | 307 / 131 (0) | 57 s with 500s and backoff, 1733 out (1631) |
| feedback | Feedback (31b) | on | 50.1 s | 850 / 1133 (869) | 230 s over two calls (JSON retry) |
| | | | | | 1 HTTP 503 (11.3 s), then a 35.7 s call |
| | Domain checker (26b) | off | 3.5 s | 333 / 119 (0) | 34.1 s, 1560 out (1466) |

Tokens across the run: 3,473 in, 3,434 out, 2,373 of them reasoning (69%, all from plan, pick and feedback). Run 1: 4,340 in, 14,917 out, 13,783 reasoning (92%).

Supervisor analyze took 31.9 s for 92 output tokens and no reasoning. In the earlier attempt the same call took 9.5 s. The 31b model's latency on the free tier varies a lot, apart from thinking.

### Retries
- Model API: 8 HTTP attempts, 7 × 200, 1 × 503 (Feedback, handled by the AI SDK's own retry). No `generateJson` backoff, no JSON retries, no 429s.
- RDAP: 53 lookups, all answered (39 × 200 taken, 14 × 404 available), the slowest 0.54 s.

### Slowest steps now
1. Supervisor pick, 57 s (thinking on).
2. Feedback, 50 s (thinking on, plus an 11 s 503).
3. Supervisor analyze, 32 s (no thinking, slow API).
4. Supervisor plan, 29 s (thinking on).

The fast-model calls (namers, domain checker) now take 3 to 7 s. What's left is the 31b model with thinking on, and free-tier latency.

### All fixtures (`scripts/try-agents.ts`, 5 fixtures in parallel, wall time)
| Setting | Wall | log-tool | todo-app | bat | excalidraw | zod |
|---|---|---|---|---|---|---|
| Before (thinking on everywhere) | 690 s | 543 s | 552 s | 476 s | 689 s | 633 s |
| Thinking off everywhere (tried, not kept) | 290 s | 101 s | 99 s | 289 s | 49 s | 166 s |
| Kept: off except plan, pick, feedback | 351 s | 251 s | 240 s | 248 s | 213 s | 350 s |

Each fixture ran once per setting, so single fixture times include free-tier noise (bat's 289 s in the second row is one 503 and one 500 during analyze and feedback).
