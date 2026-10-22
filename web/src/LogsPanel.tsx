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
    <Card className="flex min-h-0 flex-col gap-3 p-4! lg:flex-1 lg:p-5!">
      <h2 className="text-2xl font-bold">Agents log</h2>
      <ol ref={list} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1 max-lg:max-h-[60vh]">
        {!logs.length && !busy && <li className="text-ink/60">Each step shows up here as it happens.</li>}
        {logs.map((l) => (
          <li key={l.i} className={cx(
            'flex flex-col items-start gap-1 text-base sm:flex-row sm:gap-2.5',
            l.level === 'done' && 'font-bold',
            l.level === 'warn' && 'rounded-[4px] bg-pink/40 p-1',
          )}>
            <Badge tone={ACTORS[l.actor].tone} className="shrink-0 text-center whitespace-nowrap sm:w-[10em]">{ACTORS[l.actor].label}</Badge>
            <span className="pt-0.5">{l.text}</span>
          </li>
        ))}
        {busy && (
          <li className="flex items-center gap-2.5 text-base">
            <span className="w-[10em] shrink-0 text-sm">
              <span className="mx-auto block size-5 animate-spin rounded-full border-[3px] border-ink border-t-transparent" />
            </span>
            Working on it…
          </li>
        )}
      </ol>
    </Card>
  );
}
