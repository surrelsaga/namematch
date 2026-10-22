import { afterEach, expect, test, vi } from 'vitest';
import { checkDomains, normalizeName } from './index';

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (fn: (url: string) => Promise<Response>) => {
  const mock = vi.fn((url: string | URL) => fn(String(url)));
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
