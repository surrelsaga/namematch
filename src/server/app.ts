import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { analyzeProject, generateNames, refineNames } from '../mastra/run';
import { NameInputsSchema } from '../shared/schemas';
import type { Logger, Session, SessionStatus } from '../shared/types';
import { readSource } from '../sources';

/** In-memory sessions. ponytail: never evicted, add a TTL sweep if memory grows on the host. */
export const sessions = new Map<string, Session>();

const SourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github'), url: z.url() }),
  // ~50 KB of .md from the browser, with slack for multi-byte chars
  z.object({ kind: z.literal('markdown'), text: z.string().min(1).max(60_000), filename: z.string().max(200).optional() }),
]);
const CreateBody = z.object({ source: SourceSchema });
const GenerateBody = z.object({ inputs: NameInputsSchema });
const FeedbackBody = z.object({ message: z.string().trim().min(1).max(2_000) });

const BUSY: SessionStatus[] = ['analyzing', 'generating', 'refining'];

function loggerFor(session: Session): Logger {
  return (actor, text, level = 'info') => {
    session.logs.push({ i: session.logs.length + 1, at: new Date().toISOString(), actor, text, level });
  };
}

/** Runs one background job. Never throws: a failure becomes status 'error' plus a warn line. */
function runJob(session: Session, status: SessionStatus, job: (log: Logger) => Promise<SessionStatus>) {
  const log = loggerFor(session);
  session.status = status;
  session.error = undefined;
  job(log).then(
    (next) => { session.status = next; },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`session ${session.id} failed:`, err);
      session.status = 'error';
      session.error = message;
      log('system', `Something went wrong: ${message}`, 'warn');
    },
  );
}

export const app = new Hono();

app.use('/api/*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'request too large' }, 413) }));

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/sessions', async (c) => {
  const body = CreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: z.prettifyError(body.error) }, 400);
  const { source } = body.data;

  const session: Session = {
    id: randomUUID(),
    status: 'analyzing',
    sourceLabel: source.kind === 'github' ? source.url : (source.filename ?? 'pasted text'),
    cards: [],
    chat: [],
    logs: [],
  };
  sessions.set(session.id, session);

  runJob(session, 'analyzing', async (log) => {
    const text = await readSource(source);
    session.sourceLabel = text.label;
    const { profile, suggested } = await analyzeProject(text, log);
    session.profile = profile;
    session.suggested = suggested;
    return 'needs-inputs';
  });
  return c.json({ sessionId: session.id });
});

app.get('/api/sessions/:id', (c) => {
  const session = sessions.get(c.req.param('id'));
  if (!session) return c.json({ error: 'session not found' }, 404);
  const after = Number(c.req.query('after')) || 0;
  return c.json({ ...session, logs: session.logs.filter((l) => l.i > after) });
});

app.post('/api/sessions/:id/generate', async (c) => {
  const session = sessions.get(c.req.param('id'));
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (BUSY.includes(session.status)) return c.json({ error: 'session is busy' }, 409);
  const profile = session.profile;
  if (!profile) return c.json({ error: 'project has not been read yet' }, 409);
  const body = GenerateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: z.prettifyError(body.error) }, 400);

  const { inputs } = body.data;
  session.inputs = inputs;
  runJob(session, 'generating', async (log) => {
    session.cards = await generateNames(profile, inputs, log);
    return 'ready';
  });
  return c.body(null, 202);
});

app.post('/api/sessions/:id/feedback', async (c) => {
  const session = sessions.get(c.req.param('id'));
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (BUSY.includes(session.status)) return c.json({ error: 'session is busy' }, 409);
  const { profile, inputs } = session;
  if (!profile || !inputs || !session.cards.length) return c.json({ error: 'generate names first' }, 409);
  const body = FeedbackBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: z.prettifyError(body.error) }, 400);

  const { message } = body.data;
  const chat = [...session.chat];
  session.chat.push({ role: 'user', text: message, at: new Date().toISOString() });
  const round = Math.max(...session.cards.map((card) => card.round)) + 1;

  runJob(session, 'refining', async (log) => {
    log('you', message);
    const res = await refineNames({ profile, inputs, cards: session.cards, chat, message, round }, log);
    session.cards = [...res.cards, ...session.cards];
    session.inputs = res.inputs;
    session.chat.push({ role: 'agent', text: res.reply, at: new Date().toISOString() });
    return 'ready';
  });
  return c.body(null, 202);
});
