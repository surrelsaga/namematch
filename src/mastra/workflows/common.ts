import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { CandidateSchema, TldSchema } from '../../shared/schemas';
import type { Feel, Logger } from '../../shared/types';

/** run.ts puts the session Logger here; Studio runs have none and log to the console. */
export const LOG_KEY = 'log';
const consoleLog: Logger = (actor, text, level = 'info') => console.log(`[${level}] ${actor.padEnd(14)} ${text}`);
export const getLog = (ctx: RequestContext): Logger => (ctx.get(LOG_KEY) as Logger | undefined) ?? consoleLog;

export const FEEL_LABEL: Record<Feel, string> = {
  professional: 'Professional',
  'short-cool': 'Short & cool',
  'random-fun': 'Random & fun',
};

export const list = (names: string[]) => names.join(', ');

/** A candidate that made the cut, ready for domain checks. */
export const PickedSchema = CandidateSchema.extend({ whyItFits: z.string() });
export type Picked = z.infer<typeof PickedSchema>;

export const DomainCheckInputSchema = z.object({
  picked: z.array(PickedSchema),
  tlds: z.array(TldSchema),
  round: z.number().int().positive(),
});

const DomainResultSchema = z.object({
  tld: TldSchema,
  domain: z.string(),
  status: z.enum(['taken', 'available', 'unknown']),
  registerUrl: z.string().optional(),
});

export const NameCardSchema = PickedSchema.extend({
  id: z.string(),
  domains: z.array(DomainResultSchema),
  variantOf: z.string().optional(),
  round: z.number(),
});
