import { expect, test, vi } from 'vitest';
import { analyzeProject } from '../mastra/run';
import type { NameInputs, SessionView } from '../shared/types';
import { app } from './app';

// Real stubs, wrapped so one test can make analyze fail.
vi.mock('../mastra/run', async (importOriginal) => {
  const real = await importOriginal<typeof import('../mastra/run')>();
  return { ...real, analyzeProject: vi.fn(real.analyzeProject) };
});

const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const get = async (id: string, after = 0) =>
  (await (await app.request(`/api/sessions/${id}?after=${after}`)).json()) as SessionView;

async function waitWhile(id: string, status: SessionView['status']) {
  let s = await get(id);
  while (s.status === status) {
    await new Promise((r) => setTimeout(r, 50));
    s = await get(id);
  }
  return s;
}

async function create() {
  const res = await post('/api/sessions', { source: { kind: 'markdown', text: '# Logr\nA log tool.', filename: 'logr.md' } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { sessionId: string }).sessionId;
}

const inputs: NameInputs = { kind: 'dev-tool', feels: ['short-cool'], audience: 'developers', keep: [], avoid: [], tlds: [] };

test('health', async () => {
  const res = await app.request('/api/health');
  expect(await res.json()).toEqual({ ok: true });
});

test('full flow: create, generate, feedback', { timeout: 30_000 }, async () => {
  const id = await create();
  let s = await waitWhile(id, 'analyzing');
  expect(s.status).toBe('needs-inputs');
  expect(s.sourceLabel).toBe('logr.md');
  expect(s.profile?.summary).toBeTruthy();
  expect(s.suggested?.feels.length).toBeGreaterThan(0);
  expect(s.logs.map((l) => l.i)).toEqual(s.logs.map((_, n) => n + 1));

  const lastI = s.logs.at(-1)!.i;
  expect((await get(id, lastI)).logs).toEqual([]);

  expect((await post(`/api/sessions/${id}/generate`, { inputs })).status).toBe(202);
  s = await waitWhile(id, 'generating');
  expect(s.status).toBe('ready');
  expect(s.inputs).toEqual(inputs);
  expect(s.cards.length).toBe(5);
  expect(s.cards.every((c) => c.round === 1 && c.domains.length === 0)).toBe(true);
  expect((await get(id, lastI)).logs[0].i).toBe(lastI + 1);

  expect((await post(`/api/sessions/${id}/feedback`, { message: 'calmer please' })).status).toBe(202);
  s = await waitWhile(id, 'refining');
  expect(s.status).toBe('ready');
  expect(s.cards.length).toBe(7);
  expect(s.cards[0].round).toBe(2);
  expect(s.chat.map((t) => t.role)).toEqual(['user', 'agent']);
  expect(s.logs.some((l) => l.actor === 'you' && l.text === 'calmer please')).toBe(true);
});

test('409 while busy or before the project is read', async () => {
  const id = await create();
  expect((await post(`/api/sessions/${id}/generate`, { inputs })).status).toBe(409);
  expect((await post(`/api/sessions/${id}/feedback`, { message: 'hi' })).status).toBe(409);
  await waitWhile(id, 'analyzing');
  expect((await post(`/api/sessions/${id}/feedback`, { message: 'hi' })).status).toBe(409);
  expect((await post(`/api/sessions/${id}/generate`, { inputs })).status).toBe(202);
  expect((await post(`/api/sessions/${id}/generate`, { inputs })).status).toBe(409);
});

test('failed job sets error status and a warn line', async () => {
  vi.mocked(analyzeProject).mockRejectedValueOnce(new Error('model is down'));
  const id = await create();
  const s = await waitWhile(id, 'analyzing');
  expect(s.status).toBe('error');
  expect(s.error).toBe('model is down');
  expect(s.logs.at(-1)).toMatchObject({ actor: 'system', level: 'warn' });
});

test('bad input: 400 and 404', async () => {
  expect((await post('/api/sessions', { source: { kind: 'github', url: 'nope' } })).status).toBe(400);
  expect((await post('/api/sessions', {})).status).toBe(400);
  expect((await app.request('/api/sessions', { method: 'POST', body: 'not json' })).status).toBe(400);
  expect((await app.request('/api/sessions/missing')).status).toBe(404);
  const id = await create();
  await waitWhile(id, 'analyzing');
  expect((await post(`/api/sessions/${id}/generate`, { inputs: { ...inputs, feels: [] } })).status).toBe(400);
});
