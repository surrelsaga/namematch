import { useState, type FormEvent } from 'react';
import type { Source } from '../../src/shared/types';
import { Chat } from './Chat';
import { InputsCard } from './InputsCard';
import { LogsPanel } from './LogsPanel';
import { Results } from './Results';
import { Button, Card, Chip, Input, TextArea } from './ui';
import { useSession } from './useSession';

const MAX_MD_BYTES = 50_000;
const GITHUB_URL = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/;

function SourceCard({ locked, onStart }: { locked: boolean; onStart: (source: Source) => void }) {
  const [tab, setTab] = useState<Source['kind']>('github');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [filename, setFilename] = useState<string>();
  const [problem, setProblem] = useState<string>();

  async function pickFile(file?: File) {
    if (!file) return;
    setText(await file.text());
    setFilename(file.name);
    setProblem(undefined);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (tab === 'github') {
      if (!GITHUB_URL.test(url.trim())) return setProblem('Paste a public GitHub repo link, like https://github.com/owner/repo.');
      onStart({ kind: 'github', url: url.trim() });
    } else {
      if (!text.trim()) return setProblem('Upload a .md file or paste the text first.');
      if (new Blob([text]).size > MAX_MD_BYTES) return setProblem('That is over 50 KB. Trim it down to the important parts.');
      onStart({ kind: 'markdown', text, filename });
    }
    setProblem(undefined);
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <fieldset disabled={locked} className="grid min-w-0 gap-4">
          <div className="flex flex-wrap gap-3">
            <Chip on={tab === 'github'} onClick={() => setTab('github')}>GitHub repo</Chip>
            <Chip on={tab === 'markdown'} onClick={() => setTab('markdown')}>Upload .md</Chip>
          </div>
          {tab === 'github' ? (
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              aria-label="GitHub repo URL" placeholder="https://github.com/owner/repo" />
          ) : (
            <>
              <Input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" aria-label="Markdown file"
                onChange={(e) => pickFile(e.target.files?.[0])}
                className="file:mr-3 file:cursor-pointer file:rounded-[4px] file:border-2 file:border-ink file:bg-yellow file:px-2 file:font-bold" />
              <TextArea rows={7} value={text} onChange={(e) => setText(e.target.value)}
                aria-label="Project description" placeholder="…or paste your README / project notes here" />
            </>
          )}
          {problem && <p role="alert" className="font-bold">{problem}</p>}
          <Button type="submit" className="justify-self-start">Read my project</Button>
        </fieldset>
      </form>
    </Card>
  );
}

export function App() {
  const { session, error, busy, start, generate, feedback } = useSession();
  const status = session?.status;
  // Inputs stay editable until names exist, so a failed generate can be retried.
  const inputsLocked = busy || !(status === 'needs-inputs' || (status === 'error' && !session?.cards.length));

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-8 lg:px-10">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-8 2xl:grid-cols-[minmax(0,1fr)_34rem]">
        <main className="grid min-w-0 gap-8">
          {/* Header lives in the left column so the sticky right column starts at the top. */}
          <header>
            <h1 className="brut inline-block bg-yellow px-6 py-2 text-6xl font-bold tracking-tight">Nammit</h1>
            <p className="mt-4 text-xl lg:text-2xl">Name your project and check if the domains are available.</p>
          </header>
          <SourceCard locked={busy || !!session?.suggested} onStart={start} />
          {session?.suggested && (
            <InputsCard key={session.id} session={session} locked={inputsLocked} onSubmit={generate} />
          )}
          {(error || status === 'error') && (
            <Card tone="bg-pink" role="alert">
              <b>That didn't work.</b> {error ?? session?.error}
            </Card>
          )}
          {!!session?.cards.length && <Results cards={session.cards} />}
        </main>
        {/* Stays put while the names scroll, so the chat input is always in reach. */}
        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:h-[calc(100dvh_/_var(--zoom)_-_3rem)]">
          <LogsPanel logs={session?.logs ?? []} busy={busy} />
          <Chat chat={session?.chat ?? []} ready={!!session?.cards.length} busy={busy} onSend={feedback} />
        </aside>
      </div>
    </div>
  );
}
