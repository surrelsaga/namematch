import { beforeEach, expect, test, vi } from 'vitest';
import type { LogLine, Logger, NameInputs, ProjectProfile } from '../shared/types';

// Canned replies per agent id instead of model calls. Uses Block B's domain stub
// (.com taken, "kast" taken everywhere, the rest free).
const replies: Record<string, (prompt: string) => unknown> = {};
const calls: string[] = [];
vi.mock('./generate-json', () => ({
  generateJson: async (agent: { id: string }, prompt: string, schema: { parse(v: unknown): unknown }) => {
    calls.push(agent.id);
    const reply = replies[agent.id];
    if (!reply) throw new Error(`no reply for ${agent.id}`);
    return schema.parse(reply(prompt));
  },
}));
const { analyzeProject, generateNames, refineNames } = await import('./run');

const profile: ProjectProfile = { summary: 'A log tool.', keywords: ['logs', 'cli', 'errors'] };
const inputs: NameInputs = { kind: 'dev-tool', feels: ['short-cool'], audience: 'developers', keep: [], avoid: ['bad'], tlds: [] };
const names = (from: string, ...n: string[]) => n.map((name) => ({ name, from, meaning: `${name} meaning` }));

let logs: Pick<LogLine, 'actor' | 'text' | 'level'>[] = [];
const log: Logger = (actor, text, level = 'info') => logs.push({ actor, text, level });
const said = (actor: string) => logs.filter((l) => l.actor === actor).map((l) => l.text);

beforeEach(() => {
  logs = [];
  calls.length = 0;
  for (const k of Object.keys(replies)) delete replies[k];
  // The model plans a feel the user didn't choose; code must ignore it.
  replies.supervisor = (p) => p.startsWith('Task: plan')
    ? { namers: [{ feel: 'professional', count: 5 }, { feel: 'short-cool', count: 6 }], twist: 'terminal vibes', reasoning: 'Short suits devs.' }
    : { picks: [{ name: 'KAST', whyItFits: 'w' }, { name: 'made-up', whyItFits: 'w' }, { name: 'rydo', whyItFits: 'w' }], dropped: 'Dropped zipr.' };
  replies['short-cool'] = () => names('professional', 'rydo', 'kast', 'rydo', 'badly', 'zipr', 'tailo', 'vynl');
});

test('analyze returns profile and forces tlds empty', async () => {
  replies.supervisor = () => ({
    profile,
    suggested: { ...inputs, tlds: ['com'] },
  });
  const out = await analyzeProject({ label: 'README.md', text: 'hi' }, log);
  expect(out.suggested.tlds).toEqual([]);
  expect(logs.at(-1)?.level).toBe('done');
});

test('generate runs only the chosen namers and picks 5 without domains', async () => {
  const cards = await generateNames(profile, inputs, log);
  expect(calls.filter((c) => c !== 'supervisor')).toEqual(['short-cool']);
  expect(said('professional')).toEqual(['Skipped, not in the chosen feel.']);
  expect(said('random-fun')).toEqual(['Skipped, not in the chosen feel.']);
  // Valid picks first, invented one ignored, topped up from the pool; dupes and avoid words gone.
  expect(cards.map((c) => c.name)).toEqual(['kast', 'rydo', 'zipr', 'tailo', 'vynl']);
  expect(cards.every((c) => c.from === 'short-cool' && c.round === 1 && c.domains.length === 0)).toBe(true);
  expect(logs.at(-1)).toMatchObject({ actor: 'system', level: 'done' });
});

test('names with nothing free get variant cards', async () => {
  replies['domain-checker'] = () => [{ for: 'kast', variants: ['getkast', 'rydo', 'Kast HQ'] }];
  const cards = await generateNames(profile, { ...inputs, tlds: ['com', 'dev'] }, log);
  expect(calls).toContain('domain-checker');
  const variants = cards.filter((c) => c.variantOf);
  expect(variants.map((c) => [c.name, c.variantOf])).toEqual([['getkast', 'kast'], ['kasthq', 'kast']]);
  expect(cards[1].name).toBe('getkast'); // right after kast
  expect(cards[0].domains.map((d) => d.status)).toEqual(['taken', 'taken']);
});

test('a failing namer is skipped, not fatal', async () => {
  const cards = await generateNames(profile, { ...inputs, feels: ['short-cool', 'random-fun'] }, log);
  expect(cards).toHaveLength(5);
  expect(logs.find((l) => l.actor === 'random-fun')?.level).toBe('warn');
});

test('refine returns new feedback cards, updated tlds and the reply', async () => {
  replies.feedback = () => ({
    reply: 'Calmer ones.',
    names: [{ name: 'rydo', from: 'short-cool', meaning: 'm', whyItFits: 'w' }, { name: 'quill', from: 'feedback', meaning: 'm', whyItFits: 'w' }],
    tlds: ['dev'],
  });
  const old = await generateNames(profile, inputs, log);
  const out = await refineNames({ profile, inputs, cards: old, chat: [], message: 'calmer, check .dev', round: 2 }, log);
  expect(out.reply).toBe('Calmer ones.');
  expect(out.inputs.tlds).toEqual(['dev']);
  expect(out.cards.map((c) => [c.name, c.from, c.round, c.domains.length])).toEqual([['quill', 'feedback', 2, 1]]);
});

test('a supervisor failure rejects the run', async () => {
  delete replies.supervisor;
  await expect(generateNames(profile, inputs, log)).rejects.toThrow('no reply for supervisor');
});
