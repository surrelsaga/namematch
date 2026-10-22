import type { DomainResult, DomainStatus, Tld } from '../shared/types';

const RDAP: Record<Tld, string> = {
  com: 'https://rdap.verisign.com/com/v1/',
  dev: 'https://pubapi.registry.google/rdap/',
  app: 'https://pubapi.registry.google/rdap/',
  tech: 'https://rdap.radix.host/rdap/',
  ai: 'https://rdap.identitydigital.services/rdap/',
};
const MAX_PARALLEL = 4;
const TIMEOUT_MS = 5000;

export function normalizeName(name: string): string | null {
  // NFD splits "é" into "e" + accent mark, so the accent is dropped but the letter kept.
  const n = name.normalize('NFD').toLowerCase().replace(/[\s_]+/g, '').replace(/[^a-z0-9-]/g, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(n) && n.length >= 2 && n.length <= 30 ? n : null;
}

// Global limit across all sessions. A finished lookup hands its slot straight to the next waiter.
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active < MAX_PARALLEL) active++;
  else await new Promise<void>((r) => waiting.push(r));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

async function lookup(domain: string, tld: Tld): Promise<DomainStatus> {
  try {
    const res = await fetch(`${RDAP[tld]}domain/${domain}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel();
    return res.status === 200 ? 'taken' : res.status === 404 ? 'available' : 'unknown';
  } catch {
    return 'unknown';
  }
}

// ponytail: unbounded in-memory cache, fine at a few dozen names per session; add a TTL/LRU if the server runs for weeks.
const cache = new Map<string, Promise<DomainStatus>>();
function status(domain: string, tld: Tld): Promise<DomainStatus> {
  let p = cache.get(domain);
  if (!p) {
    p = limited(() => lookup(domain, tld));
    cache.set(domain, p);
    // Don't remember failures, the next round should try again.
    p.then((s) => s === 'unknown' && cache.delete(domain));
  }
  return p;
}

/** Keys are the names as given. Names that aren't domain-friendly get no results. */
export async function checkDomains(
  names: string[], tlds: Tld[],
): Promise<Record<string, DomainResult[]>> {
  const uniqueTlds = [...new Set(tlds)];
  return Object.fromEntries(await Promise.all(names.map(async (name) => {
    const n = normalizeName(name);
    const results = n ? await Promise.all(uniqueTlds.map(async (tld): Promise<DomainResult> => {
      const domain = `${n}.${tld}`;
      const s = await status(domain, tld);
      return s === 'available'
        ? { tld, domain, status: s, registerUrl: `https://porkbun.com/checkout/search?q=${domain}` }
        : { tld, domain, status: s };
    })) : [];
    return [name, results] as const;
  })));
}
