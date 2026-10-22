import { expect, test } from 'vitest';
import { app } from './app';

test('health', async () => {
  const res = await app.request('/api/health');
  expect(await res.json()).toEqual({ ok: true });
});
