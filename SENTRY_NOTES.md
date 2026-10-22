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
