import { useState, type ReactNode } from 'react';
import { TLDS, type NameInputs, type Session } from '../../src/shared/types';
import { ACTORS, AUDIENCES, FEELS, KINDS, splitList, toggleFeel } from './lib';
import { Button, Card, Chip, Input } from './ui';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="font-bold">{label} {hint && <span className="font-normal text-ink/60">({hint})</span>}</div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

export function InputsCard({ session, locked, onSubmit }: {
  session: Session; locked: boolean; onSubmit: (inputs: NameInputs) => void;
}) {
  const [draft, setDraft] = useState<NameInputs>(session.inputs ?? session.suggested!);
  const [keep, setKeep] = useState(draft.keep.join(', '));
  const [avoid, setAvoid] = useState(draft.avoid.join(', '));
  // Once names exist, show what the server used (feedback can change tlds).
  const v = locked ? session.inputs ?? draft : draft;
  // Functional so quick clicks never toggle from a stale draft.
  const set = (patch: (d: NameInputs) => Partial<NameInputs>) => setDraft((d) => ({ ...d, ...patch(d) }));

  return (
    <Card>
      <form className="grid gap-5" onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...draft, keep: splitList(keep), avoid: splitList(avoid) });
      }}>
        <div>
          <h2 className="text-2xl font-bold">Here's what I understood</h2>
          <p className="mt-1 text-lg">{session.profile?.summary}</p>
        </div>
        <fieldset disabled={locked} className="grid min-w-0 gap-5">
          <Row label="What is it?">
            {KINDS.map(([k, label]) => (
              <Chip key={k} on={v.kind === k} onClick={() => set(() => ({ kind: k }))}>{label}</Chip>
            ))}
          </Row>
          <Row label="Feel" hint="pick 1 or 2">
            {FEELS.map(([f, label]) => (
              <Chip key={f} on={v.feels.includes(f)} tone={ACTORS[f].tone}
                onClick={() => set((d) => ({ feels: toggleFeel(d.feels, f) }))}>{label}</Chip>
            ))}
          </Row>
          <Row label="Who's it for?">
            {AUDIENCES.map(([a, label]) => (
              <Chip key={a} on={v.audience === a} onClick={() => set(() => ({ audience: a }))}>{label}</Chip>
            ))}
          </Row>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="font-bold">Keep <span className="font-normal text-ink/60">(optional)</span></span>
              <Input value={locked ? v.keep.join(', ') : keep} onChange={(e) => setKeep(e.target.value)}
                placeholder="words to keep, comma separated" />
            </label>
            <label className="grid gap-2">
              <span className="font-bold">Avoid <span className="font-normal text-ink/60">(optional)</span></span>
              <Input value={locked ? v.avoid.join(', ') : avoid} onChange={(e) => setAvoid(e.target.value)}
                placeholder="words to avoid, comma separated" />
            </label>
          </div>
          <Row label="Domains" hint="optional, leave empty to skip domain checks">
            {TLDS.map((t) => (
              <Chip key={t} on={v.tlds.includes(t)} tone="bg-mint" className="font-mono"
                onClick={() => set((d) => ({
                  tlds: d.tlds.includes(t)
                    ? d.tlds.filter((x) => x !== t)
                    : TLDS.filter((x) => x === t || d.tlds.includes(x)),
                }))}>
                .{t}
              </Chip>
            ))}
          </Row>
        </fieldset>
        {!locked && <Button type="submit" className="justify-self-start">Name it</Button>}
      </form>
    </Card>
  );
}
