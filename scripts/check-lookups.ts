// Run: pnpm tsx --env-file=.env scripts/check-lookups.ts   (live network, GITHUB_TOKEN optional)
import repos from '../fixtures/repos.json';
import { checkDomains } from '../src/domains';
import { readSource } from '../src/sources';
import { TLDS } from '../src/shared/types';

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

const random = `nammit${Math.random().toString(36).slice(2, 14)}`;

await check(`get.* taken and ${random}.* available on all 5 TLDs`, async () => {
  const t = Date.now();
  const out = await checkDomains(['get', random], [...TLDS]);
  const bad = [
    ...out.get.filter((d) => d.status !== 'taken'),
    ...out[random].filter((d) => d.status !== 'available' || !d.registerUrl),
  ];
  if (bad.length) throw new Error(bad.map((d) => `${d.domain} ${d.status}`).join(', '));
  return `${out.get.length + out[random].length} lookups (${Date.now() - t} ms), e.g. ${out[random][0].registerUrl}`;
});

await check('cached lookups are instant', async () => {
  const t = Date.now();
  await checkDomains(['get'], [...TLDS]);
  if (Date.now() - t > 50) throw new Error(`took ${Date.now() - t} ms`);
  return `${Date.now() - t} ms`;
});

for (const [kind, url] of Object.entries(repos)) {
  await check(`read ${kind} repo`, async () => {
    const { label, text } = await readSource({ kind: 'github', url });
    if (text.length < 500) throw new Error(`only ${text.length} chars`);
    const sections = text.match(/^## .+$/gm)?.join(', ');
    return `${label}, ${text.length} chars, sections: ${sections}\n      ${text.split('\n')[1]}`;
  });
}

await check('missing repo error', async () => {
  try {
    await readSource({ kind: 'github', url: `https://github.com/${random}/${random}` });
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('no error thrown');
});

console.log(results.every(Boolean) ? '\nAll checks passed.' : '\nSome checks failed.');
process.exit(results.every(Boolean) ? 0 : 1);
