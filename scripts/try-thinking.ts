// Run: pnpm tsx --env-file=.env scripts/try-thinking.ts [runs]   (live model calls)
// One Short & cool namer call per thinking setting: time, output tokens, reasoning tokens, names.
import { shortCool } from '../src/mastra/agents';

const prompt = `Come up with 6 names.\n${JSON.stringify({
  project: {
    summary: 'A command line tool that groups repeated log lines and highlights errors. Made for backend engineers debugging production.',
    keywords: ['logs', 'cli', 'debugging', 'errors', 'terminal'],
  },
  kind: 'dev-tool', audience: 'developers', keep: [], avoid: [], twist: 'terminal vibes', count: 6, alreadyUsed: [],
}, null, 2)}`;

const settings: Record<string, Record<string, string | number> | undefined> = {
  default: undefined,
  minimal: { thinkingLevel: 'minimal' },
  low: { thinkingLevel: 'low' },
  high: { thinkingLevel: 'high' },
  'budget 0': { thinkingBudget: 0 },
  'budget 512': { thinkingBudget: 512 },
};

const runs = Number(process.argv[2] ?? 1);
for (const [label, thinkingConfig] of Object.entries(settings)) {
  for (let i = 0; i < runs; i++) {
    const t = Date.now();
    try {
      const res = await shortCool.generate(prompt, thinkingConfig ? { providerOptions: { google: { thinkingConfig } } } : {});
      const u = res.usage;
      const names = res.text.match(/"name":\s*"([^"]+)"/g)?.map((m) => m.split('"')[3]).join(', ');
      console.log(`${label.padEnd(11)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  out ${u.outputTokens}  reasoning ${u.reasoningTokens ?? '?'}  ${names}`);
    } catch (e) {
      console.log(`${label.padEnd(11)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  ERROR ${(e as Error).message.slice(0, 200)}`);
    }
  }
}
