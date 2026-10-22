import type { DomainResult, NameCard } from '../../src/shared/types';
import { ACTORS } from './lib';
import { Badge, Card } from './ui';

function DomainPill({ d }: { d: DomainResult }) {
  if (d.status === 'available') {
    return d.registerUrl ? (
      <a href={d.registerUrl} target="_blank" rel="noreferrer" aria-label={`Register ${d.domain}`} className="group">
        <Badge big tone="bg-mint" className="font-mono">
          {d.domain}
          <span className="ml-2 inline-block rounded-[3px] bg-ink px-2 py-0.5 font-sans whitespace-nowrap text-white group-hover:underline">register →</span>
        </Badge>
      </a>
    ) : <Badge big tone="bg-mint" className="font-mono">{d.domain} · available</Badge>;
  }
  return d.status === 'taken'
    ? <Badge big tone="bg-neutral-300 text-ink/60" className="font-mono">{d.domain} · taken</Badge>
    : <Badge big tone="bg-yellow" className="font-mono">{d.domain} · couldn't check</Badge>;
}

function NameCardView({ card }: { card: NameCard }) {
  const namer = ACTORS[card.from];
  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone={namer.tone}>{namer.label}</Badge>
        {card.variantOf && <Badge>variant of {card.variantOf}</Badge>}
      </div>
      <h3 className="font-mono text-5xl font-bold break-all">{card.name}</h3>
      <p className="text-lg">{card.meaning}</p>
      <p><b>Why it fits:</b> {card.whyItFits}</p>
      {card.domains.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
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
      <h2 className="text-3xl font-bold">{r === 1 ? 'Your names' : `Round ${r}`}</h2>
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(24rem,100%),1fr))]">
        {cards.filter((c) => c.round === r).map((c) => <NameCardView key={c.id} card={c} />)}
      </div>
    </section>
  ));
}
