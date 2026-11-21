// A THREAD'S STATE MARK, ITS NAME IN THE BAR, AND THE CARD A TEAMMATE READS.
// The rules that decide words are in ./summary-rules.ts, and the bar's crumb in
// ./crumb-rules.ts, where the tests read them.
import { useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Person, RepeatRule, ThreadCard, WorkItem } from '../types';
import { doneSteps, threadState } from '../../../shared/thread-cards.mts';
import { PriorityIcon } from '../components/Priority';
import { priorityIdOf, priorityLabelOf } from '../priority';
import { Face, TeamContext, firstName } from '../team/people';
import { STATE_WORD, UNSEEN_THREAD, agoWords, linkPerson, linkWords, stateGlyph, type StateGlyph } from './summary-rules';
import { crumbName, renameTo } from './crumb-rules';
import { chosenNames } from './summary-rules';
import { inStep, RunningMark } from './Pages';
import { FleetContext } from '../fleet';
import { factsFor, statusCell, type StatusCell } from '../status-word';
import { TicketText } from '../components/TicketReference';
import { standingLine } from './teammate-thread';
import './summary.css';

/* ------------------------------------------------------------------ pieces */

function Glyph({ kind }: { kind: StateGlyph }) {
  return <span className={`ts-st ts-st-${kind}`} aria-hidden="true" />;
}

/**
 * THE MARK BESIDE WHAT IS HAPPENING (w-ec2b04d449). The same shapes the row's
 * Status column wears, so the panel and the list cannot say a thread is two
 * things at once: it turns while an agent is on it, rings in the accent while
 * nothing can start it, and rings faintly while it waits its turn.
 */
function StatusGlyph({ status }: { status: StatusCell }) {
  if (status.live && status.cloud) return <RunningMark cloud />;
  return <span className={`ts-st ts-st-${status.mark}${status.live ? ' live' : ''}`} aria-hidden="true" ref={status.live ? inStep : undefined} />;
}

/** What is happening on this thread, for the panel and the byline both. */
function useStatus(item: WorkItem): StatusCell {
  const fleet = useContext(FleetContext);
  const state = threadState(item);
  return statusCell(item, { ...factsFor(fleet, item.id), state, inProgress: state === 'running' });
}

/* ----------------------------------------------------------------- top bar */

/**
 * "● Running": the thread's mark and its word, FIRST ON THE LINE UNDER THE
 * TITLE (w-e731ca9376, 2026-10-01). It stood at the right of the bar beside the
 * Summary button until she asked for it here, in place of the live word
 * "Working" that said the same thing in other letters. Byline.tsx draws it
 * where it was handed it, in the line's own uppercase mono.
 */
export function ThreadStateMark({ item }: { item: WorkItem }) {
  // AND IT SAYS "WORKING" AGAIN WHILE ONE IS (w-ec2b04d449). The word here was
  // the thread's state, which reads "Waiting" over a conversation saying
  // "Editing tokens.css"; it is what is happening now, in the same words the
  // row and the panel use.
  const status = useStatus(item);
  return <span className="ts-lead"><StatusGlyph status={status} />{status.word}</span>;
}

/** The rule behind a run of a repeating task, when the thread is one (w-5e3f2e047f). */
export interface RepeatHandle {
  rule: RepeatRule;
  /** Replace what every later run is told, as one message (message-split.ts).
   *  False when the write was refused, and the box opens again with her words. */
  onSave: (message: string) => Promise<boolean>;
  onEnd: () => void;
}

const NOT_WRITTEN = 'Not written yet';

/** Each done step a dot, joined to the next by a thin line, oldest at the top (summary.css .ts-trail). */
export function DoneTrail({ steps }: { steps: string[] }) {
  return (
    <ol className="ts-trail">
      {steps.map((s, i) => <li key={i} className={`ts-step${i === steps.length - 1 ? ' ts-step-last' : ''}`}><TicketText text={s} /></li>)}
    </ol>
  );
}

/* ------------------------------------------------------------- renaming */

/**
 * A THREAD'S NAME, WHICH A CLICK TURNS INTO A BOX (w-ab3d51dc7d): "there's no
 * way for us to update the title of a task". The summary's heading and the
 * bar's crumb both use it. Enter or clicking away saves, once, rather than as
 * she types, because every keystroke would rename the row in the list beside
 * it. Escape puts the old name back and goes no further, so it never closes
 * the thread. What she saved shows at once and until the row catches up.
 */
export function useRename(name: string, onRename: ((name: string) => Promise<boolean>) | undefined, threadKey: string) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { setDraft(null); setSaved(null); }, [threadKey]);
  useEffect(() => { if (saved !== null && name === saved) setSaved(null); }, [name, saved]);
  const shown = saved ?? name;
  const begin = () => { if (onRename) setDraft(shown); };
  const finish = () => {
    if (draft === null) return;
    const next = renameTo(draft, shown);
    setDraft(null);
    if (next === null || !onRename) return;
    setSaved(next);
    void onRename(next).then((ok) => { if (!ok) setSaved(null); }, () => setSaved(null));
  };
  const cancel = () => setDraft(null);
  const onKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); finish(); }
    else e.stopPropagation();
  };
  return { shown, draft, editing: draft !== null, begin, finish, setDraft, onKey };
}

/* ------------------------------------------------------------- the crumb */

/**
 * THE THREAD'S BAR (w-922f66bb06): one line in the app's mono capitals, the
 * tab the thread was opened from, a slash, and the thread's name, "NEEDS YOU /
 * FIRST FRAME WHITE BACKGROUND FIX".
 *
 * ONLY "‹ NEEDS YOU" IS THE WAY BACK (w-ab3d51dc7d). The whole line was one
 * back button, and "the fact that selecting the whole breadcrumb brings me
 * back doesn't really make sense". The back half keeps the back hint and Esc;
 * the name is its own control, and pressing it renames the thread. Where a
 * thread cannot be renamed (a conversation is named for its person) the name
 * is plain words.
 *
 * The name keeps whole words up to 59 letters (crumb-rules.ts) and the whole
 * of it is one hover away.
 */
export function ThreadCrumb({ from, name, audience = null, onBack, onRename, threadKey = '', renameAsk = 0, onAsked }: {
  from: string; name: string; onBack: () => void;
  /** Who a thread about work is with, drawn after its name. */
  audience?: string | null;
  onRename?: (name: string) => Promise<boolean>; threadKey?: string;
  /** When ⌘K's Rename Thread… was pressed; a new moment opens the name box. */
  renameAsk?: number;
  /** Called once it has, so a crumb drawn again later does not open it again. */
  onAsked?: () => void;
}) {
  const r = useRename(name, onRename, threadKey);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (r.editing) box.current?.select(); }, [r.editing]);
  useEffect(() => { if (renameAsk) { r.begin(); onAsked?.(); } }, [renameAsk]);
  return (
    <div className="thread-crumb">
      <button type="button" className="back-esc thread-crumb-back" data-hint="back" onClick={onBack} aria-label={`Back to ${from} (esc)`}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
        <span className="thread-crumb-from">{from}</span>
      </button>
      <span className="thread-crumb-sep" aria-hidden="true">/</span>
      {r.editing ? (
        <input
          ref={box}
          className="thread-crumb-edit"
          aria-label="Thread name"
          value={r.draft ?? ''}
          onChange={(e) => r.setDraft(e.target.value)}
          onBlur={r.finish}
          onKeyDown={r.onKey}
        />
      ) : onRename ? (
        <button type="button" className="thread-crumb-name" aria-label="Rename this thread" title={r.shown} onClick={r.begin}>{crumbName(r.shown)}</button>
      ) : (
        <span className="thread-crumb-name" title={r.shown}>{crumbName(r.shown)}</span>
      )}
      {audience && !r.editing && <span className="thread-crumb-with">{audience}</span>}
    </div>
  );
}

/* ----------------------------------------------------------- a teammate's */

/** What a teammate's thread waits on, and from whom: the line under its name. */
export function TeammateStanding({ card, person, now = Date.now() }: { card: ThreadCard; person: Person | null; now?: number }) {
  const team = useContext(TeamContext);
  const owner = firstName(person) || 'Someone';
  const waits = card.state !== 'done' ? linkWords(card.blockedBy, team?.byId) : null;
  const word = card.shippedAt ? 'Shipped' : waits ? `Waits on ${waits}` : card.state === 'waiting' ? `Waiting on ${owner}` : STATE_WORD[card.state];
  const line = card.shippedAt ? null : standingLine(card.state, owner, waits);
  return (
    <p className="tp-standing">
      <Glyph kind={stateGlyph(card.state, false)} />
      <b>{word}</b>
      {line && <span className="tp-standing-line">{line}</span>}
      <span className="tp-ago">Updated {agoWords(card.updatedAt, now)}</span>
    </p>
  );
}

/**
 * A teammate's thread, beside its conversation: what it is about and what is
 * done, the files it links to, what it waits on or holds up when anything
 * does, and its properties. Its state heads the page (TeammateStanding). A
 * private thread's card says only that it is private, because the Mac that
 * published it sent nothing else (shared/thread-cards.mts cardsFor).
 */
export function TeammateCard({ card, person, files = [], done = true }: {
  card: ThreadCard; person: Person | null; now?: number;
  files?: { src: string; name: string; notes: number; open: () => void }[];
  /** False where the page already shows the Done list. */
  done?: boolean;
}) {
  const team = useContext(TeamContext);
  const name = person?.name || 'Someone';
  if (!card.visible) {
    return (
      <article className="ts-ticket ts-ticket-private">
        <p className="ts-tk-lead dim">Private thread</p>
        <div className="ts-tk-foot"><Face person={person} /><b>{name}</b><span className="ts-tk-state"><Glyph kind={stateGlyph(card.state, false)} />{card.shippedAt ? 'Shipped' : STATE_WORD[card.state]}</span></div>
      </article>
    );
  }
  const pid = Number.isFinite(card.priority) ? priorityIdOf(card.priority) : null;
  const titles = (links: ThreadCard['blockedBy']) => (
    <p>{links.map((l, i) => { const who = linkPerson(l.id, team?.byId); return <span key={l.id} className={l.title || who ? '' : 'dim'}>{i > 0 && ', '}{l.title ?? who ?? UNSEEN_THREAD}</span>; })}</p>
  );
  return (
    <article className="ts-ticket">
      {/* THE SAME TWO PARTS AS THE PANEL (w-54e9c7243f): Context as the lead,
          then the Done trail when anything is done. */}
      <section className="ts-tk-part">
        <span className="ts-h">About</span>
        <p className={`ts-tk-lead${card.problem ? '' : ' dim'}`}>{card.problem || NOT_WRITTEN}</p>
      </section>
      {done && doneSteps(card.progress).length > 0 && (
        <section className="ts-tk-part ts-tk-done"><span className="ts-h">Done</span><DoneTrail steps={doneSteps(card.progress)} /></section>
      )}
      {files.length > 0 && (
        <section className="ts-tk-part">
          <span className="ts-h">Files</span>
          <ul className="ts-tk-files">
            {files.map((f) => (
              <li key={f.src}>
                <button type="button" onClick={f.open} title={`Open ${f.name}`}>
                  <span className="ts-tk-ext" aria-hidden="true">{(f.name.includes('.') ? f.name.split('.').pop() ?? '' : 'file').slice(0, 4)}</span>
                  <span className="ts-tk-fname">{f.name}</span>
                  {f.notes > 0 && <span className="ts-tk-notes">{f.notes === 1 ? '1 note' : `${f.notes} notes`}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(card.blockedBy.length > 0 || card.blocks.length > 0) && (
        <div className="ts-tk-part ts-tk-grid ts-tk-next">
          {card.blockedBy.length > 0 && <div><span className="ts-h">Blocked by</span>{titles(card.blockedBy)}</div>}
          {card.blocks.length > 0 && <div><span className="ts-h">Blocks</span>{titles(card.blocks)}</div>}
        </div>
      )}
      <dl className="ts-tk-props">
        <dt>Owner</dt><dd><Face person={person} />{name}</dd>
        {pid && <><dt>Priority</dt><dd><PriorityIcon id={pid} />{priorityLabelOf(pid)}</dd></>}
        {card.project && <><dt>Project</dt><dd>{card.project}</dd></>}
        <dt>Who sees it</dt><dd>{card.people?.length && team ? chosenNames(card.people, team.byId) : 'The team'}</dd>
      </dl>
    </article>
  );
}

/** "Message Maya": their face and the words, in a square button, for the top bar over their card. */
export function MessagePerson({ person, onMessage }: { person: Person | null; onMessage: () => void }) {
  return (
    <button type="button" className="ts-msgbtn" onClick={onMessage}>
      <Face person={person} />Message {firstName(person)}
    </button>
  );
}
