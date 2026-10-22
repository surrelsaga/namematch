import { expect, test } from 'vitest';
import { z } from 'zod';
import { generateJson } from './generate-json';
import type { Agent } from '@mastra/core/agent';

const schema = z.object({ n: z.number() });
const fake = (...replies: string[]) =>
  ({ id: 'fake', generate: async () => ({ text: replies.shift() ?? '' }) }) as unknown as Agent;

test('strips fences and chatter', async () => {
  expect(await generateJson(fake('Sure!\n```json\n{"n":1}\n```\nDone'), 'p', schema)).toEqual({ n: 1 });
});

test('retries once, then throws', async () => {
  expect(await generateJson(fake('nope', '{"n":2}'), 'p', schema)).toEqual({ n: 2 });
  await expect(generateJson(fake('nope', 'still nope'), 'p', schema)).rejects.toThrow('after a retry');
});
