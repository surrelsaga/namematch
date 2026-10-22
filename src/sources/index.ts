// STUB. Block B replaces this with the real GitHub and markdown reading.
import type { Source, SourceText } from '../shared/types';

const MAX_CHARS = 12_000;

export async function readSource(source: Source): Promise<SourceText> {
  if (source.kind === 'markdown') {
    return { label: source.filename ?? 'pasted text', text: source.text.slice(0, MAX_CHARS) };
  }
  const label = new URL(source.url).pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  return { label, text: `# ${label}\n\nA small command line tool that helps developers do a boring task faster.` };
}
