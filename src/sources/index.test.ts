import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { readSource } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const repoInfo = {
  full_name: 'Acme/rocket', default_branch: 'trunk', description: 'Fast rockets', topics: ['cli', 'space'], language: 'Rust',
};

/** Fake GitHub: routes by URL, anything unknown is a 404. */
const stubGithub = (routes: Record<string, () => Response>) => {
  const mock = vi.fn(async (url: string | URL) => {
    const hit = Object.entries(routes).find(([k]) => String(url).endsWith(k));
    return hit ? hit[1]() : new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

test('markdown is trimmed to 12k chars', async () => {
  const out = await readSource({ kind: 'markdown', text: `  ${'x'.repeat(20_000)}`, filename: 'idea.md' });
  expect(out).toEqual({ label: 'idea.md', text: 'x'.repeat(12_000) });
  expect((await readSource({ kind: 'markdown', text: 'hi' })).label).toBe('pasted text');
  await expect(readSource({ kind: 'markdown', text: '  \n' })).rejects.toThrow('empty');
});

test.each(['log-tool.md', 'todo-app.md'])('reads the %s fixture', async (file) => {
  const text = readFileSync(`fixtures/${file}`, 'utf8');
  const out = await readSource({ kind: 'markdown', text, filename: file });
  expect(out).toEqual({ label: file, text: text.trim() });
  expect(out.text).toMatch(/^# \S/);
});

test('a huge README still fits in 12k', async () => {
  stubGithub({
    '/repos/a/b': () => Response.json(repoInfo),
    '/readme': () => new Response('r'.repeat(50_000)),
    '/package.json': () => new Response('p'.repeat(50_000)),
  });
  const out = await readSource({ kind: 'github', url: 'https://github.com/a/b' });
  expect(out.text.length).toBeLessThanOrEqual(12_000);
  expect(out.text).toContain(`\n${'r'.repeat(8_000)}\n`);
  expect(out.text).toContain(`## package.json\n${'p'.repeat(1_500)}`);
  expect(out.text).not.toContain('p'.repeat(1_501));
});

test('combines repo info, README and manifests', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'tok');
  const fetch = stubGithub({
    '/repos/acme/rocket': () => Response.json(repoInfo),
    '/repos/Acme/rocket/readme': () => new Response('# Rocket\nLaunches things.'),
    '/Acme/rocket/trunk/Cargo.toml': () => new Response('[package]\nname = "rocket"'),
  });
  const out = await readSource({ kind: 'github', url: 'github.com/acme/rocket.git/tree/main/src' });
  expect(out.label).toBe('Acme/rocket');
  expect(out.text).toBe([
    '# Acme/rocket', 'Description: Fast rockets', 'Topics: cli, space', 'Language: Rust',
    '\n## README\n# Rocket\nLaunches things.', '\n## Cargo.toml\n[package]\nname = "rocket"',
  ].join('\n'));
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
});

test('clear errors', async () => {
  await expect(readSource({ kind: 'github', url: 'https://gitlab.com/a/b' })).rejects.toThrow('Not a GitHub repo URL');
  for (const url of ['https://github.com/only-owner', 'not a url at all', '', 'https://github.com.evil.io/a/b']) {
    await expect(readSource({ kind: 'github', url })).rejects.toThrow('Not a GitHub repo URL');
  }

  stubGithub({});
  await expect(readSource({ kind: 'github', url: 'https://github.com/a/b' })).rejects.toThrow('Repo not found or private');

  stubGithub({ '/repos/a/b': () => new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }) });
  await expect(readSource({ kind: 'github', url: 'https://github.com/a/b' })).rejects.toThrow('GitHub rate limit hit, try again later');

  vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed'); });
  await expect(readSource({ kind: 'github', url: 'https://github.com/a/b' })).rejects.toThrow("Couldn't reach GitHub");
});
