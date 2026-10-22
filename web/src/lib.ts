import type { Actor, Audience, Feel, Kind } from '../../src/shared/types';

export const KINDS: [Kind, string][] = [
  ['startup', 'Startup'], ['side-project', 'Side project'], ['dev-tool', 'Dev tool'],
];
export const FEELS: [Feel, string][] = [
  ['professional', 'Professional'], ['short-cool', 'Short & cool'], ['random-fun', 'Random & fun'],
];
export const AUDIENCES: [Audience, string][] = [
  ['developers', 'Developers'], ['everyday', 'Everyday people'], ['businesses', 'Businesses'],
];

export const ACTORS: Record<Actor, { label: string; tone: string }> = {
  supervisor: { label: 'Supervisor', tone: 'bg-yellow' },
  professional: { label: 'Professional', tone: 'bg-sky' },
  'short-cool': { label: 'Short & cool', tone: 'bg-mint' },
  'random-fun': { label: 'Random & fun', tone: 'bg-pink' },
  'domain-checker': { label: 'Domain checker', tone: 'bg-orange' },
  feedback: { label: 'Feedback', tone: 'bg-lilac' },
  you: { label: 'You', tone: 'bg-white' },
  system: { label: 'System', tone: 'bg-ink text-white' },
};

/** Pick 1 or 2: a third pick drops the oldest, the last one can't be removed. */
export function toggleFeel(feels: Feel[], f: Feel): Feel[] {
  if (feels.includes(f)) return feels.length > 1 ? feels.filter((x) => x !== f) : feels;
  return [...feels, f].slice(-2);
}

/** "a, b,, c " -> ["a", "b", "c"] */
export const splitList = (s: string) => s.split(',').map((w) => w.trim()).filter(Boolean);
