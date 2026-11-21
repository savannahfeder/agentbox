// The panels Share… opens under the thread's dots, drawn with the menu's own
// parts (.th-menu, .row-i) so they sit where its rows were.
import { useContext, useState } from 'react';
import { Face, TeamContext } from '../team/people';
import type { Person } from '../types';
import { firstName, matchPeople, type SeenBy } from './share-rules';
import './share.css';
import '../team/asks.css';

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
        <span className="ico"><InboxMark /></span><span className="ts-more-label">Send to {firstName(first)}</span>
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

/** To, a note, and Send to inbox; Copy link beside it for a link instead. */
export function SendSheet({ people, start, link, onCopy, onSend }: {
  people: readonly Person[];
  start: readonly string[];
  link: boolean;
  onCopy: () => void;
  onSend: (to: string[], note: string) => void;
}) {
  const [to, setTo] = useState<string[]>([...start]);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const found = typed ? matchPeople(people, typed, to).slice(0, 5) : [];
  const add = (id: string) => { setTo((was) => [...new Set([...was, id])]); setTyped(''); };
  const send = () => { if (to.length) onSend(to, note.trim()); };
  return (
    <div className="th-menu ts-more-menu sh-send" role="dialog" aria-label="Send to someone">
      <div className="sh-to">
        <span className="sh-label">To</span>
        {to.map((id) => { const p = people.find((x) => x.id === id); return p && <button key={id} type="button" className="sh-chip" title="Take off" onClick={() => setTo((was) => was.filter((x) => x !== id))}><Face person={p} size={18} />{firstName(p)}</button>; })}
        <input className="sh-find" autoFocus placeholder={to.length ? '' : 'Add a person'} value={typed} aria-label="Add a person"
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
      <textarea className="sh-note" placeholder="Add a note" value={note} aria-label="Add a note" rows={2}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
      <div className="sh-foot">
        {link && <button type="button" className="th-new sh-ghost" onClick={onCopy}><LinkMark />Copy link</button>}
        <button type="button" className="th-new sh-go" disabled={!to.length} onClick={send}>Send to inbox</button>
      </div>
    </div>
  );
}

export type GiveMode = 'help' | 'review' | 'give';

const MODES: { id: GiveMode; label: string; detail: (first: string) => string; ask: string; go: (first: string) => string }[] = [
  { id: 'help', label: 'Help', detail: (f) => `${f} can write to your agent, then hands it back to you.`, ask: 'What do you need help with?', go: (f) => `Ask ${f} to help` },
  { id: 'review', label: 'Review', detail: (f) => `${f} reads it and tells you it looks good or what to change.`, ask: 'What should they look at?', go: (f) => `Ask ${f} to review` },
  { id: 'give', label: 'Hand over', detail: (f) => `It becomes ${f}’s thread from now on.`, ask: 'Add a note', go: (f) => `Give to ${f}` },
];

/** After a person is picked: help with a step, a review, or the whole thread, and a note. */
export function GiveSheet({ to, onGive, onAsk, step = null, start = 'help', startNote = '', onChange, onChangePerson }: {
  to: { id: string; name: string };
  onGive: (note: string) => void;
  /** Help or a review keeps the thread yours; without it only handing over is offered. */
  onAsk?: (kind: 'help' | 'review', note: string) => void;
  /** The message picked as the step, drawn as a quote. */
  step?: string | null;
  start?: GiveMode;
  startNote?: string;
  /** Every pick and keystroke, so a sheet closed unsent can open again as it was. */
  onChange?: (mode: GiveMode, note: string) => void;
  /** Pressing the name goes back to the people. */
  onChangePerson?: () => void;
}) {
  const [note, setNote] = useState(startNote);
  const [mode, setMode] = useState<GiveMode>(onAsk ? start : 'give');
  const team = useContext(TeamContext);
  const first = to.name.split(/\s+/)[0] || to.name;
  const m = MODES.find((x) => x.id === mode)!;
  const go = () => { if (mode === 'give' || !onAsk) onGive(note.trim()); else onAsk(mode, note.trim()); };
  const face = <Face person={team?.byId.get(to.id) ?? { id: to.id, email: '', name: to.name, avatarUrl: null }} size={18} />;
  return (
    <div className="th-menu ts-more-menu sh-send sh-give" role="dialog" aria-label={`Bring in ${first}`}>
      <div className="sh-to"><span className="sh-label">To</span>{onChangePerson
        ? <button type="button" className="sh-chip" title="Pick someone else" onClick={onChangePerson}>{face}{first}</button>
        : <span className="sh-chip sh-chip-set">{face}{first}</span>}</div>
      {onAsk && <div className="sh-modes">
        <div className="sh-switch" role="radiogroup" aria-label="What you want from them">
          {MODES.map((x) => <button key={x.id} type="button" role="radio" aria-checked={mode === x.id} className={`sh-mode${mode === x.id ? ' on' : ''}`} onClick={() => { setMode(x.id); onChange?.(x.id, note); }}>{x.label}</button>)}
        </div>
        <p className="sh-mode-says">{m.detail(first)}</p>
      </div>}
      {step && mode !== 'give' && <blockquote className="sh-step">{step.length > 220 ? `${step.slice(0, 220)}…` : step}</blockquote>}
      <textarea className="sh-note" autoFocus placeholder={m.ask} value={note} aria-label={m.ask} rows={2}
        onChange={(e) => { setNote(e.target.value); onChange?.(mode, e.target.value); }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }} />
      <div className="sh-foot">
        <button type="button" className="th-new sh-go" onClick={go}>{m.go(first)}</button>
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
