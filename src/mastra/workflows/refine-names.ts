import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { FeedbackOutputSchema, NameInputsSchema, ProjectProfileSchema } from '../../shared/schemas';
import { TLDS } from '../../shared/types';
import { feedback } from '../agents';
import { generateJson } from '../generate-json';
import { DomainCheckInputSchema, NameCardSchema, RETRY, getLog, list, type Picked } from './common';
import { domainCheck } from './domain-check';

const InputSchema = z.object({
  profile: ProjectProfileSchema,
  inputs: NameInputsSchema,
  cards: z.array(NameCardSchema),
  chat: z.array(z.object({ role: z.enum(['user', 'agent']), text: z.string(), at: z.string() })),
  message: z.string(),
  round: z.number().int().positive(),
});
const OutputSchema = z.object({ reply: z.string(), cards: z.array(NameCardSchema), inputs: NameInputsSchema });

const feedbackStep = createStep({
  id: 'feedback',
  inputSchema: InputSchema,
  outputSchema: DomainCheckInputSchema.extend({ reply: z.string(), inputs: NameInputsSchema }),
  execute: async ({ inputData: { profile, inputs, cards, chat, message, round }, requestContext }) => {
    const log = getLog(requestContext);
    log('feedback', `Reading your message: "${message.length > 80 ? `${message.slice(0, 80)}...` : message}"`);

    // The server may already have added this message to the chat; don't show it twice.
    const last = chat.at(-1);
    const history = last?.role === 'user' && last.text === message ? chat.slice(0, -1) : chat;
    const prompt = [
      `Project: ${JSON.stringify(profile)}`,
      `Current inputs: ${JSON.stringify(inputs)}`,
      `Names shown so far, newest first: ${JSON.stringify(cards.slice(0, 40).map(({ name, from, meaning }) => ({ name, from, meaning })))}`,
      `Chat so far:\n${history.slice(-10).map((t) => `${t.role}: ${t.text}`).join('\n') || '(none)'}`,
      `New message from the user: """${message}"""`,
      'Return {"reply": "...", "names": [{"name": "...", "from": "feedback", "meaning": "...", "whyItFits": "one plain sentence"}], "tlds": [...]}',
    ].join('\n\n');
    const out = await generateJson(feedback, prompt, FeedbackOutputSchema);

    // Drop exact repeats of names already shown, unless that leaves nothing.
    const shown = new Set(cards.map((c) => c.name.toLowerCase()));
    const fresh = out.names.filter((n) => !shown.has(n.name.toLowerCase()));
    const picked: Picked[] = (fresh.length ? fresh : out.names).map((n) => ({ ...n, from: 'feedback' }));
    log('feedback', `Came up with ${picked.length}: ${list(picked.map((p) => p.name))}.`);

    let next = inputs;
    if (out.tlds) {
      const tlds = TLDS.filter((t) => out.tlds!.includes(t));
      next = { ...inputs, tlds };
      log('feedback', tlds.length ? `Checking ${tlds.map((t) => `.${t}`).join(' ')} from now on.` : 'Stopped domain checks as you asked.');
    }
    return { reply: out.reply, inputs: next, picked, tlds: next.tlds, round };
  },
});

export const refineNames = createWorkflow({
  id: 'refineNames',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  retryConfig: RETRY,
})
  .then(feedbackStep)
  .then(domainCheck)
  .map(async ({ inputData, getStepResult }) => {
    const { reply, inputs } = getStepResult(feedbackStep);
    return { reply, inputs, cards: inputData.cards };
  })
  .commit();
