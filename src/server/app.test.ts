import { expect, test, vi } from 'vitest';
import { analyzeProject, generateNames } from '../mastra/run';
import type { NameInputs, SessionView } from '../shared/types';
import { app } from './app';

// Fake jobs (no model, no network), wrapped so tests can make a job fail.
vi.mock('../mastra/run', () => {
  const pause = () => new Promise((r) => setTimeout(r, 150)); // long enough to observe the busy state
  const card = (name: string, round: number, from: 'short-cool' | 'feedback' = 'short-cool') => ({
    id: `${round}-${name}`, name, from, meaning: `${name} meaning`, whyItFits: 'fits', domains: [], round,
  });
  return {
    analyzeProject: vi.fn(async (source: { label: string }, log: (a: string, t: string) => void) => {
      await pause();
      log('supervisor', `Read ${source.label}.`);
      return {
        profile: { summary: 'A log tool.', keywords: ['logs', 'cli', 'errors'] },
        suggested: { kind: 'dev-tool', feels: ['short-cool'], audience: 'developers', keep: [], avoid: [], tlds: [] },
      };
    }),
    generateNames: vi.fn(async (_profile: unknown, _inputs: unknown, log: (a: string, t: string) => void) => {
      await pause();
      log('supervisor', 'Picked 5.');
      return ['rydo', 'pooli', 'zipr', 'kast', 'vynl'].map((n) => card(n, 1));
    }),
    refineNames: vi.fn(async (ctx: { inputs: unknown; round: number }) => {
      await pause();
      return {
        reply: 'Here are two calmer options.', inputs: ctx.inputs,
        cards: ['quill', 'brevo'].map((n) => card(n, ctx.round, 'feedback')),
      };
    }),
  };
});

// Registered before any request: Hono cannot add routes once its router is built.
app.get('/api/test-throw', () => { throw new Error('boom'); });

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

// Behaviors the web app (Block D) relies on.

async function readySession() {
  const id = await create();
  await waitWhile(id, 'analyzing');
  expect((await post(`/api/sessions/${id}/generate`, { inputs })).status).toBe(202);
  expect((await waitWhile(id, 'generating')).status).toBe('ready');
  return id;
}

test('D1: every error is JSON { error: string }', async () => {
  const id = await create();
  const responses = [
    await app.request('/api/test-throw'), // 500
    await app.request('/api/sessions/missing'), // 404 session
    await app.request('/api/nope'), // 404 route
    await post('/api/sessions', {}), // 400
    await post(`/api/sessions/${id}/generate`, { inputs }), // 409
    await post('/api/sessions', { source: { kind: 'markdown', text: 'x'.repeat(200_000) } }), // 413
  ];
  expect(responses.map((r) => r.status)).toEqual([500, 404, 404, 400, 409, 413]);
  for (const r of responses) {
    expect(r.headers.get('content-type')).toContain('application/json');
    const body = (await r.json()) as { error: unknown };
    expect(Object.keys(body)).toEqual(['error']);
    expect(typeof body.error).toBe('string');
  }
});

test('D2: feedback adds the user message and the agent reply to chat', { timeout: 30_000 }, async () => {
  const id = await readySession();
  await post(`/api/sessions/${id}/feedback`, { message: 'shorter please' });
  expect((await get(id)).chat).toMatchObject([{ role: 'user', text: 'shorter please' }]); // right away
  const s = await waitWhile(id, 'refining');
  expect(s.chat).toHaveLength(2);
  expect(s.chat[0]).toMatchObject({ role: 'user', text: 'shorter please' });
  expect(s.chat[1].role).toBe('agent');
  expect(s.chat[1].text).toBeTruthy();
});

test('D3: new cards go in front, newest round first', { timeout: 30_000 }, async () => {
  const id = await readySession();
  const before = (await get(id)).cards.map((c) => c.id);
  await post(`/api/sessions/${id}/feedback`, { message: 'one' });
  await waitWhile(id, 'refining');
  await post(`/api/sessions/${id}/feedback`, { message: 'two' });
  const s = await waitWhile(id, 'refining');
  const rounds = s.cards.map((c) => c.round);
  expect(rounds).toEqual([...rounds].sort((a, b) => b - a));
  expect(rounds[0]).toBe(3);
  expect(s.cards.slice(-before.length).map((c) => c.id)).toEqual(before);
});

test('D4: generate can be retried after it fails', { timeout: 30_000 }, async () => {
  vi.mocked(generateNames).mockRejectedValueOnce(new Error('namers timed out'));
  const id = await create();
  await waitWhile(id, 'analyzing');
  expect((await post(`/api/sessions/${id}/generate`, { inputs })).status).toBe(202);
  let s = await waitWhile(id, 'generating');
  expect(s.status).toBe('error');
  expect(s.error).toBe('namers timed out');

  expect((await post(`/api/sessions/${id}/generate`, { inputs })).status).toBe(202);
  expect((await get(id)).error).toBeUndefined();
  s = await waitWhile(id, 'generating');
  expect(s.status).toBe('ready');
  expect(s.cards.length).toBeGreaterThan(0);
});
