import { expect, test } from 'vitest';
import type { LogLine, Session } from '../../src/shared/types';
import { splitList, toggleFeel } from './lib';
import { mergeView } from './useSession';

test('toggleFeel keeps 1 or 2', () => {
  expect(toggleFeel(['professional'], 'short-cool')).toEqual(['professional', 'short-cool']);
  expect(toggleFeel(['professional', 'short-cool'], 'random-fun')).toEqual(['short-cool', 'random-fun']);
  expect(toggleFeel(['professional', 'short-cool'], 'professional')).toEqual(['short-cool']);
  expect(toggleFeel(['professional'], 'professional')).toEqual(['professional']);
});

test('splitList', () => {
  expect(splitList(' cat, , dog ,')).toEqual(['cat', 'dog']);
  expect(splitList('')).toEqual([]);
});

test('mergeView appends only new log lines', () => {
  const line = (i: number): LogLine => ({ i, at: '', actor: 'system', text: `l${i}`, level: 'info' });
  const view = (logs: LogLine[], status: Session['status'] = 'analyzing'): Session =>
    ({ id: 's', status, sourceLabel: 'x', cards: [], chat: [], logs });

  const a = mergeView(undefined, view([line(1), line(2)]));
  const b = mergeView(a, view([line(2), line(3)], 'ready')); // a repeated line is dropped
  expect(b.logs.map((l) => l.i)).toEqual([1, 2, 3]);
  expect(b.status).toBe('ready');
});
