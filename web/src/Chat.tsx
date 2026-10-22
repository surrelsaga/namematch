import { useEffect, useRef, useState } from 'react';
import type { ChatTurn } from '../../src/shared/types';
import { Button, Card, Input, cx } from './ui';

/** Feedback thread. Scrolls inside its panel; the input stays pinned at the bottom. */
export function Chat({ chat, ready, busy, onSend }: {
  chat: ChatTurn[]; ready: boolean; busy: boolean; onSend: (message: string) => Promise<boolean>;
}) {
  const [msg, setMsg] = useState('');
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [chat.length]);

  return (
    <Card tone="bg-lilac/30" className="flex min-h-0 flex-col gap-4 p-4! lg:flex-1 lg:p-5!">
      <h2 className="text-2xl font-bold">Tweak the names</h2>
      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 max-lg:max-h-[60vh]">
        {!ready && <p className="text-ink/60">Chat opens when names are ready.</p>}
        {ready && !chat.length && <p className="text-ink/60">Not quite right? Tell me what to change.</p>}
        {chat.map((t, i) => (
          <Card key={i} tone={t.role === 'user' ? 'bg-yellow' : 'bg-lilac'}
            className={cx('max-w-[85%] shrink-0 p-3! text-lg', t.role === 'user' ? 'self-end' : 'self-start')}>
            {t.text}
          </Card>
        ))}
      </div>
      <form className="flex gap-3" onSubmit={async (e) => {
        e.preventDefault();
        if (await onSend(msg.trim())) setMsg('');
      }}>
        <Input value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Your feedback" disabled={!ready}
          placeholder="e.g. shorter, more playful" className="min-w-0" />
        <Button type="submit" disabled={!ready || busy || !msg.trim()}>Send</Button>
      </form>
    </Card>
  );
}
