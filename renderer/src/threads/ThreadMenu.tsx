// THE THREAD'S MENU: the square three-dot button at the right of the top bar,
// beside the Summary button, and the small menu it opens.
//
// The bar it replaced (2026-10-01) was cluttered, so viewing the code,
// opening the terminal and marking done moved into a small three-dot menu.
// Measured before, at 1440: the terminal mark at 1091..1125,
// the state word, the Summary button at 1219..1340, the Done mark at
// 1364..1398, and the change figures hanging under them. Now the bar's right
// side is the Summary button and these dots, and the three verbs are rows.
//
// EVERY KEY STILL WORKS AND EVERY ROW SAYS ITS KEY. E finishes a thread and ⌘J
// shows its terminal, from anywhere on the page, exactly as before (App.tsx);
// the rows print them so the menu teaches the keys rather than hiding them.
// The code row has no key, so it prints what the run changed instead.
//
// CODE CAME OUT AS A BUTTON AND ADD PEOPLE WENT IN (w-c25aae4035). Nobody found
// the change as a row, so the corner draws it beside Done with its figures, and
// Add people, which was that corner's button, is a row here.
//
// ONLY WHAT APPLIES. A run that changed no code has no code row, rather than a
// row that opens nothing. A conversation with a person has no code and no
// terminal, so its menu is Mark done alone, and with nothing left to offer
// (a finished conversation) no dots are drawn at all.
//
// DONE CAME BACK OUT OF THE MENU (w-bca8a6466f, 2026-10-26). Her words: "We
// need a button in the top right to be able to easily mark threads as done;
// currently it's very non-discoverable for such a key feature." Of six corners
// drawn she first picked Done joined to the dots, then asked the same night for
// "the one that was separate instead": Done in a box of its own, with the
// double tick and the word, just left of the dots. So `done` stays in
// threadMenuRows as the one place its words and key are said, and the button
// draws it rather than a row. A conversation with a person gets Done alone; a
// finished thread gets the dots alone.
//
// THE APP'S OWN POPOVER, not a new one: `.th-menu` and `.row-i` from pages.css,
// the dark card with square corners whose rows light on hover. summary.css
// only places it under the dots.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { chord } from '../this-keyboard';
import { DONE } from '../done-word';
import { onPhone } from '../phone-screen';
import { PlaceButton, type PlaceFacts } from './PlaceButton';
import { nameWait } from '../../../shared/thread-waits.mts';
import { PriorityIcon } from '../components/Priority';
import { PRIORITIES, priorityLabelOf, type PriorityId } from '../priority';
import { Face } from '../team/people';
import type { Person } from '../types';
import { ChooseList, CopiedSheet, EveryoneMark, GiveSheet, PanelBack, SeeList, SendSheet, ShareList, pointsAtStep } from './SharePanel';
import { readAskDraft, saveAskDraft, type AskDraft, type ItemRef } from '../drafts';
import type { SeenBy, ShareFace } from './share-rules';
import { BRING_IN, OUTSIDE_ALL, OUTSIDE_ASK, OUTSIDE_MODES, OUTSIDE_TITLE, outsideLabel } from '../outside-agents';
import type { AgentMode } from '../types';

/** ⌘K asking a person: the thread's menu opens its sheet for them. */
export const ASK_PERSON_EVENT = 'zero:ask-person';

export type ThreadMenuRowId = 'follow' | 'continue' | 'share' | 'run' | 'code' | 'terminal' | 'people' | 'later' | 'priority' | 'outside' | 'pin' | 'rename' | 'move' | 'give' | 'wait' | 'shipped' | 'stop-repeat' | 'close-task' | 'reopen' | 'done';

/**
 * WHERE THIS THREAD RUNS: in the cloud now (`cloud`), free to go there
 * (`here`), kept on this Mac by her (`kept`) or by the cloud handing it back
 * (`needs`), running here where the cloud could take it now (`move`), or here
 * because the whole cloud is off (`off`). The top bar's PlaceButton draws it;
 * ⌘K offers PLACE_ROW's words, and for `off` its own Turn the cloud on row.
 */
export type ThreadPlace = 'cloud' | 'here' | 'kept' | 'move' | 'needs' | 'off';
export const PLACE_ROW: Record<Exclude<ThreadPlace, 'off'>, { label: string; detail: string }> = {
  cloud: { label: 'Run on this Mac', detail: 'In the cloud now' },
  here: { label: 'Keep on this Mac', detail: 'Cloud allowed' },
  kept: { label: 'Run on the cloud', detail: 'This Mac only' },
  move: { label: 'Move to the cloud', detail: 'On this Mac now' },
  needs: { label: 'Run on the cloud', detail: 'Needs this Mac' },
};
/** What picking does: keep it on this Mac (true), let the cloud have it (false), move its run now, or turn the whole cloud on. */
export type PlaceAct = boolean | 'move' | 'cloud-on';
export const placeAct = (place: Exclude<ThreadPlace, 'off'>): PlaceAct => (place === 'move' ? 'move' : place !== 'kept' && place !== 'needs');
export interface ThreadMenuRow {
  id: ThreadMenuRowId; label: string; key: string | null; detail?: string;
  /** A row that is on until it is picked again, ticked meanwhile. */
  on?: boolean;
}

/**
 * Which rows a thread's menu offers, in the order they are drawn. `terminal`
 * is null where the thread has none, else whether it is open now, so the row
 * says what pressing it will do: a row called Open terminal that closed an open
 * one would be lying (TaskTerminal.tsx says the same of ⌘K's row).
 *
 * RUN NOW comes first and only on a task that is waiting its turn and has not
 * been pushed already (w-87ff499077). Raising a task's tag could not start it:
 * a project's place in the order outweighs any tag, and only Urgent could take
 * a running slot. This row is the one-time "this task, now" that was missing;
 * supervisor.runNow says what it does.
 *
 * PIN THREAD keeps it at the top of the list (w-20323283e6), just above Mark
 * done. `pin` is null where a thread cannot be pinned, else whether it is now,
 * so the row says what pressing it does.
 *
 * LATER IS A ROW ONLY WHERE THERE IS NO L (QA batch 005, F-117). On the laptop
 * L puts a thread off from anywhere on the page, so a row would be a second
 * door to one verb; on a phone there was no door at all and the Later tab
 * could not be filled. It names no key for the same reason.
 */
export function threadMenuRows({ change, terminal, finish, follow = null, carryOn = false, runNow = false, share = false, shareButton = false, shareSays = null, people = false, later = false, priority = null, outside = null, pin = null, rename = false, move = false, give = false, wait = false, shipped = null, stopRepeat = false, closeTask = false, reopen = false }: {
  /** A teammate's thread: whether you are told when it is done, or null where that cannot change. */
  follow?: 'on' | 'off' | null;
  /** A teammate's thread you can carry on in one of your own. */
  carryOn?: boolean;
  /** A done thread whose corner holds something else, so Reopen is a row. */
  reopen?: boolean;
  /** Share… opens the link, the inbox and who can open it; it takes Add people's place. */
  share?: boolean;
  /** Share is the button beside Done, so the menu does not repeat it. */
  shareButton?: boolean;
  /** Who can open it, beside the Share row where there is no button to wear it. */
  shareSays?: string | null;
  /** Someone could still be added to the thread. */
  people?: boolean;
  /** A run of a repeating task: no more runs after this one. */
  stopRepeat?: boolean;
  /** An open task between people: E only clears it from your Needs you, so closing it is its own row. */
  closeTask?: boolean;
  /** Whether a person has said it shipped, or null where the team would not see that. */
  shipped?: 'marked' | 'unmarked' | null;
  wait?: boolean | 'blocked';
  rename?: boolean;
  /** Opens ⌘K on its Move to rows, which already know the projects and say when a thread cannot move. */
  move?: boolean;
  change: boolean;
  terminal: 'open' | 'closed' | null;
  finish: boolean;
  runNow?: boolean;
  /** 'key' on the laptop, where L does it and the row says so. */
  later?: boolean | 'key';
  /** The level it runs at now, or null where it has none to change. */
  priority?: PriorityId | null;
  /** On a session started outside Agentbox: how many of those the inbox takes. */
  outside?: AgentMode | null;
  pin?: 'pinned' | 'unpinned' | null;
  give?: boolean;
}): ThreadMenuRow[] {
  const rows: ThreadMenuRow[] = [];
  if (follow) rows.push({ id: 'follow', label: 'Tell me when it is done', key: null, on: follow === 'on' });
  if (carryOn) rows.push({ id: 'continue', label: 'Continue it yourself', key: null });
  // One door for both: someone looking to hand it off goes to Share first (founder, 2026-11-21).
  if (share && !shareButton) rows.push({ id: 'share', label: give ? 'Ask, hand over or share…' : 'Share…', key: null, ...(shareSays ? { detail: shareSays } : {}) });
  if (runNow) rows.push({ id: 'run', label: 'Run now', key: null });
  if (change) rows.push({ id: 'code', label: 'View code changes', key: null });
  if (terminal) rows.push({ id: 'terminal', label: terminal === 'open' ? 'Hide terminal' : 'Open terminal', key: '⌘J' });
  if (people && !share) rows.push({ id: 'people', label: 'Add people', key: null });
  if (later) rows.push({ id: 'later', label: 'Later', key: later === 'key' ? 'L' : null });
  if (priority) rows.push({ id: 'priority', label: 'Priority', key: null, detail: priorityLabelOf(priority) });
  if (outside) rows.push({ id: 'outside', label: OUTSIDE_ALL, key: null, detail: outsideLabel(outside) });
  if (rename) rows.push({ id: 'rename', label: 'Rename', key: null });
  if (move) rows.push({ id: 'move', label: 'Move to another project', key: null });
  if (pin) rows.push({ id: 'pin', label: pin === 'pinned' ? 'Unpin thread' : 'Pin thread', key: null });
  if (give && !share) rows.push({ id: 'give', label: 'Ask or hand over…', key: null });
  if (wait) rows.push({ id: 'wait', label: wait === 'blocked' ? 'Blocked by…' : 'Waits on…', key: null });
  if (shipped) rows.push({ id: 'shipped', label: shipped === 'marked' ? 'Not shipped after all' : 'Mark as shipped', key: null });
  if (stopRepeat) rows.push({ id: 'stop-repeat', label: 'Stop repeating', key: null });
  if (closeTask) rows.push({ id: 'close-task', label: 'Close task', key: null, detail: 'For both of you' });
  // Only a handed-on thread has this row; taking it back ends their copy too.
  if (reopen) rows.push({ id: 'reopen', label: 'Take it back', key: null });
  if (finish) rows.push({ id: 'done', label: 'Mark done', key: 'E' });
  return rows;
}

/** The four levels the Priority row opens, the one it is at marked. */
export function priorityLevels(current: PriorityId | null): { id: PriorityId; label: string; on: boolean }[] {
  return PRIORITIES.map((p) => ({ id: p.id, label: p.label, on: p.id === current }));
}

/** Done, which the corner draws as its own half, and the rows left for the menu. */
export function splitDone(rows: ThreadMenuRow[]): { done: ThreadMenuRow | null; menu: ThreadMenuRow[] } {
  return { done: rows.find((r) => r.id === 'done') ?? null, menu: rows.filter((r) => r.id !== 'done') };
}

/* ------------------------------------------------------------------ marks */

export const mark = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

function CodeMark() {
  return <svg {...mark}><path d="m8.5 7-5 5 5 5" /><path d="m15.5 7 5 5-5 5" /></svg>;
}
function TerminalMark() {
  return <svg {...mark}><rect x="3" y="4" width="18" height="16" /><path d="m7 9 3 3-3 3m6 0h4" /></svg>;
}
/** The two ticks the Done mark was drawn with, now its row's mark. */
function DoneMark() {
  return <svg {...mark}><path d="m3 13 3.6 3.6L13.4 9" /><path d="m10.6 13 3.6 3.6L21 9" /></svg>;
}
/** A play mark with a bar in front of it: start this one, ahead of the line. */
function RunMark() {
  return <svg {...mark}><path d="M5 5v14" /><path d="m9 5 10 7-10 7z" /></svg>;
}
/** This Mac: a square screen on its stand. */
export function MacMark({ size = 16 }: { size?: number } = {}) {
  return <svg {...mark} width={size} height={size}><rect x="3" y="5" width="18" height="12" /><path d="M8 21h8M12 17v4" /></svg>;
}
export function CloudMark({ size = 16 }: { size?: number } = {}) {
  return <svg {...mark} width={size} height={size}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>;
}
/** A square-headed pin, because every shape in this skin is square. */
export function PinMark({ size = 16, className }: { size?: number; className?: string }) {
  return <svg {...mark} width={size} height={size} className={className}><path d="M8 3h8l-1.5 6 3.5 3.5H6L9.5 9z" /><path d="M12 12.5V21" /></svg>;
}
/** A clock, the mark Later wears everywhere else in the app. */
function LaterMark() {
  return <svg {...mark}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
}
/** A person and the way out to them. */
function GiveMark() {
  return <svg {...mark}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-5.5 6-5.5 1.4 0 2.7.4 3.7 1" /><path d="M15 17h6m-2.5-2.5L21 17l-2.5 2.5" /></svg>;
}
/** A square box with an arrow going out of it. */
function ShippedMark() {
  return <svg {...mark}><path d="M4 9h16v11H4z" /><path d="M12 15V3m-3.5 3.5L12 3l3.5 3.5" /></svg>;
}
/** The circling arrow a repeat wears, struck through. */
function StopRepeatMark() {
  return <svg {...mark}><path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" /><path d="M18 3v4h-4M6 21v-4h4" /><path d="m4 4 16 16" /></svg>;
}
/** An hourglass, squared off. */
function WaitMark() {
  return <svg {...mark}><path d="M6 3h12M6 21h12M7 3v4l5 5 5-5V3M7 21v-4l5-5 5 5v4" /></svg>;
}
function RenameMark() {
  return <svg {...mark}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>;
}
/** An arrow into a wall: somewhere else. */
function MoveMark() {
  return <svg {...mark}><path d="M3 12h13m-4-4 4 4-4 4" /><path d="M20 4v16" /></svg>;
}
/** A person with a plus beside them. */
function PeopleMark() {
  return <svg {...mark}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-5.5 6-5.5 1.4 0 2.7.4 3.7 1" /><path d="M18 13v7m-3.5-3.5h7" /></svg>;
}
/** An arrow turning back. */
/** A ring with a check: the task is closed for both people, which Done alone is not. */
function CloseTaskMark() {
  return <svg {...mark}><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.8L16 9.6" /></svg>;
}
function ReopenMark() {
  return <svg {...mark}><path d="M4 10h11a5 5 0 0 1 0 10h-4" /><path d="m8 6-4 4 4 4" /></svg>;
}
/** The bell a group wears for its alerts (team/rooms/icons.tsx). */
function FollowMark() {
  return <svg {...mark}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5h4" /></svg>;
}
/** An arrow turning off the line: carry it on from here. */
/** An arrow down into a tray: in here from now on. */
function BringInMark() {
  return <svg {...mark}><path d="M12 3.5v9m-3.5-3.5 3.5 3.5 3.5-3.5" /><path d="M3.5 14.5h4.5l1.5 2.5h5l1.5-2.5h4.5V20h-17z" /></svg>;
}
function InboxMark() {
  return <svg {...mark}><path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" /><path d="M5.5 5h13L21 13.5V19H3v-5.5z" /></svg>;
}
function ContinueMark() {
  return <svg {...mark}><path d="M6 4.5v7a3.5 3.5 0 0 0 3.5 3.5H19" /><path d="m15 11 4 4-4 4" /></svg>;
}
const TICK = <svg className="ts-more-tick" {...mark}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const MARKS: Record<ThreadMenuRowId, typeof CodeMark> = { follow: FollowMark, continue: ContinueMark, reopen: ReopenMark, share: PeopleMark, run: RunMark, code: CodeMark, terminal: TerminalMark, people: PeopleMark, later: LaterMark, priority: () => <PriorityIcon id="medium" />, outside: InboxMark, pin: () => <PinMark />, rename: RenameMark, move: MoveMark, give: GiveMark, wait: WaitMark, shipped: ShippedMark, 'stop-repeat': StopRepeatMark, 'close-task': CloseTaskMark, done: DoneMark };

/** Three square dots, because every shape in this skin is square. */
function Dots() {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="2.5" y="7" width="2" height="2" /><rect x="7" y="7" width="2" height="2" /><rect x="11.5" y="7" width="2" height="2" /></svg>;
}

/* ------------------------------------------------------------------- list */

/** The open menu: one row per verb, its mark, its words, and its key or detail. */
export function ThreadMenuList({ rows, change, onPick }: {
  rows: ThreadMenuRow[];
  /** What the run changed, drawn by Focus ("+873 −41 in 7 files"). */
  change?: ReactNode;
  onPick: (id: ThreadMenuRowId) => void;
}) {
  return (
    <div className="th-menu ts-more-menu" role="menu" aria-label="Thread actions">
      {rows.map((row) => {
        const Mark = MARKS[row.id];
        return (
          <button key={row.id} type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => onPick(row.id)}>
            <span className="ico"><Mark /></span>
            <span className="ts-more-label">{row.label}</span>
            {row.id === 'code' ? change : row.key ? <kbd>{chord(row.key)}</kbd> : row.detail ? <span className="ts-more-detail">{row.detail}</span> : row.on && TICK}
          </button>
        );
      })}
    </div>
  );
}

function BlockWords({ onPick }: { onPick: (id: string) => void }) {
  const [words, setWords] = useState('');
  const id = nameWait(words);
  return <label className="row-i ts-more-row ts-wait-words">
    <span className="ico"><WaitMark /></span>
    <input role="menuitem" tabIndex={-1} placeholder="Or type what it waits on" aria-label="Blocked by someone or something you type" value={words}
      onChange={(e) => setWords(e.target.value)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && id) { e.preventDefault(); onPick(id); } }} />
  </label>;
}

/** Who can open the thread, worn by the Share button as the hand-over button wears who has it. */
function ShareButtonFace({ face }: { face?: ShareFace<Person> }) {
  if (!face || face.mark === 'share') return <><PeopleMark /><span>Share</span></>;
  return <>
    {face.people.length
      ? <span className="ts-share-faces">{face.people.map((p) => <Face key={p.id} person={p} size={18} />)}</span>
      : <EveryoneMark />}
    <span className="ts-share-words">{face.words}</span>
  </>;
}

/* ----------------------------------------------------------------- button */

export function ThreadMenu({ thread = null, following = null, onFollow, onContinue = null, share = null, onCopyLink, onSendTo, onSee, onChoose, change = null, codeButton = null, codeOpen = false, onViewChange, addPeople = null, onAddPeople, terminal = null, onToggleTerminal, onFinish = null, onCloseTask = null, onStopRepeating = null, onReopen = null, handedTo = null, onRunNow = null, onLater = null, priority = null, onPriority, outside = null, onOutside, onBringIn = null, pinned = null, onPin, place = null, placeFacts = {}, onPlace, giveTo = [], onGive, onAsk, onRename = null, onMove = null, shipped = null, onShipped, waitChoices = [], waitsNow = false, onWait, blocks = false, files = null }: {
  /** On a teammate's thread: whether you are told when it is done, or null where you cannot be. */
  following?: boolean | null;
  onFollow?: () => void;
  /** On a teammate's thread: carry it on in a thread of your own. */
  onContinue?: (() => void) | null;
  /** The thread the ask sheet sends, by its name; what the sheet holds is kept for it across closes and visits. */
  thread?: (ItemRef & { name?: string }) | null;
  /** What Share… offers, or null where the thread cannot be shared. `face` is what its button wears. */
  share?: { link: string | null; people: readonly Person[]; last?: string | null; seen: SeenBy; seenWord: string; teamName: string; chosen?: readonly string[]; face?: ShareFace<Person> } | null;
  /** Puts the link on the clipboard; false when it could not. */
  onCopyLink?: () => Promise<boolean>;
  onSendTo?: (to: string[], note: string) => void;
  onSee?: (to: SeenBy) => void;
  /** Chosen people…: adds the person to who can open it, or takes them off. */
  onChoose?: (id: string) => void;
  /** Opens ⌘K on the Move to rows. */
  onMove?: (() => void) | null;
  /** Whether a person has said it shipped, or null where the team would not see that. */
  shipped?: boolean | null;
  onShipped?: (on: boolean) => void;
  /** What it could wait on, people first; the row is only there when something is. */
  waitChoices?: readonly { id: string; label: string }[];
  waitsNow?: boolean;
  /** A task: its waits are blocks, said as such. */
  blocks?: boolean;
  /** Null stops waiting. */
  onWait?: (id: string | null) => void;
  /** Who it can be handed on to; the row is only there when somebody is. */
  giveTo?: readonly { id: string; name: string; detail?: string; asked?: boolean }[];
  /** `note`: what the giver wants from a person; empty for an AI teammate. */
  onGive?: (to: { id: string; name: string }, note: string) => void;
  /** Help or a review from a person, keeping the thread; `step` is the message picked, if one was. */
  onAsk?: (to: { id: string; name: string }, kind: 'help' | 'review', note: string, step: string | null) => void;
  /** Opens the name box, on a conversation, whose bar has no name to press. */
  onRename?: (() => void) | null;
  /** The change figures, or null when this run changed no code. */
  change?: ReactNode | null;
  /** Drawn as a button in the corner, which then takes the menu's code row. */
  codeButton?: ReactNode | null;
  /** The change is the file open beside the thread. */
  codeOpen?: boolean;
  onViewChange?: () => void;
  /** Who can be added, or null where nobody can. A conversation adds through New thread, so it lists nobody. */
  addPeople?: { people: readonly Person[]; conversation: boolean } | null;
  /** With no one named, a conversation opens New thread to pick. */
  onAddPeople?: (person?: string) => void;
  terminal?: 'open' | 'closed' | null;
  onToggleTerminal?: () => void;
  /** Null on a thread that is already done. */
  onFinish?: (() => void) | null;
  /** Non-null on a run of a repeating task that still repeats. */
  onStopRepeating?: (() => void) | null;
  /** Non-null on an open task between people: closes it for both. */
  onCloseTask?: (() => void) | null;
  /** On a done thread: opens it again, where Done sits on an open one. */
  onReopen?: (() => void) | null;
  /** Whom it was handed to: their button takes Reopen's place and opens the task they were given. */
  handedTo?: { name: string; initials: string; onOpen: (() => void) | null } | null;
  /** Non-null only on a task that is waiting its turn and not yet pushed. */
  onRunNow?: (() => void) | null;
  /** Opens the Later picker. Non-null only where there is no keyboard to press L on. */
  onLater?: (() => void) | null;
  /** The level it runs at now; the row opens the four levels. */
  priority?: PriorityId | null;
  onPriority?: (id: PriorityId) => void;
  /** A session started outside Agentbox: the setting for all of those, and how to change it. */
  outside?: AgentMode | null;
  onOutside?: (mode: AgentMode) => void;
  /** A session started outside Agentbox: makes it one of Agentbox's threads. */
  onBringIn?: (() => void) | null;
  /** Whether the thread is pinned now, or null where it cannot be. */
  pinned?: boolean | null;
  onPin?: (pin: boolean) => void;
  /** Where it runs, or null where the cloud could never run it; drawn as PlaceButton. */
  place?: ThreadPlace | null;
  /** The Files button, first in the row. */
  files?: ReactNode;
  placeFacts?: Omit<PlaceFacts, 'place'>;
  /** True keeps it on this Mac (moving it here if it is in the cloud). */
  onPlace?: (keep: PlaceAct) => void;
}) {
  const canGive = giveTo.length > 0 && !!onGive && !!onFinish;
  // With both, the Share button beside Done is the one door, so the menu does not repeat it.
  // A phone's bar has no room for it, so there Share is the menu's first row.
  const shareButton = !!share && canGive && !onPhone();
  const shareSays = share?.face && share.face.mark !== 'share' ? share.face.words : null;
  const { done, menu: rows } = splitDone(threadMenuRows({ follow: following === null || !onFollow ? null : following ? 'on' : 'off', carryOn: !!onContinue, change: !!change && !codeButton, share: !!share, shareButton, shareSays, people: !!addPeople && !!onAddPeople, terminal, finish: !!onFinish, runNow: !!onRunNow, later: onLater ? (onPhone() ? true : 'key') : false, priority: onPriority ? priority : null, outside: onOutside ? outside : null, rename: !!onRename, move: !!onMove, pin: pinned === null || !onPin ? null : pinned ? 'pinned' : 'unpinned', give: canGive, wait: waitChoices.length > 0 && !!onWait && !!onFinish ? (blocks ? 'blocked' : true) : false, shipped: shipped === null || !onShipped ? null : shipped ? 'marked' : 'unmarked', stopRepeat: !!onStopRepeating, closeTask: !!onCloseTask, reopen: !!onReopen && !!handedTo }));
  const [open, setOpen] = useState(false);
  const [giving, setGiving] = useState(false);
  const [givingTo, setGivingTo] = useState<{ id: string; name: string } | null>(null);
  const [giveStart, setGiveStart] = useState<'help' | 'review' | 'give'>('help');
  const [givingFromShare, setGivingFromShare] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [leveling, setLeveling] = useState(false);
  const [showing, setShowing] = useState(false);
  const [sharing, setSharing] = useState<null | 'list' | 'send' | 'copied' | 'see' | 'choose'>(null);
  const [sendTo, setSendTo] = useState<string[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [shareDirect, setShareDirect] = useState(false);
  // One note per person, kept until it is sent, across closes and visits to the thread.
  const [notes, setNotes] = useState<Record<string, string>>(() => (thread ? readAskDraft(thread).notes : {}));
  const keepAsk = (patch: Partial<AskDraft>) => { if (thread) saveAskDraft(thread, { ...readAskDraft(thread), ...patch }); };
  const asking = (givingFromShare && giveStart !== 'give') || !!step;
  const listed = giveTo.filter((p) => !(asking && p.id.startsWith('mate:')));
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setGiving(false);
    setGivingTo(null);
    setGiveStart('help');
    setGivingFromShare(false);
    setStep(null);
    setWaiting(false);
    setAdding(false);
    setLeveling(false);
    setShowing(false);
    setSharing(null);
    setShareDirect(false);
    if (refocus) button.current?.focus();
  }, []);

  // ⌘K's Add people and the reply box's @ ask for the picker with this event.
  const askToAdd = useCallback(() => {
    if (!addPeople || !onAddPeople) return;
    if (addPeople.conversation) { close(false); onAddPeople(); return; }
    setAdding(true);
    setOpen(true);
  }, [addPeople, onAddPeople, close]);
  useEffect(() => {
    window.addEventListener('zero:add-people', askToAdd);
    return () => window.removeEventListener('zero:add-people', askToAdd);
  }, [askToAdd]);
  useEffect(() => { keepAsk({ notes }); }, [notes]);
  // A sheet that closes unsent is where Ask a teammate opens next; back on the people, or a send, ends it.
  useEffect(() => {
    if (open && giving) keepAsk({ last: givingTo ? { to: { id: givingTo.id, name: givingTo.name }, mode: giveStart } : null });
  }, [open, giving, givingTo?.id, giveStart]);
  // "Ask a teammate" on one of the agent's messages opens the people list with that message as the step,
  // or the sheet a close left, now pointing at this message.
  useEffect(() => {
    if (!onAsk || !giveTo.length) return undefined;
    const askAbout = (e: Event) => {
      const last = thread ? readAskDraft(thread).last : null;
      const back = last ? giveTo.find((p) => p.id === last.to.id && !p.id.startsWith('mate:') && !p.asked) : null;
      setStep(String((e as CustomEvent<string>).detail ?? '') || null);
      if (last && back) { setGiveStart(last.mode); setGivingTo(back); }
      setGiving(true);
      setOpen(true);
    };
    window.addEventListener('zero:ask-step', askAbout);
    return () => window.removeEventListener('zero:ask-step', askAbout);
  }, [!!onAsk, giveTo.map((p) => `${p.id}${p.asked ? ' asked' : ''}`).join(), thread?.product, thread?.id]);
  // ⌘K's Ask Theo for a review or for help (ASK_PERSON_EVENT) opens the same sheet the menu's row does, Theo picked.
  useEffect(() => {
    if (!onAsk) return undefined;
    const askPerson = (e: Event) => {
      const d = (e as CustomEvent<{ kind: 'help' | 'review' | 'give'; to: { id: string; name: string } }>).detail;
      if (!d) return;
      setSharing(null); setStep(null); setGiveStart(d.kind); setGivingFromShare(true); setGiving(true); setGivingTo(d.to); setOpen(true);
    };
    window.addEventListener(ASK_PERSON_EVENT, askPerson);
    return () => window.removeEventListener(ASK_PERSON_EVENT, askPerson);
  }, [!!onAsk]);
  // ⌘K's Share with chosen people… opens the same list Share → Chosen people does.
  useEffect(() => {
    if (!share) return undefined;
    const askToChoose = () => { setSharing('choose'); setOpen(true); };
    window.addEventListener('zero:choose-people', askToChoose);
    return () => window.removeEventListener('zero:choose-people', askToChoose);
  }, [!!share]);

  // CLOSED BY ESCAPE AND BY A PRESS ANYWHERE OUTSIDE IT. Both listen first, on
  // the window's capture, and Escape stops there: the window's own Escape
  // (App.tsx) means "go back", and one press closing the menu AND the thread
  // would take her somewhere she did not ask to go. The arrows are the menu's
  // while it is open, for the same reason: in a thread they otherwise walk an
  // agent's options. Enter on a row is left to the row and kept from the
  // window, which reads Enter as "send the picked option".
  useEffect(() => {
    if (!open) return undefined;
    // A note half-written in a sheet stays: people click into the thread to re-read the step mid-note.
    const away = (e: PointerEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      if ([...(wrap.current?.querySelectorAll('textarea') ?? [])].some((t) => t.value.trim())) return;
      close(false);
    };
    const keys = (e: KeyboardEvent) => {
      // The ask sheet's note is kept for its person, so Escape can close.
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
      // A note being written keeps every key: Tab to its button, arrows through its lines, ⌘↵ to send.
      if (document.activeElement?.tagName === 'TEXTAREA' && wrap.current?.contains(document.activeElement)) return;
      const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0
          : e.key === 'End' ? items.length - 1
            : e.key === 'ArrowDown' ? (at + 1) % items.length
              : (at <= 0 ? items.length - 1 : at - 1);
        items[next].focus();
        return;
      }
      // Typing in the menu's own box is typing.
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '') && wrap.current?.contains(document.activeElement)) return;
      if ((e.key === 'Enter' || e.key === ' ') && wrap.current?.contains(document.activeElement)) { e.stopImmediatePropagation(); return; }
      if (e.key === 'Tab') close(false);
    };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', keys, true);
    };
  }, [open, close]);

  // The first row takes the focus as the menu opens, so the arrows work at once.
  useEffect(() => {
    // Back is not the thing anyone came for, so the first real row takes it.
    if (open) wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(.sh-back)')?.focus();
  }, [open, giving, waiting, adding, leveling, showing, sharing]);

  // Enter, Space or the down arrow on the dots opens the menu. Handled here and
  // stopped, because the window reads Enter on a thread as "send the picked
  // option" and would cancel the button's own press.
  const openFromKeys = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const copyLink = () => { void onCopyLink?.().then((ok) => { if (ok) setSharing('copied'); else close(false); }); };

  const pick = (id: ThreadMenuRowId) => {
    if (id === 'give') { setGiving(true); return; }
    if (id === 'wait') { setWaiting(true); return; }
    if (id === 'people') { askToAdd(); return; }
    if (id === 'priority') { setLeveling(true); return; }
    if (id === 'outside') { setShowing(true); return; }
    if (id === 'share') { setSharing('list'); return; }
    close(id === 'terminal');
    if (id === 'follow') onFollow?.();
    else if (id === 'continue') onContinue?.();
    else if (id === 'run') onRunNow?.();
    else if (id === 'code') onViewChange?.();
    else if (id === 'terminal') onToggleTerminal?.();
    else if (id === 'later') onLater?.();
    else if (id === 'rename') onRename?.();
    else if (id === 'move') onMove?.();
    else if (id === 'pin') onPin?.(!pinned);
    else if (id === 'shipped') onShipped?.(!shipped);
    else if (id === 'stop-repeat') onStopRepeating?.();
    else if (id === 'close-task') onCloseTask?.();
    else if (id === 'reopen') onReopen?.();
    else onFinish?.();
  };

  if (!rows.length && !done && !place && !onReopen && !files && !codeButton && !onBringIn) return null;
  return (
    <span className="ts-more-wrap" ref={wrap}>
      {files}
      {codeButton && <button type="button" className="ts-done ts-code" aria-label="View code changes" aria-pressed={codeOpen} onClick={() => onViewChange?.()}>
        <CodeMark />
        {codeButton}
      </button>}
      {place && <PlaceButton place={place} {...placeFacts} onPlace={onPlace} />}
      {handedTo && !done && <button type="button" className="ts-done ts-handed" disabled={!handedTo.onOpen} onClick={handedTo.onOpen ?? undefined}><span className="ts-handed-face" aria-hidden="true">{handedTo.initials}</span><span>{handedTo.name}</span></button>}
      {onReopen && !handedTo && !done && <button type="button" className="ts-done ts-reopen" onClick={onReopen}><span>Reopen</span></button>}
      {share && shareButton && <button type="button" className="ts-done ts-share" aria-haspopup="menu" aria-expanded={open && !!sharing}
        aria-label={!share.face || share.face.mark === 'share' ? 'Share' : `Share, ${share.face.words} can open it`}
        onClick={() => { if (open && sharing) { close(false); return; } close(false); setOpen(true); setSharing('list'); setShareDirect(true); }}>
        <ShareButtonFace face={share.face} />
      </button>}
      {onBringIn && <button type="button" className="ts-done ts-bring-in" onClick={onBringIn}><BringInMark /><span>{BRING_IN}</span></button>}
      {done && (
        <button
          type="button"
          className="ts-done"
          data-hint="done"
          data-hint-align="right"
          aria-label={`${done.label} (${done.key})`}
          onClick={() => onFinish?.()}
        >
          <DoneMark />
          <span>{DONE.short}</span>
        </button>
      )}
      {rows.length > 0 && <button
        ref={button}
        type="button"
        className="ts-more"
        aria-label="More actions"
        data-hint="more"
        data-hint-align="right"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { if (open) close(false); else setOpen(true); }}
        onKeyDown={openFromKeys}
      >
        <Dots />
      </button>}
      {open && waiting && (
        <div className="th-menu ts-more-menu ts-wait-menu" role="menu" aria-label={blocks ? 'Blocked by' : 'Waits on'}>
          <p className="ts-menu-say">{blocks ? 'Blocked until that is done.' : 'It moves to Later and comes back when that is done.'}</p>
          {waitsNow && <button type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); onWait?.(null); }}>
            <span className="ico"><WaitMark /></span><span className="ts-more-label">{blocks ? 'Not blocked' : 'Stop waiting'}</span>
          </button>}
          {waitChoices.map((c) => <button key={c.id} type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); onWait?.(c.id); }}>
            <span className="ico"><WaitMark /></span><span className="ts-more-label">{c.label}</span>
          </button>)}
          {/* A task can wait on someone off the team, or on something, in plain words. */}
          {blocks && <BlockWords onPick={(id) => { close(false); onWait?.(id); }} />}
        </div>
      )}
      {open && adding && addPeople && (
        <div className="th-menu ts-more-menu" role="menu" aria-label="Add to this thread">
          <p className="ts-menu-say">They see this thread and its files and can comment.</p>
          {addPeople.people.map((p) => <button key={p.id} type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); onAddPeople?.(p.id); }}>
            <span className="ico"><Face person={p} size={18} /></span>
            <span className="ts-more-label">{p.name}</span>
          </button>)}
        </div>
      )}
      {open && leveling && (
        <div className="th-menu ts-more-menu" role="menu" aria-label="Priority">
          {priorityLevels(priority).map((p) => <button key={p.id} type="button" role="menuitem" aria-current={p.on ? 'true' : undefined} tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); if (!p.on) onPriority?.(p.id); }}>
            <span className="ico"><PriorityIcon id={p.id} /></span>
            <span className="ts-more-label">{p.label}</span>
            {p.on && <svg className="ts-more-tick" {...mark}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}
          </button>)}
        </div>
      )}
      {open && showing && (
        <div className="th-menu ts-more-menu" role="menu" aria-label={OUTSIDE_TITLE}>
          <p className="ts-menu-say">{OUTSIDE_ASK}</p>
          {OUTSIDE_MODES.map((m) => <button key={m.value} type="button" role="menuitem" aria-current={m.value === outside ? 'true' : undefined} tabIndex={-1} className="row-i ts-more-row" onClick={() => { close(false); if (m.value !== outside) onOutside?.(m.value); }}>
            <span className="ts-more-label">{m.label}</span>
            {m.value === outside && TICK}
          </button>)}
        </div>
      )}
      {open && share && sharing === 'list' && (() => {
        return <ShareList link={!!share.link} others={share.people.length > 0} seen={share.seenWord}
          onCopy={copyLink}
          onSendOther={() => { setSendTo([]); setSharing('send'); }}
          onSee={() => setSharing('see')}
          onAsk={canGive && onAsk ? (kind) => { setSharing(null); setGiveStart(kind); setGivingFromShare(true); setGiving(true); } : undefined}
          onHand={canGive ? () => { setSharing(null); setGiveStart('give'); setGivingFromShare(true); setGiving(true); } : undefined}
          // Opened by the Share button there is no menu behind it to go back to.
          onBack={shareDirect ? undefined : () => setSharing(null)} />;
      })()}
      {open && share && sharing === 'send' && <SendSheet people={share.people} start={sendTo} link={!!share.link} onCopy={copyLink} onBack={() => setSharing('list')}
        onSend={(to, note) => { close(false); onSendTo?.(to, note); }} />}
      {open && share && sharing === 'copied' && share.link && <CopiedSheet link={share.link} people={share.people} onBack={() => setSharing('list')}
        onSend={(id) => { close(false); onSendTo?.([id], ''); }} />}
      {open && share && sharing === 'see' && <SeeList seen={share.seen} teamName={share.teamName} onBack={() => setSharing('list')}
        onPick={(to) => { if (to === 'people') { setSharing('choose'); return; } close(false); if (to !== share.seen) onSee?.(to); }} />}
      {open && share && sharing === 'choose' && <ChooseList people={share.people} chosen={share.seen === 'people' ? share.chosen ?? [] : []} onPick={(id) => onChoose?.(id)} onBack={() => setSharing('see')} />}
      {open && !waiting && !adding && !leveling && !showing && !sharing && (giving && givingTo
        ? <GiveSheet to={givingTo} step={step} start={giveStart} only={givingFromShare ? giveStart : step ? 'ask' : undefined} onBack={() => setGivingTo(null)} onCancel={() => close(true)}
          threadName={thread?.name ?? null} onMode={setGiveStart}
          note={notes[givingTo.id] ?? ''} onNote={(n) => setNotes((was) => ({ ...was, [givingTo.id]: n }))}
          onGive={(note) => { keepAsk({ last: null }); setNotes((was) => ({ ...was, [givingTo.id]: '' })); close(false); onGive?.(givingTo, note); }}
          onAsk={onAsk ? (kind, note) => { const s = pointsAtStep(kind) ? step : null; keepAsk({ last: null }); setNotes((was) => ({ ...was, [givingTo.id]: '' })); close(false); onAsk(givingTo, kind, note, s); } : undefined} />
        : giving
        ? <div className="th-menu ts-more-menu" role="menu" aria-label="Ask or hand off">
          <PanelBack label={step ? 'Close' : 'Back'} onBack={() => { if (step) { close(false); return; } setGiving(false); if (givingFromShare) { setGivingFromShare(false); setSharing('list'); } }} />
          <p className="ts-menu-say">{(givingFromShare ? (giveStart === 'give' ? 'Who takes it over?' : giveStart === 'review' ? 'Who should review it?' : 'Who do you want to ask?') : step ? 'Who do you want to ask?' : onAsk ? 'Ask a person for help or a review, or hand it over.' : 'A person gets it as a task in their Needs you.')
            + (listed.some((p) => p.id.startsWith('mate:')) ? ' An AI teammate starts on it.' : '')}</p>
          {listed.map((p) => <button key={p.id} type="button" role="menuitem" tabIndex={-1} className="row-i ts-more-row" disabled={asking && p.asked} onClick={() => { if (p.id.startsWith('mate:')) { close(false); onGive?.(p, ''); } else setGivingTo(p); }}>
            <span className="ico">{p.id.startsWith('mate:') ? <GiveMark /> : <Face name={p.name} size={18} />}</span>
            <span className="ts-more-label">{p.name}</span>
            {asking && p.asked ? <span className="ts-more-detail">Already asked</span> : p.detail && <span className="ts-more-detail">{p.detail}</span>}
          </button>)}
        </div>
        : <ThreadMenuList rows={rows} change={change} onPick={pick} />)}
    </span>
  );
}
