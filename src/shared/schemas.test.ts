import { expect, test } from 'vitest';
import { AnalyzeOutputSchema, FeedbackOutputSchema } from './schemas';

test('analyze output', () => {
  const ok = {
    profile: { summary: 'x', keywords: ['a', 'b', 'c'] },
    suggested: { kind: 'dev-tool', feels: ['short-cool'], audience: 'developers', keep: [], avoid: [], tlds: [] },
  };
  expect(AnalyzeOutputSchema.safeParse(ok).success).toBe(true);
  expect(AnalyzeOutputSchema.safeParse({ ...ok, suggested: { ...ok.suggested, feels: [] } }).success).toBe(false);
});

test('feedback output needs 1 to 5 names', () => {
  expect(FeedbackOutputSchema.safeParse({ reply: 'hi', names: [] }).success).toBe(false);
});
