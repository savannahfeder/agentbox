// WHO SEES A PROJECT'S THREADS, AS ONE BUTTON BESIDE ITS NAME (w-b989839656,
// design 2B, approved 2026-10-05). The button is drawn as how the project is
// shared, "Just you", "Northwind team" or the people, rather than a Share
// button with the answer written somewhere else. It opens the same three
// choices a thread has. Projects stay on each Mac; this decides only whose
// Team page the project's thread summaries reach, and a thread can still say
// otherwise from the New thread card.
import { useContext, useEffect, useRef, useState } from 'react';
import type { Person, Product } from '../types';
import { projectSeenBy } from '../../../shared/thread-cards.mjs';
import { chosenWords, teammates } from '../threads/composer-rules';
import { LockIcon, TeamContext } from './people';

type ProjectSeen = Pick<Product, 'name'> & Partial<Pick<Product, 'personal' | 'seenBy' | 'seenByPeople'>>;
type Who = 'private' | 'team' | 'people';

/** The words for who sees a project: short for the Projects list's column,
 *  long for the button. One reading of the project, so the two cannot differ. */
export function seenByWords(product: ProjectSeen, byId: Map<string, Person>, teamName: string | null): { who: Who; short: string; long: string } {
  const { who, people } = projectSeenBy(product);
  if (who === 'private') return { who, short: 'Just you', long: 'Just you' };
  if (who === 'people') {
    const names = chosenWords(people, people.map((id) => byId.get(id)).filter((p): p is Person => !!p));
    return { who, short: names, long: names };
  }
  return { who, short: 'Team', long: teamName ? `${teamName} team` : 'Team' };
}

export function PeopleMark() {
  return <svg width="15" height="13" viewBox="2 4 20 17" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" />
  </svg>;
}

/** The Projects list's Who sees it cell (design 1B): the mark and the short words. */
export function ProjectWho({ product }: { product: ProjectSeen }) {
  const team = useContext(TeamContext);
  if (!team) return null;
  const words = seenByWords(product, team.byId, team.state.team?.name ?? null);
  return <>{words.who === 'private' ? <LockIcon /> : <PeopleMark />}{words.short}</>;
}

const Caret = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;

export function ProjectShare({ product, onChange }: {
  product: ProjectSeen;
  onChange: (who: Who, people?: string[]) => void | Promise<void>;
}) {
  const team = useContext(TeamContext);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<'rows' | 'people'>('rows');
  const [ticked, setTicked] = useState<string[]>(() => projectSeenBy(product).people);
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  if (!team) return null;

  const teamName = team.state.team?.name ?? null;
  const words = seenByWords(product, team.byId, teamName);
  // MY WORKSPACE IS JUST YOU BY WHAT IT IS, so its button says so and does
  // not open: a menu offering a choice that is refused is worse than none.
  const locked = product.personal === true;
  const others = teammates(team.state.people ?? [], team.me);
  const pick = (who: Who, people?: string[]) => { setOpen(false); setPage('rows'); void onChange(who, people); };
  const row = (who: Who, label: string, line: string) => (
    <button key={who} type="button" role="menuitemradio" aria-checked={words.who === who} className={`tc-row tc-two${words.who === who ? ' on' : ''}`}
      onClick={() => (who === 'people' ? setPage('people') : pick(who))}>
      {who === 'private' ? <LockIcon /> : <PeopleMark />}
      <span className="tc-row-label">{label}<small>{line}</small></span>
    </button>
  );

  return (
    <span className="ps-anchor" ref={box}>
      <button type="button" className="set-ghost ps-btn" disabled={locked} aria-haspopup={locked ? undefined : 'menu'} aria-expanded={locked ? undefined : open}
        title={locked ? 'My Workspace is always just you' : 'Who sees this project’s threads'}
        onClick={() => { setTicked(projectSeenBy(product).people); setPage('rows'); setOpen((o) => !o); }}>
        {words.who === 'private' ? <LockIcon /> : <PeopleMark />}
        <span>{words.long}</span>
        {!locked && <Caret />}
      </button>
      {open && !locked && (
        <div className="ps-menu" role="menu" aria-label={`Who sees ${product.name}`}>
          {page === 'rows' ? <>
            <span className="tc-menu-head">Who sees {product.name}</span>
            {row('private', 'Just you', 'Only you see its threads.')}
            {row('team', teamName ? `${teamName} team` : 'Team', 'Everyone on the team sees its threads.')}
            {row('people', 'Chosen people', 'Only the people you pick see them.')}
          </> : <>
            <span className="tc-menu-head">Who sees {product.name}</span>
            {others.length ? others.map((p) => {
              const on = ticked.includes(p.id);
              return (
                <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={on} className={`tc-row${on ? ' on' : ''}`}
                  onClick={() => setTicked((t) => (on ? t.filter((x) => x !== p.id) : [...t, p.id]))}>
                  <span className={`ps-tick${on ? ' on' : ''}`} aria-hidden="true">
                    {on && <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.8 8.4 6.6 11.2 12.2 5" /></svg>}
                  </span>
                  <span className="tc-row-label">{p.name}</span>
                </button>
              );
            }) : <span className="tc-none">Nobody else is on the team yet.</span>}
            <span className="ps-foot">
              <button type="button" className="set-ghost" onClick={() => setPage('rows')}>Back</button>
              {/* Nobody ticked is Just you, the way it reads everywhere else. */}
              <button type="button" className="set-ghost" onClick={() => pick(ticked.length ? 'people' : 'private', ticked)}>Done</button>
            </span>
          </>}
        </div>
      )}
    </span>
  );
}
