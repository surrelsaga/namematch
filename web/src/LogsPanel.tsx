import { useEffect, useRef } from 'react';
import type { LogLine } from '../../src/shared/types';
import { ACTORS } from './lib';
import { Badge, Card, cx } from './ui';

export function LogsPanel({ logs, busy }: { logs: LogLine[]; busy: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [logs.length, busy]);

  return (
    <Card className="grid gap-3 p-4! lg:sticky lg:top-6">
      <h2 className="text-xl font-bold">What's happening</h2>
      <ol ref={list} aria-live="polite" className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
        {logs.map((l) => (
          <li key={l.i} className={cx(
            'flex items-start gap-2 text-sm',
            l.level === 'done' && 'font-bold',
            l.level === 'warn' && 'rounded-[4px] bg-pink/40 p-1',
          )}>
            <Badge tone={ACTORS[l.actor].tone} className="w-32 shrink-0 text-center whitespace-nowrap">{ACTORS[l.actor].label}</Badge>
            <span className="pt-0.5">{l.text}</span>
          </li>
        ))}
        {busy && (
          <li className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0">
              <span className="mx-auto block size-4 animate-spin rounded-full border-[3px] border-ink border-t-transparent" />
            </span>
            Working on it…
          </li>
        )}
      </ol>
    </Card>
  );
}
