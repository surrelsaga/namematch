import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { backoffMs, generateJson } from './generate-json';
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

test('waits out a rate limit using the delay Google asks for', async () => {
  const limited = { statusCode: 429, responseBody: '{"error":{"details":[{"retryDelay":"46s"}]}}' };
  expect(backoffMs(limited, 0)).toBe(47_000);
  expect(backoffMs({ statusCode: 503 }, 1)).toBe(16_000);
  expect(backoffMs({ statusCode: 404 }, 0)).toBeNull();

  vi.useFakeTimers();
  let calls = 0;
  const flaky = { id: 'flaky', generate: async () => { if (calls++ < 2) throw limited; return { text: '{"n":3}' }; } } as unknown as Agent;
  const done = generateJson(flaky, 'p', schema);
  await vi.advanceTimersByTimeAsync(100_000);
  expect(await done).toEqual({ n: 3 });
  expect(calls).toBe(3);
  vi.useRealTimers();
});
