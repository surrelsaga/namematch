import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  CandidateSchema, CandidatesSchema, NameInputsSchema, NamingPlanSchema, PickResultSchema, ProjectProfileSchema,
} from '../../shared/schemas';
import type { Candidate, Feel, NameInputs, NamingPlan, ProjectProfile } from '../../shared/types';
import { professional, randomFun, shortCool, supervisor } from '../agents';
import { generateJson } from '../generate-json';
import { DomainCheckInputSchema, FEEL_LABEL, NameCardSchema, RETRY, getLog, list, type Picked } from './common';
import { domainCheck } from './domain-check';

const TOTAL = 10;
const PICKS = 5;

const InputSchema = z.object({ profile: ProjectProfileSchema, inputs: NameInputsSchema });
const PlannedSchema = InputSchema.extend({ plan: NamingPlanSchema });
const NamerOutSchema = z.object({ candidates: CandidatesSchema });
// The step sets "from" itself; with thinking off a namer sometimes puts the twist there, which cost a JSON retry.
const NamerReplySchema = z.array(CandidateSchema.omit({ from: true }));

const brief = (profile: ProjectProfile, inputs: NameInputs) => ({
  project: profile, kind: inputs.kind, audience: inputs.audience, keep: inputs.keep, avoid: inputs.avoid,
});

const planPrompt = (profile: ProjectProfile, inputs: NameInputs) => `Task: plan which namers to use.

Project: ${JSON.stringify(brief(profile, inputs))}
Chosen feels: ${JSON.stringify(inputs.feels)}

Rules:
- One namer per chosen feel, no others.
- Split about ${TOTAL} names between them. One feel gets all ${TOTAL}. Two feels: split by fit, like 6 and 4.
- If kind is "startup" and "professional" is chosen, give "professional" the bigger share.
- twist: one short line of creative direction drawn from the project, the audience and any keep words.
- reasoning: one plain sentence on why you split it this way.

Return {"namers": [{"feel": "...", "count": 6}], "twist": "...", "reasoning": "..."}

Examples:
- CLI log tool, feels ["short-cool", "random-fun"]: {"namers": [{"feel": "short-cool", "count": 6}, {"feel": "random-fun", "count": 4}], "twist": "terminal vibes", "reasoning": "Developers like short names they can type, with a few fun ones to compare."}
- invoicing startup, feels ["professional", "short-cool"]: {"namers": [{"feel": "professional", "count": 6}, {"feel": "short-cool", "count": 4}], "twist": "money that arrives on time", "reasoning": "Businesses trust credible names, so professional gets the bigger share."}`;

/** Exactly the chosen feels, whatever the model said; a feel it left out gets an even share. */
function fixPlan(plan: NamingPlan, feels: Feel[]): NamingPlan {
  const count = (feel: Feel) => plan.namers.find((x) => x.feel === feel)?.count ?? Math.round(TOTAL / feels.length);
  return { ...plan, namers: feels.map((feel) => ({ feel, count: Math.min(count(feel), TOTAL) })) };
}

const supervisorPlan = createStep({
  id: 'supervisor-plan',
  inputSchema: InputSchema,
  outputSchema: PlannedSchema,
  execute: async ({ inputData: { profile, inputs }, requestContext }) => {
    const log = getLog(requestContext);
    log('supervisor', 'Planning which namers to use.');
    const plan = fixPlan(await generateJson(supervisor, planPrompt(profile, inputs), NamingPlanSchema), inputs.feels);
    const using = plan.namers.map((n) => `${FEEL_LABEL[n.feel]} (${n.count} names)`).join(' and ');
    log('supervisor', `Using ${using}. Twist: "${plan.twist.replace(/[.!\s]+$/, '')}". ${plan.reasoning}`);
    return { profile, inputs, plan };
  },
});

/** One step per feel; returns [] and logs "skipped" when the plan doesn't use it. */
const namer = (feel: Feel, agent: Agent) => createStep({
  id: feel,
  inputSchema: PlannedSchema,
  outputSchema: NamerOutSchema,
  execute: async ({ inputData: { profile, inputs, plan }, requestContext }) => {
    const log = getLog(requestContext);
    const slot = plan.namers.find((n) => n.feel === feel);
    if (!slot) {
      log(feel, 'Skipped, not in the chosen feel.');
      return { candidates: [] };
    }
    const prompt = `Come up with ${slot.count} names.\n${JSON.stringify({
      ...brief(profile, inputs), twist: plan.twist, count: slot.count, alreadyUsed: [],
    }, null, 2)}`;
    try {
      const got = await generateJson(agent, prompt, NamerReplySchema);
      const candidates = got.map((c): Candidate => ({ ...c, from: feel }));
      log(feel, `Returned ${candidates.length}: ${list(candidates.map((c) => c.name))}.`);
      return { candidates };
    } catch {
      // One namer failing shouldn't sink the round; supervisorPick fails if nobody returned anything.
      log(feel, 'Had trouble coming up with names, skipped this time.', 'warn');
      return { candidates: [] };
    }
  },
});

const pickPrompt = (profile: ProjectProfile, inputs: NameInputs, pool: Candidate[], n: number) => `Task: pick the best ${n} names.

Project: ${JSON.stringify(brief(profile, inputs))}
Candidates: ${JSON.stringify(pool)}

Rules:
- Only pick names from the candidates, spelled exactly the same.
- Drop near-duplicates, names containing an avoid word, and names too close to a well-known brand or product.
- If candidates came from more than one feel, include some of each.
- whyItFits: one plain sentence on why the name fits this project.
- dropped: one plain sentence on what you dropped and why, like "Dropped kast, too close to an existing brand." Say "Dropped nothing notable." if so.

Return {"picks": [{"name": "...", "whyItFits": "..."}], "dropped": "..."}`;

const supervisorPick = createStep({
  id: 'supervisor-pick',
  inputSchema: z.object(Object.fromEntries(
    (['professional', 'short-cool', 'random-fun'] as const).map((f) => [f, NamerOutSchema]),
  ) as Record<Feel, typeof NamerOutSchema>),
  outputSchema: DomainCheckInputSchema,
  execute: async ({ inputData, getInitData, requestContext }) => {
    const log = getLog(requestContext);
    const { profile, inputs } = getInitData<z.infer<typeof InputSchema>>();

    // Dedupe and drop avoid words in code too, so the model only judges taste.
    const avoid = inputs.avoid.map((a) => a.trim().toLowerCase()).filter(Boolean);
    const seen = new Set<string>();
    const pool = Object.values(inputData).flatMap((o) => o.candidates).filter((c) => {
      const k = c.name.toLowerCase();
      if (seen.has(k) || avoid.some((a) => k.includes(a))) return false;
      seen.add(k);
      return true;
    });
    if (!pool.length) throw new Error('The namers did not come up with any names. Try again.');

    const n = Math.min(PICKS, pool.length);
    const out = await generateJson(supervisor, pickPrompt(profile, inputs, pool, n), PickResultSchema);

    // Ignore invented or repeated picks, top up from the pool if the model picked too few.
    const picked: Picked[] = [];
    for (const p of out.picks) {
      const c = pool.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (c && !picked.some((x) => x.name === c.name) && picked.length < n) picked.push({ ...c, whyItFits: p.whyItFits });
    }
    for (const c of pool) {
      if (picked.length >= n) break;
      if (!picked.some((x) => x.name === c.name)) picked.push({ ...c, whyItFits: c.meaning });
    }

    log('supervisor', `Picked ${picked.length}: ${list(picked.map((p) => p.name))}. ${out.dropped}`);
    return { picked, tlds: inputs.tlds, round: 1 };
  },
});

export const generateNames = createWorkflow({
  id: 'generateNames',
  inputSchema: InputSchema,
  outputSchema: z.object({ cards: z.array(NameCardSchema) }),
  retryConfig: RETRY,
})
  .then(supervisorPlan)
  .parallel([namer('professional', professional), namer('short-cool', shortCool), namer('random-fun', randomFun)])
  .then(supervisorPick)
  .then(domainCheck)
  .commit();
