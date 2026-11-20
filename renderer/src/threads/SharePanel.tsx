// The panels Share… opens under the thread's dots, drawn with the menu's own
// parts (.th-menu, .row-i) so they sit where its rows were.
import { useRef, useState } from 'react';
import { Face } from '../team/people';
import type { Person } from '../types';
import { WANT_WORDS, type Step, type Want } from '../../../shared/thread-ask.mts';
import { firstName, matchPeople, type SeenBy } from './share-rules';
import './share.css';

const mark = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
export const LinkMark = () => <svg {...mark}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
const InboxMark = () => <svg {...mark}><path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z" /><path d="M4 13.5h4.5l1 2h5l1-2H20" /></svg>;
const PeopleMark = () => <svg {...mark}><circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" /></svg>;
const LockMark = () => <svg {...mark}><rect x="5.5" y="10.5" width="13" height="9" rx="1.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>;
const Tick = () => <svg className="ts-more-tick" {...mark}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

const row = 'row-i ts-more-row';

/** Copy link, send it to the one teammate named, to anyone else, and who can open it. */
export function ShareList({ link, first, others, seen, onCopy, onSendFirst, onSendOther, onSee }: {
  link: boolean;
  first: Person | null;
  others: boolean;
  seen: string;
  onCopy: () => void;
  onSendFirst: () => void;
  onSendOther: () => void;
  onSee: () => void;
}) {
  return (
    <div className="th-menu ts-more-menu sh-list" role="menu" aria-label="Share">
      {link && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onCopy}>
        <span className="ico"><LinkMark /></span><span className="ts-more-label">Copy link</span>
      </button>}
      {first && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onSendFirst}>
        <span className="ico"><InboxMark /></span><span className="ts-more-label">Send to {firstName(first)}…</span>
        <Face person={first} size={18} />
      </button>}
      {others && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onSendOther}>
        <span className="ico"><InboxMark /></span><span className="ts-more-label">Send to someone…</span>
      </button>}
      <span className="sh-sep" aria-hidden="true" />
      <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onSee}>
        <span className="ico"><PeopleMark /></span><span className="ts-more-label">Who can open it</span><kbd>{seen}</kbd>
      </button>
    </div>
  );
}

/** Team, chosen people, or only you; the one it is now ticked. */
export function SeeList({ seen, teamName, onPick }: { seen: SeenBy; teamName: string; onPick: (to: SeenBy) => void }) {
  const rows: { id: SeenBy; label: string; Mark: () => JSX.Element }[] = [
    { id: 'team', label: `Everyone at ${teamName}`, Mark: PeopleMark },
    { id: 'people', label: 'Chosen people…', Mark: PeopleMark },
    { id: 'private', label: 'Only you', Mark: LockMark },
  ];
  return (
    <div className="th-menu ts-more-menu" role="menu" aria-label="Who can open it">
      {rows.map(({ id, label, Mark }) => <button key={id} type="button" role="menuitem" aria-current={seen === id ? 'true' : undefined} tabIndex={-1} className={row} onClick={() => onPick(id)}>
        <span className="ico"><Mark /></span><span className="ts-more-label">{label}</span>{seen === id && <Tick />}
      </button>)}
    </div>
  );
}

/** Chosen people…: the team, ticked where they can open it; a press adds or takes off. */
export function ChooseList({ people, chosen, onPick }: { people: readonly Person[]; chosen: readonly string[]; onPick: (id: string) => void }) {
  return (
    <div className="th-menu ts-more-menu" role="menu" aria-label="Who can open it">
      {people.map((p) => <button key={p.id} type="button" role="menuitem" aria-current={chosen.includes(p.id) ? 'true' : undefined} tabIndex={-1} className={row} onClick={() => onPick(p.id)}>
        <span className="ico"><Face person={p} size={18} /></span><span className="ts-more-label">{p.name || firstName(p)}</span>{chosen.includes(p.id) && <Tick />}
      </button>)}
    </div>
  );
}

/** What the button says for what you want: a plain send is the link in their inbox. */
export function sendWords(want: Want | null, to: readonly Person[]): string {
  if (want === 'help') return 'Ask for help';
  if (want === 'review') return 'Send for review';
  if (want === 'hand') return `Give to ${to.length === 1 ? firstName(to[0]) : 'them'}`;
  return 'Send to inbox';
}

/**
 * To, what you want from them, a note, and the button that does it. Pressing
 * the picked want again takes it off, which sends the link alone. Help shows
 * the step it is about; a hand-over goes to one person.
 */
export function SendSheet({ people, start, link, onCopy, onSend, step = null, want: first = null, wants = [] }: {
  people: readonly Person[];
  start: readonly string[];
  link: boolean;
  onCopy: () => void;
  onSend: (to: string[], note: string, want: Want | null) => void;
  step?: Step | null;
  want?: Want | null;
  wants?: readonly Want[];
}) {
  const [to, setTo] = useState<string[]>([...start]);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [want, setWant] = useState<Want | null>(first && wants.includes(first) ? first : null);
  const found = typed ? matchPeople(people, typed, to).slice(0, 5) : [];
  // The sheet owns the typing: once a person or a want is picked, the note has the keys.
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const add = (id: string) => { setTo((was) => [...new Set([...was, id])]); setTyped(''); noteBox.current?.focus(); };
  const ready = want === 'hand' ? to.length === 1 : to.length > 0;
  const send = () => { if (ready) onSend(to, note.trim(), want); };
  const picked = to.map((id) => people.find((x) => x.id === id)).filter((p): p is Person => !!p);
  return (
    <div className="th-menu ts-more-menu sh-send" role="dialog" aria-label="Send to someone">
      <div className="sh-to">
        <span className="sh-label">To</span>
        {picked.map((p) => <button key={p.id} type="button" className="sh-chip" title="Take off" onClick={() => setTo((was) => was.filter((x) => x !== p.id))}><Face person={p} size={18} />{firstName(p)}</button>)}
        <input className="sh-find" autoFocus={!to.length} placeholder={to.length ? '' : 'Add a person'} value={typed} aria-label="Add a person"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && found[0]) { e.preventDefault(); add(found[0].id); }
            else if (e.key === 'Backspace' && !typed && to.length) setTo((was) => was.slice(0, -1));
          }} />
      </div>
      {found.length > 0 && <div className="sh-found">
        {found.map((p) => <button key={p.id} type="button" className={row} onClick={() => add(p.id)}><span className="ico"><Face person={p} size={18} /></span><span className="ts-more-label">{p.name || p.email}</span></button>)}
      </div>}
      {wants.length > 0 && <div className="sh-wants" role="group" aria-label="What you want">
        {wants.map((w) => <button key={w} type="button" className="sh-want" aria-pressed={want === w} onClick={() => { setWant((was) => (was === w ? null : w)); noteBox.current?.focus(); }}>{WANT_WORDS[w]}</button>)}
      </div>}
      {want === 'help' && step && <blockquote className="sh-step">{step.words}</blockquote>}
      <textarea ref={noteBox} className="sh-note" autoFocus={to.length > 0} placeholder="Add a note" value={note} aria-label="Add a note" rows={2}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
      <div className="sh-foot">
        {link && want !== 'hand' && <button type="button" className="th-new sh-ghost" onClick={onCopy}><LinkMark />Copy link</button>}
        <button type="button" className="th-new sh-go" disabled={!ready} onClick={send}>{sendWords(want, picked)}</button>
      </div>
    </div>
  );
}

/** After Copy link: it is on the clipboard, and anyone can still have it in their inbox. */
export function CopiedSheet({ link, people, onSend }: { link: string; people: readonly Person[]; onSend: (id: string) => void }) {
  return (
    <div className="th-menu ts-more-menu sh-copied" role="dialog" aria-label="Link copied">
      <div className="sh-done"><Tick /><span>Link copied</span></div>
      <div className="sh-url">{link.replace(/^https?:\/\//, '')}</div>
      {people.length > 0 && <>
        <span className="sh-sep" aria-hidden="true" />
        <span className="sh-head">Or put it in an inbox</span>
        <div className="sh-chips">
          {people.map((p) => <button key={p.id} type="button" className="sh-chip" onClick={() => onSend(p.id)}><Face person={p} size={20} />{firstName(p)}</button>)}
        </div>
      </>}
    </div>
  );
}
