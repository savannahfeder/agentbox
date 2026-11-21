// The panels Share… opens under the thread's dots, drawn with the menu's own
// parts (.th-menu, .row-i) so they sit where its rows were.
import { useContext, useState } from 'react';
import { Face, TeamContext } from '../team/people';
import type { Person } from '../types';
import { firstName, matchPeople, type SeenBy } from './share-rules';
import { sendKeyFor } from '../reply-keys';
import './share.css';
import '../team/asks.css';

const mark = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
export const LinkMark = () => <svg {...mark}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
const PeopleMark = () => <svg {...mark}><circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" /></svg>;
/** The mark Who can open it and Everyone at the team wear, for the Share button too. */
export const EveryoneMark = PeopleMark;
const LockMark = () => <svg {...mark}><rect x="5.5" y="10.5" width="13" height="9" rx="1.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>;
const HandMark = () => <svg {...mark}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-5.5 6-5.5 1.4 0 2.7.4 3.7 1" /><path d="M15 17h6m-2.5-2.5L21 17l-2.5 2.5" /></svg>;
const ReviewMark = () => <svg {...mark}><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>;
const SendMark = () => <svg {...mark}><path d="M20.5 3.5 3.5 10.5l7 3 3 7z" /><path d="m10.5 13.5 4-4" /></svg>;
const AskMark = () => <svg {...mark}><path d="M5 5.5h14v10H10l-4 3.5v-3.5H5z" /><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4" /><path d="M12 14.2v.1" /></svg>;
const BackMark = () => <svg {...mark}><path d="m14.5 6-6 6 6 6" /></svg>;
const Tick = () => <svg className="ts-more-tick" {...mark}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

const row = 'row-i ts-more-row';

/** The way back to the panel this one opened from, at the top of every panel under Share. */
export function PanelBack({ label, onBack }: { label: string; onBack: () => void }) {
  return <>
    <button type="button" role="menuitem" tabIndex={-1} className={`${row} sh-back`} onClick={onBack}>
      <span className="ico"><BackMark /></span><span className="ts-more-label">{label}</span>
    </button>
    <span className="sh-sep" aria-hidden="true" />
  </>;
}

/** Ask someone in or hand it over first, then the link: copy it, send it to an inbox, and who can open it.
 *  A one-click send to the last person was taken out: it was the panel's most clickable row and only sent a link. */
export function ShareList({ link, others, seen, onCopy, onSendOther, onSee, onAsk, onHand, onBack }: {
  link: boolean;
  /** Someone on the team to send a link to. */
  others: boolean;
  seen: string;
  onCopy: () => void;
  onSendOther: () => void;
  onSee: () => void;
  /** Help or a review; absent where the thread cannot be asked about. */
  onAsk?: (kind: 'help' | 'review') => void;
  /** Hand it over for good; absent where it cannot be. */
  onHand?: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="th-menu ts-more-menu sh-list" role="menu" aria-label="Share or hand off">
      {onBack && <PanelBack label="Back" onBack={onBack} />}
      {onAsk && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={() => onAsk('review')}>
        <span className="ico"><ReviewMark /></span><span className="ts-more-label">Ask for a review…</span>
      </button>}
      {onAsk && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={() => onAsk('help')}>
        <span className="ico"><AskMark /></span><span className="ts-more-label">Ask for help…</span>
      </button>}
      {onHand && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onHand}>
        <span className="ico"><HandMark /></span><span className="ts-more-label">Hand it over…</span>
      </button>}
      {(onAsk || onHand) && <span className="sh-sep" aria-hidden="true" />}
      {link && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onCopy}>
        <span className="ico"><LinkMark /></span><span className="ts-more-label">Copy link</span>
      </button>}
      {others && <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onSendOther}>
        <span className="ico"><SendMark /></span><span className="ts-more-label">Send a link…</span>
      </button>}
      <span className="sh-sep" aria-hidden="true" />
      <button type="button" role="menuitem" tabIndex={-1} className={row} onClick={onSee}>
        <span className="ico"><PeopleMark /></span><span className="ts-more-label">Who can open it</span><span className="ts-more-detail">{seen}</span>
      </button>
    </div>
  );
}

/** Team, chosen people, or only you; the one it is now ticked. */
export function SeeList({ seen, teamName, onPick, onBack }: { seen: SeenBy; teamName: string; onPick: (to: SeenBy) => void; onBack?: () => void }) {
  const rows: { id: SeenBy; label: string; Mark: () => JSX.Element }[] = [
    { id: 'team', label: `Everyone at ${teamName}`, Mark: PeopleMark },
    { id: 'people', label: 'Chosen people…', Mark: PeopleMark },
    { id: 'private', label: 'Only you', Mark: LockMark },
  ];
  return (
    <div className="th-menu ts-more-menu" role="menu" aria-label="Who can open it">
      {onBack && <PanelBack label="Back" onBack={onBack} />}
      {rows.map(({ id, label, Mark }) => <button key={id} type="button" role="menuitem" aria-current={seen === id ? 'true' : undefined} tabIndex={-1} className={row} onClick={() => onPick(id)}>
        <span className="ico"><Mark /></span><span className="ts-more-label">{label}</span>{seen === id && <Tick />}
      </button>)}
    </div>
  );
}

/** Chosen people…: the team, ticked where they can open it; a press adds or takes off. */
export function ChooseList({ people, chosen, onPick, onBack }: { people: readonly Person[]; chosen: readonly string[]; onPick: (id: string) => void; onBack?: () => void }) {
  return (
    <div className="th-menu ts-more-menu" role="menu" aria-label="Who can open it">
      {onBack && <PanelBack label="Back" onBack={onBack} />}
      {people.map((p) => <button key={p.id} type="button" role="menuitem" aria-current={chosen.includes(p.id) ? 'true' : undefined} tabIndex={-1} className={row} onClick={() => onPick(p.id)}>
        <span className="ico"><Face person={p} size={18} /></span><span className="ts-more-label">{p.name || firstName(p)}</span>{chosen.includes(p.id) && <Tick />}
      </button>)}
    </div>
  );
}

/** To, a note, and Send in chat; Copy link beside it for a link instead. */
export function SendSheet({ people, start, link, onCopy, onSend, onBack }: {
  onBack?: () => void;
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
    <div className="th-menu ts-more-menu sh-send" role="dialog" aria-label="Send a link">
      {onBack && <PanelBack label="Back" onBack={onBack} />}
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
        <button type="button" className="th-new sh-go" disabled={!to.length} onClick={send}>Send in chat</button>
      </div>
    </div>
  );
}

export type GiveMode = 'help' | 'review' | 'give';

const MODES: { id: GiveMode; label: string; detail: (first: string) => string; ask: (first: string) => string; go: (first: string) => string }[] = [
  { id: 'help', label: 'Help', detail: (f) => `${f} can write to your agent, then hands it back to you.`, ask: () => 'What do you need help with?', go: (f) => `Ask ${f} to help` },
  { id: 'review', label: 'Review', detail: (f) => `${f} reads it and tells you it looks good or what to change.`, ask: (f) => `What should ${f} look at?`, go: (f) => `Ask ${f} to review` },
  { id: 'give', label: 'Hand over', detail: (f) => `${f} owns it from now on, with its conversation and files. You can take it back.`, ask: (f) => `Anything ${f} should know?`, go: (f) => `Hand over to ${f}` },
];

/** Only help points at a message; a review or a hand-over is of the whole thread, so it shows and sends none. */
export const pointsAtStep = (mode: GiveMode): boolean => mode === 'help';

const ThreadMark = () => <svg {...mark} width={14} height={14}><path d="M4 5h16v11h-9l-4.5 3.5V16H4z" /><path d="M8 9h8M8 12h5" /></svg>;

/** After a person is picked: help with a step, a review, or the whole thread, and a note. */
export function GiveSheet({ to, onGive, onAsk, step = null, start = 'help', onBack, only, onCancel, note: kept, onNote, onMode, threadName = null }: {
  /** The thread's name, as the person asked sees it in their list. */
  threadName?: string | null;
  /** The switch was moved, so a sheet closed unsent can open again on it. */
  onMode?: (mode: GiveMode) => void;
  onBack?: () => void;
  /** The note kept by whoever opens the sheet, so Escape or Back does not lose it. */
  note?: string;
  onNote?: (note: string) => void;
  /** Closes the sheet; a click outside keeps a note with words in it, so this is the way out. */
  onCancel?: () => void;
  /** Came in through Ask (help or a review), one of its two rows, or Hand over: no switch when the row already chose. */
  only?: 'ask' | 'give' | 'help' | 'review';
  to: { id: string; name: string };
  onGive: (note: string) => void;
  /** Help or a review keeps the thread yours; without it only handing over is offered. */
  onAsk?: (kind: 'help' | 'review', note: string) => void;
  /** The message picked as the step, drawn as a quote. */
  step?: string | null;
  start?: GiveMode;
}) {
  const [own, setOwn] = useState('');
  const note = kept ?? own;
  const setNote = onNote ?? setOwn;
  const fixed = only === 'help' || only === 'review' || only === 'give';
  const [mode, setMode] = useState<GiveMode>(only === 'help' || only === 'review' ? (onAsk ? only : 'give') : onAsk && only !== 'give' ? (only === 'ask' && start === 'give' ? 'help' : start) : 'give');
  const choices = MODES.filter((x) => (only === 'ask' ? x.id !== 'give' : true));
  const team = useContext(TeamContext);
  const first = to.name.split(/\s+/)[0] || to.name;
  const m = MODES.find((x) => x.id === mode)!;
  // Help with no step picked and no words would reach them as an empty ask.
  const empty = mode === 'help' && !step && !note.trim();
  const go = () => { if (empty) return; if (mode === 'give' || !onAsk) onGive(note.trim()); else onAsk(mode, note.trim()); };
  const quote = step && pointsAtStep(mode) && <blockquote className="sh-step">{step.length > 220 ? `${step.slice(0, 220)}…` : step}</blockquote>;
  return (
    <div className="th-menu ts-more-menu sh-send sh-give" role="dialog" aria-label={`Ask or hand over to ${first}`}>
      {onBack && <PanelBack label="Back" onBack={onBack} />}
      <div className="sh-to"><span className="sh-label">To</span><span className="sh-chip sh-chip-set"><Face person={team?.byId.get(to.id) ?? { id: to.id, email: '', name: to.name, avatarUrl: null }} size={18} />{first}</span></div>
      {onAsk && !fixed && <div className="sh-modes">
        <div className="sh-switch" role="radiogroup" aria-label="What you want from them">
          {choices.map((x) => <button key={x.id} type="button" role="radio" aria-checked={mode === x.id} className={`sh-mode${mode === x.id ? ' on' : ''}`} onClick={() => { setMode(x.id); onMode?.(x.id); }}>{x.label}</button>)}
        </div>
        <p className="sh-mode-says">{m.detail(first)}</p>
      </div>}
      {(!onAsk || fixed) && <p className="sh-mode-says sh-mode-alone">{m.detail(first)}</p>}
      {/* The whole thread goes, so it is drawn by its name with the message as where to look. */}
      {threadName ? <div className="sh-thread"><div className="sh-thread-head"><ThreadMark /><span>{threadName}</span></div>{quote}</div> : quote}
      <textarea className="sh-note" autoFocus placeholder={m.ask(first)} value={note} aria-label={m.ask(first)} rows={2}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }} />
      <div className="sh-foot">
        {onCancel && <button type="button" className="th-new sh-ghost" onClick={onCancel}>Cancel</button>}
        <button type="button" className="th-new sh-go" disabled={empty} onClick={go}>{m.go(first)}<kbd>{sendKeyFor(false)}</kbd></button>
      </div>
    </div>
  );
}

/** After Copy link: it is on the clipboard, and anyone can still have it in their inbox. */
export function CopiedSheet({ link, people, onSend, onBack }: { link: string; people: readonly Person[]; onSend: (id: string) => void; onBack?: () => void }) {
  return (
    <div className="th-menu ts-more-menu sh-copied" role="dialog" aria-label="Link copied">
      {onBack && <PanelBack label="Back" onBack={onBack} />}
      <div className="sh-done"><Tick /><span>Link copied</span></div>
      <div className="sh-url">{link.replace(/^https?:\/\//, '')}</div>
      {people.length > 0 && <>
        <span className="sh-sep" aria-hidden="true" />
        <span className="sh-head">Or send it in chat</span>
        <div className="sh-chips">
          {people.map((p) => <button key={p.id} type="button" className="sh-chip" onClick={() => onSend(p.id)}><Face person={p} size={20} />{firstName(p)}</button>)}
        </div>
      </>}
    </div>
  );
}
