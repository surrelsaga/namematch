// Run: pnpm tsx scripts/sanity.ts   (needs .env)
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { generateJson } from '../src/mastra/generate-json';
import { getModel, type ModelTier } from '../src/mastra/models';

const results: boolean[] = [];

async function check(name: string, fn: () => Promise<string>) {
  try {
    console.log(`PASS  ${name}: ${await fn()}`);
    results.push(true);
  } catch (e) {
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
    results.push(false);
  }
}

async function rdap(base: string, domain: string) {
  const res = await fetch(`${base}domain/${domain}`, { signal: AbortSignal.timeout(5000) });
  return res.status;
}

async function jsonCall(tier: ModelTier) {
  const agent = new Agent({
    id: `sanity-${tier}`,
    name: `Sanity ${tier}`,
    instructions: 'You answer with JSON only. No prose, no markdown.',
    model: getModel(tier),
  });
  const t = Date.now();
  const out = await generateJson(
    agent,
    'Return {"names": [three short brandable app names for a to-do app], "count": 3}',
    z.object({ names: z.array(z.string()).length(3), count: z.literal(3) }),
  );
  return `${tier} ${tier === 'main' ? process.env.MODEL_ID : process.env.FAST_MODEL_ID} ${out.names.join(', ')} (${Date.now() - t} ms)`;
}

await check('Gemma JSON call', async () => `${await jsonCall('main')} | ${await jsonCall('fast')}`);

await check('RDAP get.tech and random .tech', async () => {
  const base = 'https://rdap.radix.host/rdap/';
  const random = `namematch-${Math.random().toString(36).slice(2, 12)}`;
  const t = Date.now();
  const [taken, free] = [await rdap(base, 'get.tech'), await rdap(base, `${random}.tech`)];
  if (taken !== 200) throw new Error(`get.tech returned ${taken}, expected 200 (taken)`);
  if (free !== 404) throw new Error(`${random}.tech returned ${free}, expected 404 (available)`);
  return `get.tech taken, ${random}.tech available (${Date.now() - t} ms)`;
});

await check('GitHub README fetch', async () => {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.raw+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch('https://api.github.com/repos/sharkdp/bat/readme', { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const text = await res.text();
  if (!text.length) throw new Error('README was empty');
  return `sharkdp/bat README, ${text.length} chars`;
});

console.log(results.every(Boolean) ? '\nAll checks passed.' : '\nSome checks failed.');
process.exit(results.every(Boolean) ? 0 : 1);
