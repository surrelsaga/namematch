// STUBS. Final signatures, fake data. Block A replaces the bodies with the real workflows.
import { randomUUID } from 'node:crypto';
import { checkDomains } from '../domains';
import type {
  Candidate, ChatTurn, Logger, NameCard, NameInputs, ProjectProfile, SourceText,
} from '../shared/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(300 + Math.random() * 500);

async function say(log: Logger, ...args: Parameters<Logger>) {
  await pause();
  log(...args);
}

const FAKE_NAMES: Candidate[] = [
  { name: 'rydo', from: 'short-cool', meaning: 'Short and easy to type, hints at "ride" and "do".' },
  { name: 'pooli', from: 'random-fun', meaning: 'Playful, like a pool of ideas.' },
  { name: 'zipr', from: 'short-cool', meaning: 'Quick, like a zipper closing.' },
  { name: 'kast', from: 'short-cool', meaning: 'Sounds like casting something out.' },
  { name: 'vynl', from: 'random-fun', meaning: 'A vinyl record with the vowel dropped.' },
];

/** Cards for candidates; names with nothing available get one extra variant card. */
async function toCards(
  list: Candidate[], tlds: NameInputs['tlds'], round: number, log: Logger,
): Promise<NameCard[]> {
  const card = (c: Candidate, domains: NameCard['domains'], variantOf?: string): NameCard => ({
    id: randomUUID(), name: c.name, from: c.from, meaning: c.meaning,
    whyItFits: `Fits the project and is easy to say out loud.`, domains, variantOf, round,
  });
  if (!tlds.length) return list.map((c) => card(c, []));

  const found = await checkDomains(list.map((c) => c.name), tlds);
  const cards: NameCard[] = [];
  for (const c of list) {
    const domains = found[c.name] ?? [];
    cards.push(card(c, domains));
    if (domains.some((d) => d.status === 'available')) continue;
    await say(log, 'domain-checker', `${domains.map((d) => `${c.name}.${d.tld}`).join(', ')} all taken. Suggesting variants.`);
    const v = `get${c.name}`;
    const vDomains = (await checkDomains([v], tlds))[v] ?? [];
    const free = vDomains.find((d) => d.status === 'available');
    await say(log, 'domain-checker', free ? `${free.domain} available.` : `${v} is taken too.`);
    cards.push(card({ name: v, from: c.from, meaning: `${c.name} with a "get" prefix.` }, vDomains, c.name));
  }
  return cards;
}

export async function analyzeProject(
  source: SourceText, log: Logger,
): Promise<{ profile: ProjectProfile; suggested: NameInputs }> {
  await say(log, 'supervisor', `Read ${source.label}. Looks like a command line tool for developers.`);
  await say(log, 'supervisor', 'Filled in the questions below. Check them and change anything that is off.', 'done');
  return {
    profile: {
      title: source.label,
      summary: 'A small command line tool that helps developers do a boring task faster.',
      keywords: ['cli', 'developer tools', 'automation', 'productivity'],
    },
    suggested: { kind: 'dev-tool', feels: ['short-cool', 'random-fun'], audience: 'developers', keep: [], avoid: [], tlds: [] },
  };
}

export async function generateNames(
  profile: ProjectProfile, inputs: NameInputs, log: Logger,
): Promise<NameCard[]> {
  const [a, b] = inputs.feels;
  await say(log, 'supervisor', `Using ${a}${b ? ` and ${b}` : ''}. Twist: "terminal vibes".`);
  if (!inputs.feels.includes('professional')) await say(log, 'professional', 'Skipped, not in the chosen feel.');
  await say(log, 'short-cool', 'Returned 3: rydo, zipr, kast.');
  if (inputs.feels.includes('random-fun')) await say(log, 'random-fun', 'Returned 2: pooli, vynl.');
  else await say(log, 'random-fun', 'Skipped, not in the chosen feel.');
  await say(log, 'supervisor', `Picked 5 for "${profile.title ?? 'your project'}". Dropped nothing.`);
  if (!inputs.tlds.length) await say(log, 'system', 'No domains picked, skipping domain checks.');
  const cards = await toCards(FAKE_NAMES, inputs.tlds, 1, log);
  const free = cards.filter((c) => c.domains.some((d) => d.status === 'available')).length;
  await say(log, 'system', `Done: ${cards.length} names, ${free} with an available domain.`, 'done');
  return cards;
}

export async function refineNames(
  ctx: {
    profile: ProjectProfile; inputs: NameInputs; cards: NameCard[];
    chat: ChatTurn[]; message: string; round: number;
  },
  log: Logger,
): Promise<{ reply: string; cards: NameCard[]; inputs: NameInputs }> {
  await say(log, 'feedback', `Read your message: "${ctx.message.slice(0, 60)}".`);
  const fresh: Candidate[] = [
    { name: 'quill', from: 'feedback', meaning: 'A writing pen, calm and classic.' },
    { name: 'brevo', from: 'feedback', meaning: 'From "brief", short and friendly.' },
  ];
  await say(log, 'feedback', 'Came up with 2 new names: quill, brevo.');
  const cards = await toCards(fresh, ctx.inputs.tlds, ctx.round, log);
  await say(log, 'system', `Done: ${cards.length} new names.`, 'done');
  return { reply: 'Here are two calmer options, quill and brevo. Want them shorter still?', cards, inputs: ctx.inputs };
}
