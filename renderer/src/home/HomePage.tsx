import { useEffect, useRef, useState } from 'react';
import { agoShort, doors, type DoorKey, type TeamRowState } from './home-model';
import { PriorityMark } from '../threads/Pages';
import { priorityLabelOf, type PriorityId } from '../priority';
import './home.css';
import { enterIsTheButtons } from '../focused-button';

/** `from` is the teammate who asked, when one did; priority is null at Medium, as in the Inbox; an invitation has no time. */
export type NeedsRow = { key: string; letter: string; title: string; from: string | null; priority: PriorityId | null; project: string; at: number | null; unread: boolean };
export type TeamRow = { key: string; name: string; letter: string; ai: boolean; line: string; state: TeamRowState; week: number[]; total: number };
export type ProgressRow = { key: string; letter: string; title: string; line: string; at: number };

const ICONS: Record<DoorKey, JSX.Element> = {
  inbox: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>,
  progress: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7.5" /><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none" /></svg>,
  team: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="7.5" r="2.5" /><circle cx="6" cy="10" r="2" /><circle cx="18" cy="10" r="2" /><path d="M8 19c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" /><path d="M3 18c0-2 1.3-3.5 3-3.5M21 18c0-2-1.3-3.5-3-3.5" /></svg>,
};

function Bars({ week }: { week: number[] }) {
  const top = Math.max(3, ...week);
  return <div className="hm-bars" aria-hidden="true">
    {week.map((n, i) => <i key={i} className={n === 0 ? 'z' : i === week.length - 1 ? 't' : ''} style={n ? { height: `${Math.max(3, Math.round((n / top) * 20))}px` } : undefined} />)}
  </div>;
}

export function HomePage({ hello, now, needs, needsCount, inboxCount = needsCount, progressCount, team, progress, slot, onDoor, onOpen, onMember, onTeam }: {
  hello: string; now: number;
  needs: NeedsRow[]; needsCount: number;
  /** The Inbox's own number, for its door. */
  inboxCount?: number;
  progressCount: number;
  /** Null when there is no team: the second card is your own In progress. */
  team: TeamRow[] | null;
  progress: ProgressRow[];
  slot: (el: HTMLDivElement | null) => void;
  onDoor: (key: DoorKey) => void;
  onOpen: (key: string) => void;
  onMember: (key: string) => void;
  onTeam: () => void;
}) {
  const [pick, setPick] = useState(-1);
  const rows = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pick >= needs.length) setPick(needs.length - 1); }, [needs.length, pick]);
  useEffect(() => {
    // J and K walk Needs you and Enter opens the row, as they do in the Inbox.
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (enterIsTheButtons(e)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, [contenteditable="true"], .modal'))) return;
      // The New thread box's suggestions take ↓ and Enter themselves; the setup has its own keys.
      if (t?.closest('.tc-card') || document.documentElement.hasAttribute('data-setup')) return;
      // Never from the New thread box's own controls, or with a menu or a dialog open.
      if (t?.closest('.hm-start')) return;
      if (document.querySelector('.modal-backdrop, .proj-menu, [role="listbox"], [role="menu"]')) return;
      const down = e.key === 'j' || e.key === 'ArrowDown', up = e.key === 'k' || e.key === 'ArrowUp';
      if (!down && !up && !(e.key === 'Enter' && pick >= 0)) return;
      if (!needs.length) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Enter') { onOpen(needs[pick].key); return; }
      setPick((p) => Math.min(needs.length - 1, Math.max(0, down ? p + 1 : p - 1)));
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [needs, pick, onOpen]);
  useEffect(() => {
    rows.current?.querySelector('.hm-row.on')?.scrollIntoView({ block: 'nearest' });
  }, [pick]);

  return <div className="hm-page">
    <div className="hm-col">
      <h1 className="hm-hello">{hello}</h1>
      <nav className="hm-doors" aria-label="Places">
        {doors({ needs: inboxCount, progress: progressCount, team: !!team }).map((d) => (
          <button type="button" key={d.key} className={`hm-door hm-glass${d.key === 'inbox' && d.count ? ' hot' : ''}`} onClick={() => onDoor(d.key)}>
            {ICONS[d.key]}{d.label}{d.count !== null && <span className="c">{d.count}</span>}
          </button>
        ))}
      </nav>
      <div className="hm-start" ref={slot} />
      <div className="hm-two">
        <section className="hm-card hm-glass" aria-label="Needs you">
          <header className="hm-head">
            <span className="t">Needs you{needsCount > 0 && <em>{needsCount}</em>}</span>
            <button type="button" className="hm-link" onClick={() => onDoor('inbox')}>Open inbox →</button>
          </header>
          <div className="hm-scroll" ref={rows}>
            {needs.length === 0 && <p className="hm-empty">Nothing needs you.</p>}
            {needs.map((r, i) => (
              <button type="button" key={r.key} className={`hm-row${i === pick ? ' on' : ''}${r.unread ? ' unread' : ''}`} onClick={() => onOpen(r.key)} onMouseEnter={() => setPick(i)}>
                <span className="hm-face">{r.letter}</span>
                <span className="hm-text"><b>{r.title}</b>
                  <span className="hm-tags">
                    {r.priority && <span className={`hm-prio${r.priority === 'urgent' ? ' urgent' : ''}`} title={priorityLabelOf(r.priority)} aria-label={priorityLabelOf(r.priority)}><PriorityMark id={r.priority} /></span>}
                    {r.from && <span className="hm-tag">{r.from}</span>}
                    {r.project && <span className="hm-tag">{r.project}</span>}
                  </span>
                </span>
                {r.at !== null && <time>{agoShort(r.at, now)}</time>}
              </button>
            ))}
          </div>
        </section>
        {team ? (
          <section className="hm-card hm-glass" aria-label="Team this week">
            <header className="hm-head">
              <span className="t">Team this week</span>
              <button type="button" className="hm-link" onClick={onTeam}>Open Team →</button>
            </header>
            <div className="hm-scroll">
              {team.length === 0 && <p className="hm-empty">Nobody else on your team yet.</p>}
              {team.map((m) => (
                <button type="button" key={m.key} className="hm-row hm-mate" onClick={() => onMember(m.key)}>
                  <span className={`hm-face${m.ai ? ' ai' : ''}${m.state === 'working' ? ' live' : m.state === 'waiting' ? ' wait' : ''}`}>{m.letter}</span>
                  <span className="hm-text"><b>{m.name}</b><small>{m.line}</small></span>
                  <span className="hm-week"><Bars week={m.week} /><span>{m.total} done</span></span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="hm-card hm-glass" aria-label="In progress">
            <header className="hm-head">
              <span className="t">In progress{progressCount > 0 && <em>{progressCount}</em>}</span>
              <button type="button" className="hm-link" onClick={() => onDoor('progress')}>Open →</button>
            </header>
            <div className="hm-scroll">
              {progress.length === 0 && <p className="hm-empty">No agent is working right now.</p>}
              {progress.map((r) => (
                <button type="button" key={r.key} className="hm-row" onClick={() => onOpen(r.key)}>
                  <span className="hm-face live">{r.letter}</span>
                  <span className="hm-text"><b>{r.title}</b><small>{r.line}</small></span>
                  <time>{agoShort(r.at, now)}</time>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  </div>;
}
