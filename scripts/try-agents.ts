// Run: pnpm tsx --env-file=.env scripts/try-agents.ts [filter]   (live model calls, a few minutes)
// analyze -> generate (.com .dev) -> one feedback round on every fixture, in parallel.
import { readFile, readdir } from 'node:fs/promises';
import { analyzeProject, generateNames, refineNames } from '../src/mastra/run';
import { readSource } from '../src/sources';
import type { Logger, NameCard, Source, Tld } from '../src/shared/types';

const MESSAGE = 'Make them shorter and punchier, and check .ai too.';

const mds = (await readdir('fixtures')).filter((f) => f.endsWith('.md'));
const repos: Record<string, string> = JSON.parse(await readFile('fixtures/repos.json', 'utf8'));
const sources: Source[] = [
  ...await Promise.all(mds.map(async (f) => ({ kind: 'markdown' as const, filename: f, text: await readFile(`fixtures/${f}`, 'utf8') }))),
  ...Object.values(repos).map((url) => ({ kind: 'github' as const, url })),
].filter((s) => JSON.stringify(s).includes(process.argv[2] ?? ''));

const show = (cards: NameCard[]) => cards.map((c) => {
  const free = c.domains.filter((d) => d.status === 'available').map((d) => d.domain);
  return `  ${c.name.padEnd(14)} ${c.from.padEnd(12)} ${c.variantOf ? `(variant of ${c.variantOf}) ` : ''}${c.whyItFits}${free.length ? ` [${free.join(' ')}]` : ''}`;
}).join('\n');

const results = await Promise.allSettled(sources.map(async (source) => {
  const t = Date.now();
  const text = await readSource(source);
  const tag = text.label;
  const log: Logger = (actor, line, level = 'info') =>
    console.log(`${String(Math.round((Date.now() - t) / 1000)).padStart(4)}s ${tag.padEnd(22)} ${actor.padEnd(14)} ${level === 'info' ? '' : `[${level}] `}${line}`);

  const { profile, suggested } = await analyzeProject(text, log);
  const inputs = { ...suggested, tlds: ['com', 'dev'] as Tld[] };
  const cards = await generateNames(profile, inputs, log);
  const out = await refineNames({ profile, inputs, cards, chat: [], message: MESSAGE, round: 2 }, log);
  return [
    `=== ${tag} (${Math.round((Date.now() - t) / 1000)}s)`,
    `profile: ${JSON.stringify(profile)}`,
    `inputs:  ${JSON.stringify(suggested)}`,
    `round 1:\n${show(cards)}`,
    `feedback "${MESSAGE}" -> "${out.reply}" tlds=${out.inputs.tlds.join(',')}\n${show(out.cards)}`,
  ].join('\n');
}));

console.log();
for (const r of results) console.log(r.status === 'fulfilled' ? r.value : `=== FAILED: ${r.reason}`, '\n');
process.exit(results.every((r) => r.status === 'fulfilled') ? 0 : 1);
