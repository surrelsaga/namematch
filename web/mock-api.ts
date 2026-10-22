// Dev-only fake of the section 5 API, built on the Step 0 stubs, so the UI runs without Block C.
// Turn on with MOCK_API=1. ponytail: delete once Block C's server is merged.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { analyzeProject, generateNames, refineNames } from '../src/mastra/run';
import { readSource } from '../src/sources';
import type { Logger, NameInputs, Session, Source } from '../src/shared/types';

const BUSY: Session['status'][] = ['analyzing', 'generating', 'refining'];

export function mockApi(): Plugin {
  const sessions = new Map<string, Session>();

  const logger = (s: Session): Logger => (actor, text, level = 'info') =>
    s.logs.push({ i: s.logs.length + 1, at: new Date().toISOString(), actor, text, level });

  function run(s: Session, status: Session['status'], job: (log: Logger) => Promise<void>) {
    const log = logger(s);
    s.status = status;
    s.error = undefined;
    job(log).then(
      () => { s.status = status === 'analyzing' ? 'needs-inputs' : 'ready'; },
      (e: Error) => { s.status = 'error'; s.error = e.message; log('system', `Something went wrong: ${e.message}`, 'warn'); },
    );
  }

  async function body(req: IncomingMessage) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return raw ? JSON.parse(raw) : {};
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const send = (code: number, data: unknown = {}) => {
      res.statusCode = code;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(data));
    };
    const url = new URL(req.url ?? '/', 'http://x');
    const [, id, action] = url.pathname.split('/');

    if (req.method === 'POST' && !id) {
      const { source } = (await body(req)) as { source: Source };
      const s: Session = {
        id: randomUUID(), status: 'analyzing', cards: [], chat: [], logs: [],
        sourceLabel: source.kind === 'github' ? source.url : source.filename ?? 'pasted text',
      };
      sessions.set(s.id, s);
      run(s, 'analyzing', async (log) => {
        const text = await readSource(source);
        s.sourceLabel = text.label;
        Object.assign(s, await analyzeProject(text, log));
      });
      return send(200, { sessionId: s.id });
    }

    const s = sessions.get(id);
    if (!s) return send(404, { error: 'Session not found.' });
    if (req.method === 'GET' && !action) {
      const after = Number(url.searchParams.get('after') ?? 0);
      return send(200, { ...s, logs: s.logs.filter((l) => l.i > after) });
    }
    if (req.method !== 'POST') return send(404, { error: 'Not found.' });
    if (BUSY.includes(s.status)) return send(409, { error: 'Session is busy.' });

    if (action === 'generate') {
      const { inputs } = (await body(req)) as { inputs: NameInputs };
      s.inputs = inputs;
      run(s, 'generating', async (log) => { s.cards = await generateNames(s.profile!, inputs, log); });
      return send(202);
    }
    if (action === 'feedback') {
      const { message } = (await body(req)) as { message: string };
      s.chat.push({ role: 'user', text: message, at: new Date().toISOString() });
      run(s, 'refining', async (log) => {
        log('you', message);
        const round = Math.max(1, ...s.cards.map((c) => c.round)) + 1;
        const r = await refineNames(
          { profile: s.profile!, inputs: s.inputs!, cards: s.cards, chat: s.chat, message, round }, log,
        );
        s.cards = [...r.cards, ...s.cards];
        s.inputs = r.inputs;
        s.chat.push({ role: 'agent', text: r.reply, at: new Date().toISOString() });
      });
      return send(202);
    }
    send(404, { error: 'Not found.' });
  }

  return {
    name: 'nammit-mock-api',
    configureServer(server) {
      server.middlewares.use('/api/sessions', (req, res) => void handle(req, res));
    },
  };
}
