import { Hono } from 'hono';
import type { Session } from '../shared/types';

/** In-memory sessions. Block C fills this in. */
export const sessions = new Map<string, Session>();

export const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));
