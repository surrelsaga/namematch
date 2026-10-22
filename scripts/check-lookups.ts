// Run: pnpm tsx --env-file=.env scripts/check-lookups.ts   (live network, GITHUB_TOKEN optional)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import repos from '../fixtures/repos.json';
import { checkDomains, normalizeName } from '../src/domains';
import { readSource } from '../src/sources';
import { TLDS, type Source } from '../src/shared/types';

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

// Count live RDAP requests and the peak number in flight.
const realFetch = globalThis.fetch;
let rdapCalls = 0, inFlight = 0, peak = 0;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('rdap')) return realFetch(url, init);
  rdapCalls++;
  peak = Math.max(peak, ++inFlight);
  try {
    return await realFetch(url, init);
  } finally {
    inFlight--;
  }
};

const random = 'xqzvplm7nammit';

await check(`google.* taken and ${random}.* available on all 5 TLDs`, async () => {
  const t = Date.now();
  const out = await checkDomains(['google', random], [...TLDS]);
  console.table(TLDS.map((tld, i) => ({
    tld, google: out.google[i].status, [random]: out[random][i].status, registerUrl: out[random][i].registerUrl,
  })));
  const bad = [
    ...out.google.filter((d) => d.status !== 'taken' || d.registerUrl),
    ...out[random].filter((d) => d.status !== 'available' || !d.registerUrl),
  ];
  if (bad.length) throw new Error(bad.map((d) => `${d.domain} ${d.status}`).join(', '));
  return `${rdapCalls} lookups in ${Date.now() - t} ms, peak ${peak} at once`;
});

await check('max 4 lookups at once (20 new domains)', async () => {
  peak = 0;
  const names = Array.from({ length: 4 }, (_, i) => `nammitpeak${i}${Date.now().toString(36)}`);
  const out = await checkDomains(names, [...TLDS]);
  if (peak > 4) throw new Error(`peak was ${peak}`);
  return `${Object.values(out).flat().length} results, peak ${peak} at once`;
});

await check('repeat calls hit the cache', async () => {
  const before = rdapCalls, t = Date.now();
  await checkDomains(['google', random], [...TLDS]);
  if (rdapCalls !== before) throw new Error(`${rdapCalls - before} new requests`);
  return `0 new requests, ${Date.now() - t} ms`;
});

await check('hanging and failing servers give unknown, not a hang', async () => {
  const server = createServer(() => {}); // never answers
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  globalThis.fetch = (url, init) =>
    realFetch(String(url).endsWith('.dev') ? `http://127.0.0.1:${port}/` : 'http://127.0.0.1:1/', init);
  try {
    let t = Date.now();
    const refused = (await checkDomains(['nammitrefused'], ['com'])).nammitrefused[0].status;
    const refusedMs = Date.now() - t;
    t = Date.now();
    const hung = (await checkDomains(['nammithung'], ['dev'])).nammithung[0].status;
    const hungMs = Date.now() - t;
    if (refused !== 'unknown' || hung !== 'unknown' || hungMs > 6000) throw new Error(`${refused} ${hung} ${hungMs} ms`);
    return `refused → ${refused} in ${refusedMs} ms, hanging → ${hung} in ${hungMs} ms`;
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    server.close();
  }
});

await check('normalizeName on messy input', async () => {
  const inputs = ['  My Cool  App  ', 'ROCKET🚀ship', '🚀🚀', 'Café Olé', 'C++ & Co.', 'get_rydo-HQ', '-dash-', '', 'x',
    'The Most Amazing Productivity Application Ever'];
  console.table(inputs.map((input) => ({ input, output: normalizeName(input) })));
  return `${inputs.length} inputs`;
});

const sources: [string, Source][] = [
  ...Object.entries(repos).map(([kind, url]): [string, Source] => [`${kind} repo`, { kind: 'github', url }]),
  ...['log-tool.md', 'todo-app.md'].map((f): [string, Source] => [f, { kind: 'markdown', text: readFileSync(`fixtures/${f}`, 'utf8'), filename: f }]),
];
const rows: Record<string, string | number>[] = [];
for (const [name, source] of sources) {
  await check(`read ${name}`, async () => {
    const { label, text } = await readSource(source);
    if (text.length < 200 || text.length > 12_000) throw new Error(`${text.length} chars`);
    const lines = text.split('\n');
    rows.push({ source: name, label, chars: text.length, title: lines[0], summary: lines.find((l, i) => i > 0 && l.trim()) ?? '' });
    return label;
  });
}
console.table(rows);

for (const [name, source] of [
  ['bad URL', { kind: 'github', url: 'https://gitlab.com/foo/bar' }],
  ['missing or private repo', { kind: 'github', url: `https://github.com/${random}/${random}` }],
  ['empty .md', { kind: 'markdown', text: '   \n' }],
] as [string, Source][]) {
  await check(`${name} error`, async () => {
    try {
      await readSource(source);
    } catch (e) {
      return `"${(e as Error).message}"`;
    }
    throw new Error('no error thrown');
  });
}

console.log(results.every(Boolean) ? '\nAll checks passed.' : '\nSome checks failed.');
process.exit(results.every(Boolean) ? 0 : 1);
