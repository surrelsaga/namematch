import { useState } from 'react';
import type { ChatTurn, DomainResult, NameCard } from '../../src/shared/types';
import { ACTORS } from './lib';
import { Badge, Button, Card, Input, cx } from './ui';

function DomainPill({ d }: { d: DomainResult }) {
  if (d.status === 'available') {
    const pill = (
      <Badge tone="bg-mint" className="font-mono text-sm">
        {d.domain} · {d.registerUrl ? 'register ↗' : 'available'}
      </Badge>
    );
    return d.registerUrl
      ? <a href={d.registerUrl} target="_blank" rel="noreferrer" className="hover:underline">{pill}</a>
      : pill;
  }
  return d.status === 'taken'
    ? <Badge tone="bg-neutral-300 text-ink/60" className="font-mono text-sm">{d.domain} · taken</Badge>
    : <Badge tone="bg-yellow" className="font-mono text-sm">{d.domain} · couldn't check</Badge>;
}

function NameCardView({ card }: { card: NameCard }) {
  const namer = ACTORS[card.from];
  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone={namer.tone}>{namer.label}</Badge>
        {card.variantOf && <Badge>variant of {card.variantOf}</Badge>}
      </div>
      <h3 className="font-mono text-4xl font-bold break-all">{card.name}</h3>
      <p>{card.meaning}</p>
      <p className="text-sm"><b>Why it fits:</b> {card.whyItFits}</p>
      {card.domains.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {card.domains.map((d) => <DomainPill key={d.domain} d={d} />)}
        </div>
      )}
    </Card>
  );
}

/** Cards come newest round first; one heading per round. */
export function Results({ cards }: { cards: NameCard[] }) {
  const rounds = [...new Set(cards.map((c) => c.round))];
  return rounds.map((r) => (
    <section key={r} className="grid gap-4">
      <h2 className="text-2xl font-bold">{r === 1 ? 'Your names' : `Round ${r}`}</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        {cards.filter((c) => c.round === r).map((c) => <NameCardView key={c.id} card={c} />)}
      </div>
    </section>
  ));
}

export function Chat({ chat, busy, onSend }: {
  chat: ChatTurn[]; busy: boolean; onSend: (message: string) => Promise<boolean>;
}) {
  const [msg, setMsg] = useState('');
  return (
    <Card tone="bg-lilac/30" className="grid gap-4">
      <h2 className="text-2xl font-bold">Not quite right? Tell me what to change.</h2>
      {chat.map((t, i) => (
        <Card key={i} tone={t.role === 'user' ? 'bg-yellow' : 'bg-lilac'}
          className={cx('max-w-[85%] p-3!', t.role === 'user' && 'justify-self-end')}>
          {t.text}
        </Card>
      ))}
      <form className="flex gap-3" onSubmit={async (e) => {
        e.preventDefault();
        if (await onSend(msg.trim())) setMsg('');
      }}>
        <Input value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Your feedback"
          placeholder="e.g. shorter, more playful, also check .ai" />
        <Button type="submit" disabled={busy || !msg.trim()}>Send</Button>
      </form>
    </Card>
  );
}
