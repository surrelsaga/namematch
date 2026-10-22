// STUBS. Block B replaces these with the real RDAP lookups.
import type { DomainResult, Tld } from '../shared/types';

export function normalizeName(name: string): string | null {
  const n = name.toLowerCase().replace(/[\s_]+/g, '').replace(/[^a-z0-9-]/g, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(n) && n.length >= 2 && n.length <= 30 ? n : null;
}

/** Fake: .com is always taken, "kast" is taken everywhere, "zipr.ai" is unknown, the rest is free. */
export async function checkDomains(
  names: string[], tlds: Tld[],
): Promise<Record<string, DomainResult[]>> {
  await new Promise((r) => setTimeout(r, 300));
  return Object.fromEntries(names.map((name) => [name, tlds.map((tld): DomainResult => {
    const domain = `${name}.${tld}`;
    const status = tld === 'com' || name === 'kast' ? 'taken' : name === 'zipr' && tld === 'ai' ? 'unknown' : 'available';
    return status === 'available'
      ? { tld, domain, status, registerUrl: `https://www.namecheap.com/domains/registration/results/?domain=${domain}` }
      : { tld, domain, status };
  })]));
}
