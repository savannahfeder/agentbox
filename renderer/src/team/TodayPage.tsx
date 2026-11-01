// The Today page: the team's day in a few lines a person, in place of a standup.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { shownTitle } from '../../../shared/thread-title.mjs';
import { MemberFace } from './everything/TeamStrip';
import type { Member } from './everything/members';
import { SHOWN, lineWhen, linesToStep, stepLine, todayParts, type TodayLine, type TodayPerson, type TodayRange, type TodayCounts } from './today';
import './today.css';

const RANGES: { id: TodayRange; label: string }[] = [{ id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'week', label: 'This week' }];
const EMPTY: Record<TodayRange, string> = { today: 'Nothing moved yet today.', yesterday: 'Nothing moved yesterday.', week: 'Nothing moved this week.' };
const QUIET: Record<TodayRange, string> = { today: 'Nothing yet today from', yesterday: 'Nothing yesterday from', week: 'Nothing this week from' };

const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);


function Section({ id, picked, label, lines, extra, range, tone, titleOf, onOpen }: {
  id: string; picked: string | null; label: string; lines: TodayLine[]; extra?: ReactNode; range: TodayRange; tone?: 'ask' | 'tasks';
  titleOf: (l: TodayLine) => string;
  onOpen: (l: TodayLine) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!lines.length && !extra) return null;
  const more = lines.length - SHOWN;
  return <div className={`td-sec${tone ? ` ${tone}` : ''}`}>
    <span className="td-label">{label}</span>
    <ul>
      {(open ? lines : lines.slice(0, SHOWN)).map((l) => <li key={l.key}>
        <button type="button" className={`td-line${picked === `${id}/${l.key}` ? ' is-picked' : ''}`} onClick={() => onOpen(l)} title={l.says ? `${titleOf(l)}: ${l.says}` : titleOf(l)}>
          {tone === 'ask' && <i className="td-dot" aria-hidden="true" />}
          <span className="td-t">{titleOf(l)}</span>
          {l.on && <span className="td-on">on {l.on}</span>}
          {l.blocked && <span className="td-on td-block">blocked on {l.blocked}</span>}
          {l.level && <span className="td-says">{l.level}</span>}
          {l.says && <span className="td-says">{l.says}</span>}
          {tone === 'tasks'
            ? l.due && <span className={`td-at td-due${l.due.late ? ' late' : ''}`}>{l.due.word}</span>
            : <span className="td-at">{lineWhen(l.at, range, Date.now())}</span>}
        </button>
      </li>)}
      {!open && more > 0 && <li><button type="button" className="td-more" onClick={() => setOpen(true)}>and {more} more</button></li>}
      {extra && <li className="td-extra">{extra}</li>}
    </ul>
  </div>;
}

// Titles past the first few were never worked out: a week on a big store finishes thousands.
const titleOf = (l: TodayLine) => l.title || (l.item ? shownTitle(l.item) : '');

function Person({ p, face, picked, range, onOpen }: { p: TodayPerson; face?: Member; picked: string | null; range: TodayRange; onOpen: (l: TodayLine) => void }) {
  const secret = p.privateDone ? `${p.privateDone} private ${p.privateDone === 1 ? 'thread' : 'threads'}` : null;
  const props = { picked, range, onOpen, titleOf };
  const at = (section: string) => `${p.key}/${section}`;
  return <section className="td-person" aria-label={p.name}>
    <header className="td-who">
      {face && <MemberFace m={face} size={22} />}
      <h2>{p.name}</h2>
      {face?.role && <em>{face.role}</em>}
    </header>
    <Section id={at('waitingOnYou')} label="Waiting on you" lines={p.waitingOnYou} tone="ask" {...props} />
    <Section id={at('tasks')} label="Tasks" lines={p.tasks} tone="tasks" {...props} />
    <Section id={at('blocked')} label="Blocked" lines={p.blocked} {...props} />
    <Section id={at('decided')} label="Decided" lines={p.decided} {...props} />
    <Section id={at('shipped')} label="Shipped" lines={p.shipped} {...props} />
    <Section id={at('finished')} label="Finished" lines={p.finished} extra={secret && (p.finished.length ? `and ${secret}` : secret)} {...props} />
    <Section id={at('working')} label="Working on" lines={p.working} {...props} />
  </section>;
}

export function TodayPage({ range, onRange, day, faces, picked, onPicked, keys, onOpen, onNeeds }: {
  range: TodayRange; onRange: (r: TodayRange) => void;
  day: { people: TodayPerson[]; quiet: string[]; counts: TodayCounts };
  faces: ReadonlyMap<string, Member>;
  /** The line J and K are on, kept above the page so coming back from a thread lands on it. */
  picked: string | null; onPicked: (id: string | null) => void;
  /** False while something is drawn over the page, which then keeps the keys. */
  keys: boolean;
  onOpen: (l: TodayLine) => void;
  onNeeds: () => void;
}) {
  const [needs, ...rest] = todayParts(day.counts);
  const held = useRef({ lines: linesToStep(day.people), picked, onOpen, onPicked });
  held.current = { lines: linesToStep(day.people), picked, onOpen, onPicked };
  // In the capture phase, or App's own J and K move the list hidden under this page.
  useEffect(() => {
    if (!keys) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const now = held.current;
      const down = e.key === 'j' || e.key === 'ArrowDown';
      if (down || e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        now.onPicked(stepLine(now.lines, now.picked, down ? 1 : -1));
      } else if (e.key === 'Enter') {
        const hit = now.lines.find((l) => l.id === now.picked);
        if (!hit) return;
        e.preventDefault(); e.stopPropagation();
        now.onOpen(hit.line);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [keys]);
  const page = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (picked) page.current?.querySelector('.td-line.is-picked')?.scrollIntoView({ block: 'nearest' });
  }, [picked]);
  return <div className="td" aria-label="Today" ref={page}>
    <div className="td-col">
      <div className="td-top">
        <p className="td-sum">
          {day.counts.needYou > 0 ? <button type="button" className="td-needs" onClick={onNeeds} title="Open Needs you">{needs}</button> : needs}
          {rest.map((r) => `, ${r}`).join('')}
        </p>
        <div className="td-range" role="tablist" aria-label="Which days">
          {RANGES.map((r) => <button type="button" role="tab" key={r.id} aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => onRange(r.id)}>{r.label}</button>)}
        </div>
      </div>
      {day.people.length === 0 && <p className="td-empty">{EMPTY[range]}</p>}
      <div className="td-people">
        {day.people.map((p) => <Person key={p.key} p={p} face={faces.get(p.key)} picked={picked} range={range} onOpen={onOpen} />)}
      </div>
      {day.quiet.length > 0 && <p className="td-quiet">{QUIET[range]} {joinNames(day.quiet)}.</p>}
    </div>
  </div>;
}
