import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { checkDomains, normalizeName } from './index';

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (fn: (url: string, init?: RequestInit) => Promise<Response>) => {
  const mock = vi.fn((url: string | URL, init?: RequestInit) => fn(String(url), init));
  vi.stubGlobal('fetch', mock);
  return mock;
};

test('normalizeName', () => {
  expect(normalizeName('Rydo')).toBe('rydo');
  expect(normalizeName('Get Rydo_HQ')).toBe('getrydohq');
  expect(normalizeName('zip.r!')).toBe('zipr');
  expect(normalizeName('my-app')).toBe('my-app');
  expect(normalizeName('-rydo')).toBeNull();
  expect(normalizeName('rydo-')).toBeNull();
  expect(normalizeName('a')).toBeNull();
  expect(normalizeName('!!!')).toBeNull();
  expect(normalizeName('a'.repeat(30))).toBe('a'.repeat(30));
  expect(normalizeName('a'.repeat(31))).toBeNull();
});

test('normalizeName on messy input', () => {
  expect(normalizeName('  My Cool  App  ')).toBe('mycoolapp');
  expect(normalizeName('ROCKET🚀ship')).toBe('rocketship');
  expect(normalizeName('🚀🚀')).toBeNull();
  expect(normalizeName('Café Olé')).toBe('cafeole');
  expect(normalizeName('Naïve Über')).toBe('naiveuber');
  expect(normalizeName('C++ & Co.')).toBe('cco');
  expect(normalizeName('---')).toBeNull();
  expect(normalizeName('')).toBeNull();
  expect(normalizeName('   ')).toBeNull();
  expect(normalizeName('The Most Amazing Productivity Application Ever')).toBeNull();
});

test('a hanging server gives unknown after 5 s, a refused connection right away', async () => {
  const server = createServer(() => {}); // accepts, never answers
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  const realFetch = globalThis.fetch;
  // Real fetch and real 5 s timeout, only the URL is swapped: .dev hangs, everything else is refused.
  stubFetch((url, init) => realFetch(url.endsWith('.dev') ? `http://127.0.0.1:${port}/` : 'http://127.0.0.1:1/', init));
  try {
    let t = Date.now();
    expect((await checkDomains(['refusetest'], ['com'])).refusetest[0].status).toBe('unknown');
    expect(Date.now() - t).toBeLessThan(1000);
    t = Date.now();
    expect((await checkDomains(['hangtest'], ['dev'])).hangtest[0].status).toBe('unknown');
    expect(Date.now() - t).toBeGreaterThanOrEqual(4900);
    expect(Date.now() - t).toBeLessThan(6000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}, 10_000);

test('maps RDAP status codes and adds register links only when available', async () => {
  const fetch = stubFetch(async (url) => {
    if (url.endsWith('.com')) return new Response('{}', { status: 200 });
    if (url.endsWith('.dev')) return new Response('', { status: 404 });
    if (url.endsWith('.app')) return new Response('', { status: 503 });
    throw new Error('network down');
  });
  const out = await checkDomains(['Map Test'], ['com', 'dev', 'app', 'ai']);
  expect(out['Map Test']).toEqual([
    { tld: 'com', domain: 'maptest.com', status: 'taken' },
    { tld: 'dev', domain: 'maptest.dev', status: 'available', registerUrl: 'https://porkbun.com/checkout/search?q=maptest.dev' },
    { tld: 'app', domain: 'maptest.app', status: 'unknown' },
    { tld: 'ai', domain: 'maptest.ai', status: 'unknown' },
  ]);
  expect(fetch).toHaveBeenCalledWith('https://rdap.verisign.com/com/v1/domain/maptest.com', expect.anything());
});

test('no tlds or bad names means no lookups', async () => {
  const fetch = stubFetch(async () => new Response('', { status: 404 }));
  expect(await checkDomains(['rydo'], [])).toEqual({ rydo: [] });
  expect(await checkDomains(['!!'], ['com'])).toEqual({ '!!': [] });
  expect(fetch).not.toHaveBeenCalled();
});

test('caches known results but retries unknown ones', async () => {
  const fetch = stubFetch(async (url) => new Response('', { status: url.endsWith('.com') ? 200 : 500 }));
  await checkDomains(['cachetest'], ['com', 'dev']);
  await checkDomains(['cachetest'], ['com', 'dev']);
  expect(fetch.mock.calls.filter(([u]) => String(u).endsWith('.com'))).toHaveLength(1);
  expect(fetch.mock.calls.filter(([u]) => String(u).endsWith('.dev'))).toHaveLength(2);
});

test('the same domain asked twice at once is fetched once', async () => {
  const fetch = stubFetch(async () => new Response('', { status: 404 }));
  const [a, b] = await Promise.all([checkDomains(['dupetest'], ['ai']), checkDomains(['dupetest', 'DupeTest'], ['ai', 'ai'])]);
  expect(a.dupetest).toEqual(b.DupeTest);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('runs at most 4 lookups at once', async () => {
  let active = 0, peak = 0;
  stubFetch(async () => {
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return new Response('', { status: 404 });
  });
  const names = Array.from({ length: 6 }, (_, i) => `limit${i}`);
  const out = await checkDomains(names, ['com', 'dev', 'ai']);
  expect(peak).toBe(4);
  expect(Object.values(out).flat()).toHaveLength(18);
});
