# namematch

Live: https://namematch.tech

Paste your project, get name ideas, and see which domains are free.

## What it does

You paste a GitHub repo link or a `.md` file and answer a few quick questions. A team of AI agents then suggests names for your project and checks if the domains are available (`.com`, `.dev`, `.app`, `.tech`, `.ai`). Then you chat with it to refine the names, as many rounds as you like.

This app is for developers who have built something and got stuck on what to call it. The vibe is playful and plain-spoken: a colorful, chunky UI, short answers, and a live log that shows what each agent is doing.

## How it works

![Architecture](docs/architecture.png)

Six agents, each with one job:

- **Supervisor:** reads your project, pre-fills the questions, plans which namers to use, and picks the best 5 names.
- **Professional namer:** credible, brandable names you can say in a meeting.
- **Short & cool namer:** 4 to 7 letter names that are invented or blended and easy to type.
- **Random & fun namer:** playful, absurd, wordplay names.
- **Domain checker:** for names with no free domain, suggests close variants (like a `get` prefix or `hq` suffix).
- **Feedback:** takes your chat messages and adjusts or adds names.

Workflows decide the steps and agents make the creative decisions. Agents never call each other, and domain lookups are plain code.

## What it's built with

- [Mastra](https://mastra.ai): agents and workflows.
- Gemma 4 open models via the Google API: the models behind every agent.
- RDAP: open data for domain checks, no API key needed.
- Hono: the small server.
- React + Vite + Tailwind: the web UI.
- Sentry: tracing of agent and workflow runs (optional).

## Run it yourself

You need Node 24 or newer, pnpm, and a free Google AI Studio API key.

```sh
cp .env.example .env   # then fill in .env
pnpm install
pnpm dev
```

Open the Vite URL it prints. To poke at the agents and workflows on their own, run `pnpm mastra:dev` for Mastra Studio (port 4111).

What goes in `.env`:

| Variable | What it is |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Your Google API key. |
| `MODEL_PROVIDER` | `google` (default) or `ollama`. |
| `MODEL_ID` | Model for the Supervisor and Feedback agents, for example `gemma-4-31b-it`. Required. |
| `FAST_MODEL_ID` | Model for the namers and Domain checker, for example `gemma-4-26b-a4b-it`. Required. |
| `OLLAMA_BASE_URL` | Only for Ollama. Defaults to `http://localhost:11434`. |
| `GITHUB_TOKEN` | Optional. Avoids GitHub's low rate limit when reading repos. |
| `SENTRY_DSN` | Optional. Leave empty to turn Sentry off. |
| `PORT` | Server port. Defaults to `3000`. |

## Make it yours

To add a namer in your own style (say, "old-timey" names), add a new feel. TypeScript will point out anything you miss.

1. `src/shared/types.ts`: add the feel to `Feel` and to `Actor`.
2. `src/shared/schemas.ts`: add it to `FeelSchema`.
3. `src/mastra/agents/index.ts`: create the agent with `make(...)`, using the same `NAMER_RULES` and 2 or 3 examples as the others, and add it to the `agents` object.
4. `src/mastra/workflows/common.ts`: add its label to `FEEL_LABEL`.
5. `src/mastra/workflows/generate-names.ts`: import the agent, add the feel to the list in `supervisorPick`'s `inputSchema`, and add `namer('your-feel', yourAgent)` to `.parallel([...])`.
6. `src/mastra/workflows/analyze-project.ts`: add the feel to the list in the prompt, so the Supervisor can suggest it.
7. `web/src/lib.ts`: add it to `FEELS` and `ACTORS` (pick a color class such as `bg-lilac`).

A run uses 1 or 2 feels, so your namer is picked next to the others, not instead of them.

## Good to know

- The free Google tier is slow and rate limited, so a run can take several minutes.
- The hosted demo sends your project description to Google's API.
- A fully local mode with Ollama exists (`MODEL_PROVIDER=ollama`), but it is untested.
- Sessions are kept in memory. A server restart or page reload starts over.
- Only public GitHub repos work. Domain results come from RDAP, so check with a registrar before you rely on one.

## License

MIT. See [LICENSE](LICENSE).
