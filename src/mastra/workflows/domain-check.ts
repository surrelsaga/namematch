import { randomUUID } from 'node:crypto';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { checkDomains, normalizeName } from '../../domains';
import { VariantsSchema } from '../../shared/schemas';
import type { DomainResult, NameCard, Tld } from '../../shared/types';
import { domainChecker } from '../agents';
import { generateJson } from '../generate-json';
import { DomainCheckInputSchema, NameCardSchema, getLog, list, type Picked } from './common';

const MAX_VARIANTS = 6;
const isFree = (d: DomainResult) => d.status === 'available';

/** Domain results per name, in the same order. Names that can't be a domain get []. */
async function lookup(names: string[], tlds: Tld[]): Promise<DomainResult[][]> {
  const norm = names.map(normalizeName);
  const found = await checkDomains([...new Set(norm.filter((n): n is string => !!n))], tlds);
  return norm.map((n) => (n && found[n]) || []);
}

/** Shared last step: look up domains, ask for variants of names with nothing free, keep variants that have a free domain. */
export const domainCheck = createStep({
  id: 'domain-check',
  inputSchema: DomainCheckInputSchema,
  outputSchema: z.object({ cards: z.array(NameCardSchema) }),
  execute: async ({ inputData: { picked, tlds, round }, requestContext }) => {
    const log = getLog(requestContext);
    const card = (p: Picked, domains: DomainResult[], variantOf?: string): NameCard =>
      ({ id: randomUUID(), ...p, domains, variantOf, round });

    if (!tlds.length) {
      log('system', 'No domains picked, skipping domain checks.');
      log('system', `Done: ${picked.length} names.`, 'done');
      return { cards: picked.map((p) => card(p, [])) };
    }

    log('system', `Checking ${tlds.map((t) => `.${t}`).join(' ')} for ${picked.length} names.`);
    const found = await lookup(picked.map((p) => p.name), tlds);
    const stuck = picked.filter((_, i) => !found[i].some(isFree));
    const extra = new Map<Picked, NameCard[]>();

    if (stuck.length) {
      const facts = stuck.map((p) => {
        const d = found[picked.indexOf(p)];
        const text = d.length ? d.map((r) => `${r.domain} ${r.status}`).join(', ') : `${p.name} can't be used as a domain`;
        log('domain-checker', `${text}. Suggesting variants.`);
        return `- ${p.name}: ${text}`;
      });

      let suggested: z.infer<typeof VariantsSchema> = [];
      try {
        suggested = await generateJson(domainChecker, [
          'Suggest variants for these names. Lookup results:', ...facts,
          `Don't suggest any of these existing names: ${list(picked.map((p) => p.name))}.`,
        ].join('\n'), VariantsSchema);
      } catch {
        log('domain-checker', 'Could not come up with variants this time.', 'warn');
      }

      // Keep it to MAX_VARIANTS lookups per round, skip repeats and names that can't be domains.
      const seen = new Set(picked.map((p) => normalizeName(p.name)));
      const tries: { of: Picked; name: string }[] = [];
      for (const s of suggested) {
        const of = stuck.find((p) => normalizeName(p.name) === normalizeName(s.for));
        for (const v of of ? s.variants : []) {
          const n = normalizeName(v);
          if (!n || seen.has(n) || tries.length >= MAX_VARIANTS) continue;
          seen.add(n);
          tries.push({ of: of!, name: n });
        }
      }

      const vFound = await lookup(tries.map((t) => t.name), tlds);
      tries.forEach(({ of, name }, i) => {
        const free = vFound[i].filter(isFree);
        if (!free.length) return;
        log('domain-checker', `${list(free.map((d) => d.domain))} available.`);
        extra.set(of, [...(extra.get(of) ?? []), card({ ...of, name }, vFound[i], of.name)]);
      });
      for (const p of stuck) if (!extra.has(p)) log('domain-checker', `No free variant found for ${p.name}.`);
    }

    // Variants sit right after the name they came from.
    const cards = picked.flatMap((p, i) => [card(p, found[i]), ...(extra.get(p) ?? [])]);
    const withFree = cards.filter((c) => c.domains.some(isFree)).length;
    log('system', `Done: ${cards.length} names, ${withFree} with an available domain.`, 'done');
    return { cards };
  },
});
