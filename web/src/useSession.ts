import { useEffect, useRef, useState } from 'react';
import type { NameInputs, Session, SessionView, Source } from '../../src/shared/types';

const BUSY: Session['status'][] = ['analyzing', 'generating', 'refining'];
export const isBusy = (s?: Session) => !!s && BUSY.includes(s.status);

/** The server only sends log lines after `?after=`, so keep the ones we already have. */
export function mergeView(prev: Session | undefined, view: SessionView): Session {
  const last = prev?.logs.at(-1)?.i ?? 0;
  return { ...view, logs: [...(prev?.logs ?? []), ...view.logs.filter((l) => l.i > last)] };
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let data;
  try { data = JSON.parse(await res.text()); } catch { /* empty or not JSON */ }
  if (res.status === 409) throw new Error('Still working on the last step, give it a moment.');
  if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status}).`);
  return data;
}

/** The only poller: every 1 s while a job runs, 5 s otherwise. */
export function useSession() {
  const [id, setId] = useState<string>();
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [kick, setKick] = useState(0); // bump to poll right away after an action
  const current = useRef<Session>(undefined);

  useEffect(() => {
    if (!id) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const after = current.current?.logs.at(-1)?.i ?? 0;
        const view = await api<SessionView>(`/sessions/${id}?after=${after}`);
        if (stop) return;
        current.current = mergeView(current.current, view);
        setSession(current.current);
        setError(undefined);
      } catch {
        if (stop) return;
        setError('Lost touch with the server. Retrying.');
      }
      timer = setTimeout(poll, isBusy(current.current) ? 1000 : 5000);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [id, kick]);

  /** Runs one action; resolves true if it went through. */
  async function act(fn: () => Promise<void>) {
    setPending(true);
    setError(undefined);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    session,
    error,
    busy: pending || isBusy(session),
    start: (source: Source) => act(async () => {
      const r = await api<{ sessionId: string }>('/sessions', { source });
      current.current = undefined;
      setSession(undefined);
      setId(r.sessionId);
    }),
    generate: (inputs: NameInputs) => act(async () => {
      await api(`/sessions/${id}/generate`, { inputs });
      setKick((k) => k + 1);
    }),
    feedback: (message: string) => act(async () => {
      await api(`/sessions/${id}/feedback`, { message });
      setKick((k) => k + 1);
    }),
  };
}
