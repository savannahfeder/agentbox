import { previewFocus } from './preview-focus';
import type {FocusControlStyle} from './focus-control';
import {reviewLabEnabled} from './review-lab';
import { deliverReply } from './deliver-reply.mjs';
import { ArtifactSurface } from './components/ArtifactSurface';
import { artifactPlacement, artifactFraction, type ArtifactMode } from './artifact-layout';
import { chromeIsUp, CHROME_HOLD, CHROME_REACH } from './full-screen-chrome';
// the app's renderer: one state machine, keyboard-first. The Superhuman grammar:
// arrows move, Enter focuses, E archives (never approves), R replies, C composes, Tab cycles
// views, Cmd+K is the palette, S snoozes, Z undoes. Everything derives from the snapshot; every action is one IPC call
// followed by a refetch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { readySkin, swapLook } from './look-switch';
import type { AnswerMode, Approval, PermissionMode, RepeatRule, RepeatShape, Snapshot, ThreadCard, ThreadStateWord, View, WorkItem } from './types';
import { api } from './api';
import { setClaudeModels } from './models';
import { advanceAfter, nextAfterAdvance, type Advance } from './advance';
import { freshCopy, staysOnTheTask, stillFollowing, wayOut, type Followed } from './stay-with-a-command';
import { List } from './components/List';
import { isTroubleRow, troubleRow } from './trouble-row';
import { importAnswer, isImportRow, isNotImportedRow, justImported, type ImportChoice } from './import-row';
import { Focus } from './components/Focus';
import type { PendingSaid } from './item-thread';
import { DocPane, type OpenDoc } from './components/DocPane';
import { docKind, EVEN_SPLIT, escapeClosesDoc, escapeInTheFileClosesIt, focusIsInTheFile, readSplit, writeSplit } from './doc-pane';
import { changeOwnsKey } from './code-keys';
import { askStillStands, nextUndo, shownAfterUndo, undoAsk, HOLDS_A_KEY, NOTHING_TO_UNDO } from './undo-window';
import { whatTheFileSentUp } from '../../shared/artifact-keys.mjs';
import { type Place, placeIsSomewhere, readPlace, writePlace, writeScroll } from './where-she-was';
import { documentCandidates } from './message-artifacts';
import { filesFromRuns } from './run-files';
import { Rail } from './components/Rail';
import { ThreadComposer } from './threads/ThreadComposer';
import { proposeParent } from '../../shared/project-folder-check.mjs';
import { NewProject } from './components/NewProject';
import { ImportAgents } from './components/ImportAgents';
import { importedLine } from './agent-import-card';
import { whenLabel } from './components/When';
import { RepeatFocus } from './components/RepeatFocus';
import { Palette } from './components/Palette';
import { Standing, STANDING } from './components/Standing';
import { Settings } from './components/Settings';
import { Snooze } from './components/Snooze';
/* The line, the toast and the dot on the cog were the other three drawn for that round and
 are gone; their copy is in decisions.md and their photographs on
 `astral/w-86452550e5-looks`.
*/
import { announcesUpdate, isUpdateRow } from './update-row';
// Inbox zero is `IdlePage`.
import { IdlePage } from './components/IdlePage';
import { ago, itemOptions, offerIsLive, parseRepeat } from './format';
import {
  hasDraft, restoreDraft, restoreFailedDraft, readComposeDraft, restoreComposeDraft, saveDraft, clearComposeDraft,
  type SentDraft, type ComposeDraft,
} from './drafts';
import { approvalStage } from './approval-stage';
import { approvalReads } from './approval-card';
// The new task card's two sentences: why it will not take one, and where the
// one it took went. Only the second is raised from here, because by the time
// there is anything to confirm the card has closed.
import { sentLine } from './compose-says';
import { belongsInInbox, belongsInProgress, belongsOnTheRail, byRunningOrder, clipToSentence, hiddenUntil, maskedAncestors, notStarted, parkedByAgent, replyClearsSchedule, statusForReply, stoppable, threadMasked, withdrawReply } from './list-rules';
import { agentKey, agentRow, asksSomething, byRecency, listed as agentIsListed, onTheRail, railLine, reachesInbox, progressAfterReply, replyReaches, whereItRuns } from '../../shared/agents.mjs';
import { opensATextField } from './keys';
import { isUrgentRow, taskToReturnTo, urgentInterruption } from './interrupt';
import { DONE } from './done-word';
import { modalAfterLeavingATask } from './modal-scope';
import { NOTHING_OVER_THE_APP, afterTheWalk, type OpenOverTheApp } from './walk-scope';
import { splitMessage } from './message-split';
import { parseQuery, searchItems } from './search';
import { applyTheme, machineTheme, onMachineTheme, resolvePick, resolveTheme, THEME_KEY, type ThemePick } from './theme';
import { hintScheduler, type HintScheduler } from './hint-timing';
import { HINTS } from './hint-plate';
import { HintPlate } from './components/HintPlate';
import { applySkin, applySkinDetail, applyTune, DEFAULT_SKIN, idleSkin, lookMeans, lookOf, resolveSkin, resolveSkinDetail, resolveTune, seedFirstRunLook, SKINS, storeTune, walkSkin, wornSkin, SKIN_KEY, TUNE_DEFAULT, TUNE_KEY, type Look, type SkinChoice, type SkinId, type SkinTune } from './skins';
// THE SHAPE OF AN OPENED TASK IS STILL AN OPEN QUESTION. Six of them,
// one attribute, and the whole file goes when she picks.
import { resolveTaskShape, TASK_SHAPE_KEY, type TaskShape } from './task-shape';
import { ComposeIcon } from './components/ComposeIcon';
import { WorkspaceNavigation } from './components/WorkspaceNavigation';
import { searchFieldInStrip, workspaceDestinations, workspaceNavigationShown, workspacePageTitle } from './workspace-navigation.mjs';
import { SettingsIcon } from './components/SettingsIcon';
import { UsagePill } from './components/UsagePill';
import { engineWordFor } from './byline';
import { SearchIcon } from './components/SearchIcon';
import { CrossIcon } from './components/CrossIcon';
import { ZoomPercent } from './components/ZoomPercent';
import { FindBar } from './components/FindBar';
import { Landed, Onboarding, PracticeBand, WayOut } from './components/Onboarding';
import { PRACTICE_ROWS, PRACTICE_SLUG } from '../../shared/first-run-practice.mjs';
import { ModeScreen, isModeVariant } from './components/ModeScreen';
import { practiceRemembered, rememberProject, rememberedProject } from './compose-project';
import { needsStaging, walkStageKey } from './walk-staging';
import { TutorialOffer } from './components/TutorialOffer';
import { comeBackTo, neverOffered, offerOnNewProject, rememberOffered } from './tutorial';
import {
  ANSWER_AFTER_MS, COACHED, COPY as WALK_COPY, FIRST_RUN_LABEL, advance as advanceRun, afterCommand, beatRows, coach, closingRefused, firstRunDone,
  finishedCleared, firstRunNeeded, inboxCleared, laterCleared, laterId, laterIndex,
  mayOpenInbox, noCodingAgent, practising, restartFirstRun, snoozeRefused, tutorialRun,
  waitingId, waitingIndex,
  finishFirstRun, forcedStep, readFirstRun, walkRows,
  saveFirstRun, START as RUN_START, stepTo, TASK_BODY, TASK_TITLE, whyNotMade, type FirstRun,
} from './onboarding';
import { priorityCommands, priorityIdOf, priorityLabelOf, type PriorityId } from './priority';
import { NO_FILTER, filterBox, filterMenu, filterTags, isFiltering, toggleFilter, clearFilterPart, type BoxFilter as BoxFilterState, type FilterPart, type Harness } from './box-filter';
import { BoxFilter } from './components/BoxFilter';
import { itemPriority, moveProduct, productRankScore } from '../../shared/rank.mjs';
import { isCleanRun, ruleIdOf, ruleLabel } from '../../shared/repeats.mjs';
import { NAME, Name } from '../../shared/product-name.mjs';
import { inMyInbox, isShared, heldByAPerson, runnerOf } from '../../shared/team-rules.mjs';
import { Face, TeamContext, firstName, teamView } from './team/people';
import { FaceHover } from './team/status';
import { TeamPage } from './team/TeamPage';
import { EmptyTab, FilteredEmpty, HeaderActions, INBOX_TABS, InboxBoard, InboxClear, LiveContext, PeopleFilter, StateTabs } from './threads/Pages';
import { MessagePerson, TeammateCard } from './threads/Summary';
import { SignInPage } from './team/SignInPage';
import { DEFAULT_DISPLAY, boardColumns, boardWalk, conversationWith, flipView, isDirect, nextTab, pageFor, readDisplay, writeDisplay, keeps as keepsDisplay, sorted as sortedByDisplay, type Display } from './threads/page-rules';
import { mergeRows, needsWord, normalizePicked, othersInView, readPicked, teammateRows, writePicked } from './threads/people-rules';

type Modal = null | 'compose' | 'filter' | 'palette' | 'reply' | 'snooze' | 'standing';

// WHAT AN UNDO HANDS BACK, and where it belongs on the screen. A withdrawn
// reply belongs to a thread, so undoing it opens that thread with the user's
// words in the reply box. A withdrawn NEW TASK belongs to no thread at all: it was
// written in the card, and the card is where it has to reappear. Null is an
// undo that cancelled something and had nothing of hers to return.
type Restored = { item: WorkItem } | { compose: true } | null;
const restoredItem = (r: Restored): WorkItem | null => (r && 'item' in r ? r.item : null);

interface Snooze { [id: string]: number }

/**
 * WHICH OF THE THREE PRACTICE ROWS IS THE AGENT THAT IS STOPPED. Read off the
 *  copy itself rather than written down twice: the rows are staged in the order
 *  they are declared, so the index into `run.examples` is the same index. */
/**
 * HOW MUCH OF A ROW'S TITLE A TOAST CARRIES. A hard 32-character cut was
 *  mid-word — see `deferCommit` — and `clipToSentence` is the app's own rule
 *  for stopping on a sentence, or failing that on a word. 48 holds every
 *  practice row's first sentence and most real ones. */
const TOAST_TITLE = 48;

/**
 * How long a message she sent to a running agent is held after the row has
 * recorded it. Nothing on the screen changes at this moment: the committed
 * copy has been the one drawn since it arrived, a ledger read after the
 * provider's answer, which is milliseconds. This only stops the queue
 * growing for as long as the app is open, and it is generous because letting
 * go too early is the one direction that can cost her a message. */
const LANDED_MS = 10_000;

const WAITING_AT = waitingIndex(PRACTICE_ROWS);
const LATER_AT = laterIndex(PRACTICE_ROWS);

const SEEN_KEY = 'zero.seen';
// WHAT COUNTS AS CLICKING SOMETHING RATHER THAN CLICKING NOTHING.
//
// This is the test for "has a function": a control, a link, a field, a row she
// can open, the reply dock, or anything drawn over the app. Everything else is
// the wall.
//
// It is one sentence and it is spelled once here so no second reader writes
// its own.
const SOMETHING_WITH_A_JOB = 'button, a, input, textarea, select, [role="button"], [contenteditable=""], [contenteditable="true"], .row, .modal, .palette, .focus-dock';
// Whether the product panel is up. One key, not one per mode, and it outlives
// the window: see the note beside the state itself.
const PANEL_KEY = 'zero.panel';
// Whether the app draws the keys it has when you point at something. On by
// default; this is the way back out.
const HINTS_KEY = 'zero.keyhints';
// THE TOP STRIP'S OWN HINTS ARE GONE AND THE LIST THAT HELD THEM WITH THEM
// (w-2f7fac6027). They printed a cap and a word INTO the strip, which is the
// app changing under the pointer, and two of the four are components that were
// then ruled out of carrying a hint at all because they already show their key. What
// every component says now lives in `hint-plate.ts`, which is one list for the
// whole window rather than one per surface, and it is checked against the
// handlers the same way this one was.
const SNOOZE_KEY = 'zero.snooze';
// When answers to her own asks started being delivered to the inbox rather than
// filed straight into Done (see belongsInInbox). Stamped once, on the first run
// that knows about it, so the change hands her what happens NEXT instead of
// emptying the archive into an inbox she keeps at zero.
const DELIVERY_KEY = 'zero.deliveredThrough';
const deliveredThrough = (() => {
  const held = Number(localStorage.getItem(DELIVERY_KEY));
  if (Number.isFinite(held) && held > 0) return held;
  const now = Date.now();
  localStorage.setItem(DELIVERY_KEY, String(now));
  return now;
})();

// A withdrawn reply (Z right after a send) is not an answer. Everywhere state
// derives from "has the user answered", withdrawn means no: the item comes
// back to the inbox instead of vanishing from every view (2026-08-04).
const liveAnswer = (i: WorkItem) => (i.answer && i.answer !== '(withdrawn)' ? i.answer : undefined);

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  // WHERE SHE WAS BEFORE ⌘R, read once, on the way in.
  //
  // A ref rather than state because it is never rendered and never changes: it
  // is the note the last page left, and the moment it has been acted on it is
  // history. `restored` is what stops it being acted on twice, which matters
  // because the snapshot arrives more than once and every arrival re-runs the
  // effect that reads this.
  const wasAt = useRef<Place | null>(readPlace(window.localStorage));
  // Whether that note has been acted on. STATE and not a ref, deliberately: the
  // boot screen below is held up until this turns true, and a ref that flips
  // without a render can leave the window on "the app" for good when the restore
  // happened to change nothing else (a task that is gone since, say).
  const [restored, setRestored] = useState(false);
  // The row the cursor is owed, once the tab it lives in has been drawn.
  const wantRow = useRef<string | null>(null);
  // Whether this page is a reload or a fresh launch, which only the main
  // process can say. `null` is "not answered yet", and it is a third state
  // rather than a default of false because the difference decides whether the
  // boot screen waits: guessing false for the one frame before the answer
  // arrives is how a restore turns into a flash of the inbox.
  const [reloaded, setReloaded] = useState<boolean | null>(null);
  // WHEN HER PLACE IN THE OPEN TASK WAS LAST WRITTEN DOWN. Scroll events arrive
  // by the dozen per gesture and each write is a JSON round trip, so this keeps
  // one every quarter second. A reload she triggers herself is always at least
  // that long after her last scroll.
  const scrollWrittenAt = useRef(0);
  // Where a ⌘R says she was in the task it reopened, handed to the pane once.
  const [resumeAt, setResumeAt] = useState<{ id: string; top: number } | null>(null);
  const [view, setView] = useState<View>('inbox');
  // WHICH PILE OF STOPPED TASKS SHE HAS ALREADY CLOSED THE ROW ON, by the
  // moment the first of them got stuck. Closing that row is the one thing about
  // it that cannot go in a ledger, because there is no ledger row to close; it
  // lives here and survives a restart, and a NEW failure carries a new `since`,
  // so the row comes back on its own rather than staying gone because she
  // dismissed a different pile last week.
  const [troubleClosed, setTroubleClosed] = useState<number>(() => {
    try { return Number(localStorage.getItem('zero.troubleClosed')) || 0; } catch { return 0; }
  });
  const setTroubleClosedAt = useCallback((since: number) => {
    setTroubleClosed(since);
    try { localStorage.setItem('zero.troubleClosed', String(since)); } catch { /* private mode: it just comes back */ }
  }, []);
  const [selected, setSelected] = useState(0);
  // THE ROW UNDER THE POINTER, and the row the row-keys act on while it is
  // there. Her hint is drawn on the row she is pointing at, so that row has to
  // be the one R and E reach, or the app draws a promise it does not keep:
  // selection is where the keyboard left it, which after one click and one
  // escape is very often somewhere else on the page.
  //
  // The keyboard TAKES IT BACK. Every key that moves the selection clears this
  // first, so walking the list with J and K is never overruled by a pointer
  // resting on row four, and the hint disappears at the same moment, which is
  // right: it is a hint for the hand that is on the mouse.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // THE COMPONENT THE KEY HINT IS DRAWN FOR.
  //
  // THIS REPLACED TWO OLDER HINTS THAT BOTH CHANGED THE THING UNDER THE POINTER
  // (w-2f7fac6027, 2026-09): a row's right end swapped its product and its time
  // for two keycaps, and the top strip grew a cap beside the tabs. The better
  // shape, after living with them: hovering a component that has a shortcut
  // shows, after a second or two, a plate around it rather than changing the
  // component itself.
  //
  // ONE MECHANISM FOR THE WHOLE APP, AND IT IS THE DOM THAT OPTS IN. A component
  // carries `data-hint="<id>"` and `hint-plate.ts` says what that id is worth.
  // The alternative was a handler and a piece of state per control, which is
  // exactly what the two it replaced were and why they drifted apart.
  //
  // TWO NAMES, BECAUSE POINTING AT SOMETHING AND SAYING SOMETHING ARE NOT THE
  // SAME MOMENT. `pointedHint` is the element the pointer is on, set the instant
  // it arrives. `shownHint` is what is actually drawn, and it lags by HINT_WAIT.
  const [pointedHint, setPointedHint] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [shownHint, setShownHint] = useState<{ id: string; el: HTMLElement } | null>(null);
  const hints = useRef<HintScheduler<{ id: string; el: HTMLElement }> | null>(null);
  if (!hints.current) hints.current = hintScheduler(setShownHint);
  useEffect(() => { hints.current?.point(pointedHint); }, [pointedHint]);
  useEffect(() => () => hints.current?.stop(), []);
  // THE SWITCH OVER ALL OF IT. Off means the row keeps
  // saying its product and its time under the pointer, the tabs say nothing,
  // and the two corner buttons stop printing their key in the Mac's label.
  //
  // It takes the pointer-follows-the-keys half with it, and that is the point
  // rather than a side effect: the keys reach the pointed row BECAUSE the row
  // under the pointer is drawing a promise about them. With nothing drawn there
  // is no promise, so the keyboard's own row is the honest target again, which
  // is what the app did before this. `hoveredId` is simply never set.
  const [keyHints, setKeyHints] = useState(() => localStorage.getItem(HINTS_KEY) !== '0');
  const setHints = useCallback((v: boolean) => {
    setKeyHints(v);
    localStorage.setItem(HINTS_KEY, v ? '1' : '0');
    // A hover left over from before the switch was thrown would keep one row
    // pointing at itself with nothing drawn on it. `stop` also forgets the
    // grace period, so turning the hints back on costs the full wait again
    // rather than drawing instantly on the first thing she passes.
    if (!v) { setHoveredId(null); setPointedHint(null); hints.current?.stop(); }
  }, []);
  const [focused, setFocused] = useState<WorkItem | null>(null);
  // Which row is open NOW, for callbacks that settle minutes after the render
  // that made them. A failed live reply reads it to decide whether she is
  // still on that conversation or has gone somewhere else.
  const focusedNow = useRef<WorkItem | null>(null);
  focusedNow.current = focused;
  // THE ROW SHE IS WATCHING A COMMAND ANSWER ON. Set when she sends one of
  // Claude Code's eight from an open task, cleared when she leaves it. It is
  // what keeps the pane open under her while the row runs, and what sends her
  // back to her inbox rather than to In progress when she is done reading.
  // The rule, and the reason for it, are in ./stay-with-a-command.
  const [following, setFollowing] = useState<Followed>(null);
  /* * WHAT SHE HAS SENT TO A RUNNING AGENT AND THE LEDGER HAS NOT RECORDED YET.

     A reply to a working agent does not go to the row first. It goes to the
     session, and `submitReply` writes the row only after the provider says it
     has the message. Claude says so by replaying it, which it does at its next
     break, and `attachClaudeInput` waits up to 120 seconds for that. The
     conversation is drawn off the row, so for the whole of that wait the user's
     words were on no screen: the reply box had closed and the thread had not
     heard of them. Three messages typed into that silence all appeared at once
     when the agent finally paused.

     These are held here because this is what does the sending. A failed send
     drops its own entry and gives her the words back. A successful one is
     dropped by the ledger rather than by us: the committed copy cancels the
     pending one inside `itemThread`, so at no point is the message on neither
     screen. Nothing here is stored and none of it survives a restart, which is
     correct: a send that has not landed by then did not happen.
  */
  const [sending, setSending] = useState<(PendingSaid & { product: string; id: string })[]>([]);
  // In flight on ONE row, in the order she sent them. A message on its way to
  // another task is that task's conversation, not this one's.
  const sendingOn = useCallback(
    (item: WorkItem): PendingSaid[] => sending.filter((s) => s.product === item.product && s.id === item.id),
    [sending],
  );
  /*
   * WHICH CODING AGENT THE OPEN ROW REALLY RUNS ON, and it is main's answer
     rather than one the renderer works out. `byItem` names only the rows that
     differ from the workspace, so the read is `byItem[id] ?? workspace`, which
     is the same word `Supervisor#_engineFor` will spawn on. On every Mac with
     one coding agent that is `claude`, and on a payload written before `engines`
     was on the snapshot it is null; both read as Claude Code everywhere it is
     used.

     DECLARED HERE RATHER THAN IN THE PANE'S PROPS BECAUSE THREE SURFACES NEED
     IT and one of them is a callback. The pane's byline and its reply footer
     take it as a prop, and `answerWith` needs it to decide whether a slash
     command keeps her on the row -- and a second copy of this expression is a
     second opinion about which engine a row is on. */
  const runningEngine = focused ? (snap?.engines?.byItem?.[focused.id] ?? snap?.engines?.workspace ?? null) : null;
  // It used to live 800 lines below, which put it out of that reach.
  const [focusedRepeat, setFocusedRepeat] = useState<RepeatRule | null>(null);
  // THE TASK AN URGENT ROW TOOK HER OFF, so she can be put back on it.
  //
  // The second sentence is the half that makes the first one bearable, so the
  // two live together: nothing sets `focused` to an urgent row over her head
  // without putting what she was reading in here first.
  const [heldByUrgent, setHeldByUrgent] = useState<WorkItem | null>(null);
  // Rows already in the inbox before now. An urgent row she has been ignoring
  // all afternoon is not an interruption; one that ARRIVES while she is
  // reading is. Without this, opening any task would bounce her off it.
  const knownRows = useRef<Set<string> | null>(null);
  // A row interrupts once, ever, and this outlives the interruption itself: it
  // is what stops her being pulled back to the same card every time the inbox
  // refreshes after she has walked away from it.
  const spentInterrupts = useRef<Set<string>>(new Set());
  // Whether the box for changing that rule's instruction is open. Its own flag
  // rather than a value of `modal`, because `modal` is cleared the moment no
  // TASK is open (modal-scope.ts) and a rule is not a task: routed through
  // there, this box would fold itself the instant it opened.
  const [editingRule, setEditingRule] = useState(false);
  // One name for "she is reading one thing full screen", asked by the panel key
  // and by the panel itself. Two expressions of the same idea is how the key
  // and the screen end up disagreeing about which mode she is in.
  const inFullScreen = !!focused || !!focusedRepeat;
  // Read once, because nothing in the app changes it: it is set from a shot
  // script or by hand while she is choosing. main.tsx has already put it on
  // <html>; this is the same answer in a form the JSX below can ask.
  const [taskShape] = useState<TaskShape>(() => resolveTaskShape(localStorage.getItem(TASK_SHAPE_KEY)));
  const [modal, setModal] = useState<Modal>(null);
  // A hint promises a key, so it may not be drawn where the key is swallowed.
  // A modal takes the keyboard whole, so nothing underneath one may advertise
  // anything, and the hint the pointer was already on has to go with it: the
  // control never sees the pointer leave, because the pointer never moved.
  const hintsOn = keyHints && !modal;
  useEffect(() => { if (!hintsOn) { setPointedHint(null); hints.current?.stop(); } }, [hintsOn]);

  // WHO IS UNDER THE POINTER, ASKED ONCE FOR THE WHOLE WINDOW.
  //
  // ON MOUSEMOVE AND NOT MOUSEOVER, for the same reason the rows use move: a
  // pointer parked where the app happened to draw something new would otherwise
  // claim a component it was never moved to. `closest` walks up from whatever
  // was hit, so a hint may be written on the whole component and still answer
  // for the icon inside it.
  useEffect(() => {
    if (!hintsOn) return undefined;
    const onMove = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-hint]') as HTMLElement | null;
      const id = el?.dataset.hint;
      if (!el || !id || !HINTS[id]) { setPointedHint((was) => (was ? null : was)); return; }
      setPointedHint((was) => (was && was.el === el ? was : { id, el }));
    };
    const onOut = (e: MouseEvent) => { if (!e.relatedTarget) setPointedHint(null); };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseout', onOut, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseout', onOut, true);
    };
  }, [hintsOn]);
  // A PLATE MUST NEVER OUTLIVE THE THING IT IS ABOUT, and this is three guards
  // rather than one because it went wrong three ways at once.
  //
  // THE FAULT: a row's own keys kept appearing in the top-left corner, over the
  // traffic lights, after hovering something in the inbox and then pressing
  // another shortcut such as ⌘2. A shortcut plate must never appear in the
  // wrong position, triggered by the wrong thing.
  //
  // WHAT WAS ACTUALLY HAPPENING. The plate is measured off the element's live
  // box. She pointed at a row, then used the KEYBOARD, and the list under the
  // pointer was replaced: pressing ⌘2 (Tab, since 2026-10-02) swaps the whole
  // list for another one, and
  // typing in search re-renders it. The row she had been pointing at was then
  // detached from the document, and a detached element's box is all zeros, so
  // the plate placed itself at 0,0 and was clamped to the window's own margin.
  // The top-left corner is what a hint about nothing looks like.
  //
  // THE KEYBOARD TAKES THE HINT AWAY, which is the guard that answers her case
  // directly and is right on its own terms: the hint is a hint for the hand on
  // the mouse, and `hoveredId` beside it already works this way.
  useEffect(() => {
    if (!shownHint) return undefined;
    const drop = () => { setPointedHint(null); hints.current?.stop(); };
    window.addEventListener('scroll', drop, true);
    window.addEventListener('resize', drop);
    window.addEventListener('keydown', drop, true);
    // AND THE ELEMENT ITSELF CAN GO WITHOUT ANY OF THOSE FIRING. A row can be
    // re-rendered away by an agent finishing, with no key pressed and nothing
    // scrolled, so the last guard watches the document rather than the input.
    const watch = new MutationObserver(() => {
      if (!shownHint.el.isConnected) drop();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('scroll', drop, true);
      window.removeEventListener('resize', drop);
      window.removeEventListener('keydown', drop, true);
      watch.disconnect();
    };
  }, [shownHint]);
  // Settings is a screen rather than a modal, so it has its own state rather
  // than a place in the Modal union: the standing-instructions box opens OVER
  // it from its own General pane, and one state for both would close the
  // screen to show the box. ?settings=1 opens it on load, and ?settings=agents
  // (or =project:kestrel) opens it on a named pane, so a screenshot run can
  // reach any of them in one URL: a screen that cannot be summoned cannot be
  // looked at. THE NEW
  // PROJECT CARD (hers). Its own state rather than a member of the modal
  // stack, because two of its three doors are inside something else: the chip
  // lives in the new-task card and the + lives in Settings, and BOTH have to
  // still be there when the card closes. Making it a modal would have thrown
  // away whatever she had already typed into the task she opened it from.
  const [newProject, setNewProject] = useState(false);
  // THE AGENT IMPORT, OFF THE WALK. Its own flag rather than a `modal`, for
  // the same reason `newProject` has one: ⌘K closes the modal stack on its
  // way out, and this card is opened FROM ⌘K.
  const [importAgents, setImportAgents] = useState(false);
  // The project just made, handed to the composer so the task she was in the
  // middle of writing is now addressed to it.
  const [pickProject, setPickProject] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(
    () => new URLSearchParams(location.search).has('settings'),
  );
  // THE TEAM PAGE, a page like Settings: it takes the main area and leaves the
  // header and the sidebar where they are.
  const [teamOpen, setTeamOpen] = useState(() => new URLSearchParams(location.search).has('team'));
  // A TEAMMATE'S THREAD, opened from the Team board: its card, never its conversation.
  const [openCard, setOpenCard] = useState<ThreadCard | null>(null);
  // THERE IS NO MEMBERS PAGE ANY MORE (w-8415594d19, 2026-10-01). Team
  // management is a pane in Settings, so the sidebar's two team rows are one
  // row that opens it. This is all that is left of them: whether the email box
  // on that pane takes the cursor, which is what makes Invite people a
  // shortcut rather than another way to reach Settings.
  const [inviteFocus, setInviteFocus] = useState(false);
  // WHAT THE COMPOSER OPENS WITH, when something hands it a start: "Hand it to
  // an agent" on a message from a person turns that message into a thread.
  // `also` is everyone after the first in To, which is how "Add people" on an
  // open conversation hands the whole group over (threads/page-rules.ts).
  const [composeInitial, setComposeInitial] = useState<{ to?: string; also?: string[]; body?: string } | null>(null);
  // OPEN A CONVERSATION WITH THE REPLY BOX READY, carrying what was typed. The
  // composer hands over here when its To is someone you already talk to, and
  // "Message Maya" comes here first.
  const openConversation = useCallback((convo: WorkItem, draft = '') => {
    if (draft.trim()) saveDraft(convo, draft);
    clearComposeDraft();
    setComposeInitial(null);
    setTeamOpen(false);
    setOpenCard(null);
    setFocused(convo);
    setModal('reply');
  }, []);
  const handToAgent = useCallback((item: WorkItem) => {
    const from = item.createdBy ? teamView(snap?.team ?? null, snap?.products ?? [])?.byId.get(item.createdBy)?.name : null;
    const quoted = (item.body ?? item.title ?? '').trim();
    setComposeInitial({ to: 'agent', body: from ? `${from} asked:\n\n${quoted}\n\n` : `${quoted}\n\n` });
    setModal('compose');
  }, [snap?.team, snap?.products]);
  // ADD PEOPLE on an open conversation: New thread, with everyone already in
  // that conversation in To. Nothing is written to the conversation on screen,
  // because adding somebody makes the group's conversation and leaves this one
  // as it was; sending is what makes it (main/team/index.mjs directWith).
  const addPeopleToConversation = useCallback((who: { to: string; also: string[] }) => {
    setComposeInitial({ to: who.to, also: who.also });
    setModal('compose');
  }, []);
  // Drawn when it is open and nothing sits over it: an opened task or Settings
  // takes the page, and closing them returns to the Team page.
  const teamShown = teamOpen && !focused && !settingsOpen;
  // THE SIGN-IN PAGE STANDS OVER EVERYTHING when a team build has nobody
  // signed in, once the saved sign-in has been looked for (team/SignInPage.tsx).
  // Signing out lands on it, and it says so.
  const signInGate = !api.isFixtures && !!snap?.team?.configured && snap.team.started === true && !snap.team.signedIn;
  const wasSignedIn = useRef(false);
  const [signedOutHere, setSignedOutHere] = useState(false);
  useEffect(() => {
    if (snap?.team?.signedIn) { wasSignedIn.current = true; setSignedOutHere(false); }
    else if (wasSignedIn.current && snap?.team?.started) setSignedOutHere(true);
  }, [snap?.team?.signedIn, snap?.team?.started]);
  const signInGateRef = useRef(false);
  signInGateRef.current = signInGate;
  /*
   * EVERYTHING DRAWN OVER THE APP, IN ONE PLACE.
     Read by `closeWhatFloats` below, which is how a walk hands the whole window
     back instead of leaving a card it hid on top of her inbox. A ref rather
     than a dependency list for the same reason `claudeRef` is one: the walk
     ends from three different callbacks and none of them should be rebuilt
     every time one of these opens. `./walk-scope.ts` is the rule. */
  const floatingRef = useRef<OpenOverTheApp>(NOTHING_OVER_THE_APP);
  floatingRef.current = { modal, settings: settingsOpen, importAgents, newProject, teamShown };
  // WHICH PAGE OF SETTINGS A PRESS ASKED FOR, when it asked for one. ⌘K's
  // "Keyboard shortcuts" row opens Settings on the Shortcuts page rather than
  // on its front door; the cog and the plain "Settings…" row leave this null
  // and land where they always did. It is cleared on the way out so reopening
  // Settings does not silently reopen somebody's last errand.
  const [settingsPane, setSettingsPane] = useState<string | null>(null);
  const [settingsPage, setSettingsPage] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  // THE BOX FILTER'S OTHER TWO PARTS (w-aa3fa4cbf0). The project part is
  // `productFilter` above, kept under its old name because the practice run and
  // the import card read it too. All three are applied LAST, to the box on
  // screen: see `boxFilter` and `list` below, and ./box-filter.ts for why.
  const [priorityFilter, setPriorityFilter] = useState<PriorityId | null>(null);
  const [harnessFilter, setHarnessFilter] = useState<Harness | null>(null);
  const boxFilter = useMemo<BoxFilterState>(
    () => ({ project: productFilter, priority: priorityFilter, harness: harnessFilter }),
    [productFilter, priorityFilter, harnessFilter],
  );
  const setBoxFilter = (f: BoxFilterState) => {
    setProductFilter(f.project);
    setPriorityFilter(f.priority);
    setHarnessFilter(f.harness);
    setSelected(0);
  };
  // Stable, because the menu's click-away listener is keyed on it.
  const closeFilter = useCallback(() => setModal((m) => (m === 'filter' ? null : m)), []);
  // TASK SEARCH. `null` is not searching at all, which is the state the app
  // spends almost all of its life in and in which nothing below behaves any
  // differently; '' is the field open and empty. Two states in one variable
  // because "is the tab row a field right now" and "what is in it" are the same
  // question, and splitting them is how a field ends up open with a stale query
  // in it (design B, the corner magnifier and `/`).
  const [search, setSearch] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // ESC PUTS HER BACK WHERE SHE WAS. Searching crosses every tab, so leaving it
  // has to restore the one she came from AND the row she was on, or a search
  // that found nothing has quietly moved her.
  const searchReturn = useRef<{ view: View; selected: number } | null>(null);
  // THE PANEL IS UP IN BOTH MODES, AND IS A TOGGLE IN BOTH. It was closed over
  // a task twice, and both times for the same reason: it was the loudest thing
  // on the screen and it competed with what she had opened.
  //
  // So the loudness was the objection, not the presence, and the fix for the
  // loudness is in styles.css rather than here.
  //
  // ONE STATE, REMEMBERED, EVERYWHERE. It used to be two, one per mode, so that
  // a press in the list could not silently become the default over a task. That
  // reverses BOTH the two-state split and the reset-on-the-way-out rule that
  // went with it: hiding the panel is a thing she does to the app, not to a
  // screen, so it is one flag.
  //
  // It still starts up on a machine that has never been told otherwise.
  const [panelUp, setPanelUp] = useState(() => localStorage.getItem('powerup.sidebar.collapsed') !== 'true');
  // WHAT THE SIDEBAR WAS BEFORE A DOCUMENT TOOK THE WHOLE WINDOW, and null
  // whenever nothing has. The effect that fills it in sits further down beside
  // the artifact's own state; it is declared here because the line below has to
  // read it, and because a ref is the right home for it: it is never drawn, and
  // as state it would re-run its own effect the moment it was written.
  const panelBeforeFullScreen = useRef<boolean | null>(null);
  const panelUpNow = useRef(panelUp);
  panelUpNow.current = panelUp;
  // A COLLAPSE THE APP DID IS NOT A PREFERENCE, SO IT IS NOT REMEMBERED. While
  // a document is full screen the stored value stays at whatever she last chose
  // herself, so quitting in that state reopens with her sidebar rather than the
  // one full screen borrowed.
  useEffect(() => {
    if (panelBeforeFullScreen.current !== null) return;
    localStorage.setItem(PANEL_KEY, panelUp ? '1' : '0'); localStorage.setItem('powerup.sidebar.collapsed', String(!panelUp));
  }, [panelUp]);
  // The one way to change it. The key, the button in the corner and the ⌘K
  // command all call THIS, so there is no second place for it to be confused in.
  const togglePanel = useCallback(() => setPanelUp((v) => !v), []);
  // Resolved once at mount and applied before the first paint below, so the
  // window never flashes the other theme on the way in.
  // IT HOLDS THE PICK, NOT THE COLOUR. `match` is one of the three things this
  // can be, and it is resolved to light or dark at every paint below rather than
  // frozen here, so a Mac that flips at sunset takes the window with it and the
  // ticked tile still says Match my system.
  const [theme, setTheme] = useState<ThemePick>(() => resolvePick(localStorage.getItem(THEME_KEY)));
  // WHAT THE MAC SAYS RIGHT NOW, and it only matters while `theme` is `match`.
  // A piece of state rather than a read at paint time because nothing else would
  // tell React that the Mac changed its mind while the window was open.
  const [machine, setMachine] = useState(() => resolveTheme('match'));
  useEffect(() => onMachineTheme(setMachine), []);
  // The picture over dark, on its own axis (skins.ts). Applied in main.tsx
  // before the first paint; this is the same value read back so the controls
  // can show which one is on.
  const [skin, setSkin] = useState<SkinChoice>(() => resolveSkin(localStorage.getItem(SKIN_KEY)));
  // WHAT SHE PICKS IS ONE THING. Light, Dark, or a picture — never a theme and
  // a picture separately, because a picture IS dark, and two
  // controls for one decision is the cognitive load the design law exists to
  // refuse. Settings and ⌘K both call this and nothing else, so there is no
  // second place for the two halves to disagree.
  const look = lookOf(theme, skin);
  // HER DIALS on the picture: blur and dim (skins.ts). They live beside the
  // skin rather than inside it because they are hers to move and the skin is
  // ours to ship, and because moving one has to repaint the window she is
  // looking at, not the next one she opens.
  const [tune, setTuneState] = useState<SkinTune>(() => {
    const sk = resolveSkin(localStorage.getItem(SKIN_KEY));
    // With no picture on there are no dials to show, but the state still needs
    // a shape, so it borrows the first picture's. SKINS[0], not a name: the
    // first picture was Mountain, it was removed, and a hard-coded id here is
    // what would have broken.
    return resolveTune(localStorage.getItem(TUNE_KEY), sk === 'none' ? SKINS[0].id : sk);
  });
  // The newest press wins: walking the strip with the arrow keys fires several
  // switches before the first picture is decoded, and only the last may land.
  const lookSeq = useRef(0);
  // THE TILE SHE PRESSED, ticked on the press itself while its picture decodes,
  // so a click always answers at once even when the window takes a beat.
  const [pickedLook, setPickedLook] = useState<Look | null>(null);
  const setLook = useCallback((next: Look) => {
    const { theme: t, skin: s } = lookMeans(next);
    // Stored at once, so what she pressed is kept even if the window closes
    // before the picture is ready. The screen changes once it is (look-switch.ts).
    localStorage.setItem(THEME_KEY, t); localStorage.setItem(SKIN_KEY, s);
    const seq = ++lookSeq.current;
    setPickedLook(next);
    void readySkin(s).then(() => {
      if (seq !== lookSeq.current) return;
      swapLook(() => flushSync(() => {
        setPickedLook(null);
        setTheme(t); applyTheme(resolveTheme(t));
        setSkin(s); applySkin(wornSkin(t, s, machineTheme()));
        // Each picture carries its own dials, so arriving on one loads ITS numbers
        // rather than leaving the last picture's blur on this one's photograph.
        if (s !== 'none') {
          const next = resolveTune(localStorage.getItem(TUNE_KEY), s);
          setTuneState(next); applyTune(next);
        }
      }));
    });
  }, []);

  const setTune = useCallback((next: SkinTune) => {
    const sk = resolveSkin(localStorage.getItem(SKIN_KEY));
    if (sk === 'none') return;
    setTuneState(next);
    applyTune(next);
    localStorage.setItem(TUNE_KEY, storeTune(localStorage.getItem(TUNE_KEY), sk, next));
  }, []);
  const resetTune = useCallback(() => {
    const sk = resolveSkin(localStorage.getItem(SKIN_KEY));
    if (sk !== 'none') setTune(TUNE_DEFAULT[sk as SkinId]);
  }, [setTune]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')));
  // Batch selection (Superhuman: cmd-A, shift-select, then act on all).
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [snoozes, setSnoozes] = useState<Snooze>(() => JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}'));
  // An undo entry can carry the user's own words back with it: withdrawing a
  // reply must return what was written, not merely cancel the send.
  //
  // AND IT CARRIES THE MOMENT IT WAS MADE, because that is what Z is allowed to
  // reach (./undo-window). A row she closed at 1:18pm came back at 1:21pm, as her
  // own write, off an entry this stack had kept armed since the close.
  type Undoable = {
    /** What it SAYS once the undo has happened. */
    label: string;
    /**
     * And what it would do, said as a plain verb phrase that finishes "press Z
     * again to ___". Required, not optional, so a new entry cannot be made
     * without one: the question a late Z asks is the only thing standing
     * between a stray letter and a decision, and `label` cannot do that job.
     * It is a finished announcement, so a question built out of one reads
     * "Press Z again and this happens: Reopened: ...", which cannot be read
     * (./undo-window).
     */
    undoes: string;
    run: () => Promise<void>;
    restore?: () => Restored;
    /** The row this puts back, which a Z opens once it has run (./undo-window, `shownAfterUndo`). */
    brings?: WorkItem;
  };
  const [undoStack, setUndoStack] = useState<Array<Undoable & { at: number }>>([]);
  /**
   * THE ONLY WAY ONTO THAT STACK, so the stamp is applied once to the rule rather
   * than at thirteen call sites, one of which would forget it and be undoable for
   * ever again. It stamps the entry itself rather than a copy of it: the reply
   * hand-over holds on to its entry and takes it back off by identity when the
   * send fails, and a copy would leave that filter matching nothing.
   */
  const pushUndo = useCallback(<T extends Undoable>(entry: T) => {
    const stamped = Object.assign(entry, { at: Date.now() });
    setUndoStack((u) => [...u, stamped]);
    return stamped;
  }, []);
  /**
   * THE QUESTION A LATE Z ASKS, waiting for the next key to answer it. Past
   * thirty seconds Z names what it would undo instead of doing it, and only a
   * second Z goes through with it; every other key means no, which is handled
   * at the top of the keyboard effect below. Held in a ref because nothing on
   * the screen reads it except the toast it already raised.
   */
  const undoAskRef = useRef<{ entry: Undoable & { at: number }; at: number } | null>(null);
  /* * A TOAST CAN CARRY A WAY IN NOW, and on the one that says a task was made it does.

     `goes` is the row it was about, by id, NOT a closure that opens it. A
     closure made here would hold whatever `items` was at the moment of sending,
     which is the list from BEFORE the row existed; the lookup happens at click
     time instead, against whatever the window is holding by then. A row that has
     since gone (she withdrew it with Z) simply does not answer the click.
  */
  const [toast, setToast] = useState<{ text: string; goes?: { product: string; id: string } } | null>(null);
  // Dev aid, the same shape again: ?modes=a,b,e draws one of the three unbuilt
  // treatments of the permission question (./components/ModeScreen.tsx), so it
  // can be photographed inside the real app rather than redrawn beside it.
  // Nothing in the app links to it.
  const [modeDraft] = useState(() => isModeVariant(new URLSearchParams(location.search).get('modes')));
  const [modeDraftValue, setModeDraftValue] = useState<PermissionMode>('auto');
  // showToast is defined six hundred lines below, and the effect that brings
  // her back from an interruption sits beside the interruption rather than
  // beside the toast, so it reaches it through a ref.
  const showToastRef = useRef<((line: string) => void) | null>(null);
  // The approval she just answered, held only long enough for the card to
  // leave. Cmd+Y is caught in the main process, so this is the renderer's only
  // evidence the press landed at all.
  const [answered, setAnswered] = useState<{ id: string; allow: boolean } | null>(null);
  // The card that held the stage when she pressed: the store push usually beats
  // the animation, and a card cannot finish leaving once the snapshot has
  // forgotten it exists.
  const frontApproval = useRef<Approval | null>(null);
  // Which option (by its number) the arrows have highlighted in focus mode.
  // A task always opens with NOTHING selected: Enter can only ever send a
  // choice the user visibly made.
  const [optionSel, setOptionSel] = useState<number | null>(null);
  // The item whose action is held in the grace window. The write waits for
  // Z; the SIGNAL must not: the item leaves the inbox and shows under In
  // progress immediately, because a sent thing still sitting in the inbox
  // reads as not sent.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [run, setRun] = useState<FirstRun | null>(null);
  // THE FIRST SECOND OF HER OWN PROJECT. Null except for the five seconds after
  // the walk ends; see `Landed` in components/Onboarding.tsx for why the
  // confetti is here rather than on the card before it.
  const [landing, setLanding] = useState<{ agents: boolean } | null>(null);
  // THE TUTORIAL, OFFERING ITSELF ON A NEW PROJECT. Null except for the moment
  // between a project being made and the question being answered. It holds the
  // slug because that is where the person comes back to when the tutorial is
  // over; see `comeBackTo` in ./tutorial.ts for why the tutorial has to carry a
  // project it did not make.
  const [offer, setOffer] = useState<{ product: string | null } | null>(null);
  // WHETHER TO SAY ANYTHING ABOUT CLAUDE CODE, which is not the same question
  // as whether it is installed.
  //
  // So this holds one thing, and it is the thing the screen draws: missing,
  // meaning we looked, we got an answer, and the answer was no. It starts
  // false, and a settings read that never reached the main process leaves it
  // false. The old shape was { found }, and `found: false` was the value every
  // one of those failures produced.
  const [claude, setClaude] = useState({ missing: false, url: 'https://code.claude.com/docs/en/setup' });
  const [home, setHome] = useState('');
  const runRef = useRef<FirstRun | null>(null);
  runRef.current = run;
  // The same, for the Claude Code answer, so `finishRun` can refuse a press
  // without being rebuilt every time that answer changes.
  const claudeRef = useRef(claude);
  claudeRef.current = claude;
  // ?firstrun=1 walks it again without wiping anything, which is how it can be
  // looked at on a Mac that has already been set up.
  const forcedRun = useRef(forcedStep(new URLSearchParams(location.search).get('firstrun')));

  // WHETHER IT RUNS AT ALL: a store with no projects has never been used, and
  // that is the only honest test. It waits for the first snapshot, so a slow
  // read never flashes the welcome at someone who has twenty projects.
  useEffect(() => {
    if (run || !snap) return;
    if (!firstRunNeeded({ products: snap.products.length, done: firstRunDone(localStorage), forced: !!forcedRun.current })) return;
    // A half-finished walk resumes where it stopped: the folder and name are
    // saved as answered, so reopening resumes.
    setRun(forcedRun.current ? { ...RUN_START, step: forcedRun.current } : readFirstRun(localStorage));
    // AND THE LOOK IS WRITTEN DOWN HERE, on the one line that knows this Mac
    // has never been used. Before this, only the three setup screens and inbox
    // zero painted the lake and nothing was stored, so every other screen fell
    // through to whatever the Mac preferred and a light Mac turned the walk
    // white after the third screen.
    //
    // WHAT IT SEEDS IS PLAIN DARK, NOT A PICTURE. The `else` branch that used
    // to sit under this line put Gouache Valley on any Mac that had chosen no
    // picture, every time the walk ran, and that is how a look nobody
    // picked reached the window. It is deleted, and so is the function behind
    // it. A picture is something somebody chooses on the walk's look step now,
    // and nothing else in the app chooses one for them.
    //
    // The state goes with it because both were read from localStorage at mount
    // and neither is watching it, so writing the keys alone would only take
    // effect on the next launch.
    const seeded = seedFirstRunLook(localStorage, THEME_KEY);
    if (seeded) { setTheme(seeded.theme); setSkin(seeded.skin); }
  }, [snap, run]);

  useEffect(() => { if (run) saveFirstRun(localStorage, run); }, [run]);

  // WHAT CODEX CALLS ITS MODELS ON THIS MAC, and what its own config.toml
  // runs. Both stay empty on every Mac with one coding agent, because
  // main/settings.mjs does not even open Codex's cache there, and the
  // composer's model drawer then behaves exactly as it always has. Filled by
  // the settings read below, which is a trip this component was already
  // making.
  const [codexModels, setCodexModels] = useState<Array<{ id: string; label: string; levels?: string[]; defaultLevel?: string | null }>>([]);
  const [codexModelDefault, setCodexModelDefault] = useState<string | null>(null);

  // HER HOME FOLDER, WHICH MAIN NOW SAYS OUTRIGHT.
  //
  // This was `storePath` with its last segment cut off, and that is not a home
  // folder: it is `<store root>/accounts`. Two screens read it as one. The walk's
  // folder screen therefore never shortened anything to `~`, and the New
  // Project card judges its proposed parent against the home it is handed, so
  // with the wrong one it proposed `<store root>/accounts/dev` on a Mac with no
  // projects yet, and `~/Documents` on a Mac whose only project lives there.
  //
  // AND IT IS READ ON EVERY LAUNCH, NOT ONLY DURING THE WALK. New Project is
  // reachable from three places long after the walk is over, and it wants the
  // same answer.
  useEffect(() => {
    const readModels=()=>api.settings().then((s) => {
      const said = s.workspace?.homePath;
      if (typeof said === 'string' && said) setHome(said);
      // AND WHAT THIS MAC'S CLAUDE CODE CALLS ITS MODELS, which is set BEFORE
      // the setState below on purpose: `setClaudeModels` holds a module value
      // rather than React state (renderer/src/models.ts says why), so it needs
      // the repaint that line is already causing. Until this lands every picker
      // draws the table committed at build time, which is the same list it has
      // always drawn.
      setClaudeModels(s.workspace?.claudeModels);
      // And Codex's models, in the same trip rather than in one of their own.
      const models = s.workspace?.codexModels;
      if (Array.isArray(models)) setCodexModels(models);
      setCodexModelDefault(s.workspace?.codexModelDefault ?? null);
    }).catch(() => { /* nothing here stops because a setting did not read */ });
    void readModels();window.addEventListener('agent-models-changed',readModels);
    return()=>window.removeEventListener('agent-models-changed',readModels);
  }, []);

  // CLAUDE CODE IS ASKED ABOUT ONCE, AT THE END, AND NOWHERE ELSE.
  //
  // It used to be read on the first render of the walk and drawn on the folder
  // screen, which is the second thing anybody sees. So the read itself now
  // waits for the finish card: before that there is no answer in this component
  // at all, and a screen cannot draw a value it does not have. The search is
  // also given the whole of the walk to happen in rather than the first second
  // of it, which is time a slow login shell is glad of.
  const atEnd = !!run && run.step === 'done';
  useEffect(() => {
    if (!atEnd) return;
    api.settings().then((s) => {
      // ok is false when the page could not reach the main process at all, and
      // claudeCertain is false when the search itself came back without an
      // answer, or when this Mac shows signs of Claude Code that the search
      // could not turn into a path. Any of those means nothing may be said.
      const sure = s.ok !== false && s.workspace?.claudeCertain === true;
      // AND CODEX IS ENOUGH ON ITS OWN. The card shuts the inbox only when we
      // are sure of both: no Claude Code, and no Codex either.
      const codexSure = s.ok !== false && s.workspace?.codexCertain === true;
      setClaude({
        missing: sure && !s.workspace?.claudeFound
          && noCodingAgent({ found: false, certain: true }, { found: !!s.workspace?.codexFound, certain: codexSure }),
        url: s.workspace?.claudeInstallUrl || 'https://code.claude.com/docs/en/setup',
      });
    }).catch(() => { /* the walk does not end because a setting did not read */ });
  }, [atEnd]);

  // CHECK AGAIN, the way through the card that is holding the inbox shut. It
  // searches from scratch rather than reading the remembered answer, and it
  // answers with whether Claude Code is STILL missing, so the card can say
  // something different the second time.
  //
  // A search that comes back unsure opens the gate. That is deliberate and it
  // is the same rule as everywhere else in this file: `certain` is what we are
  // entitled to act on, and shutting somebody out of their own app on an answer
  // we could not establish would be worse than the line she complained about.
  const recheckClaude = useCallback(async () => {
    // Both searches, because whichever one they just installed opens the door.
    const [r, codex] = await Promise.all([api.recheckClaude(), api.recheckCodex()]);
    const missing = noCodingAgent(r, codex);
    setClaude({ missing, url: r.url });
    return missing;
  }, []);

  const fire = useCallback((e: Parameters<typeof advanceRun>[1]) => {
    setRun((r) => (r ? advanceRun(r, e) : r));
  }, []);

  // AND THE WHOLE APP IS SCOPED TO THE PRACTICE PROJECT WHILE THEY ARE IN IT.
  //
  // So nothing is drawn smaller and nothing is drawn over: the rail, the tabs,
  // the inbox, the compose card and the reading pane are the real ones at full
  // size, and this is the one line that makes them the practice project's. It
  // is the app's own product filter, which every list in here already reads.
  const inPractice = practising(run);
  // THE TWO BEATS THE NEW THREAD CARD IS OPEN FOR: the one about who the thread
  // is for and the one that sends it. Both want the walk's own task in the box,
  // the practice project under it and the label on the row it makes, so the
  // card is told once rather than in three places that could disagree.
  const walkCard = run?.step === 'who' || run?.step === 'task';
  // WHAT THE LISTS UNDERNEATH ARE SCOPED TO. Only the practice run: it has to
  // make the whole app the practice project's, the mask and the counts included.
  // Her own filter is not this. It narrows the box on screen and nothing else
  // (w-aa3fa4cbf0), so the inbox count still says what is really waiting.
  const scope = inPractice ? productFilter : null;
  useEffect(() => {
    if (!inPractice || !run?.practice) return;
    setProductFilter(run.practice);
    // Cleared by finishRun rather than here: this effect ends the moment the
    // finish card appears, and clearing it there would put every project they
    // have behind that card a beat before the walk hands them their own.
  }, [inPractice, run?.practice]);

  // THE APP IS DRIVEN BY THE STEP, not the other way round. Each step opens the
  // real thing it is about to talk about, so the tether always has a live
  // rectangle to hang off.
  useEffect(() => {
    if (!run) return;
    // BEAT FOUR IS THE REAL, EMPTY INBOX.
    if (run.step === 'make') { setFocused(null); setModal(null); setView('inbox'); }
    // BOTH BEATS THE CARD IS OPEN FOR, not just the send. Somebody who quits
    // the walk on the beat about who a thread is for comes back to a card
    // telling them to click To, and without this there would be no card on the
    // screen to click it on.
    if (run.step === 'who' || run.step === 'task') setModal('compose');
    if (run.step === 'working') { setModal(null); setView('progress'); setSelected(0); }
    // AND IT COMES BACK TO HER INBOX RATHER THAN OPENING ITSELF.
    if (run.step === 'open') { setModal(null); setView('inbox'); setSelected(0); }
    if (run.step === 'clear') { setModal(null); setFocused(null); setView('inbox'); setSelected(0); }
    // BEAT FOURTEEN IS THE LIST AGAIN, with the picker opening over it when S
    // is pressed. It does NOT clear the modal on every render, because the
    // press that opens the picker is the press this beat is waiting for and
    // shutting it a frame later would make S look dead.
    if (run.step === 'snooze') { setFocused(null); setView('inbox'); setSelected(0); }
    // BEAT FOURTEEN STARTS IN THE LIST AND ENDS IN THE READING PANE, so it
    // opens on the list and then lets her open the row herself. It does NOT
    // clear `focused`, because arriving here from `clear` already has nothing
    // open and clearing it again on every render would shut the row a moment
    // after she opened it.
    if (run.step === 'unblock') { setModal(null); setView('inbox'); setSelected(0); }
    // BEAT FIFTEEN IS THE ONE BEAT THE WALK DOES NOT DRIVE. It is a tour of the
    // three tabs and the person presses Tab to take it, so forcing a view here
    // would put the screen back on Inbox a moment after they left it. All this
    // does is make sure nothing is over the app when the tour starts.
    if (run.step === 'where') { setModal(null); setFocused(null); }
    // THE BOARD BEAT IS DRIVEN NO HARDER THAN THE TOUR IS. The press that
    // matters is inside the View and filters menu, which the person opens
    // themselves, so all this does is make sure nothing is over the app and
    // that they are on the Inbox, where the board lives.
    if (run.step === 'board') { setModal(null); setFocused(null); setView('inbox'); }
    if (run.step === 'command') { setModal(null); setFocused(null); setView('inbox'); }
  }, [run?.step]);

  // C IS THE APP'S OWN C NOW. Beat four points at the plus on the real inbox,
  // where the key she is told to press is already bound to opening the compose
  // card, so the walk listens for the card rather than for the keystroke: the
  // beat moves on whether she pressed C or clicked the plus, and it is the
  // app's behaviour she is learning rather than the walk's.
  useEffect(() => {
    // THE CARD OPENING ENDS THE FIRST BEAT AND STARTS THE ONE ABOUT WHO IT IS
    // FOR (2026-10-01). It used to go straight to the send; To is the card's
    // first line and the walk never said a word about it.
    if (run?.step !== 'make' || modal !== 'compose') return;
    setRun((r) => (r ? stepTo(r, 'who') : r));
  }, [run?.step, modal]);

  // AND SHE OPENS IT HERSELF. Beat six's second half ends when the row she was
  // pointed at is really open, by ↵ or by a click on it.
  useEffect(() => {
    if (run?.step !== 'open' || !focused || focused.id !== run.item) return;
    setRun((r) => (r ? stepTo(r, 'answer') : r));
  }, [run?.step, focused?.id]);

  // THE ANSWER ARRIVES. The walk watches the real item in the real snapshot, so
  // "it is running" stops being true at the moment it stops being true.
  useEffect(() => {
    if (run?.step !== 'working' || !run.item || !snap) return;
    const it = snap.items.find((i) => i.id === run.item);
    if (!it) return;
    const landed = !!it.result || it.status === 'done' || it.status === 'blocked';
    if (!landed) return;
    // IT DOES NOT OPEN ITSELF ANY MORE. It lands in the inbox and the card
    // beside it says to press ↵, which is the next beat.
    setView('inbox');
    fire({ t: 'answered' });
  }, [snap, run?.step, run?.item]);

  // AND THE APP IS WHAT ANSWERS IT.So after about two seconds the folder chosen
  // two screens earlier is read and its first real line is written on the row
  // as the result. The effect above then sees that result and moves the walk
  // on, exactly as it did when a session wrote it, because nothing downstream
  // knows the difference.
  //
  // THE TWO SECONDS ARE THE WALK'S, NOT THE WORK'S. Reading a readme takes
  // milliseconds, and being answered in the same frame as the keypress teaches
  // nothing about what a task is: the sentence beside the row is what is being
  // read during them.
  //
  // AND IT IS ANSWERED IN THE PRACTICE PROJECT, which points at no folder at
  // all. The readme read above cannot run there and would have nothing honest
  // to say if it did, so main/store.mjs writes the pre-written answer instead.
  // Same row, same ledger, same two seconds.
  useEffect(() => {
    if (run?.step !== 'working' || !run.item) return;
    const product = run.practice ?? run.product;
    if (!product) return;
    const id = run.item;
    let live = true;
    const t = setTimeout(async () => {
      try { await api.firstRunAnswer({ product, id }); } catch { /* the slow line covers it */ }
      if (live) await refresh();
    }, ANSWER_AFTER_MS);
    return () => { live = false; clearTimeout(t); };
  }, [run?.step, run?.item, run?.product, run?.practice]);

  // AND NOTHING FROM CLAUDE CODE STARTS WHILE THE WALK IS UP.Making the project
  // one screen earlier composes a real directive, and on her own walk that
  // directive's session started first and put the example task thirteen seconds
  // behind it in the queue. Everything is released the moment the walk ends,
  // which is this effect's cleanup.
  const walking = !!run && run.step !== 'landed';
  useEffect(() => {
    if (!walking) return;
    api.firstRunWalking(true);
    return () => { api.firstRunWalking(false); };
  }, [walking]);

  // AND CLOSING HER OWN TASK FILLS THE INBOX UP, WHICH IS BEAT EIGHT.Staged is
  // the one she took on the round four page.
  //
  // THE AGENTS SCREEN USED TO SIT HERE AND DO THIS STAGING.So closing the
  // answer goes straight on to the three examples, and the staging that the
  // agents screen used to carry moved here with the beat it belongs to.
  //
  // A store that will not take the three is not a reason to strand somebody
  // mid-walk, so a failure skips the beat and goes on to ⌘K rather than ending
  // the walk: the end of it is now her agents and the finish card, and both of
  // those are worth more than the three examples were.
  //
  // AND SINCE 2026-08-23 THE THREE ARE ALREADY THERE. They are written into the
  // practice project at the moment it is made, because an inbox somebody walks
  // into really does have things in it already, and `walkRows` is what keeps
  // them off the screen until this beat. So this no longer writes anything: it
  // lets the list go and moves the walk on. The fallback is still the same one,
  // because a store that would not take the three is not a reason to strand
  // somebody mid-walk: no rows means straight on to ⌘K rather than a beat
  // pointing at an empty list.
  //
  // A WALK WITH NO PRACTICE PROJECT BEHIND IT (fixtures, an old preload) still
  // stages them the old way, into the project they made. That path is what a
  // window with no main process under it takes, and it is better than a beat
  // that silently does nothing. AND THE GUARD IS THE WALK'S OWN TASK, NOT A
  // BOOLEAN. It was `useRef(false)`, flipped true the first time this beat ran
  // and never put back, so a SECOND walk in the same window never got past beat
  // twelve. ./walk-staging.ts holds the rule and the whole story: a second
  // walk staged only one task, so one press of E reached inbox zero.
  const staging = useRef<string | null>(null);
  const stageKey = walkStageKey(run, !!focused);
  useEffect(() => {
    if (!needsStaging(staging.current, stageKey)) return;
    staging.current = stageKey;
    (async () => {
      const already = runRef.current?.examples ?? [];
      if (already.length) {
        await refreshRef.current?.();
        fire({ t: 'staged', examples: already });
        return;
      }
      const product = runRef.current?.practice ?? runRef.current?.product ?? null;
      let staged: string[] = [];
      if (product) {
        try { staged = (await api.firstRunExamples({ product }))?.ids ?? []; }
        catch { staged = []; }
      }
      await refreshRef.current?.();
      if (staged.length) fire({ t: 'staged', examples: staged });
      else setRun((r) => (r ? stepTo(r, 'command') : r));
    })();
  }, [stageKey, fire]);

  // WHAT THE FINISH CARD'S ONE BUTTON DOES. The names she kept are written
  // against the project she just made, and the walk ends whether or not that
  // write lands: a settings file that will not take a key is not a reason to
  // trap somebody on the last card of an onboarding.
  //
  // ONE PRESS, BECAUSE THE IMPORT IS ON THE FINISH CARD.It used to be a screen
  // of its own with its own Finish, and the confetti came after it.
  //
  // AND IT WILL NOT END THE WALK WHILE CLAUDE CODE IS MISSING.The card does not
  // draw a way in, so nothing should reach here at all; this is the same rule
  // stated where the walk is actually written off, so a press that arrives by
  // some route the card does not know about is refused too.
  //
  // AND THE PRESS NOW DOES SOMETHING. It used to write the ticked names into a
  // settings file nothing in the app ever read, which was measured on a tester's
  // build: the inbox was byte for byte identical before and after. So the
  // same press files one row per agent, each one asking that agent for its
  // first job, and the inbox that opens has the user's own agents in it.
  //
  // AND THE PRACTICE PROJECT GOES AWAY HERE. It is archived rather than
  // deleted, which is one key in one project.json and is all it takes:
  // `listProducts` skips an archived project, so it leaves the rail, the inbox,
  // the compose card, the palette and the supervisor in the same breath.
  // Everything they pressed during the walk is still on the ledger; an
  // onboarding does not remove directories from somebody's store.
  //
  // THE AGENTS THEY KEPT GO INTO THEIR OWN PROJECT, never the practice one.
  // That is the whole point of the practice project existing: the four rows the
  // finish card files are the first real work in the inbox they land in.
  //
  // AND THE CELEBRATION IS HERE, NOT ON THE CARD BEFORE IT (2026-08-24).So the
  // last thing this does is arm `Landed`, which falls over her own inbox for
  // five seconds and takes itself down. `landing` remembers whether she kept
  // any agents, because that decides which of her two lines is TRUE of the list
  // behind the words. `celebrate` IS FALSE FOR ONE CALLER AND ONE ONLY: the
  // quiet way out. Somebody who skipped the walk is not done with it, and
  // throwing them a party for leaving is the app misreading the room. They
  // still land in their own project; it simply lands quietly. AND THE COMPOSE
  // CARD STOPS OPENING ON PRACTICE. The walk writes the practice slug into the
  // remembered-project slot when it makes the practice project (`onPractice`,
  // below), because every beat after that is meant to file into Practice.
  // Nothing ever wrote it back, so the slot still said `practice` when the walk
  // was over, and ./components/Compose.tsx opens the card on whatever that slot
  // says. Every task a user wrote AFTER the tutorial was therefore addressed
  // to Practice by default, where the supervisor will never run it, and it
  // survived a restart, because localStorage does. It looked like the user had
  // been left in practice mode.
  //
  // It is HANDED BACK rather than cleared wherever there is something to hand
  // it to: the walk made the person a real project a few screens earlier, and
  // that is the project their first real task belongs to. With nothing to name,
  // the key goes entirely and the card falls back to the first project on the
  // row. The other half of this — every install where the slot is ALREADY
  // wrong, is the effect beside `rankedProducts`,
  // because a walk somebody quit never reaches this function at all. `filed` IS
  // THE IMPORT CARD'S OWN COUNT. The last card of the walk is the import card
  // now, and it files into as many inboxes as it had to make, so nothing here
  // could repeat that work correctly: this knows one project and the card knew
  // six. When it is set, this files nothing and only reads it to decide which
  // line the confetti falls over. `practised` IS WHETHER THIS WALK REALLY
  // SHOWED SOMEBODY AROUND, and it is the one thing that stops the new project
  // offer ever asking a second time. True from the finish card, from the import
  // card and from the end of the tutorial; FALSE from the quiet way out,
  // because somebody who skipped has seen none of the practice and the next
  // project they make is exactly the moment they might want it after all. The
  // reasoning for asking once and never again is in ./tutorial.ts.
  /*
   * THE WALK HANDS THE WHOLE WINDOW BACK.
   *
   * The walk is drawn over everything, so anything the app has open while it
   * runs is invisible for as long as it runs and is the first thing on the
   * screen the moment it stops. The route in is one press wide and it is not a
   * mistake anybody made: the last beat asks for ⌘K, and Return in the palette
   * with nothing typed opens the new project card. `./walk-scope.ts` has the
   * whole story and the rule; this is the one place that applies it, at both
   * ends of every walk. */
  const closeWhatFloats = useCallback(() => {
    const shut = afterTheWalk(floatingRef.current);
    setModal(shut.modal as Modal);
    setSettingsOpen(shut.settings);
    setSettingsPane(null);
    setImportAgents(shut.importAgents);
    setNewProject(shut.newProject);
    setTeamOpen(shut.teamShown);
  }, []);

  const finishRun = useCallback((
    chosen: string[],
    { celebrate = true, filed = null as number | null, practised = false } = {},
  ) => {
    if (!mayOpenInbox(claudeRef.current)) return;
    closeWhatFloats();
    if (practised) rememberOffered(localStorage);
    const product = runRef.current?.product ?? null;
    if (product && filed === null) {
      void api.importAgents({ product, agents: chosen })
        .catch(() => { /* nothing here is worth stopping the walk for */ });
    }
    void api.firstRunPracticeEnd().then(() => refreshRef.current?.());
    setProductFilter(null);
    rememberProject(runRef.current?.product ?? null); // see above
    finishFirstRun(localStorage);
    setRun(null);
    if (celebrate) setLanding({ agents: (filed ?? chosen.length) > 0 });
  }, [closeWhatFloats]);

  // AND THE WAY BACK TO THE WELCOME SCREEN, from ⌘K.A downloaded app has no
  // address bar, so `?firstrun=1` was reachable from a terminal and nowhere
  // else.
  //
  // IT WIPES NOTHING. The two localStorage keys the walk keeps are forgotten
  // and the store is not touched, so the walk runs again over what she already
  // has and makes one more project on its way through. The palette row says
  // that in its hint, because this is the one command in the app somebody could
  // reasonably fear.
  //
  // The palette is closed first: the walk's own beats set the modal themselves,
  // and beat four is the real inbox with the plus ringed on it. AND IT STARTS
  // ON THE NEXT TICK, WHICH IS NOT A TIDY-UP. Measured here on 2026-08-23,
  // driving the built app: typing "onboarding" into ⌘K and pressing return
  // opened the walk on the SECOND screen, "Set up your first project", with the
  // second dot lit. One press, two screens. The palette handles that return on
  // the way down, React flushes the walk's effects before the same event has
  // finished reaching the window, and the welcome screen's own return listener
  // — the one that means "get started" — catches the press that opened it.
  // Handing the start to the next tick lets the press finish first, and the
  // welcome is what she sees. AND EVERY START PUTS THE ⌘K BEAT'S OWN MEMORY
  // BACK. `sawPalette` below is a ref, and a ref outlives a walk exactly as the
  // staging ref did (./walk-staging.ts): left true by an earlier walk, the
  // effect that watches beat eighteen reads "the palette has been open and is
  // not open now" the instant that beat arrives, and ends the walk without
  // anybody pressing ⌘K at all. It can only bite a SECOND walk in one mounted
  // app, which is exactly how both of these commands work and is not how a
  // reload works, so it hid behind ?firstrun=1 the same way the staging bug
  // did.
  const walkAgain = useCallback(() => {
    restartFirstRun(localStorage);
    closeWhatFloats(); // everything over the app, not only the palette
    setFocused(null);
    setView('inbox');
    sawPalette.current = false;
    setTimeout(() => setRun({ ...RUN_START }), 0);
  }, [closeWhatFloats]);

  /* * THE TUTORIAL ON ITS OWN, WHICH IS THE OTHER HALF OF THE SPLIT (w-9a6ea066d6,
     2026-08-28).

     IT WIPES NOTHING AND IT FORGETS NOTHING. `walkAgain` above calls
     `restartFirstRun`, which forgets that the first run was ever finished,
     because that walk really is the first run and has to believe it. This one
     does not: the person is set up, stays set up, and their store, their
     projects and their settings are not touched at any point. What it does is
     open the walk on the hand-off card with `tutorial: true` on it, which is the
     one field that keeps the setup screens off the front and the import card off
     the end (`tutorialRun` and `afterCommand` in ./onboarding.ts).

     AND IT COUNTS AS THE OFFER BEING ANSWERED. Somebody who went and got the
     tutorial themselves has answered the question the new project card would
     have asked them, and asking it afterwards is the nagging she rejects.
  */
  const startTutorial = useCallback((product: string | null) => {
    rememberOffered(localStorage);
    setOffer(null);
    closeWhatFloats(); // see `walkAgain` above
    setFocused(null);
    setView('inbox');
    sawPalette.current = false;
    // The next tick, for the same reason `walkAgain` uses one: the palette
    // handles the Return that started this on the way down, and the hand-off
    // card's own Return listener would otherwise catch the very press that
    // opened it. Measured on 2026-08-23; see the note on `walkAgain`.
    setTimeout(() => setRun(tutorialRun(product)), 0);
  }, [closeWhatFloats]);

  // THE EMPTY INBOX USED TO BE HELD FOR FOUR SECONDS HERE, behind a card that
  // said "This is inbox zero. Get back here every day. She is right, so
  // clearing the three goes straight on to ⌘K and there is nothing to hold.

  // AND ⌘K IS BEAT NINE, NOT THE FIRST THING. It asks her to open the palette
  // herself.
  //
  // IT USED TO END RIGHT THERE, AND THAT IS WHAT SHE OBJECTED TO.The card and
  // the dots used to disappear the instant the palette opened, so the walk had
  // no end, it just stopped happening while she was looking at something else.
  const sawPalette = useRef(false);
  useEffect(() => {
    if (run?.step !== 'command') return;
    if (modal === 'palette') { sawPalette.current = true; return; }
    if (!sawPalette.current) return;
    // AND THIS IS WHERE THE TWO WALKS PART COMPANY. The onboarding goes on to
    // the import card and the confetti; the tutorial ends here, because the
    // person running it set Agentbox up weeks ago and ⌘K has a row of its own
    // for importing agents. The rule is `afterCommand` in ./onboarding.ts
    // rather than a condition written out here, so it can be tested without a
    // window.
    if (afterCommand(run) === 'end') { finishRun([], { practised: true }); return; }
    setRun((r) => (r ? stepTo(r, 'done') : r));
  }, [run, modal, finishRun]);

  const prevInboxIds = useRef<Set<string>>(new Set());
  const prevAskIds = useRef<Set<string>>(new Set());
  // After resolving an item FROM INSIDE IT, advance to the next one instead of
  // dropping back to the list: processing the inbox is a flow, not a round trip
  // per item. Resolving from the LIST leaves her in the list, which is
  // `advanceAfter` in ./advance and hers on.
  const advanceRef = useRef<Advance | null>(null);
  // The grace window: an action is held for a few seconds before anything is
  // written; Z inside the window cancels it completely. Short on purpose: a
  // stray agent start is cheap, unlike a stray email.
  const UNDO_GRACE_MS = 3000;
  const pendingRef = useRef<{
    item: WorkItem;
    timer: ReturnType<typeof setTimeout>;
    run: () => Promise<void>;
    // What to give back if this one is undone. A reply hands the user's words
    // to the composer again; an approval has nothing of theirs to return.
    restore?: () => Restored;
  } | null>(null);

  const flushPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    await pending.run();
    setPendingId(null);
    await refreshRef.current?.();
  }, []);

  const refresh = useCallback(async () => setSnap(await api.snapshot()), []);
  const refreshRef = useRef<() => Promise<void>>();
  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
    const off = api.onChanged(refresh);
    const poll = setInterval(refresh, 10_000);
    return () => { off(); clearInterval(poll); };
  }, [refresh]);

  // Dev aid: ?focus=1 opens the first inbox item on load (screenshot runs), and
  // ?panel=0 alongside it drops the panel off that task, which is what her \
  // does and the one state a screenshot otherwise cannot reach. It reads both
  // values rather than only the interesting one, so the URL keeps working the
  // day the default flips back.
  const autoFocused = useRef(false);
  useEffect(() => {
    if (autoFocused.current || !snap) return;
    const previewItem = previewFocus(location.search, snap.items, inbox);
    if (previewItem) {
      autoFocused.current = true;
      setFocused(previewItem);
      const panel = new URLSearchParams(location.search).get('panel');
      if (panel === '1') setPanelUp(true);
      if (panel === '0') setPanelUp(false);
    }
  });

  /* ------------------------------- derived ------------------------------- */
  const now = Date.now();
  // THE SIDEBAR'S CLOCK, ROUNDED DOWN TO THE MINUTE.The panel is redrawn far
  // more often than that — the poll above is every ten seconds and any
  // keystroke re-renders — so the fix cannot be a slower timer, it has to be a
  // clock whose VALUE does not move. Every row's age is measured against this,
  // so the text on the right of the panel is identical for a whole minute no
  // matter how many times it is drawn, and it changes all at once when the
  // minute turns. `agoQuiet` in format.ts is the other half: it says "now"
  // rather than counting seconds.
  const railNow = Math.floor(now / 60_000) * 60_000;
  // ONE ROW WHILE THE WALK IS RUNNING, AND IT IS THE ROW BEING POINTED AT.
  //
  // HERE rather than at the list, because the list is not the only place the
  // others show up. Shot 08-21: with the filter on the drawn list alone, the In
  // progress tab still counted two, and the rail still had "Take the app from idea
  // toward launch" under Active agents. A count and a rail line are the same
  // promise broken more quietly. Everything comes back the moment the walk ends,
  // which is one render later; walkRows in ./onboarding says the rest.
  const items = walkRows(snap?.items ?? [], run);

  /* --------------------- her agents, as rows in her list ------------------- */
  // EVERY CLAUDE CODE AGENT ON HER MACHINE THAT AGENTBOX DID NOT START. They are
  // drawn as ordinary rows because ONE DOOR, ONE LIST is already decided and
  // because a second kind of row is a second thing to learn. They are not work
  // items and never touch a ledger: `id` is `agent:<pid>`, the `agent` field is
  // what every action path checks, and the main process refuses a store write
  // against that id whatever the UI does.
  //
  // THEY ARE ALL IN THE INBOX NOW, and there is no second tab. How many of them
  // is `agentMode` below, which is the user's to set. HOW MUCH OF THE
  // CONVERSATION THE CARD RECALLS: the message it was STARTED with, up to three
  // later ones from the user, and where the thread got to. That is the only
  // shape, one size for every row, so there is no setting to read here any more.
  const agentRows = useMemo(() => {
    const live = (snap?.agents ?? []).filter(agentIsListed);
    return [...live].sort(byRecency).map((a) => {
      const { title, body } = agentRow(a, now);
      return {
        id: `agent:${a.pid}`,
        product: a.product ?? '',
        productName: a.productName ?? whereItRuns(a),
        status: 'open' as const,
        title,
        body,
        kind: 'agent',
        labels: [],
        // A stopped agent is the loudest thing in the list; a quiet one is the
        // quietest. Beyond that they are scored by exactly the rule everything
        // else is scored by, because inventing a second ordering is how the top
        // of the inbox stops meaning what it says. This is also what keeps the
        // thirteen she is sweeping underneath the one that is actually asking.
        priority: asksSomething(a) ? 9 : 1,
        epoch: 0,
        claim: null,
        createdAt: a.startedAt,
        updatedAt: a.lastActiveAt || a.startedAt,
        // THE MOMENT SHE PUT IT OFF UNTIL, in the field every list here already
        // reads, so Scheduled, the focus footer and the way back all work on an
        // agent row without learning a second shape. It is stamped as HERS
        // because it is: only the user can set one, an agent cannot reach
        // it, and `parkedByAgent` would otherwise read an unstamped moment as
        // an agent parking itself and offer her "let it run now" on somebody
        // else's terminal.
        runAt: a.runAt ?? 0,
        ...(a.runAt ? { wrote: { runAt: { ts: a.runAtSetAt ?? a.runAt, source: 'founder' } } } : {}),
        agent: a,
      } as WorkItem;
    });
  }, [snap?.agents, now]);

  // AND NONE OF HER OWN CLAUDE CODE AGENTS EITHER, while the walk is up. These
  // are the rows this rule is actually about, and on a Mac that already has
  // sessions running they are the ones in the way.
  const agentList = useMemo(
    () => walkRows(agentRows.filter((r) => !scope || r.product === scope), run),
    [agentRows, scope, run],
  );

  // HOW MANY OF HER AGENTS THE INBOX TAKES: all of them, only the ones stopped
  // on a question, or none.
  //
  // NONE IS THE DEFAULT NOW: a session started in a terminal is kept separate
  // from the inbox unless the setting says otherwise. The real default is
  // decided once, in main/settings.mjs; this fallback only covers the moment
  // before the first snapshot arrives, and it agrees with it so the inbox
  // cannot flash a row it is about to drop.
  const agentMode = snap?.config?.outsideAgents ?? 'off';

  // When work may next START on an item, whoever deferred it. `runAt` is the
  // durable answer and lives in the ledger; the localStorage map is the OLD
  // snooze, read for one release so nothing she already deferred pops back,
  // never written. The authority for this rule is isDue in
  // shared/work-items.mjs; this is the view's copy of it.
  const dueAt = useCallback((i: WorkItem) => Math.max(i.runAt ?? 0, snoozes[i.id] ?? 0), [snoozes]);

  // When SHE put it away, which is a different question, and the difference is
  // the whole of parkedByAgent in list-rules: a moment an agent wrote brakes
  // workers and never hides a row from her. The rule itself is over there, pure
  // and pinned, so the inbox and Scheduled cannot read it two different ways.
  const hiddenAt = useCallback((i: WorkItem) => hiddenUntil(i, snoozes[i.id] ?? 0), [snoozes]);

  // THE TEAM, as the window reads it: who is signed in, their people, and
  // which projects are shared. Null when nobody is signed in, and then every
  // list below is exactly the single-person app's.
  const team = useMemo(() => teamView(snap?.team, snap?.products ?? []), [snap?.team, snap?.products]);
  // A SHARED ROW IS IN ONE INBOX AT A TIME (shared/team-rules.mjs). A row given
  // to a person is theirs while it is open, whatever its kind, because a task a
  // teammate handed you is waiting on you the moment it arrives. Null means
  // "not a team question", and the inbox's ordinary rules decide.
  const teamInbox = useCallback((i: WorkItem): boolean | null => {
    if (!team) return null;
    const product = team.products.get(i.product);
    if (!isShared(product)) return null;
    if (!inMyInbox(i, product, team.me)) return false;
    return heldByAPerson(i) ? true : null;
  }, [team]);
  // AND IN PROGRESS SHOWS WHAT IS MOVING FOR YOU: your own agents' shared
  // rows, and tasks you gave a teammate. Everyone else's is on the Team page.
  const teamProgress = useCallback((i: WorkItem): boolean => {
    if (!team) return true;
    const product = team.products.get(i.product);
    if (!isShared(product)) return true;
    if (heldByAPerson(i)) return i.assignee !== team.me && (i.createdBy === team.me || (i.people ?? []).includes(team.me!));
    return runnerOf(i, product) === team.me;
  }, [team]);

  // Everything the inbox would show before the thread mask, kept separate
  // because an ACTION needs it too: the rows this list hides are the rows her
  // bulk snooze was leaving behind (maskedAncestors, list-rules). EVERY ROW A
  // SELECTION CAN NAME. `items` is the ledger and agent rows are not in it, so
  // resolving her ticks against the ledger alone dropped them from every bulk
  // action without saying so. THE ROW THAT SAYS HER TASKS ARE NOT RUNNING.
  // Built from the supervisor's own count and the app's own sentences, and
  // shaped as a work item on purpose: from here down the list, the selection,
  // the keys and the reading pane treat it as a task, which is exactly the
  // point. `items` is passed so the opened row can name the
  // tasks rather than count them.
  //
  // AND IT GOES QUIET WHEN SHE CLOSES IT, until the pile changes. `since` is
  // the moment the first of them got stuck, so a new failure gives it a new
  // one and the row comes back; closing it and having it reappear on the next
  // tick would be the app arguing with her.
  const troubleItem = useMemo(() => {
    const t = snap?.supervisor.spawnTrouble;
    if (!t) return null;
    if (troubleClosed === t.since) return null;
    return troubleRow(t, items);
  }, [snap?.supervisor.spawnTrouble, items, troubleClosed]);

  // A NEWER AGENTBOX IS NOT A ROW. It was one until 2026-10-01; it is a card in
  // the sidebar now (components/SidebarUpdate.tsx, w-7a39dace23).

  const selectable = useMemo(
    () => [...items, ...agentRows, ...(troubleItem ? [troubleItem] : [])],
    [items, agentRows, troubleItem],
  );

  const inboxCandidates = useMemo(() => items.filter((i) => {
    if (i.id === pendingId) return false; // action held in the grace window: already sent, as far as the inbox is concerned
    if (i.product && scope && i.product !== scope) return false;
    // The rule itself lives in list-rules.ts, pure and pinned by tests. What
    // is left here is the view's own business: the grace window, the clock,
    // the practice scope.
    const shared = teamInbox(i);
    if (shared === false) return false;
    if (shared === true) return i.status !== 'done' && !(hiddenAt(i) > now);
    return belongsInInbox(i, { deliveredThrough, hiddenUntil: hiddenAt(i), now });
  }), [items, hiddenAt, scope, now, pendingId, teamInbox]);

  // EVERY PLACE SHE CAN SEE A ROW, which is what the thread mask reads. A row
  // that left the inbox because she answered it has not left her: it is in In
  // progress with a worker on it. The mask used to read the inbox alone, so
  // answering the front row of a thread pushed the row behind it back at her,
  // wearing the words it was written with (47 times in 72 hours, measured
  // 2026-08-14). Scheduled counts for the same reason and is the older half of
  // this: a row she deferred is somewhere she can reach it.
  //
  // The union itself is `belongsOnTheRail` in list-rules now, because the
  // sidebar's Active agents panel asks the same question of a row and one of
  // the two copies would have drifted.
  const liveRows = useMemo(() => items.filter((i) => {
    if (i.id === pendingId) return false;  // an action in flight holds nothing hidden
    if (i.product && scope && i.product !== scope) return false;
    return belongsOnTheRail(i, {
      deliveredThrough, hiddenUntil: hiddenAt(i), deferredUntil: dueAt(i), now,
    });
  }), [items, pendingId, scope, dueAt, hiddenAt, deliveredThrough, now]);

  // WHAT MATTERS MOST, ONE COPY, read by every list that claims to be in an
  // order. A product's place in her running order is worth a hundred item
  // points; the item's own priority breaks ties. Same module the supervisor
  // spawns by, because two copies of this is two answers to one question.
  //
  // It is a hook and not a local because In progress needed it too and did not
  // have it. That list sorted by `updatedAt` alone, so it was ordered by which
  // row had been touched most recently and by nothing else, which is the worst
  // possible rule for a list of things WAITING TO BE TOUCHED: a queued row is
  // last touched when it was filed, so the longer it waits the lower it sinks.
  const score = useCallback(
    (i: WorkItem) => productRankScore(snap?.supervisor.productOrder ?? [], i.product) + itemPriority(i),
    [snap?.supervisor.productOrder],
  );

  const inbox = useMemo(() => {
    const candidates = inboxCandidates;
    // One thread, one row. A blocked/waiting parent whose child ask is alive is
    // represented BY that child (which carries the parent as origin); showing
    // both is how one query becomes two confusing inbox items. The rule itself
    // is threadMasked in list-rules, pinned there against her real store.
    const masked = threadMasked(candidates, liveRows);
    const hasChildHere = (id: string) => masked.has(id);
    // Priority order, the same score the supervisor spawns by, from the same
    // module (`score` above): a product's place in the user's running order
    // is worth a hundred item points, the item's own priority breaks ties,
    // recency after that. The inbox reads top-down as "what matters most", not
    // "what arrived last". The formula lived here AND in
    // the supervisor until 2026-08-06; two copies of that is two answers.
    // HER AGENTS ARE IN THIS LIST AND IN NO OTHER. An agent stopped on a
    // question is an interruption like any other and sorts like one; a quiet one
    // carries priority 1, so the whole sweep sits underneath everything that is
    // actually asking her something rather than on top of it.
    const asking = agentList.filter((r) => r.id !== pendingId && r.agent && reachesInbox(r.agent, now, agentMode));
    const rows = [...candidates.filter((i) => !hasChildHere(i.id)), ...asking]
      .sort(byRunningOrder(score));
    // AND ABOVE ALL OF THEM, WHEN NOTHING IS RUNNING, THE ROW THAT SAYS SO.
    //
    // It is first rather than scored, and that is the one thing about it that
    // is not the ordinary rule. Everything under it is one product's work and
    // sorts by her order over her products; this is about all of them at once,
    // and a row saying nothing has started anywhere for twenty minutes is not
    // improved by being third.
    //
    // AND UNDER IT, THE NEW VERSION. Same reasoning and one step quieter: it is
    // about the app rather than about any one product, so her running order
    // over her products has no opinion about where it goes, and scoring it
    // against rows that DO have a product would put it somewhere meaningless.
    // It is above them rather than below because that is the approved
    // drawing, and it is one E away from gone for that version,
    // which is the difference between this and a banner. AND UNDER THOSE TWO, A
    // CONVERSATION SHE HAS JUST IMPORTED.
    //
    // It is lifted out of the scored block rather than scored higher, and
    // `justImported` in import-row.ts carries the measurement and the reason:
    // the score is her order over her PROJECTS, and an import belongs to the
    // project whose folder it ran in, which can sit far down the order, so the
    // import sorted near the bottom of the open rows. Lifting it is
    // the only move that does not require re-ranking a project to fix a row.
    //
    // It sits under the two above because those are alarms about the whole
    // app, and it comes back down the moment she opens it.
    const fresh = rows.filter((i) => justImported(i, seen));
    const rest = fresh.length ? rows.filter((i) => !justImported(i, seen)) : rows;
    // AND UNDER ALL THREE, EVERYTHING SHE MARKED URGENT, LIFTED OUT OF THE
    // SCORED BLOCK (w-bba20a03f5), picked out of five: urgent items are lifted
    // to the top under their own label.
    //
    // IT HAS TO BE A LIFT AND NOT A HIGHER SCORE, for the reason the import
    // above is one. The score is her order over her PROJECTS and a place in
    // that order is worth a hundred item points (RANK_STEP, shared/rank.mjs),
    // so an urgent row on her fifth project sits below an ordinary row on her
    // first, and no number she can put on one item ever changes that. That is
    // why this row exists: higher priority tasks were easy to miss.
    //
    // WHAT IT COSTS, said plainly because it was known before it was picked:
    // an urgent row leaves the running order, so a Sunday one sits above
    // something filed ten minutes ago. Inside the lifted block the ordinary
    // order still holds, because `rows` is already sorted and filter keeps it.
    const urgent = rest.filter(isUrgentRow);
    const ordinary = urgent.length ? rest.filter((i) => !isUrgentRow(i)) : rest;
    const top = [...(troubleItem ? [troubleItem] : []), ...fresh];
    return [...top, ...urgent, ...ordinary];
  }, [inboxCandidates, liveRows, agentList, agentMode, score, now, pendingId, troubleItem, seen]);

  // BEAT EIGHT ENDS WHEN THE INBOX IS EMPTY, and both ways of ending a task get
  // there: closing one takes it out of the list, and replying to one puts her
  // word on it, which is the same thing to a list that only holds what is
  // waiting on her. That is exactly the sentence on the card.
  //
  // AND IT GOES STRAIGHT ON TO ⌘K. There was a card in between saying she was
  // at inbox zero, which read as the end of the walk with two beats still to
  // come, so it is deleted rather than reworded.
  //
  // IT WATCHES THE DRAWN LIST, NOT THE STORE. Every action here is held for
  // three seconds so Z can take it back, and the store does not move until that
  // window closes. Read off the store, the card would still be saying "clear
  // them" for three seconds after the last row left the screen.
  useEffect(() => {
    if (run?.step !== 'clear') return;
    // THE TWO FINISHED ONES ONLY. The third is the agent that is stopped, and
    // the beat after this one is entirely about not closing it. If somebody
    // closes it anyway the row leaves the inbox and `inboxCleared` below still
    // ends the walk's list beats, so nobody is ever stranded pointing at a row
    // that is not there.
    if (!finishedCleared(inbox, run, WAITING_AT, LATER_AT)) return;
    setRun((r) => (r ? stepTo(r, 'snooze') : r));
  }, [inbox, run?.step, run?.examples.join('|')]);

  // AND BEAT FOURTEEN ENDS WHEN THE ROW THAT IS NOT FOR TODAY LEAVES THE INBOX.
  // Snoozing is what takes it out; closing it would too, and that is on
  // purpose, for the same reason `finishedCleared` tolerates a row cleared out
  // of order. Nobody is ever left reading a card about a row that is gone.
  useEffect(() => {
    if (run?.step !== 'snooze') return;
    if (!laterCleared(inbox, run, LATER_AT)) return;
    setRun((r) => (r ? stepTo(r, 'unblock') : r));
  }, [inbox, run?.step, run?.examples.join('|')]);

  // AND BEAT FOURTEEN ENDS WHEN THE STOPPED ROW LEAVES THE INBOX, which is what
  // answering it does: an answered question is In progress
  // (`belongsInProgress`), so it goes off the list and stays on the rail under
  // Active agents. That is the last frame of the walk, and it is the lesson —
  // nothing waiting on her, one agent running — drawn by the app's own rules
  // rather than claimed on a card.
  useEffect(() => {
    if (run?.step !== 'unblock') return;
    if (!inboxCleared(inbox, run)) return;
    setRun((r) => (r ? stepTo(r, 'where') : r));
  }, [inbox, run?.step, run?.examples.join('|')]);



  // Every list of products the user picks from reads in their running order.
  // Anything she has never placed follows it, alphabetically, so a brand new
  // product is findable instead of appearing wherever the store listed it.
  const rankedProducts = useMemo(() => {
    const order = snap?.supervisor.productOrder ?? [];
    const list = snap?.products ?? [];
    const placed = order
      .map((slug) => list.find((p) => p.slug === slug))
      .filter((p): p is NonNullable<typeof p> => !!p);
    const rest = list
      .filter((p) => !order.includes(p.slug))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...placed, ...rest];
  }, [snap?.products, snap?.supervisor.productOrder]);

  // AND THE REMEMBERED PROJECT IS NEVER A PRACTICE ONE ONCE THE WALK IS OVER.
  // `finishRun` hands the slot back to her own project at the end, which fixes
  // it going forward; this is the other half, for every install where it is
  // already wrong. That is anybody who quit
  // the walk halfway, closed the app in the middle of it, or walked it before
  // the hand-back existed — none of those ever reach `finishRun` at all.
  //
  // GATED ON THERE BEING NO WALK, because during one the slot is SUPPOSED to say
  // Practice: that is what makes the compose card at beat nine file the task
  // into the practice project rather than into her real work.
  //
  // It writes at most once per install, and only when the slot is wrong; a
  // remembered project that is merely missing is left alone (see
  // ./compose-project.ts for why).
  useEffect(() => {
    if (run || !snap) return;
    const slug = rememberedProject();
    if (!practiceRemembered(snap.products, slug, { practiceSlug: PRACTICE_SLUG })) return;
    rememberProject(null);
  }, [run, snap?.products]);

  // In progress is a promise that a worker is on this or about to be, so what
  // it may never hold is a row whose moment has not come. The rule is stated
  // once in list-rules, because a list being WRONG here has no symptom except
  // her waiting on work nothing was going to start. AND AN AGENT SHE HAS
  // REPLIED TO IS IN IT.An agent row had never been in any list but the inbox,
  // so the user's words went into somebody's terminal and their own screen was identical
  // afterwards. The rule is `progressAfterReply` in shared/agents.mjs and it is
  // the same promise this list makes about everything else in it: something is
  // on this right now. It ends when the session stops, and the row is back here
  // in the inbox — the two rules read the one fact, because "one row, two tabs"
  // is the failure this app has already had.
  //
  // ONLY A ROW SHE SPOKE TO. Do not rebuild that; this is not it.
  const progress = useMemo(() => [
    ...items.filter((i) => {
      if (scope && i.product !== scope) return false;
      const deferredUntil = dueAt(i);
      // The grace window: the write waits for Z, the signal must not, because a
      // sent thing still sitting in the inbox reads as not sent. A deferred row
      // is the exception, and it has somewhere to be: Scheduled.
      if (i.id === pendingId && deferredUntil <= now) return true;
      if (!teamProgress(i)) return false;
      // A MESSAGE IS NEVER RUNNING. Nothing is working on it; it waits on a
      // person, and the two persona tests both read "Running" there as an
      // agent at work. It shows in Needs you when it is yours to answer, and
      // under All otherwise.
      if (isDirect(snap?.products.find((p) => p.slug === i.product))) return false;
      // A task you gave a teammate is moving, for you, until it is done.
      if (team && heldByAPerson(i) && isShared(team.products.get(i.product))) return i.status !== 'done';
      return belongsInProgress(i, { deferredUntil, now });
    }),
    ...agentList.filter((r) => r.agent && progressAfterReply(r.agent, now, agentMode)),
    // IN THE ORDER THEY WILL RUN IN, which is the one thing this list is for.
    // It sorted by `updatedAt` alone until 2026-08-20, so it read as "most
    // recently touched", and a row waiting its turn is by definition the least
    // recently touched thing in it: the longer her Urgent task went unstarted,
    // the further it sank. She filed with a screenshot of exactly that, an
    // Urgent row at the very bottom still saying "queued".
    //
    // Same score as the inbox and as the supervisor, so the top of this list is
    // what the fleet takes next. Recency only breaks a tie now.
  ].sort(byRunningOrder(score)),
  [items, agentList, agentMode, scope, pendingId, dueAt, score, now, team, teamProgress]);

  // NOT A ROW THAT STILL NEEDS HER (2026-10-01): an agent's done on her own
  // thread waits in Needs you until she closes it, and Done counted it too,
  // so the tabs read "DONE 2 · ALL 2" with two rows still needing her.
  const done = useMemo(() => {
    const needsYou = new Set(inbox.map((i) => i.id));
    return items.filter((i) => i.status === 'done' && (!scope || i.product === scope) && !needsYou.has(i.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items, scope, inbox]);

  // Scheduled is the future inbox: everything waiting for its moment, soonest
  // first. The view only exists while something is in it. It holds two things
  // that used to be unrelated and are now one: a row deferred out of the way,
  // and work she scheduled to START later.
  //
  // Both are HERS. A row an agent parked to stop its own respawn loop is not
  // here and never was scheduled in any sense she would recognise; it is in the
  // inbox, which is where an agent downing tools should put it.
  //
  // AN AGENT SHE PUT OFF IS HERE TOO, and since 2026-08-17 this is the ONLY
  // list that holds one while it is deferred: the Your agents tab that used to
  // carry it as well is gone. A row she deferred has to be somewhere she can
  // reach it, or the only way back is waiting for the moment.
  //
  // AND SINCE w-afb66e6661 IT HOLDS A THIRD THING, which is why the tab is
  // called Later: a thread added to Later has no moment at all. It waits for a
  // person, so it sorts after everything with a clock rather than before it.
  const whenShown = useCallback(
    (i: WorkItem) => (notStarted(i) ? Number.MAX_SAFE_INTEGER : hiddenAt(i)),
    [hiddenAt],
  );
  const snoozed = useMemo(() => [
    ...items.filter((i) => (notStarted(i) || hiddenAt(i) > now)
      && i.status !== 'done'
      && (!scope || i.product === scope)),
    ...agentList.filter((r) => (r.runAt ?? 0) > now),
  ].sort((a, b) => whenShown(a) - whenShown(b)), [items, agentList, hiddenAt, whenShown, scope, now]);

  // Repeating tasks. They are RULES, on their own channel, which is why nothing
  // in the item list rules has to know they exist. They are read up here, ahead
  // of the tab order, because they are the other half of what Scheduled holds:
  // a page with nothing deferred in it but a rule that fires every Monday is
  // not an empty page, so the tab has to stay.
  const [repeats, setRepeats] = useState<RepeatRule[]>([]);
  useEffect(() => { api.repeats().then(setRepeats).catch(() => {}); }, [snap?.items?.length, view]);

  // What the Scheduled tab counts, and it is exactly what the page lists.
  const scheduledCount = snoozed.length + repeats.length;

  /**
   * THE ROTATION Tab TAKES, IN ONE PLACE. It was written out inline in the key
   *  handler and the walk's own tour worked out where the next press would land
   *  by itself, which is two copies of one order kept in step by nothing. The
   *  snooze beat put a Scheduled tab on the screen and broke the second copy the
   *  same afternoon: three presses of Tab landed on Closed rather than back on
   *  the inbox, and the walk stood still at the end of its own tour. Caught by
   *  driving it, and fixed by there being one list.
   *
   * It is now the SAME list the sidebar draws (workspaceDestinations), so Tab
   * stops wherever she can see a tab and nowhere else. A rotation that still
   * landed on it would be the September 14 bug from the other end, a stop with
   *  no tab under it instead of a tab with no stop. */
  const tabOrder = useMemo<View[]>(
    () => workspaceDestinations({ scheduledCount, view }).map(([key]) => key as View),
    [scheduledCount, view]);

  // AND BEAT FIFTEEN ENDS WHERE IT STARTED, back on an empty inbox, once every
  // other tab has been seen. It is driven off the tabs actually
  // VISITED rather than off a count of presses: Tab can be held down, and a
  // walk that moved on because three keydowns arrived would leave somebody
  // reading a card about a screen that went past.
  //
  // The set is a ref rather than state because nothing renders off it; what
  // renders is the view, and the view is already state.
  const toured = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (run?.step !== 'where') { toured.current = new Set(); return; }
    if (view !== 'inbox') { toured.current.add(view); return; }
    // EVERY TAB THE APP IS DRAWING, not a list of two written down here. With a
    // row snoozed there are three to see, and the third is where the row she
    // put off went, which is the same lesson as the other two.
    if (tabOrder.some((v) => v !== 'inbox' && !toured.current.has(v))) return;
    setRun((r) => (r ? stepTo(r, 'board') : r));
  }, [view, run?.step, tabOrder]);


  /* --------------------------------- search -------------------------------- */
  // EVERY PROJECT, EVERY TAB, CLOSED INCLUDED. This reads `items`, the whole
  // ledger, and not one of the four lists above: 523 of her 550 tasks are
  // closed, so a search scoped to the tab she happens to be standing on misses
  // almost everything she is looking for. The product filter is deliberately
  // not applied either — "across every project" was the decision, and a chip
  // left up from an hour ago silently hiding results is the failure this whole
  // feature exists to fix.
  //
  // Measured on a real store of 550 tasks: a full scan in 2.2ms. So there
  // is no index, no debounce and no worker, and the list narrows on the
  // keystroke.
  const hits = useMemo(
    () => (search === null ? null : searchItems(items, search)),
    [items, search],
  );
  const searchSummaries = useMemo(
    () => new Map((hits ?? []).map((h) => [h.item.id, h.summary])),
    [hits],
  );
  // THE LIST IS IN MATCH ORDER, and only once she has typed. With the field
  // still blank the list is every task newest first, which is her own reading
  // order and keeps its ordinary day labels; stripping them there would take
  // the headings off a list that has not been ranked at all.
  const ranked = !!search;
  const query = useMemo(() => (search === null ? undefined : parseQuery(search)), [search]);

  const openSearch = useCallback(() => {
    setSearch((s) => {
      if (s !== null) return s;              // already open: never restart her query
      searchReturn.current = { view, selected };
      return '';
    });
    setFocused(null);
    setModal(null);
    setSelected(0);
    // The field is mounted by this same render, so focusing has to wait for it.
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [view, selected]);

  const closeSearch = useCallback(() => {
    setSearch(null);
    const back = searchReturn.current;
    searchReturn.current = null;
    if (back) { setView(back.view); setSelected(back.selected); }
  }, []);

  /*
   * WHAT THE WALK IS POINTING AT RIGHT NOW, worked out once and read in two
     places: the coaching card, which rings the first of these and answers a
     press of its own key aimed anywhere else, and the LIST, which may only
     print the hint for a key that is going to work (w-7fd38422b5, 2026-08-27).
     Two copies of this would be two answers to "which row is the walk about",
     and the row hint disagreeing with the ring is the fault being fixed. */
  const walkBeat = useMemo(
    () => (run ? beatRows(run.step, run, inbox, WAITING_AT, LATER_AT, { opened: !!focused, picking: modal === 'snooze' }) : []),
    [run, inbox, focused, modal],
  );
  // THE KEY THE BEAT ON SCREEN IS ASKING FOR. The app is handed for "how long the
  // task has been running" on purpose: that argument only ever changes the
  // WORDS on the running beat, never the key, and reading the clock here would
  // re-render the list every tick for an answer that cannot move.
  const walkKey = run && COACHED.includes(run.step)
    // `tabs` cannot change the ANSWER here, because every card of the tab tour
    // asks for ⇥ whichever tab is next. It is handed over anyway so that this
    // caller and the card on the screen are asking the same question of the
    // same function, which is the fault was opened about one layer down: two
    // callers, two ideas of what the strip holds.
    ? coach(run.step, 0, { opened: !!focused, view, picking: modal === 'snooze', palette: modal === 'palette', tabs: tabOrder })?.key ?? null
    : null;

  // THE WHOLE BOX, and then the box she is looking at. Her filter
  // (w-aa3fa4cbf0) is applied here and only here, so the menu can count every
  // choice off `wholeBox` while the list shows what is left. The two rows the
  // app makes itself belong to no project and always stay: a broken session or
  // a waiting update is not something a filter should be able to hide. Search
  // ignores the filter, as it has always ignored the product filter, because
  // it reads every project and every tab on purpose.
  // ALL (the team version, approved 2026-10-01): every open thread of yours,
  // whatever it is waiting on, as one list.
  // ALL IS EVERYTHING OPEN, YOUR CONVERSATIONS INCLUDED. A conversation whose
  // turn is the other person's is in no other tab (it is not running and it
  // does not need you), so without this a message you just answered vanished
  // from the Inbox altogether.
  const allOpen = useMemo(() => {
    const seenIds = new Set<string>();
    const talking = items.filter((i) => !i.agent && i.status !== 'done' && isDirect(snap?.products.find((p) => p.slug === i.product)));
    return [...inbox, ...progress, ...snoozed, ...talking].filter((i) => (seenIds.has(i.id) ? false : (seenIds.add(i.id), true)));
  }, [inbox, progress, snoozed, items, snap?.products]);
  const wholeBox = view === 'inbox' ? inbox
    : view === 'snoozed' ? snoozed
      : view === 'progress' ? progress
        : view === 'all' ? allOpen
          : done;
  const shownBox = useMemo(() => filterBox(wholeBox, boxFilter), [wholeBox, boxFilter]);
  // THE DISPLAY MENU'S FILTERS AND SORT, on top of the box (approved
  // 2026-10-01). Remembered per page; the Inbox is a list by default and the
  // Team a board.
  // BOTH HALVES ARE KEPT, and which one the page is on follows the faces
  // (`pageFor`, below). Your own threads open as a list and a page with the
  // team on it opens as a board, which is what the approved design said and
  // what the one page stopped doing.
  const [mineDisplay, setMineDisplayRaw] = useState<Display>(() => readDisplay('inbox'));
  const [teamDisplay, setTeamDisplayRaw] = useState<Display>(() => readDisplay('team'));
  // WHOSE THREADS ARE ON THE PAGE (w-05ff3d1438): the faces at the end of the
  // tab bar. The Inbox and the Team page were one question on two pages; this
  // is the one page, and it opens as yours. Remembered between launches.
  const everyone = useMemo(() => {
    if (!team) return [];
    const people = [...team.byId.values()];
    return team.state.me && !team.byId.has(team.state.me.id) ? [team.state.me, ...people] : people;
  }, [team]);
  const [pickedRaw, setPickedRaw] = useState<string[] | null>(() => readPicked());
  const picked = useMemo(() => normalizePicked(pickedRaw, team?.me ?? null, everyone.map((p) => p.id)), [pickedRaw, team?.me, everyone]);
  const setPicked = useCallback((next: string[]) => { setPickedRaw(next); writePicked(next); setSelected(0); }, []);
  const withOthers = !!team && othersInView(picked, team.me);
  const displayPage = pageFor(withOthers);
  const inboxDisplay = withOthers ? teamDisplay : mineDisplay;
  const setInboxDisplay = useCallback((d: Display) => {
    if (displayPage === 'team') setTeamDisplayRaw(d); else setMineDisplayRaw(d);
    writeDisplay(displayPage, d);
  }, [displayPage]);
  // AND THE TUTORIAL'S BOARD BEAT ENDS WHEN THE BOARD IS REALLY ON THE SCREEN,
  // read off the view the page is drawn in rather than off a click: the press
  // is two deep, inside the View and filters menu, and the beat is about the
  // board rather than about either press that reaches it. It reads the derived
  // `inboxDisplay` rather than either half, so it ends on the board whichever
  // page the walk is standing on.
  useEffect(() => {
    if (run?.step !== 'board' || inboxDisplay.view !== 'board') return;
    setRun((r) => (r ? stepTo(r, 'command') : r));
  }, [run?.step, inboxDisplay.view]);
  // Your own rows are on the page unless you took yourself off it.
  const mineShown = !team || picked.includes(team.me ?? '');
  // The tab goes in too: Done runs newest finished first whatever the sort
  // says (w-c61f5bf497, page-rules.ts).
  const displayedBox = useMemo(
    () => (mineShown ? sortedByDisplay(shownBox.filter((i) => isTroubleRow(i) || isUpdateRow(i) || keepsDisplay(i, inboxDisplay, now)), inboxDisplay, view) : []),
    [shownBox, inboxDisplay, now, mineShown, view],
  );
  // THE PICKED TEAMMATES' THREADS FOR THIS TAB, from the cards their Macs
  // publish, merged into your rows in the Display's order.
  const cards = snap?.team?.cards ?? [];
  const theirRows = useMemo(
    () => (withOthers ? teammateRows(cards, { tab: view, picked, me: team?.me ?? null, display: inboxDisplay, products: snap?.products ?? [], now }) : []),
    [withOthers, cards, view, picked, team?.me, inboxDisplay, snap?.products, now],
  );
  const mixedRows = useMemo(() => (withOthers ? mergeRows(displayedBox, theirRows, view === 'done' ? 'done' : inboxDisplay.sort) : null), [withOthers, displayedBox, theirRows, inboxDisplay.sort, view]);
  // A teammate's thread opens as their card, over the page, and Back returns here.
  const openTeammateCard = useCallback((card: ThreadCard) => { setOpenCard(card); setTeamOpen(true); }, []);
  // HOVERING A FACE SAYS WHAT THEY ARE UP TO (w-0b54ee983f). Her words:
  // "I presumed that if I hovered over or clicked on them, it would show
  // something." These rows are the last faces in the app, so the card the
  // Team board's face chips were going to carry hangs here instead.
  const personCell = useCallback((id: string | null) => {
    const p = id ? team?.byId.get(id) ?? null : null;
    return <FaceHover person={p} me={id === team?.me} now={now}>
      <Face person={p} me={id === team?.me} />{id === team?.me ? 'You' : firstName(p)}
    </FaceHover>;
  }, [team, now]);
  const peoplePicker = team
    ? <PeopleFilter everyone={everyone} picked={picked} me={team.me} onPick={setPicked} />
    : undefined;
  // EACH TAB'S NUMBER COUNTS WHAT THE FILTERS SHOW (w-5a08121f99). It counted
  // the whole tab, so a filter that had emptied Needs you left the tab saying
  // 13 over a page saying "Nothing needs you". A tab's number is a promise
  // about what clicking it shows, and the number a filter is holding back is
  // said in full by the empty state and by the Display menu's "Showing 4 of 7".
  const shownCount = useCallback((rows: WorkItem[]) => rows.filter(
    (i) => isTroubleRow(i) || isUpdateRow(i) || keepsDisplay(i, inboxDisplay, now),
  ).length, [inboxDisplay, now]);
  const theirCount = useCallback((tab: string) => (withOthers
    ? teammateRows(cards, { tab, picked, me: team?.me ?? null, display: inboxDisplay, products: snap?.products ?? [], now }).length : 0),
  [withOthers, cards, picked, team?.me, snap?.products, now, inboxDisplay]);
  // WHAT THE FILTERS ARE HOLDING BACK on the tab she is standing on, which is
  // only ever read where the page is otherwise empty: then every row of the tab
  // is a row a filter took away.
  const hiddenNow = (mineShown ? shownBox.length : 0) + (withOthers
    ? teammateRows(cards, { tab: view, picked, me: team?.me ?? null, display: DEFAULT_DISPLAY.inbox, products: snap?.products ?? [], now }).length : 0);
  // THE TABS A PRESS OF TAB MOVES ALONG: the list the bar is drawing, so there
  // is no second copy of the order to fall out of step with it.
  const stateTabOrder = useMemo(() => INBOX_TABS.map((t) => t.view), []);
  // The inbox as she sees it, whichever tab is up: her filter AND her display
  // menu. Finishing a task from inside it advances through THIS, never the
  // whole inbox, or the next task opened can be one she has hidden
  // (w-27759abd33).
  const shownInbox = useMemo(
    () => sortedByDisplay(filterBox(inbox, boxFilter).filter((i) => isTroubleRow(i) || isUpdateRow(i) || keepsDisplay(i, inboxDisplay, now)), inboxDisplay),
    [inbox, boxFilter, inboxDisplay, now],
  );
  const boxFilterMenu = useMemo(
    () => (modal === 'filter' ? filterMenu(wholeBox.filter((i) => !isTroubleRow(i) && !isUpdateRow(i)), boxFilter, snap?.products ?? []) : null),
    [modal, wholeBox, boxFilter, snap?.products],
  );
  // AND THAT ROW READS AS WORKING, because it is: the app itself is reading the
  // folder. There is no session behind it, so the supervisor cannot report one,
  // and the alternative is the word she saw and reported, which was "queued"
  // under a sentence saying it was running. The row it applies to is the walk's
  // own and no other.
  const runningRows = useMemo(() => {
    const real = snap?.supervisor.running ?? [];
    if (run?.step !== 'working' || !run.item) return real;
    return [{ itemId: run.item, product: run.product ?? '', startedAt: run.sentAt ?? Date.now(), tail: [] }, ...real];
  }, [snap?.supervisor.running, run?.step, run?.item, run?.product, run?.sentAt]);
  // THE THREADS AN AGENT IS ON RIGHT NOW: the turning mark (threads/Pages.tsx).
  const liveIds = useMemo(() => new Set(runningRows.map((r) => r.itemId)), [runningRows]);
  // ONE RULE FOR WHERE A THREAD SITS, THE TABS' OWN (2026-10-01: the board
  // said Running for queued work the tab did not). Needs you wins, then
  // In progress, Scheduled and Done, exactly as the tabs list them.
  const tabState = useMemo(() => {
    const m = new Map<string, ThreadStateWord>();
    for (const i of done) m.set(i.id, 'done');
    for (const i of snoozed) m.set(i.id, 'scheduled');
    for (const i of progress) m.set(i.id, 'running');
    for (const i of inbox) m.set(i.id, 'waiting');
    return m;
  }, [inbox, progress, snoozed, done]);
  const stateOfMine = useCallback((i: WorkItem) => tabState.get(i.id) ?? null, [tabState]);
  // J AND K WALK WHAT IS ON THE SCREEN. On the board that is the board's own
  // reading order, down each column and on to the next (`boardColumns`, the
  // same call InboxBoard draws). Walking the tab's list instead stopped J
  // halfway down a full board, because a card from another column was not in
  // it (2026-10-02, tests/the-board-walks-in-the-order-it-is-drawn.test.mjs).
  const onBoard = search === null && inboxDisplay.view === 'board';
  const boardOrder = useMemo(
    () => (onBoard ? boardWalk(boardColumns({ items, products: snap?.products ?? [], display: inboxDisplay, now, stateOf: stateOfMine, cards, picked: team ? picked : undefined, me: team?.me ?? null, since: team?.state.since ?? null, live: liveIds })) : null),
    [onBoard, items, snap?.products, inboxDisplay, now, stateOfMine, cards, team, picked, liveIds],
  );
  const list = search !== null ? (hits ?? []).map((h) => h.item) : boardOrder ?? displayedBox;

  const current: WorkItem | undefined = list[Math.min(selected, Math.max(0, list.length - 1))];
  // THE ROW THE ROW-KEYS ACT ON. The pointer's row when it is on one, and the
  // keyboard's row otherwise. This is the half of that is not a drawing: the
  // hint is printed on the row under the pointer, so pressing the key it
  // prints has to happen to THAT row. A ticked selection outranks both,
  // because E over ticks is the batch close and no per-row hint is drawn then.
  const pointed: WorkItem | undefined =
    (hoveredId && !multiSel.size ? list.find((i) => i.id === hoveredId) : undefined) ?? current;

  /* ------------------------- a panel with a panel in it -------------------- */
  // NO HAIRLINE WITHOUT A SIDEBAR BEHIND IT.
  //
  // The rail answers a question about a PROJECT, and one of her Claude Code
  // sessions running in a folder no project points at has none. It was drawing
  // itself anyway as an empty 364px column, and in full screen that column
  // carries the border-left, so the app drew the divider, paid the width, and
  // put nothing between them.
  //
  // Both halves have to go, not just the aside: `panel-up` is what pushes the
  // reading column right to sit off the hairline, so dropping the panel while
  // leaving the class shifts the text across the window for no reason. Full
  // screen only. In the list the rail carries no line and costs no reflow, and
  // collapsing it as the cursor crosses a row would resize the list under her.
  // THE DOCUMENT SHE HAS OPEN BESIDE THE MESSAGE, and how much of the window
  // it takes. The pane belongs to the task: leaving the task closes it, which
  // is why this is cleared below rather than carried around the app.
  const [openDoc, setOpenDoc] = useState<OpenDoc | null>(null);
  const [artifactPreviewSample, setArtifactPreviewSample] = useState(new URLSearchParams(location.search).has('reviewLab') ? 'code' : 'multiple');
  const [reviewStyle,setReviewStyle] = useState('header-tools-open');
  const [focusControlStyle,setFocusControlStyle] = useState<FocusControlStyle>('corners-bare');
  const [textReviewStyle,setTextReviewStyle] = useState('glass');
  const reviewLab = reviewLabEnabled(api.isFixtures,location.search);
  // The four code treatments this used to choose between are deleted from
  // direct-review.css, so the lab's picker for them went with them. The
  // attribute stays because the review card in the conversation and the text
  // artifact are still drawn off it.
  useEffect(()=>{document.documentElement.dataset.codeReview='glass';return()=>{delete document.documentElement.dataset.codeReview;};},[]);
  useEffect(()=>{document.documentElement.dataset.textReview=reviewLab ? textReviewStyle : 'glass';return()=>{delete document.documentElement.dataset.textReview;};},[reviewLab,textReviewStyle]);
  const reviewLabStarted=useRef(false);
  useEffect(()=>{if(reviewLab && snap && !reviewLabStarted.current){const row=snap.items.find(i=>i.id==='w-n13');if(row){reviewLabStarted.current=true;setFocused(row);}}},[reviewLab,snap]);
  useEffect(()=>{document.documentElement.dataset.reviewStyle=reviewLab ? reviewStyle : 'header-tools-open';},[reviewLab,reviewStyle]);
  const [artifactMode, setArtifactMode] = useState<ArtifactMode>('beside');
  const [artifactReturnBeside, setArtifactReturnBeside] = useState(false);
  /**
   * THE SIDEBAR GETS OUT OF THE WAY IN FULL SCREEN AND COMES BACK AS IT WAS.
   *
   * IT WATCHES `artifactMode` AND NOT THE LAID-OUT `artifactView`. They differ
   * on a narrow window, where `artifactPlacement` turns a beside preview into a
   * focus one by itself; that is the layout coping, not her asking for the
   * whole window, and collapsing her sidebar because she dragged the window in
   * would be a second thing she never asked for.
   *
   * `panelUp` is deliberately not a dependency.
   */
  useEffect(() => {
    if (!!openDoc && artifactMode === 'focus') {
      if (panelBeforeFullScreen.current === null && panelUpNow.current) {
        panelBeforeFullScreen.current = true;
        setPanelUp(false);
      }
      return;
    }
    if (panelBeforeFullScreen.current !== null) {
      const back = panelBeforeFullScreen.current;
      panelBeforeFullScreen.current = null;
      setPanelUp(back);
    }
  }, [openDoc, artifactMode]);

  /**
   * FULL SCREEN, AND THE TWO THINGS THAT RIDE ON TOP OF IT.
   *
   * `fullScreenDoc` is the one condition both of them hang off: a document
   * open AND the mode she chose, not the laid-out view, for the same reason
   * the sidebar above watches the mode. See full-screen-chrome.ts for why the
   * marks wake on a corner rather than on mousemove.
   */
  const fullScreenDoc = !!openDoc && artifactMode === 'focus';

  /**
   * CLICKING AWAY FROM THE REPLY BOX FOLDS IT BACK, UNDER A FULL SCREEN
   * DOCUMENT ONLY.
   *
   * It is scoped to full screen because that is the only place the box sits
   * over something she is reading. Beside a conversation the composer has its
   * own column, and closing it on a stray click would throw her out of a reply
   * she is in the middle of. Nothing is lost either way: the draft is kept and
   * the folded pill says so (folded-reply.ts).
   *
   * TWO LISTENERS, AND THE SECOND ONE IS THE IMPORTANT ONE. `mousedown` covers
   * our own chrome, the sidebar and the marks. It does NOT cover the page,
   * because the document is an iframe and a click inside it never reaches this
   * document at all, which is the same wall the floating marks ran into. What a
   * click into a frame DOES do is blur this window while leaving that frame as
   * `document.activeElement`, and that pair is the signal. A window blur alone
   * is not enough: switching applications fires one too, and folding her box
   * away because she looked at Slack would be its own bug.
   */
  useEffect(() => {
    if (!fullScreenDoc || modal !== 'reply') return;
    const foldBack = () => setModal(null);
    const awayInTheApp = (e: MouseEvent) => {
      const at = e.target as HTMLElement | null;
      if (at?.closest?.('.focus-dock')) return;
      foldBack();
    };
    const intoThePage = () => {
      if ((document.activeElement as HTMLElement | null)?.tagName === 'IFRAME') foldBack();
    };
    document.addEventListener('mousedown', awayInTheApp);
    window.addEventListener('blur', intoThePage);
    return () => {
      document.removeEventListener('mousedown', awayInTheApp);
      window.removeEventListener('blur', intoThePage);
    };
  }, [fullScreenDoc, modal]);

  const [chromeAwake, setChromeAwake] = useState(false);
  const [chromeReaching, setChromeReaching] = useState(false);
  const chromeTimer = useRef<number | null>(null);
  const wakeChrome = useCallback(() => {
    setChromeAwake(true);
    if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setChromeAwake(false), CHROME_HOLD);
  }, []);
  useEffect(() => {
    if (!fullScreenDoc) { setChromeAwake(false); setChromeReaching(false); return; }
    // Our own chrome only. Over the document itself the pointer is inside an
    // iframe and this listener hears nothing, which is what the reach is for.
    //
    // REACHING IS READ OFF THE POINTER'S TARGET rather than off enter and
    // leave handlers on the reach. It used to be the handlers, and the reach
    // had to lie over the marks for them to fire, which is what stopped every
    // one of the marks working. Now the reach sits UNDER them and this asks
    // where the pointer is: over either, she is reaching.
    const moved = (e: MouseEvent) => {
      wakeChrome();
      setChromeReaching(!!(e.target as HTMLElement | null)?.closest?.('.doc-marks, .chrome-reach'));
    };
    const gone = () => setChromeReaching(false);
    window.addEventListener('mousemove', moved);
    window.addEventListener('blur', gone);
    return () => {
      window.removeEventListener('mousemove', moved);
      window.removeEventListener('blur', gone);
      if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    };
  }, [fullScreenDoc, wakeChrome]);
  const chromeUp = chromeIsUp({ reaching: chromeReaching, awake: chromeAwake });

  const previewTreatment = 'margin-left';
  const [designToolbar, setDesignToolbar] = useState('corner');
  const toolbarExploration = api.isFixtures && new URLSearchParams(location.search).has('artifactTweaks');
  const closeArtifact = () => {
    if (artifactMode === 'focus' && artifactReturnBeside) setArtifactMode('beside');
    else setOpenDoc(null);
  };
  const [artifactBody, setArtifactBody] = useState<HTMLDivElement | null>(null);
  const [artifactWidth, setArtifactWidth] = useState(1000);
  useEffect(() => {
    if (!artifactBody) return;
    const observer = new ResizeObserver(([entry]) => setArtifactWidth(entry.contentRect.width));
    observer.observe(artifactBody);
    return () => observer.disconnect();
  }, [artifactBody]);

  // HOW MUCH OF THE WINDOW THE FILE TAKES. three quarters, no line down the
  // middle, still resizable. The opening fraction and the floors it moves
  // between are all in doc-pane.ts, and readSplit already prefers whatever she
  // dragged it to last, so there is one read here and no layout to branch on
  // any more.
  const [split, setSplit] = useState<number>(() => readSplit(window.localStorage));
  // The folders the open document's own product owns, so the breadcrumb reads
  // "astral › designs ›" and not the account plumbing above it. The same list
  // main/artifact-path.mjs guesses against.
  const docRoots = useMemo(() => {
    const prod = snap?.products.find((p) => p.slug === openDoc?.product) ?? null;
    if (!prod) return [];
    return [prod.dir, prod.dir && `${prod.dir}/designs`, prod.dir && `${prod.dir}/attachments`,
      prod.repoPath, prod.repoPath && `${prod.repoPath}/designs`].filter(Boolean) as string[];
  }, [snap?.products, openDoc?.product]);

  const resizeDoc = useCallback((fraction: number) => {
    setSplit(fraction);
    writeSplit(window.localStorage, fraction);
  }, []);

  // ESCAPE, ARRIVING FROM INSIDE THE OPEN FILE.
  //
  // The key never reaches the window listener below from inside the pane: the
  // page there is its own document in its own origin, and a keydown does not
  // cross that line. Main hears it under the page and hands it here
  // (before-input-event, main/main.mjs).
  //
  // ANSWERED ONCE, NEVER TWICE. Main forwards only from a frame, and this
  // refuses anything that arrives while the app's own page holds the keyboard,
  // so the ordinary escape below is the only one that runs when she is reading
  // the message. The frame is blurred before the pane goes, or the keyboard is
  // left in a document that is no longer on the screen and the NEXT escape is
  // stuck the same way.
  //
  // ⌘K ARRIVES THE SAME WAY NOW, because it was dead from inside a page for
  // exactly the reason above and nothing forwarded it. The frame is blurred
  // before the palette opens, or the palette is on the screen with the keyboard
  // still in the page and every letter she types goes into the file instead of
  // into the palette's field.
  useEffect(() => {
    const off = (window.zero as any)?.onKeyInTheFile?.((k: { key: string; meta?: boolean; ctrl?: boolean }) => {
      if (!focusIsInTheFile(document.activeElement)) return;
      const meant = whatTheFileSentUp(k);
      if (meant === 'close') {
        if (!escapeInTheFileClosesIt(openDoc)) return;
        (document.activeElement as HTMLElement | null)?.blur?.();
        setOpenDoc(null);
        return;
      }
      if (meant === 'palette') {
        (document.activeElement as HTMLElement | null)?.blur?.();
        setModal((m) => (m === 'palette' ? null : 'palette'));
        return;
      }
      // HER LETTERS, HANDED STRAIGHT BACK TO THE APP. Main only sends these up
      // out of a PAGE, and only when the page is not itself taking text, so by
      // the time one arrives here it is certain there was nothing to type.
      //
      // IT IS REPLAYED RATHER THAN RE-IMPLEMENTED, and that is the whole point.
      // E archives, J and K walk the inbox, R replies, S schedules, and every
      // guard in front of them — an open rule screen, a modal, her multi-selection — is the one that already exists
      // twenty lines below. Restating what a letter means in a second place is
      // how S came to mean two things at once (renderer/src/keys.ts carries
      // that story), and there is no version of this worth that.
      //
      // The frame is blurred FIRST, for the reason the palette is: the app is
      // about to act on the card this page belongs to, and acting while the
      // keyboard is still down inside a file that is about to be replaced is
      // the bug at the top of this comment wearing its other face.
      if (meant === 'app') {
        (document.activeElement as HTMLElement | null)?.blur?.();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k.key, bubbles: true }));
      }
    }) ?? (() => {});
    return off;
  }, [openDoc]);

  const railItem = (inFullScreen ? focused : current) ?? current ?? null;
  const railProduct = snap?.products.find((p) => p.slug === railItem?.product) ?? null;
  // AND THE PANEL IS DOWN WHILE A DOCUMENT IS OPEN. The split is even, half
  // the window each, and the panel is 364px of the half the message is in: at
  // 1440 that leaves the words 356px, which is not a reading column. The
  // chosen drawing has no panel in it for the same reason (B-1920.png,
  // designs//pane/). Both halves go, the aside AND the class, or the reading
  // column keeps paying padding for a panel that is not drawn.
  const panelShown = false; // The project rail is retired on every screen.

  // THE PANE BELONGS TO THE TASK. Closing the row, or opening another one,
  // takes the document with it: a file left open beside a different message is
  // a window that no longer says what it is about.
  //
  // Which file that is, and the count behind the rule, is
  // message-artifacts.ts.
  //
  // EVERY CANDIDATE IS RESOLVED BEFORE IT IS OPENED, never opened hopefully. A
  // worker names a path that is not on disk often enough, and auto-opening one
  // would hand her half a window reading "That file could not be found" on a
  // card she never asked to open anything on. The first that really resolves
  // wins; if none does the pane simply stays shut.
  //
  // The run's own trace is only read when the card's WORDS named nothing that
  // opened, so the ordinary card costs no extra call. THE DOCUMENT THE RELOAD
  // HAS TO PUT BACK. The effect below opens the first document a card names,
  // which is right the moment she opens the card and wrong the moment ⌘R puts
  // her back on one: she may have opened a different one herself, or closed
  // the pane, and choosing again for her would be the app overruling a
  // decision it is meant to be remembering. So the restore leaves the pane it
  // wants here, and the effect honours it once. `doc: null` inside it is a
  // real answer and not an absent one: a pane she closed herself stays closed
  // through the reload.
  const pendingDoc = useRef<{ id: string; doc: OpenDoc | null } | null>(null);
  useEffect(() => {
    setOpenDoc(null);
    const card = focused;
    if (!card) return;
    const wanted = pendingDoc.current;
    pendingDoc.current = null;
    if (wanted && wanted.id === card.id) { if (!workspaceNavigation || !wanted.doc?.auto) setOpenDoc(wanted.doc); return; }
    // The conversation opens first. Artifacts open only when requested.
    if (workspaceNavigation) return;
    let live = true;
    const prod = snap?.products.find((p) => p.slug === card.product) ?? null;
    const roots = prod
      ? [prod.dir, `${prod.dir}/designs`, `${prod.dir}/attachments`, prod.repoPath, prod.repoPath && `${prod.repoPath}/designs`]
      : [];
    const firstThatResolves = async (paths: string[]) => {
      for (const src of paths.slice(0, 8)) {
        const r = await api.resolveDoc({ product: card.product, src });
        if (!live) return null;
        if (r?.ok && r.opened) return src;
      }
      return null;
    };
    (async () => {
      let src = await firstThatResolves(documentCandidates(card, [], prod?.dir ?? null));
      if (!live) return;
      if (!src) {
        const trace = await api.sessionTrace({ product: card.product, id: card.id }).catch(() => null);
        if (!live) return;
        const made = filesFromRuns(trace?.sessions ?? [], roots);
        src = await firstThatResolves(documentCandidates(card, made, prod?.dir ?? null));
      }
      if (!live || !src) return;
      setOpenDoc({ product: card.product, src, auto: true });
    })().catch(() => { /* the pane simply stays shut */ });
    return () => { live = false; };
    // The task she opened, not every edit to it: a worker writing a checkpoint
    // while she reads must not push a document back over a pane she closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id, focused?.product]);

  /* --------------------------- arrival side-effects ----------------------- */
  // WHAT ARRIVED, not what to say about it. This page owns the definition of
  // "news" (it is the only place that knows what the inbox is), and it owns
  // nothing else about the banner: whether she is looking at the window is a
  // fact only the main process can see, so main/notify.mjs decides whether to
  // speak, rolls a burst into one line, and takes it down when she comes back.
  //
  // A frozen worker travels the same road. An approval card is an agent
  // stopped mid-run with her as the only way forward, and the ask expires, so
  // it is the arrival that most deserves to reach her in another app — and
  // before this it was the one arrival that never notified at all.
  useEffect(() => {
    if (!snap) return;
    const ids = new Set(inbox.map((i) => i.id));
    const first = prevInboxIds.current.size === 0;
    const fresh = first ? [] : inbox.filter((i) => !prevInboxIds.current.has(i.id));
    prevInboxIds.current = ids;
    window.zero?.badge?.(inbox.length);

    const askIds = new Set((snap.approvals ?? []).map((a) => a.id));
    const freshAsks = prevAskIds.current.size === 0 && first
      ? []
      : (snap.approvals ?? []).filter((a) => !prevAskIds.current.has(a.id));
    prevAskIds.current = askIds;

    const arrivals = [
      ...fresh.map((i) => ({ id: i.id, title: i.title, product: i.product, productName: i.productName, kind: 'item' })),
      ...freshAsks.map((a) => ({
        id: a.id,
        title: String((a.input as any)?.description ?? (a.input as any)?.command ?? a.tool ?? 'a command'),
        product: a.product,
        productName: snap.products.find((p) => p.slug === a.product)?.name ?? a.product,
        kind: 'approval',
      })),
    ];
    if (arrivals.length) window.zero?.notify?.(arrivals);
  }, [snap, inbox]);

  useEffect(() => { setOptionSel(null); }, [focused?.id]);

  /* --------------------------- the answered card -------------------------- */
  // A press is acknowledged for one beat, then the card is gone. Long enough to
  // read as a decision landing, short enough that the queue behind it is never
  // waiting on chrome: she answers these at speed.
  const APPROVAL_EXIT_MS = 420;
  useEffect(() => {
    const off = window.zero?.onApprovalAnswered?.((a) => setAnswered(a)) ?? (() => {});
    return off;
  }, []);
  useEffect(() => {
    if (!answered) return;
    const t = setTimeout(() => setAnswered(null), APPROVAL_EXIT_MS);
    return () => clearTimeout(t);
  }, [answered]);
  // Remember the front card while nothing is leaving, so that when an answer
  // arrives the card it refers to is still in hand.
  useEffect(() => {
    if (!answered) frontApproval.current = snap?.approvals?.[0] ?? null;
  }, [snap?.approvals, answered]);

  // A saved draft is a conversation in progress: opening the item opens the
  // reply dock with it, instead of the draft hiding behind R (drafts already
  // survive restarts in localStorage; this makes that visible).
  //
  // A thread she only pasted a screenshot into is as much an unfinished message
  // as one typed into, so hasDraft weighs the images too.
  useEffect(() => {
    if (!focused) return;
    if (hasDraft(focused)) setModal('reply');
  }, [focused?.id]);

  // A MODAL THAT BELONGS TO A TASK CANNOT OUTLIVE THE TASK, and the reply dock
  // is the only one that does. The rule lives in renderer/src/modal-scope.ts
  // with the whole story, and it is applied to the STATE rather than to each
  // of the four ways out of a task, because fixing the routes you can find is
  // how the next one gets missed.
  useEffect(() => {
    if (!focused) setModal(modalAfterLeavingATask);
  }, [focused]);

  // AND CLICKING NOTHING IS THE OTHER WAY OUT OF THE REPLY BOX.
  //
  // MEASURED FIRST, AND THE CARET WAS NEVER THE PROBLEM
  // (scripts/measure-typing-owns-the-keyboard.mjs, 2026-08-30). A click on an
  // inert part of the window already took the caret out of all three fields.
  // What survived the click is the reply DOCK, and `modal` left at 'reply' is
  // exactly what the guard at the top of the key handler returns on, so the
  // caret sat in the body with every single letter in the app still dead. The
  // panel note and the search field both came back on their own. This is the
  // one box in the app with no backdrop to click, because it is drawn into the
  // card rather than over it.
  //
  // ON NOTHING, AND ONLY ON NOTHING. `.focus-dock` is the whole dock, options
  // strip and slash menu included.
  //
  // THE DRAFT SURVIVES IT, which is what makes folding the honest answer rather
  // than a smaller half-measure. The draft is written on every keystroke and
  // the box comes back carrying it on R or on the next open (drafts.ts), so
  // this costs her exactly what escape on an empty box already costs her.
  useEffect(() => {
    if (modal !== 'reply') return;
    const away = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.(SOMETHING_WITH_A_JOB)) return;
      setModal(null);
      (document.activeElement as HTMLElement | null)?.blur?.();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [modal]);

  useEffect(() => { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-2000))); }, [seen]);
  useEffect(() => { localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozes)); }, [snoozes]);

  /* -------------------------------- actions ------------------------------- */
  const markSeen = useCallback((item: WorkItem) => {
    setSeen((s) => new Set(s).add(item.id));
  }, []);

  // AN URGENT ROW THAT ARRIVES WHILE SHE IS READING TAKES THE SCREEN.
  //
  // Every rule about WHEN this is allowed is in interrupt.ts, pure and tested,
  // because the ways to get it wrong are all quiet: interrupting her mid-reply
  // costs her the words she was typing, and interrupting for a row that was
  // already in the list turns every task she opens into a bounce. What is left
  // here is only the doing of it.
  useEffect(() => {
    const ids = new Set(inbox.map((i) => i.id));
    // The first inbox we ever see is the baseline, not a pile of arrivals.
    if (knownRows.current === null) { knownRows.current = ids; return; }
    const urgent = urgentInterruption({
      reading: focused,
      inbox,
      known: knownRows.current,
      spent: spentInterrupts.current,
      typing: !!modal || search !== null,
    });
    knownRows.current = ids;
    if (!urgent || !focused) return;
    spentInterrupts.current.add(urgent.id);
    setHeldByUrgent(focused);
    setFocused(urgent);
    markSeen(urgent);
  }, [inbox, focused, modal, search, markSeen]);

  // AND BRINGS HER BACK. The other half of the rule, and the reason the
  // first half is allowed to exist at all.
  //
  // Written against the STATE rather than against each of the ways out of a
  // task — Escape, archiving it, resolving it, the close button — because
  // fixing the routes you can find is how the next one gets missed. That is
  // the same reasoning modal-scope.ts is built on, two lines above.
  useEffect(() => {
    if (focused || !heldByUrgent) return;
    const back = taskToReturnTo(heldByUrgent, items);
    setHeldByUrgent(null);
    if (!back) return;
    setFocused(back);
    // Through the ref, because this effect sits beside the interruption it
    // undoes rather than three hundred lines below where the toast is made.
    showToastRef.current?.('Back to what you were reading');
  }, [focused, heldByUrgent, items]);

  /* ------------------ the open row keeps up with the store ----------------- */
  // THE PANE HOLDS A COPY OF THE ROW, AND THE ROW CHANGES UNDER HER.
  //
  // Everything else on this screen is live already: the session, the queue, the
  // thread. The ITEM is not. It is the copy she opened, so a row she stays on
  // while `/usage` runs would draw the words it had before she pressed Enter,
  // for ever, and the answer she stayed to read would be the one thing missing
  // from it.
  //
  // THIS USED TO BE SCOPED TO THE ROW SHE WAS FOLLOWING A COMMAND ON, and that
  // was too narrow by exactly one case: an agent finishing the row she is
  // reading. She was right, and nothing was wrong with the data or the drawing.
  // The rule and what it is gated on are `freshCopy` in ./stay-with-a-command,
  // so it can be tested without a window.
  useEffect(() => {
    const fresh = freshCopy(items, focused, following);
    if (fresh) setFocused(fresh);
  }, [items, focused, following]);

  // AND THE WAY OUT OF THAT ROW IS HER INBOX, whichever way she takes it.
  //
  // A command comes back blocked carrying its answer, which is an inbox row:
  // the tab she opened it from no longer holds it.
  //
  // Against the STATE, like the interruption above it and for the same reason.
  // Escape, the back arrow, clicking away and ⌘K are four routes out of a task
  // and the fifth is the one that gets missed.
  useEffect(() => {
    const still = stillFollowing(following, focused);
    if (still !== following) { setFollowing(still); return; }
    if (!following || wayOut(following, focused) !== 'inbox') return;
    setFollowing(null);
    setView('inbox');
    // Pointed at the row she was just reading, which is where it now sits with
    // its answer on it, rather than at the top of a list she did not ask for.
    const at = shownInbox.findIndex((i) => i.id === following.id && i.product === following.product);
    setSelected(at >= 0 ? at : 0);
  }, [focused, following, shownInbox]);

  // She clicked the banner, so open the row it was about. It lands her on the
  // card rather than on whatever the cursor was left on, which is the whole
  // difference between being told and being told where. A row that has moved
  // on since (she answered it from another machine, an agent closed it) simply
  // does not answer the click; the window is already forward, which was most
  // of the point.
  useEffect(() => {
    const off = window.zero?.onOpenItem?.(({ id }) => {
      const row = [...inbox, ...progress, ...snoozed, ...done].find((i) => i.id === id);
      if (!row) return;
      setSearch(null);
      setFocused(row);
      markSeen(row);
    }) ?? (() => {});
    return off;
  }, [inbox, progress, snoozed, done, markSeen]);

  // THE PANEL'S CLICK.The actual agent already has a card here — its
  // conversation, its reply box and the button that brings its own window to
  // the front are all on it — so this opens that card rather than jumping her
  // out of the app. A session with no row left (she closed it, or put it off)
  // simply does not answer the click; the panel is not a way back into a list
  // she has already cleared.
  const openAgent = useCallback((pid: number) => {
    const row = agentRows.find((r) => r.id === `agent:${pid}`);
    if (!row) return;
    setFocused(row);
    markSeen(row);
  }, [agentRows, markSeen]);

  // THE ROW AN APPROVAL CAME FROM, which the card could never say until
  // w-34b7b861b6. An approval has to show which agent it belongs to, and give
  // a clear way to go into that agent.
  //
  // The id was already on the request the whole time. main/approval-prompt-
  // server.mjs stamps `item` off ZERO_ITEM when the worker freezes, and the
  // card drew the PRODUCT name over it, so ten asks from ten agents on one
  // product were ten identical cards.
  //
  // IT DOES NOT ANSWER OR DISMISS THE APPROVAL, and that is the whole design.
  // The approvals layer is fixed and above the window, so the row opens behind
  // the card she is deciding about: she reads what the agent is actually doing
  // and then presses Allow or Deny with the ask still in front of her. A row
  // that has gone (closed, archived, answered elsewhere) simply does not answer
  // the click, the same rule the agent panel follows.
  const approvalRow = useCallback((id: string | null) => (
    id ? [...inbox, ...progress, ...snoozed, ...done].find((i) => i.id === id) ?? null : null
  ), [inbox, progress, snoozed, done]);
  const openApprovalRow = useCallback((id: string | null) => {
    const row = approvalRow(id);
    if (!row) return;
    setSearch(null);
    setFocused(row);
    markSeen(row);
  }, [approvalRow, markSeen]);

  // WHAT THE PANEL LISTS, and it is two populations under one heading because
  // she has two kinds of agent. everything not closed, on the product the panel
  // is headed with.
  //
  //   her tasks     in progress, in her inbox, or scheduled — `belongsOnTheRail`
  //   her terminals a session she started herself, in this product's folder,
  //                 that has moved inside the day (`onTheRail`)
  //
  // the app's own workers are NOT taken from the session list: each one is on a
  // work item, and that item is in the first set already. Reading them from
  // both would print every running agent twice, which is the duplicate picture
  // that was rejected. It is also the whole of the old bug: the panel took the
  // session list and then dropped everything the app had started, so every
  // agent the app was running was hidden and the only rows left were the
  // user's own terminals in other folders.
  //
  // MOST RECENT FIRST, one order for both kinds, which is the panel's own rule
  // and the reason the clock on the right is the only difference between rows.
  const railRows = useMemo(() => {
    const slug = railItem?.product ?? null;
    if (!slug) return [];
    const tasks = items
      .filter((i) => i.product === slug && i.id !== pendingId)
      .filter((i) => belongsOnTheRail(i, {
        deliveredThrough, hiddenUntil: hiddenAt(i), deferredUntil: dueAt(i), now,
      }))
      .map((i) => ({
        key: i.id,
        line: i.title,
        at: i.updatedAt,
        open: () => { setFocused(i); markSeen(i); },
      }));
    // The rail's own copy of the same rule: an agent she has not been
    // introduced to is not on it while the walk is up.
    const sessions = (walking ? [] : (snap?.agents ?? []))
      .filter((a) => a.product === slug && onTheRail(a, now))
      .map((a) => ({
        key: `agent:${a.pid}`,
        line: railLine(a),
        at: a.lastActiveAt || a.startedAt,
        open: () => openAgent(a.pid),
      }));
    return [...tasks, ...sessions].sort((x, y) => y.at - x.at);
  }, [railItem?.product, items, snap?.agents, pendingId, deliveredThrough, hiddenAt, dueAt, now, markSeen, openAgent]);

  // (legal/privacy.html, 5.1). One place, on the id changing, rather than a
  // call beside each of the dozen things that open a task: a count added at
  // every call site is a count somebody forgets at the thirteenth, and this one
  // cannot drift from what she can see happen. Nothing about the task crosses
  // the bridge. Whether it is sent at all is decided in the main process, by
  // her switch.
  const lastCounted = useRef<string | null>(null);
  useEffect(() => {
    const id = focused?.id ?? null;
    if (!id || id === lastCounted.current) { if (!id) lastCounted.current = null; return; }
    lastCounted.current = id;
    try { window.zero?.track?.('task_opened'); } catch {}
  }, [focused?.id]);

  /*
   * HOW LONG IT STAYS, and there are two answers because there are now two
     kinds. A toast that only tells her something has 2.5 seconds, unchanged. A
     toast she is meant to be able to CLICK has to outlive noticing it, reaching
     the trackpad and arriving, and 2.5s is under that for most people: her own
     report is that she sometimes does not notice this one went past at all. Six
     seconds is the reading here, and it is a judgement, not a measurement. */
  /*
   * AND THE ONE BEFORE IT DOES NOT TAKE IT DOWN WITH IT. Each toast set its own
   * timer and none of them was ever cancelled, so a second toast inside the
   * first one's 2.5 seconds was wiped by the first one's timer, whenever that
   * happened to land. Measured 2026-09-27 on the built renderer while proving
   * the undo question: Z asked, another key answered no, Z asked again 1.8s
   * later, and the sentence she was meant to read was cleared 0.7s after it
   * appeared. Two toasts in quick succession is the normal case for a keyboard,
   * not an edge one, so the timer is held and cleared here.
   */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, goes?: { product: string; id: string }) => {
    setToast({ text, goes });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), goes ? 6000 : 2500);
  }, []);
  showToastRef.current = showToast;

  // ⌘R says so, and says which build it landed on. A reload onto an identical
  // screen was indistinguishable from a chord that did nothing, and the other
  // common reason ⌘R "does nothing" is that the renderer was never rebuilt,
  // which a build time that has not moved makes obvious.
  useEffect(() => {
    // No bridge at all (a plain browser, a screenshot harness): nobody is going
    // to answer, so say "fresh launch" now rather than leave the boot screen
    // waiting on a promise that does not exist.
    if (!window.zero?.bootInfo) { setReloaded(false); return; }
    window.zero.bootInfo().then((info) => {
      // The startup sweep ran before this page existed, so its one line was
      // held for it. It outranks the reload line: a reload she pressed herself
      // needs no telling, and agents coming back off a crash does.
      // Which set of theme pictures this screen wants, before anything else in
      // here: a toast that returns early must not take the wallpaper with it.
      applySkinDetail(resolveSkinDetail(info?.screenDetail));
      // BEFORE ANY RETURN, because this is what puts her back where she was and
      // the two early exits below are about what to SAY. Read once here rather
      // than asked for again: the main process clears the flag as it hands it
      // over, so a second call would answer "fresh launch" and the restore
      // would never happen.
      setReloaded(!!info?.reloaded);
      if (info?.recovered) { showToast(info.recovered); return; }
      if (!info?.reloaded) return;
      const stamp = info.builtAt
        ? new Date(info.builtAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : null;
      showToast(stamp ? `Reloaded · build ${stamp}` : 'Reloaded');
    }).catch(() => setReloaded(false));
  }, [showToast]);

  // She opened the lid. The app put the agents back on their work while she was
  // away from the screen, and this is the whole of what it says about it.
  useEffect(() => window.zero?.onRecovered?.((r) => { if (r?.text) showToast(r.text); }), [showToast]);

  // BEING A BRAND NEW USER, ON THE APP SHE DOWNLOADED.`walkAgain` above is the
  // "at LEAST" half. This is the first half, and the difference between them
  // is what each one forgets: that one forgets the walk was finished, this one
  // has never been set up at all.
  //
  // IT OPENS A SECOND AGENTBOX AND DELETES NOTHING. Hers keeps running with
  // every agent in it, because the single-instance lock is keyed on userData
  // and the new copy has a throwaway one (main/fresh-user.mjs). The palette is
  // closed first because the new window is what she should be looking at, and
  // the toast is what tells her which window she just got, since the fresh one
  // looks exactly like this one until it opens on the welcome screen.
  //
  // AND IT TAKES THE AGENTS AS AN ARGUMENT NOW.It passed `true` here, which
  // links her ~/.claude into the throwaway home, so the fresh copy found the
  // Claude Code sessions already running on this Mac and put them in its
  // inbox. Measured that night with the app's own discovery, three of them. ⌘K
  // has two rows for it now and this is told which test it is running.
  const openAsNewUser = useCallback(async (withAgents: boolean) => {
    setModal(null);
    const out = await api.openFreshUser(withAgents);
    if (!out.ok) { showToast(out.error ?? 'It could not be opened.'); return; }
    // The notes are the honest half: no Claude Code, no keychain or no agent
    // files means that copy is something to look at rather than something to
    // use, and she should hear that instead of finding it out. On the blank
    // run the missing agents are the POINT, so that one note is dropped: it is
    // written for the other row and it would read as a fault here.
    const notes = (out.notes ?? []).filter((n) => withAgents || !n.includes('.claude'));
    const note = notes.length ? ` · ${notes[0]}` : '';
    const what = withAgents ? `Opening a new ${NAME} that can see your agents.` : `Opening a brand new ${NAME} with nothing of yours in it.`;
    showToast(`${what} Yours keeps running.${note}`);
  }, [showToast]);

  // AN INBOX TO DEMO WITH, SO THE DEMO IS NOT HER OWN SCREEN.
  //
  // The same second Agentbox as `openAsNewUser` above, and the difference is what
  // is in its store: three invented products and a day of invented work, seeded
  // before it opens, so it lands on a full inbox rather than on the welcome
  // screen (main/demo.mjs). Hers keeps running with every agent in it.
  //
  // THE TOAST SAYS WHICH WINDOW SHE JUST GOT, because the demo looks exactly
  // like this one until it draws somebody else's products, and the moment to
  // find out which window is which is not while a room is watching.
  const openDemoInbox = useCallback(async () => {
    setModal(null);
    const out = await api.openDemo();
    if (!out.ok) { showToast(out.error ?? 'It could not be opened.'); return; }
    const note = out.notes?.length ? ` · ${out.notes[0]}` : '';
    showToast(`Opening a demo inbox with ${out.rows ?? 0} rows in it. Yours keeps running.${note}`);
  }, [showToast]);

  // She dragged the window onto the other screen, or unplugged one. The picture
  // does not change, only which copy of it is painted, so there is nothing to
  // say about it and nothing to store: the attribute is the whole of the state.
  useEffect(() => window.zero?.onScreenDetail?.((s) => applySkinDetail(resolveSkinDetail(s?.detail))), []);

  // FROM A TASK IT ADVANCES, FROM THE LIST IT DOES NOT. The rule and what it
  // cost her are in ./advance; what is here is only which state answers "was a
  // task open when she acted", and that is `focused`.
  const noteAdvance = useCallback((item: WorkItem) => {
    const index = shownInbox.findIndex((i) => i.id === item.id);
    advanceRef.current = advanceAfter({ fromTask: !!focused, index, id: item.id });
  }, [shownInbox, focused]);

  // AND EVERY WAY A ROW LEAVES HER INBOX CLOSES THE TASK THROUGH HERE.
  //
  // Closing one and answering one already advanced, because both go through
  // deferCommit below. Scheduling one, replying to an agent and sending one
  // back did not: each of those cleared `focused` on its own and never asked
  // the rule, so the row went and she was put back at the top of the list.
  //
  // So the pair is one call and the branches cannot drift apart again, which is
  // the same reason ./advance holds the rule and keys.ts holds the keys. Taken
  // from the LIST this is still a no-op: `advanceAfter` reads `focused` and
  // returns null when no task was open.
  const leaveResolved = useCallback((item: WorkItem) => {
    noteAdvance(item);
    setFocused(null);
  }, [noteAdvance]);

  // Every resolving action goes through here: the UI advances instantly, the
  // write happens after the grace window (unless Z cancels it first).
  const deferCommit = useCallback(async (
    item: WorkItem,
    run: () => Promise<void>,
    toast: string,
    restore?: () => Restored,
    // ONE SEND DOES NOT LEAVE THE TASK, and it is the only one: a command she
    // sent to watch the answer come back (./stay-with-a-command). The pane
    // stays open on the row, so there is nothing to advance to and nothing to
    // put her back at the top of a list for.
    stay?: boolean,
    // AND A WAY BACK INTO THE ROW SHE JUST ANSWERED (w-8ca9b50e36).
    //
    // Only the three actions that ANSWER a row pass this: a typed reply, an
    // approval, a picked option. Closing, scheduling and priority are not
    // replies and nothing starts on them, so they stay plain announcements and
    // do not grow a pointer.
    //
    // The row is findable the whole time the toast is up, because a pending row
    // is drawn in In progress through the grace window (see `progress`), and
    // the lookup happens at click time rather than in a closure, so it follows
    // the row wherever it has got to by then.
    goes?: { product: string; id: string },
  ) => {
    await flushPending(); // a new action commits the previous one immediately
    if (!stay) leaveResolved(item);
    setModal(null);
    setPendingId(item.id); // out of the inbox NOW; the write can wait, the signal cannot
    // "PRESS Z", NOT A BARE LETTER. The toast used to read "Closed: Added the
    // sign-in route. Tests g · Z to undo": the title had been cut mid-word at
    // 32 characters, so "Tests green." came out "Tests g", and the bare Z ran
    // straight on from it. The title is clipped on a sentence or a word now
    // (see markDone below) and the key is named as a press, so neither half can
    // be read as part of the other.
    //
    // A pick she is still looking at needs no way in: `stay` means the pane
    // never left the row.
    showToast(`${toast} · press Z to undo`, stay ? undefined : goes);
    const timer = setTimeout(async () => {
      if (pendingRef.current?.timer !== timer) return;
      pendingRef.current = null;
      await run();
      await refresh();
      setPendingId((p) => (p === item.id ? null : p));
    }, UNDO_GRACE_MS);
    pendingRef.current = { item, timer, run, restore };
  }, [flushPending, leaveResolved, refresh, showToast]);

  // It closes the ROW and touches nothing else — no message, no signal, and the
  // session goes on waiting exactly as it was. The way back is the undo below,
  // which sends the same close with 0. The rule is `putAway` in
  // shared/agents.mjs.
  const closeAgentRow = useCallback(async (item: WorkItem) => {
    const agent = item.agent!;
    const key = agentKey(agent);
    const through = agent.lastActiveAt || agent.startedAt || Date.now();
    await deferCommit(item, async () => {
      await api.closeAgent({ key, through });
      pushUndo({ label: `Back in your inbox: ${agent.name}`, undoes: `put ${agent.name} back in your inbox`, run: async () => {
        await api.closeAgent({ key, through: 0 });
      } });
    }, `Closed: ${agent.name}`);
  }, [deferCommit, pushUndo]);

  // AND CLOSING THE ROW THAT SAYS NOTHING IS RUNNING IS THE SAME KIND OF MOVE:
  // it is a fact about her inbox, not about the tasks, so it puts the row away
  // and stops nothing and starts nothing. It comes back by itself the moment
  // something new gets stuck, because the pile it is closed against is stamped
  // with when this one began. Same three second undo as every other close, so
  // E on it is no more frightening than E anywhere else.
  const closeTroubleRow = useCallback(async (item: WorkItem, since: number) => {
    const was = troubleClosed;
    await deferCommit(item, async () => {
      setTroubleClosedAt(since);
      pushUndo({ label: 'Back in your inbox: what is not running', undoes: 'put the stopped tasks back in your inbox', run: async () => { setTroubleClosedAt(was); } });
    }, 'Closed: what is not running');
  }, [deferCommit, setTroubleClosedAt, troubleClosed, pushUndo]);

  const markDone = useCallback(async (item: WorkItem) => {
    // AND DURING THE WALK, TWO OF ITS OWN ROWS SAY NO AND SAY WHY. One of them
    // is an agent stopped waiting on you, which is the move the walk is there
    // to teach people not to make, and closing it used to delete the beat that
    // teaches it. It is here rather than on the E key so that the reading
    // pane's own button, ⌘K and a ticked selection all go the same way.
    // `closingRefused` in onboarding.ts has her run, by the clock.
    const refused = closingRefused(run, item.id, WAITING_AT, LATER_AT);
    if (refused) { showToast(refused); return; }
    // AN AGENT ROW IS NOT WORK OF HERS TO RESTART OR STOP — those are promises
    // about somebody else's terminal and Agentbox keeps none of them. Closing the
    // ROW is not one of those: it is a fact about her inbox, and her inbox is
    // hers. See closeAgentRow.
    if (item.agent) { await closeAgentRow(item); return; }
    // AND THE ROW THAT COUNTS THE STOPPED TASKS PUTS ITSELF AWAY, for the same
    // reason and by its own route: there is no ledger row behind it to close.
    if (isTroubleRow(item)) {
      const since = snap?.supervisor.spawnTrouble?.since;
      if (since) await closeTroubleRow(item, since);
      return;
    }
    await deferCommit(item, async () => {
      await api.answer({ product: item.product, id: item.id, status: 'done' });
      pushUndo({ label: `Reopened: ${clipToSentence(item.title, TOAST_TITLE)}`, undoes: `reopen “${clipToSentence(item.title, TOAST_TITLE)}”`, brings: item, run: async () => { await api.answer({ product: item.product, id: item.id, status: 'open' }); } });
    }, `Closed: ${clipToSentence(item.title, TOAST_TITLE)}`);
  }, [deferCommit, closeAgentRow, closeTroubleRow, snap?.supervisor.spawnTrouble?.since, run, showToast, pushUndo]);

  const resolve = useCallback(async (item: WorkItem) => {
    // The palette's Approve. Question: send the recommended option. Review:
    // "approved, proceed", which a continuation ENACTS. Agent proposal:
    // "run it". Anything else: mark done. This used to be E, and that burned
    // her: E read as "archive" (the footer even said mark done), so hitting
    // it on a question silently APPROVED the recommendation. Approval is
    // consequential and now only happens deliberately: arrows + Enter,
    // a number key, a click, or the palette command by name.
    //
    // THE ROW THAT COUNTS THE STOPPED TASKS HAS NOTHING TO APPROVE and nothing
    // to close in a ledger, so this hands it to the one thing that is true of
    // it, which puts the row away.
    if (isTroubleRow(item)) { await markDone(item); return; }
    const options = itemOptions(item);
    const recommended = options.find((o) => o.recommended) ?? options[0];
    const isProposal = item.status === 'open' && item.kind !== 'question' && item.kind !== 'review'
      && !(item.labels ?? []).includes('founder') && !liveAnswer(item);
    const approveWith = async (answer: string, toast: string) => {
      await deferCommit(item, async () => {
        await api.answer({ product: item.product, id: item.id, answer });
        // Post-commit undo is a real cancel: stop whatever spawned, withdraw
        // the answer, reopen the item.
        //
        // NO EM DASH, HERE OR IN ANY OTHER LABEL THIS APP SHOWS.A comma carries
        // the same pause and does not read as something a machine wrote.
        // Measured that day across renderer, main and shared: seven
        // user-visible strings held one, and they are the four undo labels, the
        // two stop toasts and the resume toast. Everything else was comment
        // prose, which she never reads.
        pushUndo({ label: 'Approval withdrawn, back in your inbox', undoes: 'take back that approval and stop the agent', brings: item, run: async () => {
          await (window.zero as any)?.stopSession?.({ product: item.product, id: item.id });
          await api.answer({ product: item.product, id: item.id, answer: '(withdrawn)', status: 'open' });
        } });
      }, toast, undefined, undefined, { product: item.product, id: item.id });
    };
    if (item.kind === 'question' && recommended && !item.answer) {
      await approveWith(`Option ${recommended.n}: ${recommended.text}`, `Approved: option ${recommended.n} → ${item.productName}`);
    } else if (item.kind === 'review' && !item.answer) {
      await approveWith('Approved. Proceed as you proposed.', `Approved → ${item.productName} will enact it`);
    } else if (isProposal) {
      await approveWith('Approved. Run it.', `Running → ${item.title.slice(0, 40)}`);
    } else {
      await markDone(item);
    }
  }, [refresh, showToast, markDone]);

  // THERE IS NO DECLINE.
  //
  // It used to be "Decline Proposal" in ⌘K, written inline in the palette:
  // a founder `done` plus the answer "Not now.", which is the same closing
  // write that Close This Task already makes. Two commands did one thing, and
  // the one nobody could find was the one that also silently answered the row
  // on her behalf. Close This Task (E) is the whole of saying no now.
  //
  // Do not put it back. The advance work this row was really about
  // lives in `leaveResolved` above and still covers every way a row leaves her
  // inbox.

  const answerWith = useCallback(async (item: WorkItem, text: string, priority?: number, sent?: SentDraft, mode?: AnswerMode | null, engine?: string | null, pick?: { model: string | null; effort: string | null }) => {
    // AN AGENT ROW IS NOT WORK OF HERS TO CLOSE, DEFER OR RESTART. It stands
    // for a session running outside Agentbox; the only two things that mean
    // anything to it are a reply and being taken to its window.
    //
    // NOR IS THE ROW THAT SAYS HER TASKS ARE NOT RUNNING, NOR THE ONE THAT SAYS
    // A NEW AGENTBOX IS READY, for the same reason and one more: no ledger
    // anywhere has a row called `trouble` or `update` in it, so every one of
    // these would be a write into nothing. Both behave like a task in every way
    // she can see and in none that she cannot.
    if (item.agent || isTroubleRow(item) || isUpdateRow(item)) return;
    // Replying to a blocked item is the redirect: it goes straight back to
    // the agent with your words; nothing acts on a blocked item otherwise.
    //
    // A FINISHED THREAD IS STILL A THREAD. The supervisor only carries an
    // answer to a worker while the item is open, so a reply typed on something
    // already done landed in the ledger and then sat there forever: no worker,
    // no error, and a toast that said it had been sent. A reply reopens the
    // thread, which is what replying means.
    //
    // Claimed is deliberately left alone: a worker is on it right now, and it
    // reads her reply when it exits (deliverMidflightReply). Reopening would
    // put a second worker on the same item.
    const status = statusForReply(item.status);
    // A LIVE CORRECTION IS HELD FOR THE SAME THREE SECONDS AS EVERYTHING ELSE,
    // and then it is gone for good.
    //
    // This used to go straight out, on the reasoning that a grace window would
    // say Sent while the agent worked on without the message. That reasoning
    // came before the conversation drew what she had just sent: her message is
    // on the screen now from the moment she presses send, wearing "Sending…",
    // so a held message is not a lie, it is the label being exactly true.
    //
    // A message still in the sending state has to be able to be taken back
    // (w-5281ef1221). The label promised a way back, and the window below is
    // what makes the promise true.
    //
    // AFTER THE WINDOW IT REALLY IS UNREACHABLE, and no wording can soften
    // that: `steer` writes the message onto the session's stdin in the same tick
    // (main/claude-input.mjs), where the CLI takes them at its next break.
    // What the promise waits on is the acknowledgement, not the handing over.
    // So the message says "press Z to undo" for exactly as long as that is
    // true and stops saying it the moment it stops being true.
    const isRunning = snap?.supervisor.running.some((run) => run.itemId === item.id && run.product === item.product);
    if (isRunning) {
      setFollowing({ product: item.product, id: item.id });
      setModal(null);
      // ON THE SCREEN BEFORE ANYTHING IS ASKED OF ANYBODY. The moment she
      // presses send, her message is the last thing in the conversation, where
      // she is already looking, and it says in its own head that the agent has
      // not taken it yet. Everything below can take a minute and none of it is
      // hers to wait for.
      const at = Date.now();
      const mine = { product: item.product, id: item.id, at, text, held: true };
      // The same message once the window has closed. TWO OBJECTS RATHER THAN A
      // FIELD WRITTEN IN PLACE, because the queue is identified by identity
      // below and React only redraws on a new one.
      const gone = { ...mine, held: false };
      setSending((q) => [...q, mine]);
      // AND Z STOPS HERE, because the alternative is Z undoing something else
      // and never saying so. Messaging an agent that was working and pressing
      // Z a second later undid a different agent's work from a while earlier
      // (w-5281ef1221).
      //
      // This was the last send in the app that left nothing on the undo pile,
      // the same fault w-a4132c0f9c had on new tasks (noteNewTask below), and
      // it bites harder here: what is underneath is whatever she last did to a
      // DIFFERENT row, so one press reached into another agent's work and
      // withdrew it silently.
      //
      // IT GOES ON AT THE HAND-OVER, WHICH IS THE MOMENT IT BECOMES TRUE. Up
      // to there the window above has it, and Z inside the window is a real
      // undo: nothing was written and the message comes back.
      //
      // The entry cannot un-send anything and does not pretend to. Once `steer`
      // has written the message there is no retraction on the other side of it,
      // and stopping the run would kill work that was already going before she
      // typed. So Z says where the message is and puts her back on the
      // conversation to write the next one, which is the same honest shape
      // replyToAgent uses on her own agents below. A hand-over that FAILS takes
      // it off again, because then nothing was sent and the message is back in
      // the box.
      const alreadyGone = {
        label: 'Your message is already with the agent. Send another one to add to it.',
        // Z cannot un-send this one, so what it offers is the way back to the
        // conversation, and the phrase promises that and nothing more.
        undoes: 'go back to that conversation',
        run: async () => { setFocused(item); markSeen(item); },
      };
      // WHAT SAID THIS BEFORE WAS TWO TOASTS, and they were the whole of what
      // she had: one bar saying it was sending, one saying it was sent, neither
      // of them saying WHICH message, and both gone in a few seconds. Three
      // follow-ups meant three bars in the same place carrying the same six
      // words. The message itself is a better answer to every one of those
      // questions, so the toasts on this path are gone and only the failure
      // below still speaks.
      const handOver = async () => {
        setSending((q) => q.map((s) => (s === mine ? gone : s)));
        pushUndo(alreadyGone);
        await deliverReply({
        send: () => api.answer({ product: item.product, id: item.id, answer: text,
          ...(priority != null ? { priority } : {}),
          ...(mode !== undefined ? { permissionMode: mode } : {}),
          // A MODEL PICKED WHILE A RUN IS UP BELONGS TO THE CONVERSATION, NOT
          // TO THIS MESSAGE. The message is handed to the session already going,
          // which is on the model it spawned with and cannot change harness
          // mid-flight; the pick lands on the row and the next run reads it.
          // The drawer says "Which model this conversation runs on" rather than
          // anything about this message, for exactly this case.
          ...(pick ? { model: pick.model, effort: pick.effort } : {}),
        }),
        // NOTHING IS TAKEN OFF THE SCREEN HERE. The row is re-read, the
        // committed copy of this message arrives with it, and `itemThread`
        // cancels the pending one against it, so the two are never both drawn
        // and there is never a moment with neither. Dropping the pending one
        // the instant the provider answers would open exactly that gap, for as
        // long as a ledger read takes, on the one message all of this is for.
        //
        // It is let go a few seconds later, by which time the committed copy
        // has long since arrived and has been what she is reading. The wait is
        // only so the queue cannot grow for as long as the app is open; nothing
        // she sees turns on it.
        accepted: async () => {
          await refresh();
          setTimeout(() => setSending((q) => q.filter((s) => s !== mine && s !== gone)), LANDED_MS);
        },
        failed: (error: Error) => {
          setSending((q) => q.filter((s) => s !== mine && s !== gone));
          setUndoStack((u) => u.filter((e) => e !== alreadyGone));
          restoreFailedDraft(item, sent?.words ?? text, sent?.attachments ?? []);
          // NEVER PULL HER BACK. This settles whenever the agent's session
          // does, which can be minutes after she moved on, and it used to
          // switch the screen to this row and open its reply box in the
          // middle of whatever she was doing (w-d92559b84f). If she is still
          // here, the box opens where she is looking. If she is not, the words
          // wait in this row's box and a toast she can click says where.
          const here = focusedNow.current?.id === item.id && focusedNow.current?.product === item.product;
          if (here) {
            setModal('reply');
            showToast(error.message || 'Could not send. Your message is back in the reply box.');
          } else {
            showToast('A message you sent did not reach its agent. Click to open it, your words are back in the reply box.', { product: item.product, id: item.id });
          }
        },
        });
      };
      // THE WINDOW ITSELF, on the app's own one grace window rather than a
      // second copy of it, so a Z inside it lands in `undo`'s first branch: a
      // perfect undo, nothing written, the message back in the reply box. The
      // flush first is what makes a second message sent inside the window hand
      // the first one over rather than queue behind it.
      //
      // NO TOAST. The message on the screen says it, where she is looking, and
      // the two bars this path used to raise are the ones w-87c4e7913c took
      // away.
      await flushPending();
      const timer = setTimeout(() => {
        if (pendingRef.current?.timer !== timer) return;
        pendingRef.current = null;
        void handOver();
      }, UNDO_GRACE_MS);
      pendingRef.current = {
        item,
        timer,
        run: handOver,
        // THE WORDS AND THE PICTURES, and the bubble comes off the thread with
        // them: leaving it there would say Sending over a message that is not
        // going anywhere.
        //
        // AND THE BOX IS OPENED HERE, which the other undo paths get for free
        // and this one cannot. The effect that opens the dock on a draft runs
        // on `focused?.id`, and she never left the row, so `setFocused` back to
        // it changes nothing and the dock stays shut. The toast would then say
        // her message was back in a box she is not looking at, which is the
        // same broken promise this whole row is about.
        restore: (): Restored => {
          setSending((q) => q.filter((s) => s !== mine));
          const back = restoreDraft(item, sent?.words ?? text, sent?.attachments ?? []);
          if (back) setModal('reply');
          return back ? { item } : null;
        },
      };
      return;
    }
    // TAKING A SEND BACK RETURNS THE WORDS AND THE IMAGES. One closure, handed
    // to both undo paths (the grace window and the post-commit withdraw),
    // because there is exactly one thing that should happen to her paragraph
    // and two places that have to do it. Withdrawing overwrites the answer in
    // the ledger with '(withdrawn)', so this in-flight copy is the only one
    // left.
    //
    // `sent` is what the box HAD, which is not what it sent: the typed words
    // before the attachment markdown was appended, and the staged screenshots.
    // Handing back the joined body instead put the markdown in the reply box as
    // text. The fallback is the body, for a caller that does not carry a
    // draft.
    //
    // A REPLY IN A CONVERSATION IS ON THE SCREEN WHEN SHE SENDS IT, with no
    // gap after sending where it is nowhere to be seen. The write
    // below waits out the three seconds Z can take it back, and the thread is
    // drawn off the ledger, so the words were nowhere for those three seconds.
    // A message to a person is held in `sending` like one to a running agent;
    // the written copy replaces it (item-thread.ts) and Z takes it off.
    const talking = isDirect(snap?.products.find((p) => p.slug === item.product));
    const mine = { product: item.product, id: item.id, at: Date.now(), text, held: true };
    if (talking) setSending((q) => [...q, mine]);
    const restore = (): Restored => {
      setSending((q) => q.filter((s) => s !== mine));
      return restoreDraft(item, sent?.words ?? text, sent?.attachments ?? []) ? { item } : null;
    };
    // A REPLY IS A CLAIM ON NOW, so it cancels a schedule rather than queueing
    // behind it. The rule and the reason are in list-rules; what is here is the
    // write and the way back. The old moment rides on the undo, so answering
    // something and still wanting it to run Monday at 6am costs one Z.
    const wasScheduled = replyClearsSchedule(item, Date.now());
    const priorRunAt = item.runAt ?? 0;
    // AND A COMMAND KEEPS HER ON THE ROW IT IS ABOUT TO ANSWER.Every other
    // reply hands work to somebody else and takes seconds to hours; this one
    // prints a table in four seconds and the table is the entire reason she
    // sent it. AND ONLY ON THE ENGINE THAT HAS THE EIGHT. Codex knows none of
    // them, so the words stay in her prompt and an ordinary turn runs; keeping
    // her on the row for that would be waiting for a table nothing is going to
    // print, and it would take her out of In progress to do it. The word is
    // handed in rather than read off `item.engine`, which is what she MARKED
    // and may be a row from before the gate; this is what will really pick it
    // up.
    // A REPLY IN A CONVERSATION STAYS IN THE CONVERSATION (2026-10-01):
    // sending a message to a person must not jump to another page.
    const stay = staysOnTheTask(item, text, engine) || talking;
    if (stay) setFollowing({ product: item.product, id: item.id });
    await deferCommit(item, async () => {
      await api.answer({
        product: item.product,
        id: item.id,
        answer: text,
        ...(status ? { status } : {}),
        ...(priority != null ? { priority } : {}),
        // What this one reply may do. Undefined means she did not touch it and
        // the item keeps whatever it had; null means she cleared it.
        ...(mode !== undefined ? { permissionMode: mode } : {}),
        // AND WHICH MODEL PICKS THE ROW UP. Absent unless she opened the
        // drawer; the store writes it onto the item BEFORE the answer, so the
        // run this reply starts reads the model she just chose rather than the
        // one it was on (main/store.mjs, answerItem).
        ...(pick ? { model: pick.model, effort: pick.effort } : {}),
      });
      if (talking) setTimeout(() => setSending((q) => q.filter((s) => s !== mine)), LANDED_MS);
      if (wasScheduled) {
        await api.schedule({ product: item.product, id: item.id, runAt: 0 });
        // The legacy localStorage snooze hides a row on read all by itself, so
        // clearing only the ledger would leave her reply behind a schedule the
        // window still believes in.
        setSnoozes((s) => { const next = { ...s }; delete next[item.id]; return next; });
      }
      pushUndo({ label: 'Reply withdrawn, back in your inbox', undoes: 'take back that reply and stop the agent', restore, run: async () => {
        if (wasScheduled) await api.schedule({ product: item.product, id: item.id, runAt: priorRunAt });
        await (window.zero as any)?.stopSession?.({ product: item.product, id: item.id });
        // Put the thread back exactly where the reply found it. The rule and
        // what it cost are in list-rules (`withdrawReply`): restoring the
        // status only when the reply had changed one left an already-open row
        // sitting blocked after the kill, where nothing carries an answer.
        await api.answer({ product: item.product, id: item.id, ...withdrawReply(item.status) });
        // Taking the command back ends the watch with it, so the next Escape
        // means what it always meant.
        setFollowing(null);
      } });
    }, talking ? 'Sent' : `Sent → ${item.productName}`, restore, stay, { product: item.product, id: item.id });
  }, [deferCommit, snap?.supervisor.running, snap?.products, showToast, refresh, markSeen, pushUndo]);

  /* ------------------------ answering one of her agents -------------------- */
  // THE ONE THING AGENTBOX SAYS OUT LOUD TO THE REST OF HER MACHINE. The reply goes
  // into the running session over the socket it is already listening on; the
  // main process watches whether the agent actually moves and says which it
  // was. It never reports a delivery it did not see, because a green toast over
  // a message that went nowhere is the exact failure this app cares about most:
  // when the system swallows something the user wrote, they cannot tell it
  // from the work not happening.
  const replyToAgent = useCallback(async (item: WorkItem, text: string) => {
    const agent = item.agent;
    if (!agent) return;
    setModal(null);
    // AND THE ROW LEAVES HER INBOX, so the next task is hers. Replying moves an
    // agent row to In progress (below), which empties her inbox by a row
    // exactly as closing one does, and this used to drop her at the top of the
    // list instead.
    leaveResolved(item);
    const out = await api.agentReply({ pid: agent.pid, text });
    // Two true sentences, never one hopeful one. A failed hand-over says so; a
    // send says Sent, which is what it says everywhere else in this app; and a
    // session seen going back to work says the better thing.
    if (!out?.ok) showToast(out?.reason ?? 'The message could not be handed over.');
    else if (out.working) showToast(`${agent.name} is working on it`);
    else showToast(`Sent → ${agent.name}`);
    // AND THE ROW HAS MOVED, so there is a way back. The row is in In progress
    // now and it stays there until the session stops, which on a long job is a
    // while; a reply she did not mean to send would otherwise have no undo at
    // all. What this CANNOT do is un-send the message — that is in somebody
    // else's terminal — and the label says so rather than implying it.
    if (out?.ok && out.key) {
      const key = out.key;
      pushUndo({
        label: `Back in your inbox. Your message to ${agent.name} had already been sent.`,
        undoes: `take back your message to ${agent.name}`,
        run: async () => { await api.unreplyAgent({ key }); refresh(); },
      });
    }
    refresh();
  }, [refresh, showToast, leaveResolved]);

  // For the agent a reply cannot reach. It brings the APP the session is
  // running inside to the front, which is all that is actually available:
  // nothing public focuses one pane inside another app, and this version of the
  // CLI has no attach command whatever the earlier write-up said. The button
  // says the app's name so the promise it makes is the one it keeps.
  const revealAgent = useCallback(async (item: WorkItem) => {
    const agent = item.agent;
    if (!agent) return;
    const out = await api.agentReveal({ pid: agent.pid });
    if (!out?.ok) showToast(out?.reason ?? `${Name} cannot tell which window it is running in.`);
  }, [showToast]);

  // YES OR NO ON A CODEX CONVERSATION. The word goes down the ordinary reply
  // channel and the main process answers it itself: nothing is spawned, and no
  // worker ever reads it. Import on a declined row in Closed is the same yes.
  const answerImport = useCallback(async (item: WorkItem, choice: ImportChoice) => {
    if (item.agent || isTroubleRow(item) || isUpdateRow(item)) return;
    try {
      await api.answer({ product: item.product, id: item.id, answer: importAnswer(choice) });
      showToast(choice === 'yes' ? `Imported into ${item.productName}. It is in your inbox.` : 'Not imported. It waits in Closed under Not imported.');
    } catch (err) {
      showToast(`Could not answer: ${(err as Error).message}`);
    }
  }, [showToast]);

  const pickOption = useCallback(async (item: WorkItem, n: number) => {
    // AN AGENT ROW IS NOT WORK OF HERS TO CLOSE, DEFER OR RESTART. It stands
    // for a session running outside Agentbox; the only two things that mean
    // anything to it are a reply and being taken to its window.
    //
    // NOR IS THE ROW THAT SAYS HER TASKS ARE NOT RUNNING, NOR THE ONE THAT SAYS
    // A NEW AGENTBOX IS READY, for the same reason and one more: no ledger
    // anywhere has a row called `trouble` or `update` in it, so every one of
    // these would be a write into nothing. Both behave like a task in every way
    // she can see and in none that she cannot.
    if (item.agent || isTroubleRow(item) || isUpdateRow(item)) return;
    const option = itemOptions(item).find((o) => o.n === n);
    if (!option) return;
    // A PICK IS A REPLY, so it reopens a finished thread exactly as typing one
    // does (statusForReply). It did not, and nothing showed that: the answer
    // was written to the ledger, the toast said it had been sent, and the
    // supervisor only carries an answer while the item is open, so no worker
    // ever saw it. It never bit because the strip only ever drew off the body,
    // which meant a pick was only ever offered on a row still open. Options
    // now come off the result too (format.ts), so a finished row can offer one,
    // and this is the half of the reply path it was missing.
    const status = statusForReply(item.status);
    await deferCommit(item, async () => {
      await api.answer({ product: item.product, id: item.id, answer: `Option ${option.n}: ${option.text}`, ...(status ? { status } : {}) });
      pushUndo({ label: `Option ${option.n} withdrawn, back in your inbox`, undoes: `take back option ${option.n}`, brings: item, run: async () => {
        await (window.zero as any)?.stopSession?.({ product: item.product, id: item.id });
        // Back exactly where the pick found it, the same one write a typed
        // reply's undo makes. Hardcoding 'open' was right while a pick could
        // only ever happen on an open row; a pick on a finished one would have
        // undone into her inbox instead of back into Done.
        await api.answer({ product: item.product, id: item.id, ...withdrawReply(item.status) });
      } });
    }, `Option ${option.n} → ${item.productName}`, undefined, undefined, { product: item.product, id: item.id });
  }, [deferCommit, pushUndo]);

  /* ------------------------ the task she just wrote ------------------------ */
  // THE TASK SHE JUST MADE IS WHAT Z TAKES BACK.
  //
  // Sending was the ONE thing she can do in this app that put nothing on the
  // undo pile. Everything else does — closing a row, sending a reply, approving,
  // scheduling, waking a batch — so Z after a send never reached the send. It
  // reached PAST it and ran whatever was underneath, which could be an archive
  // from ten minutes earlier or a reply pulled out of a thread she was not even
  // looking at, and it did that silently. Meanwhile the card had already cleared
  // the draft, so one added sentence cost the whole task retyped, and the
  // same title went in twice inside a minute with a worker already claimed on
  // the first copy.
  //
  // NO GRACE WINDOW HERE, on purpose. The send stands and the way back is a real
  // withdraw. Holding the write for three seconds would have meant a task that
  // is in no view at all while she looks for it, and "did that actually send?"
  // is the one question this card must never make her ask. The withdraw stops
  // the worker as well as closing the row: main/ipc.mjs kills the session on any
  // archive, and her archive outranks whatever a straggler writes afterwards.
  const noteNewTask = useCallback((label: string, undoes: string, sent: ComposeDraft, withdraw: () => Promise<void>) => {
    pushUndo({
      label,
      undoes,
      // The whole card comes back, not just the sentence: see restoreComposeDraft.
      restore: (): Restored => (restoreComposeDraft(sent) ? { compose: true } : null),
      run: withdraw,
    });
  }, [pushUndo]);

  // Retag priority on whatever she is pointing at. One path for both ways in,
  // the ⌘1..4 chord and the ⌘K entries, so the two can never disagree about
  // what a level means or what it says afterwards.
  const retag = useCallback(async (targets: WorkItem[], value: number) => {
    if (!targets.length) return;
    const word = priorityLabelOf(priorityIdOf(value)).toLowerCase();
    await Promise.all(targets.map((i) => api.answer({ product: i.product, id: i.id, priority: value })));
    showToast(targets.length > 1 ? `${targets.length} set to ${word}` : `Priority: ${word}`);
    await refresh();
  }, [refresh, showToast]);

  const [snoozeItem, setSnoozeItem] = useState<WorkItem | WorkItem[] | null>(null);

  const openSnooze = useCallback((item: WorkItem | WorkItem[]) => {
    // AN AGENT ROW TAKES THIS ONE. Closing, restarting and stopping still mean
    // nothing to a session running outside Agentbox, but putting it off is not
    // about the session at all: it is about her inbox, and her inbox is hers.
    // Refusing it was a key that did nothing and said nothing, which is the
    // same failure as a message the system swallows.
    //
    // THE WALK'S STOPPED ROW IS THE ONE EXCEPTION, and it is not a key that
    // does nothing: putting that row off takes it out of the inbox exactly as
    // closing it does, and takes the beat that teaches answering with it. It
    // says which row and what to do instead. See `snoozeRefused`.
    // AND THE ROW THAT COUNTS THE STOPPED TASKS SAYS SO RATHER THAN SWALLOWING
    // IT. There is no ledger row to carry a moment, so deferring it would be
    // the key that does nothing this whole comment is about. Closing it is the
    // real move and it is one letter away, so the toast names it.
    const rows = Array.isArray(item) ? item : [item];
    if (rows.some(isTroubleRow)) { showToast('Nothing to put off here. Press E to close it until something else stops.'); return; }
    const held = rows
      .map((i) => snoozeRefused(run, i.id, WAITING_AT))
      .find((why): why is string => !!why);
    if (held) { showToast(held); return; }
    setSnoozeItem(item);
    setModal('snooze');
  }, [run, showToast]);

  // WHERE A DEFERRAL GOES depends on what the row is, and that is the only
  // difference between the two. A work item's moment belongs in the ledger,
  // where the supervisor reads it and a restore onto another machine carries
  // it; an agent's belongs beside the reading of the machine it is running on,
  // because there is no ledger it could live in and nothing to defer but the
  // interruption. One writer for both, so no caller has to know.
  const writeMoment = useCallback(async (item: WorkItem, ts: number) => {
    if (item.agent) await api.scheduleAgent({ key: agentKey(item.agent), runAt: ts });
    else await api.schedule({ product: item.product, id: item.id, runAt: ts });
  }, []);

  // The moment goes into the LEDGER, not this window. That is what makes it
  // survive an app restart, a reboot, and a store restored onto another
  // machine, and it is what makes the deferral real rather than cosmetic: the
  // supervisor reads the same field, so a scheduled item does not start until
  // its time. The old localStorage map hid a row and deferred no work at all.
  const snoozeUntil = useCallback(async (target: WorkItem | WorkItem[], ts: number, label: string) => {
    const picked = Array.isArray(target) ? target : [target];
    // A ROW SHE PICKED IS A THREAD, NOT AN ITEM. The rule and the measurement
    // are in list-rules. Nothing is added when she snoozes from Scheduled:
    // those rows are not candidates, so there is nothing behind them. An agent
    // row is one row and no thread: it has no parent, nothing is masked behind
    // it, and asking the ledger about its ancestors would search for an id no
    // ledger holds.
    const list = [...picked, ...maskedAncestors(picked.filter((i) => !i.agent), inboxCandidates)];
    setModal(null);
    setSnoozeItem(null);
    setMultiSel(new Set());
    // The write, THEN the word. This used to say "Scheduled for tomorrow" up
    // front and never look at what happened, so a write that failed left the
    // row sitting in the inbox under a toast promising it had gone.
    try {
      for (const item of list) await writeMoment(item, ts);
    } catch (err) {
      showToast(`Could not schedule: ${(err as Error)?.message ?? 'the store refused the write'}`);
      refresh();
      return;
    }
    // THE MOMENT IS KEPT, SO THE ROW IS GONE AND THE NEXT TASK IS HERS. The
    // task closes here rather than above the write for the same reason the
    // toast waits: a refused write leaves the row in her inbox, and moving her
    // off it would say it had gone. `picked[0]` is the row she was reading —
    // from inside a task the picker is opened on `focused` and nothing else,
    // and a bulk schedule from the list has no task open to leave.
    leaveResolved(picked[0]);
    // The COUNT IS WHAT SHE PICKED. A thread she moved as one row is one row to
    // her, so saying 13 after she selected 12 would report the repair as a
    // miscount and put the old doubt back in different words.
    showToast(picked.length > 1 ? `${picked.length} scheduled for ${label}` : `Scheduled for ${label}`);
    // Undo puts every moment back where it was rather than clearing it. A
    // parent that came along may have been parked by its own agent, and zeroing
    // that on her behalf would restart the respawn loop the park exists to stop.
    const prior = new Map(list.map((i) => [i.id, i.runAt ?? 0]));
    // `canceled`, one L, because this label is read out loud in a toast and the
    // app spells for its reader, not for the dictionary. The walk's button had
    // the same slip. This one and the repeating-task label below were the
    // last two British spellings anywhere a person can read; the sweep that
    // found them is in decisions.md under that item. And no em dash, which is
    // the OTHER half of what was wrong with this label. See the note on the
    // approval label above for the sweep.
    pushUndo({ label: 'Schedule canceled, back in the inbox', undoes: 'cancel that schedule', run: async () => {
      for (const item of list) await writeMoment(item, prior.get(item.id) ?? 0);
      refresh();
    } });
    refresh();
  }, [showToast, refresh, inboxCandidates, writeMoment, leaveResolved, pushUndo]);

  const unsnooze = useCallback(async (target: WorkItem | WorkItem[]) => {
    // An agent row belongs here for the same reason it belongs in the picker:
    // the way back has to exist wherever the way out did.
    const list = Array.isArray(target) ? target : [target];
    const prior = new Map(list.map((i) => [i.id, i.runAt ?? 0]));
    setModal(null);
    setSnoozeItem(null);
    setFocused(null);
    setMultiSel(new Set());
    // A row an agent parked never left her inbox, so saying it is back would
    // name a move that did not happen. What actually changed is that work can
    // start on it again.
    const allParked = list.every((i) => parkedByAgent(i, Date.now()));
    // A thread in Later was never in the inbox and never ran, so neither of
    // those words is true of it: it is starting for the first time.
    const allHeld = list.every((i) => notStarted(i));
    const one = allHeld ? 'Started' : allParked ? 'Running again' : 'Back in the inbox';
    showToast(list.length > 1
      ? `${list.length} ${allHeld ? 'started' : allParked ? 'running again' : 'back in the inbox'}`
      : one);
    // The old localStorage snoozes are still honored on read, so a row deferred
    // before this shipped needs clearing there too or it would not come back.
    setSnoozes((s) => {
      const next = { ...s };
      for (const item of list) delete next[item.id];
      return next;
    });
    for (const item of list) await writeMoment(item, 0);
    // AND A THREAD IN LATER IS STARTED BY THE SAME PRESS (w-afb66e6661). It has
    // no moment to clear; what it has is `start`, and 'now' is what makes the
    // supervisor see it. The undo puts it back in Later.
    const wasHeld = list.filter((i) => notStarted(i));
    for (const item of wasHeld) await api.threadEdit(item.product, item.id, { start: 'now' });
    pushUndo({ label: 'Scheduled again', undoes: 'put that schedule back', run: async () => {
      for (const item of list) await writeMoment(item, prior.get(item.id) ?? 0);
      for (const item of wasHeld) await api.threadEdit(item.product, item.id, { start: 'later' });
      refresh();
    } });
    refresh();
  }, [showToast, refresh, writeMoment, pushUndo]);

  const batchDone = useCallback(async (ids: Set<string>) => {
    // Agent rows included, and counted. Resolving her ticks against the ledger
    // alone left them selected, unclosed and uncounted, which is the same
    // silence this whole change is about.
    // AND THE WALK'S PROTECTED ROWS ARE NOT IN A BATCH EITHER. Ticking four
    // rows and pressing E is the one route that would close the stopped agent
    // without ever pointing at it, so it is refused here and said out loud,
    // the same sentence the single close gives. See `closingRefused`.
    const held = selectable.filter((i) => ids.has(i.id) && closingRefused(run, i.id, WAITING_AT, LATER_AT));
    if (held.length) { showToast(closingRefused(run, held[0].id, WAITING_AT, LATER_AT) as string); return; }
    const targets = selectable.filter((i) => ids.has(i.id));
    for (const item of targets) {
      if (item.agent) await api.closeAgent({ key: agentKey(item.agent), through: item.agent.lastActiveAt || item.agent.startedAt || Date.now() });
      else await api.answer({ product: item.product, id: item.id, status: 'done' });
    }
    pushUndo({ label: `Reopened ${targets.length} items`, undoes: `reopen those ${targets.length} tasks`, run: async () => {
      for (const item of targets) {
        if (item.agent) await api.closeAgent({ key: agentKey(item.agent), through: 0 });
        else await api.answer({ product: item.product, id: item.id, status: 'open' });
      }
    } });
    showToast(`Closed: ${targets.length} items`);
    setMultiSel(new Set());
    await refresh();
  }, [selectable, refresh, showToast, run]);

  // Is a worker on this row right now? Resuming one is a no-op, so the commands
  // that offer it leave those rows out of their count rather than promising
  // something that will not happen. This replaced a stalled-only test: the rows
  // that most needed resuming were never in `supervisor.stalled` at all, because
  // a row a worker filed as done is stopped in every sense except that one.
  //
  // It is NOT the question the stop asks. See `stoppable` in list-rules: this is
  // a fact about a process, and In progress is a promise about a row.
  const working = useCallback(
    (item: WorkItem) => !!snap?.supervisor.running?.some((s: any) => s.itemId === item.id),
    [snap?.supervisor.running],
  );

  // Stopping what is under way. The IPC already did the right thing in all
  // three cases (kill any session, then park the row as blocked, which every
  // spawn path skips and the inbox shows) — what was missing was any way to
  // reach it on the two rows that have no session yet. The toast says which of
  // the two happened, because "stopped the agent" on a task that had not
  // started reads as a claim about work that never ran.
  const stopAgent = useCallback(async (item: WorkItem) => {
    // AN AGENT ROW IS NOT WORK OF HERS TO CLOSE, DEFER OR RESTART. It stands
    // for a session running outside Agentbox; the only two things that mean
    // anything to it are a reply and being taken to its window.
    //
    // NOR IS THE ROW THAT SAYS HER TASKS ARE NOT RUNNING, NOR THE ONE THAT SAYS
    // A NEW AGENTBOX IS READY, for the same reason and one more: no ledger
    // anywhere has a row called `trouble` or `update` in it, so every one of
    // these would be a write into nothing. Both behave like a task in every way
    // she can see and in none that she cannot.
    if (item.agent || isTroubleRow(item) || isUpdateRow(item)) return;
    const wasRunning = working(item);
    setFollowing({ product: item.product, id: item.id });
    await (window.zero as any)?.stopSession?.({ product: item.product, id: item.id });
    // Three sentences rather than two and a dash. See the approval label above.
    showToast(wasRunning
      ? 'Agent stopped. Back in your inbox. Reply to redirect it.'
      : 'Stopped before it started. Back in your inbox. Reply to redirect it.');
    await refresh();
  }, [refresh, showToast, working]);

  // RUN NOW, from the three-dot menu on a waiting task (supervisor.runNow).
  // The menu only offers it on a queued task, so the refusals are races: the
  // task started, or left the store, between the menu drawing and the press.
  const runNow = useCallback(async (item: WorkItem) => {
    const r = await window.zero?.runNow?.({ product: item.product, id: item.id });
    showToast(r?.ok ? 'Up next. It starts as soon as an agent is free.'
      : r?.reason === 'running' ? 'Already running.' : 'This task is no longer waiting.');
    await refresh();
  }, [refresh, showToast]);

  // Unstick a stalled item: its answer's delivery mark is forgotten and a
  // fresh worker picks it up on the next tick, within seconds.
  const redeliver = useCallback(async (item: WorkItem) => {
    // AN AGENT ROW IS NOT WORK OF HERS TO CLOSE, DEFER OR RESTART. It stands
    // for a session running outside Agentbox; the only two things that mean
    // anything to it are a reply and being taken to its window.
    //
    // NOR IS THE ROW THAT SAYS HER TASKS ARE NOT RUNNING, NOR THE ONE THAT SAYS
    // A NEW AGENTBOX IS READY, for the same reason and one more: no ledger
    // anywhere has a row called `trouble` or `update` in it, so every one of
    // these would be a write into nothing. Both behave like a task in every way
    // she can see and in none that she cannot.
    if (item.agent || isTroubleRow(item) || isUpdateRow(item)) return;
    const r = await (window.zero as any)?.redeliver?.({ product: item.product, id: item.id });
    showToast(r?.ok ? `A fresh agent is picking this up → ${item.productName}` : 'Nothing here to restart');
    await refresh();
  }, [refresh, showToast]);

  const sendBack = useCallback(async (item: WorkItem) => {
    // AN AGENT ROW IS NOT WORK OF HERS TO CLOSE, DEFER OR RESTART. It stands
    // for a session running outside Agentbox; the only two things that mean
    // anything to it are a reply and being taken to its window.
    //
    // NOR IS THE ROW THAT SAYS HER TASKS ARE NOT RUNNING, NOR THE ONE THAT SAYS
    // A NEW AGENTBOX IS READY, for the same reason and one more: no ledger
    // anywhere has a row called `trouble` or `update` in it, so every one of
    // these would be a write into nothing. Both behave like a task in every way
    // she can see and in none that she cannot.
    if (item.agent || isTroubleRow(item) || isUpdateRow(item)) return;
    await (window.zero as any)?.reopen?.({ product: item.product, id: item.id });
    showToast(`Back in the queue → ${item.productName}`);
    // Back in the queue is out of her inbox, so it hands her the next task
    // too.
    leaveResolved(item);
    await refresh();
  }, [refresh, showToast, leaveResolved]);

  // Can this row be stopped? The rule is `stoppable` in list-rules and it is
  // deliberately the In progress rule, so the tab and the two stop surfaces can
  // never disagree about what is under way. What is left here is the view's own
  // business, the same clock and deferral the list itself passes.
  const stoppableNow = useCallback(
    // An agent row can be replied to and nothing else. Stopping is a promise
    // that the row goes back to her inbox, and there is no row: the session
    // belongs to whatever started it, and Agentbox killing somebody's terminal
    // is not a thing this build does.
    (item: WorkItem) => !item.agent && stoppable(item, { deferredUntil: dueAt(item), now }),
    [dueAt, now],
  );

  // Resume: `ids` for the rows she ticked, null for everything stranded.
  const resumeAgents = useCallback(async (ids: string[] | null) => {
    const r = await (window.zero as any)?.resumeAgents?.(ids ? { ids } : undefined);
    setMultiSel(new Set());
    showToast(r?.cleared
      ? `Resuming: ${r.cleared} interrupted ${r.cleared === 1 ? 'agent' : 'agents'} respawning`
      : 'Nothing stranded. Anything waiting respawns on its own');
    await refresh();
  }, [refresh, showToast]);

  // Put a worker back on named rows, whatever state they are in. Separate from
  // resumeAgents above, which recovers what stopped: this reaches the rows
  // nothing else can, the ones a worker already filed as done.
  const putAgentBackOn = useCallback(async (list: WorkItem[]) => {
    const ids = list.map((i) => i.id);
    const r = await (window.zero as any)?.resumeItems?.({ ids });
    setMultiSel(new Set());
    const started = r?.resumed ?? 0;
    const queued = r?.queued ?? 0;
    // Say which of the three things happened, because "resumed" over a row
    // that did nothing is the failure this command was built to end.
    showToast(started || queued
      ? [started ? `${started} resumed` : '', queued ? `${queued} waiting for a slot` : '']
        .filter(Boolean).join(', ')
      : r?.working
        ? 'Already working on it'
        : 'Nothing to resume');
    // PUTTING A WORKER BACK ON IT IS A WAY OUT OF HER INBOX TOO, and it was the
    // fifth. ⌘K offers "Resume This Agent" on a row she is reading, a worker
    // claims it, and the row moves to In progress — the same emptying as
    // closing one. She was left parked on it.
    //
    // ONLY WHEN IT ACTUALLY WENT, which is why this reads `resumed` and not
    // `queued`. Over capacity the row is only remembered: it stays open, with
    // no claim, and both tabs read the row itself (`belongsInProgress`, which
    // never looks at the supervisor's queue), so it is still sitting in her
    // inbox. Advancing off it would say it had gone. Same reason the reminder
    // above waits for its write.
    if (started > 0) leaveResolved(list[0]);
    await refresh();
  }, [refresh, showToast, leaveResolved]);

  const undo = useCallback(async () => {
    // Inside the grace window: a perfect undo, nothing was ever written.
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      clearTimeout(pending.timer);
      advanceRef.current = null;
      setPendingId(null);
      // the draft has to be back on disk before the item is focused, because it
      // is the draft's presence that opens the reply dock (the effect below).
      // Otherwise she lands on a closed composer holding a message she cannot
      // see.
      const restored = pending.restore?.();
      setFocused(pending.item);
      showToast(restored ? 'Undone. Your message is back in the reply box.' : 'Undone. Nothing was sent.');
      return;
    }
    // PAST THE GRACE WINDOW, Z REACHES THE LAST THING SHE DID, AND AFTER THIRTY
    // SECONDS IT ASKS BEFORE IT DOES IT. It used to act silently for the rest of
    // the session, which is how a row she closed at 1:18pm was back in her inbox
    // at 1:21pm written as her own hand (w-da37b95d1a). The two tiers, and why a
    // deadline was the wrong shape for this, are in ./undo-window.
    //
    // THE QUESTION LIVES IN A REF RATHER THAN IN STATE, because the only thing
    // that reads it is the next keystroke, and a re-render here would redraw the
    // whole list for the sake of a sentence in a toast.
    const now = Date.now();
    const { take: last, rest, instant } = nextUndo(undoStack, now);
    if (!last) {
      undoAskRef.current = null;
      showToast(NOTHING_TO_UNDO);
      return;
    }
    const asked = undoAskRef.current;
    const answeringIt = asked?.entry === last && askStillStands(asked.at, now);
    if (!instant && !answeringIt) {
      undoAskRef.current = { entry: last, at: now };
      showToast(undoAsk(last.undoes));
      return;
    }
    undoAskRef.current = null;
    // The close that put this row away also queued the step onto the next task.
    // If that step has not been taken yet, it must not be taken now, or it
    // would open the next task straight over the row this Z brings back.
    advanceRef.current = null;
    setUndoStack(rest);
    await last.run();
    const restored = last.restore?.();
    const item = restoredItem(restored ?? null);
    const shown = shownAfterUndo(restored, last.brings);
    // Say what the undo actually did, AND WHERE THE WORDS WENT, because the two
    // boxes are different places and she has to be told which one to look in. A
    // bare "Undone" left her hunting for a task Z had silently pulled out of
    // every view.
    showToast(
      item ? `${last.label} · your message is back in the reply box`
        : restored ? `${last.label} · your thread is back in the new thread card`
          : last.label,
    );
    await refresh();
    // A withdrawn reply reopens where she was writing it, words and all. A
    // withdrawn new task reopens the card instead: there is no thread to go to,
    // and the whole point of the press was to add a sentence to what was written.
    // AND A ROW IT PUT BACK IS OPENED, the same as a Z inside the grace window
    // opens it. It used to be announced and left in the list, while she stayed
    // on whatever the close had moved her to (w-7eb39d3c97).
    if (shown.open) { setFocused(shown.open); markSeen(shown.open); }
    else if (shown.compose) { setFocused(null); setModal('compose'); }
  }, [undoStack, refresh, showToast, markSeen]);

  /* ------------------------------- keyboard ------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Nothing behind the sign-in page answers a key.
      if (signInGateRef.current) return;
      // EVERY OTHER KEY ANSWERS NO TO THE QUESTION A LATE Z ASKED, and it is
      // here, above every screen guard, because the answer is no wherever she
      // happens to be typing. Only a second Z goes through with it (`undo`).
      // A modifier on its own is not an answer: she is most likely on her way to
      // pressing the Z, and taking the question away underneath her would leave
      // the shift key cancelling the thing it was helping her type.
      if (!HOLDS_A_KEY.has(e.key) && e.key !== 'z' && e.key !== 'Z') undoAskRef.current = null;
      // Settings is a SCREEN, not a modal over the list, so every key that acts
      // on the list behind it would act on something she cannot see. It owns
      // the keyboard while it is up; esc (handled inside it) is the way out.
      if (settingsOpen) return;
      // The new project card is the topmost thing on screen while it is up, so
      // it owns escape and nothing behind it may act on a key it never saw.
      if (newProject) {
        if (e.key === 'Escape') { e.preventDefault(); setNewProject(false); }
        return;
      }
      // A DOCUMENT IS A TEXT FIELD TOO. The pane's markdown is a
      // contenteditable, so without this every letter she types into a file is
      // also a shortcut: E closes the task, S schedules it.
      const target = e.target as HTMLElement;
      const inInput = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || !!target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setModal((m) => (m === 'palette' ? null : 'palette'));
        return;
      }
      // ⌘J SHOWS AND HIDES THIS TASK'S TERMINAL.It is the chord VS Code,
      // Cursor and Zed all use for the same panel, so there is nothing new to
      // learn.
      //
      // IT IS DELIBERATELY ABOVE THE `inInput` GATE. A terminal she cannot
      // summon while the cursor is in the reply box is one she has to click
      // away from first, which is the friction the chord exists to remove, and
      // it is how every editor with this chord behaves.
      //
      // A terminal belongs to a task, so with no task open there is nothing to
      // show, and the key says so rather than going quiet.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (!focused || focused.agent) { showToast('Open a task to use its terminal'); return; }
        window.dispatchEvent(new Event('task-terminal-toggle'));
        return;
      }
      // TAB MOVES ALONG THE STATE TABS: on the threads page it cycles Needs
      // you, In progress, Scheduled, Done and All. Shift-Tab goes back, and
      // both wrap.
      //
      // ONLY WHERE THOSE TABS ARE ON THE SCREEN WITH NOTHING OVER THEM: not
      // from inside a field, not with a card or a menu open, not on an opened
      // task (pinned next door in tab-does-nothing-on-an-open-task.test.mjs),
      // not while a search is up, and not in board view, which draws no tabs.
      // Everywhere else Tab goes on walking browser focus as it has since
      // 2026-09-14, and a field-level editor still eats its own first.
      if (e.key === 'Tab') {
        const onTheTabs = !inInput && !modal && !focused && !focusedRepeat && !inFullScreen
          && !settingsOpen && !teamShown && !openCard
          && search === null && inboxDisplay.view === 'list';
        if (!onTheTabs) return;
        // Built, not left alone: the browser's own focus walk would otherwise
        // paint a ring on whatever it landed on behind the rotation.
        e.preventDefault();
        setHoveredId(null);
        (document.activeElement as HTMLElement | null)?.blur?.();
        setMultiSel(new Set());
        setView(nextTab(stateTabOrder, view, e.shiftKey) as View);
        setSelected(0);
        return;
      }
      // NO ⌘1 TO ⌘4 (w-914b16eab6, 2026-10-02). They went straight to a
      // section of the sidebar until the sections became the tabs above, which
      // Tab walks. They were removed on her word, not left as a second way in.
      // cmd-A: select everything in the current list for batch action. It
      // works from inside a focused task too (dropping back to the list),
      // and pressing it again with everything selected clears the selection.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'a' && !inInput && !modal) {
        e.preventDefault();
        setFocused(null);
        setMultiSel((m) => m.size >= list.length && list.length > 0 ? new Set() : new Set(list.map((i) => i.id)));
        return;
      }
      // cmd-Y / cmd-N (answer the oldest approval card) live in the MAIN
      // process (before-input-event in main.mjs): menu accelerators and
      // renderer handlers both go quiet while an iframe holds focus, and these
      // two chords must outrank it (2026-08-06). cmd-1..4 USED
      // TO retag priority on whatever was selected. It is gone on her word,
      // along with the hint column the drawer drew and the ⌘K key hints. ⌘K
      // still reaches every level by name, which is the route she actually
      // used. The chord is not merely unadvertised; it does not fire, so ⌘1..4
      // is free again. It went to the sidebar's sections from 2026-09-23 to
      // 2026-10-02 and that is gone too, for Tab. What must never come back is
      // the PRIORITY reading of those keys. Modifier chords belong to the menu and the OS (cmd-R
      // reload, cmd-C copy); a single-letter shortcut must never fire
      // underneath one.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (modal || inInput) {
        if (e.key === 'Escape' && !inInput) setModal(null);
        return;
      }
      // Everything above has returned for modals and for typing, so a shortcut
      // that opens a text field swallows its own keystroke HERE, once, ahead of
      // every branch that could open one. Doing it per branch is what let S
      // through in two places at once (renderer/src/keys.ts carries the story).
      if (opensATextField(e.key)) e.preventDefault();
      // THE PANEL KEY, above the branch that splits list from full screen,
      // because it means the same thing in both and a shortcut written once
      // cannot drift between them. \ is next to Return on the key she is
      // already resting on, it opens no text field, and no other verb wants it.
      if (e.key === '\\') {
        e.preventDefault();
        togglePanel();
        return;
      }
      // SEARCH OPENS FROM ANYWHERE, which is why it sits beside the panel key
      // and above the branch that splits the list from an open task: `/` means
      // the same thing in both, and a shortcut written twice is one edit away
      // from meaning two things. Its keystroke is swallowed up at the guard
      // above (keys.ts), because it opens a text field and would otherwise type
      // itself into it.
      if (e.key === '/') {
        e.preventDefault();
        openSearch();
        return;
      }
      // AN OPEN REPEATING TASK IS A SCREEN, AND EVERY KEY STOPS HERE.
      //
      // There was no branch for it at all, so with a rule on screen the whole
      // switch below ran against the LIST BEHIND THE PANE. Measured on the
      // built app, 2026-08-21: Escape did nothing, J and K walked a list she
      // could not see, and E — which this very screen advertised as "ends this
      // repeating task" — landed in the snoozed view's branch, which means run
      // it again. The toast read "Running again" and a task she had
      // deliberately deferred was un-deferred. The rule itself was never
      // touched.
      //
      // So this returns on everything, the way an open task does. It is placed
      // ABOVE the task branch rather than inside it because the two are
      // mutually exclusive states and only one of them owns the keyboard.
      if (focusedRepeat) {
        if (e.key === 'Escape') { e.preventDefault(); setFocusedRepeat(null); setEditingRule(false); }
        // R means the same thing it means on a task: open the box and say the
        // next thing. On a rule the next thing is what it does from now on.
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setEditingRule(true); }
        // NOTHING ELSE, AND DELIBERATELY NO KEY FOR ENDING IT. E archives on
        // every other screen, and giving it "destroy this rule and every future
        // run" here would be the one place a reflex is unrecoverable.
        return;
      }
      if (focused) {
        // A CHANGE OPEN IN THE PANE HAS ALREADY ANSWERED ITS OWN KEYS.
        //
        // Measured 2026-08-27: both this handler and the change's own are on
        // the window, so both ran on the same press. J walked to the next
        // FILE here and to the next TASK below, in one keystroke — the change
        // she was reading vanished and another card came up. The arrows were
        // the same fault: they scrolled the code and moved the selected
        // option together, arming an answer she had not picked. Which keys
        // those are is in code-keys.ts, next to what they mean, and this asks
        // once rather than in each branch under it — keys.ts carries the
        // story of why that matters.
        if (docKind(openDoc?.src) === 'code' && changeOwnsKey(e.key)) return;
        // Arrows walk the options; Enter sends ONLY a visible selection.
        // Nothing is pre-selected when a task opens, so Enter on arrival is
        // inert: an approval always requires a deliberate arrow or number.
        // The same test the strip draws itself with, or the number keys and
        // what she can see disagree. Her reply from Tuesday no longer buries an
        // offer a worker wrote on Friday (format.ts, offerIsLive).
        const opts = offerIsLive(focused) ? itemOptions(focused) : [];
        // ESCAPE IS ONE WAY BACK, one step at a time: the document, then the
        // task, then the list. It has always meant "back" all the way out and
        // the pane is one more level in.
        if (e.key === 'Escape') { if (escapeClosesDoc(openDoc)) closeArtifact(); else setFocused(null); }
        else if (e.key === 'ArrowDown' && opts.length) {
          e.preventDefault();
          setOptionSel((s) => {
            const i = opts.findIndex((o) => o.n === s);
            return opts[Math.min(i + 1, opts.length - 1)].n; // from null (-1) → first
          });
        }
        else if (e.key === 'ArrowUp' && opts.length) {
          e.preventDefault();
          setOptionSel((s) => {
            const i = opts.findIndex((o) => o.n === s);
            return i <= 0 ? null : opts[i - 1].n; // above the first → nothing selected
          });
        }
        else if (e.key === 'Enter') { e.preventDefault(); if (optionSel !== null) pickOption(focused, optionSel); }
        // J/K walk the inbox from inside a task (Superhuman): read one, jump
        // to the next, leave the arrows to scroll the document and options.
        else if (e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          const idx = list.findIndex((i) => i.id === focused.id);
          const base = idx >= 0 ? idx : selected;
          const next = (e.key === 'j' || e.key === 'J') ? base + 1 : base - 1;
          const target = list[next];
          if (target) { setFocused(target); markSeen(target); setSelected(next); }
        }
        // E archives, unconditionally. It must never approve on her behalf.
        else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); markDone(focused); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setOpenDoc(null); setModal('reply'); }
        // N (AND THE OLDER C) MEAN THE SAME THING ON BOTH SCREENS. The + in
        // the top bar is on this screen too and its tooltip says "New task
        // (N)", so the key is already advertised here.
        else if (e.key === 'c' || e.key === 'C' || e.key === 'n' || e.key === 'N') { e.preventDefault(); setModal('compose'); }
        // L, NOT S, SINCE 2026-10-01. S was the schedule picker here and the
        // summary panel on the same screen (threads/Summary.tsx listens first
        // and eats it), so the two fought over one letter and a persona test
        // hit both in a minute. L is for later and it is the only key that
        // schedules anywhere in the app.
        else if (e.key === 'l' || e.key === 'L') openSnooze(focused);
        else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
        else if (/^[1-9]$/.test(e.key)) pickOption(focused, Number(e.key));
        return;
      }
      switch (e.key) {
        case 'j': case 'J':
        case 'ArrowDown': {
          e.preventDefault();
          // THE KEYBOARD TAKES THE LIST BACK. Without this a pointer left
          // sitting on a row keeps hold of R and E for as long as it sits
          // there, and walking the list would close the wrong thing.
          setHoveredId(null);
          const next = Math.min(selected + 1, Math.max(0, list.length - 1));
          if (e.shiftKey) {
            setMultiSel((m) => new Set([...m, ...(current ? [current.id] : []), ...(list[next] ? [list[next].id] : [])]));
          } else if (multiSel.size) setMultiSel(new Set());
          setSelected(next);
          break;
        }
        case 'k': case 'K':
        case 'ArrowUp': {
          e.preventDefault();
          setHoveredId(null);
          const next = Math.max(0, selected - 1);
          if (e.shiftKey) {
            setMultiSel((m) => new Set([...m, ...(current ? [current.id] : []), ...(list[next] ? [list[next].id] : [])]));
          } else if (multiSel.size) setMultiSel(new Set());
          setSelected(next);
          break;
        }
        case 'Enter': if (!multiSel.size && pointed) { setFocused(pointed); markSeen(pointed); } break;
        case 'e': case 'E':
          e.preventDefault();
          // In the snoozed view E wakes things: getting an item back is that
          // view's whole point, and nothing should quietly become done there.
          if (view === 'snoozed') unsnooze(multiSel.size ? selectable.filter((i) => multiSel.has(i.id)) : pointed ? [pointed] : []);
          else if (multiSel.size) batchDone(multiSel);
          else if (pointed && view === 'inbox') markDone(pointed);
          break;
        case 'r': case 'R': if (!multiSel.size && pointed && view === 'inbox') { e.preventDefault(); setFocused(pointed); markSeen(pointed); setModal('reply'); } break;
        // 1 AND 2 ANSWER A CODEX CONVERSATION'S ROW WITHOUT OPENING IT, and I
        // brings a declined one back from Closed. Only on those rows: on every
        // other row they stay dead, as they were. They were Y and N until
        // w-fb9051e597, which freed N for a new task.
        case '1': if (!multiSel.size && pointed && isImportRow(pointed)) { e.preventDefault(); void answerImport(pointed, 'yes'); } break;
        case '2': if (!multiSel.size && pointed && isImportRow(pointed)) { e.preventDefault(); void answerImport(pointed, 'no'); } break;
        case 'i': case 'I': if (!multiSel.size && pointed && view === 'done' && isNotImportedRow(pointed)) { e.preventDefault(); void answerImport(pointed, 'yes'); } break;
        // L swallows its own keystroke up at the guard, not here: this branch
        // and the focus-mode one both open the picker (renderer/src/keys.ts).
        // It was S until 2026-10-01; see the focus-mode branch above.
        case 'l': case 'L':
          if (multiSel.size) openSnooze(selectable.filter((i) => multiSel.has(i.id)));
          else if (pointed && (view === 'inbox' || view === 'snoozed')) openSnooze(pointed);
          break;
        // N does the same as C: the letter she reached for (w-fb9051e597).
        case 'c': case 'C': case 'n': case 'N': e.preventDefault(); setModal('compose'); break;
        case 'z': case 'Z': undo(); break;
        // B FLIPS LIST AND BOARD (w-58c8f466e7): "I quite often switch between
        // board and list view". B for board; it shipped as V first and that
        // read as "a weird one". Only where the list or the board is what is
        // on the screen; a search, the Team page and an open card draw
        // something else.
        case 'b': case 'B':
          if (search === null && !teamShown && !openCard) { e.preventDefault(); setInboxDisplay(flipView(inboxDisplay)); setSelected(0); }
          break;
        case 'Escape':
          if (multiSel.size) setMultiSel(new Set());
          // Search with the field unfocused, which is what she is left in after
          // reading a result and pressing escape out of it. Escape has to keep
          // meaning "back" all the way out rather than stopping one level in.
          else if (search !== null) closeSearch();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, newProject, focused, focusedRepeat, inFullScreen, togglePanel, current, pointed, list, view, markDone, openSnooze, pickOption, undo, markSeen, optionSel, snoozed, unsnooze, items, selectable, batchDone, selected, showToast, snap, multiSel, refresh, settingsOpen, search, openSearch, closeSearch, openDoc, artifactMode, artifactReturnBeside, teamShown, openCard, inboxDisplay, setInboxDisplay, stateTabOrder]);

  // WHO HOLDS THE KEYBOARD WHILE SEARCHING. The field is in the top bar and
  // stays mounted while a result is open, so without this the J and K that walk
  // the inbox from inside a task would be typed into the query instead. Opening
  // a row hands the keyboard back to the app; coming out of that row hands it
  // to the field again, so escape reads as one continuous way back: task,
  // results, the list she started on.
  useEffect(() => {
    if (search === null) return;
    if (focused || modal || settingsOpen) searchRef.current?.blur();
    else searchRef.current?.focus();
  }, [search, focused, modal, settingsOpen]);

  useEffect(() => { setSelected((s) => Math.min(s, Math.max(0, list.length - 1))); }, [list.length]);

  /* ------------------------- ⌘R comes back here -------------------------- */
  // WRITING IT DOWN. Every move she makes, into localStorage, because the whole
  // of React state is thrown away by the reload and nothing else survives it.
  // It costs one small JSON write per navigation, which is far less than the
  // app already writes for a single keystroke in the reply box.
  //
  // The write is held until the restore has run. Otherwise the first render of
  // the reloaded page, which is the inbox with nothing open, overwrites the
  // note it is about to read.
  useEffect(() => {
    if (reloaded === null || (reloaded && !restored)) return;
    const place: Place = { view };
    // The scroll position is NOT set here, and leaving it out is what clears it:
    // she has moved, so whatever she had scrolled to belongs to where she was,
    // not to where she is. writeScroll puts it back as soon as she scrolls.
    if (focused) place.item = { product: focused.product, id: focused.id };
    if (focusedRepeat) place.repeat = { product: focusedRepeat.product, id: focusedRepeat.id };
    if (openDoc) place.doc = { product: openDoc.product, src: openDoc.src };
    if (settingsOpen) place.settings = true;
    if (search !== null) place.search = search;
    if (current) place.row = current.id;
    writePlace(window.localStorage, place);
    // The dependencies are ids and not the rows themselves. Every snapshot
    // poll hands back fresh objects for the same work, and depending on those
    // would rewrite this file every ten seconds to say what it already said.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloaded, restored, view, focused?.id, focused?.product, focusedRepeat?.id,
    openDoc?.src, openDoc?.product, settingsOpen, search, current?.id]);

  // READING IT BACK, once, on a reload and never on a fresh launch. Opening
  // Agentbox in the morning still opens on the inbox: that is the design of the
  // app and the reason the idle screen and the first run have anywhere to be.
  // `bootInfo.reloaded` is true only for the ⌘R it was added for.
  //
  // A row that is gone since — she answered it elsewhere, an agent closed it —
  // simply does not come back, and she lands on the tab it was in, which is
  // still nearer where she was than the inbox is.
  useEffect(() => {
    if (restored || reloaded !== true || !snap) return;
    // THE FIRST RUN OUTRANKS IT. The walk drives the app itself, tab by tab,
    // and a reload in the middle of it belongs to the walk rather than to
    // wherever she happened to be standing. This effect is declared below the
    // walk's, so `run` is already decided by the time it is read. The same
    // test the walk itself uses is repeated because the two effects settle on
    // the same commit, and on that one render `run` is still null.
    if (run || firstRunNeeded({
      products: snap.products.length, done: firstRunDone(localStorage), forced: !!forcedRun.current,
    })) { setRestored(true); return; }
    const place = wasAt.current;
    if (!placeIsSomewhere(place)) { setRestored(true); return; }
    // A rule cannot be looked up until its own channel has answered, and that
    // answer comes after the snapshot. Everything else is ready now, so waiting
    // for it costs nothing on the ordinary reload, which has no rule open.
    if (place.repeat && repeats.length === 0) return;
    setRestored(true);
    setView(place.view);
    if (place.settings) setSettingsOpen(true);
    if (place.search !== undefined) {
      searchReturn.current = { view: place.view, selected: 0 };
      setSearch(place.search);
    }
    const rule = place.repeat
      ? repeats.find((r) => r.id === place.repeat!.id && r.product === place.repeat!.product) ?? null
      : null;
    const card = place.item
      ? selectable.find((i) => i.id === place.item!.id && i.product === place.item!.product) ?? null
      : null;
    if (rule) setFocusedRepeat(rule);
    else if (card) {
      // Left for the pane effect, which runs on this same change and would
      // otherwise choose a document for her all over again.
      pendingDoc.current = { id: card.id, doc: place.doc ? { ...place.doc } : null };
      // HER PLACE IN THE CONVERSATION, on a reload and only on a reload. The
      // pane spends it once against this id and then lands every later open of
      // this task at the bottom, which is the pair of answers wanted.
      if (place.scroll) setResumeAt({ id: card.id, top: place.scroll });
      setFocused(card);
    }
    // The cursor is NOT set here. `list` is still the tab she is being moved
    // off, so an index taken now would point into the wrong list; it is left to
    // the effect below, which runs once the tab has actually changed.
    wantRow.current = place.row ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, reloaded, snap, repeats, selectable, run]);

  // THE ROW THE CURSOR WAS ON, by id rather than by index: the list is rebuilt
  // from a fresh snapshot and row four may not be the row it was a second ago.
  // It waits for the list it belongs to, then gives up: a row that is no longer
  // in this tab leaves the cursor at the top, which is where a reload used to
  // leave it anyway.
  useEffect(() => {
    if (!restored || !wantRow.current) return;
    const at = list.findIndex((i) => i.id === wantRow.current);
    if (at >= 0) { wantRow.current = null; setSelected(at); }
    else if (list.length) wantRow.current = null;
  }, [restored, list]);

  // The frame between "the snapshot is here" and "she is back where she was".
  // Without this the reloaded window draws the inbox for a beat and then jumps,
  // which is the same lost-place fault in a shorter form.
  const restoring = reloaded === null
    || (reloaded === true && !restored && placeIsSomewhere(wasAt.current));

  // NOTHING RESETS THE PANEL. There used to be an effect here putting it back
  // up every time she left a task, so "up by default" meant every time rather
  // than once. That is retired: a press she made is remembered throughout the
  // app, and an effect that undoes her press on the way back to the list is
  // exactly the amnesia to avoid. The default now applies
  // to a machine that has never been told, and to nothing else.

  // Scheduled remains a destination even when no tasks are scheduled.

  // The advance: open whatever occupies the resolved item's slot, computed
  // with that item explicitly excluded (its write is deferred behind the
  // grace window, so it may still be in the fold for a few seconds).
  useEffect(() => {
    const pending = advanceRef.current;
    if (!pending || view !== 'inbox' || focused) return;
    advanceRef.current = null;
    const next = nextAfterAdvance(shownInbox, pending);
    if (next) { setFocused(next.item); markSeen(next.item); setSelected(next.index); }
  }, [shownInbox, view, focused, markSeen]);

  /* -------------------------------- render -------------------------------- */
  // (Hooks live ABOVE the boot return: below it, React counts them
  // differently between the boot render and the first real one, #310.)

  // THE WORKSPACE CHROME. `workspaceNavigationShown` is the one place that
  // decides whether the sidebar is drawn at all; the walk hides it.
  const workspaceNavigation = workspaceNavigationShown({ inFullScreen, walking });
  /* A TASK IS OPEN AND THE CORNER IS ITS OWN (w-581dbc6cc4, 2026-09-27). The
     same condition the task header and the terminal socket already use, named
     once so the corner cannot disagree with them about which screen this is. */
  const taskOpen = workspaceNavigation && !!focused && !settingsOpen;
  const artifactView = artifactPlacement(artifactMode, artifactWidth);
  const [artifactHeader, setArtifactHeader] = useState<HTMLDivElement | null>(null);
  const readingWidth = 'balanced';
  const [taskHeader, setTaskHeader] = useState<HTMLDivElement | null>(null);
  // The socket look B of w-581dbc6cc4's round teleports the code mark into.
  const [cornerHeaderTarget, setCornerHeaderTarget] = useState<HTMLSpanElement | null>(null);
  const workspaceCollapsed = !panelUp;
  const toggleWorkspace = togglePanel;

  // A schedule set on a thread. On one RUN of a repeating task it moves that
  // task's rule rather than making a second one; on ordinary work it makes that
  // work repeating, using the item's own words as the brief.
  const applyRepeat = async (item: WorkItem, rule: RepeatShape) => {
    // AN AGENT ROW IS NOT WORK OF HERS TO CLOSE, DEFER OR RESTART. It stands
    // for a session running outside Agentbox; the only two things that mean
    // anything to it are a reply and being taken to its window.
    //
    // NOR IS THE ROW THAT SAYS HER TASKS ARE NOT RUNNING, NOR THE ONE THAT SAYS
    // A NEW AGENTBOX IS READY, for the same reason and one more: no ledger
    // anywhere has a row called `trouble` or `update` in it, so every one of
    // these would be a write into nothing. Both behave like a task in every way
    // she can see and in none that she cannot.
    if (item.agent || isTroubleRow(item) || isUpdateRow(item)) return;
    const ruleId = ruleIdOf(item);
    try {
      if (ruleId) {
        await api.setRepeat({ product: item.product, id: ruleId, rule });
        showToast(`Now ${ruleLabel(rule)}`);
      } else {
        // AND THE ROW'S OWN ENGINE AND MODEL, because "make this work
        // repeating" means this work, and this work has a harness. Dropping
        // them here would quietly move a Codex task onto the workspace default
        // the moment she scheduled it.
        await api.composeRepeat({
          product: item.product, title: item.title, body: item.body, priority: item.priority, rule,
          engine: item.engine, model: item.model,
        });
        showToast(`Repeating: ${ruleLabel(rule)}`);
      }
      setRepeats(await api.repeats());
    } catch (err) {
      showToast(`Not set: ${(err as Error).message}`);
    }
  };

  const clearedToday = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    // A quiet run of a repeating task never passed her, so counting it would
    // credit her with clearing something she was never shown.
    return items.filter((i) => i.status === 'done' && !isCleanRun(i) && i.updatedAt >= start.getTime()).length;
  }, [items]);

  // THE IDLE PAGE ALWAYS WEARS THE PICTURE, WHATEVER MODE THE APP IS IN.
  //
  // It is the first and only exception to "mode follows the machine", and it
  // is one page wide. Nothing is written to localStorage: her stored look is
  // untouched and comes straight back when the page goes.
  //
  // WHY IT PINS ON THE GROUND AND NOT ON `inboxZero`. A modal floating over
  // this page is still this page, so pressing C must not flip the whole window
  // to light behind the compose card. Settings is the one thing that does lift
  // the pin, because the theme picker lives there and a picker showing Light
  // over a dark window is a control arguing with itself.
  //
  // THE SETUP SCREENS WEAR THE PICTURE, AND THEY HAVE TO BE TOLD TO.
  //
  // Corner to corner was picked in round two OVER THE LAKE, and 5e2c6ee gave
  // `.fr-screen` the photograph to match. But it gave it under
  // `:root[data-skin]`, which is on only while a picture is SWITCHED ON, and on
  // a first run nothing has switched one on: `resolveSkin(null)` is 'none'.
  //
  // It looked right anyway, by accident, for exactly as long as nobody tried it
  // with a real inbox. A brand new store has nothing in it, so `idlePinned`
  // below was already pinning the lake and the welcome inherited it. HER window
  // had rows: Claude Code agents land in the inbox and in no other list, while
  // the walk only counts PROJECTS, so an empty store and a full inbox happen at
  // the same time. The pin was off and the welcome came up as a charcoal slab,
  // #373a41.
  //
  // So the walk pins the picture itself rather than hoping to inherit one. Only
  // the three SETUP screens, which are full surfaces of their own; the steps
  // after them are tethered over the real app, and that app is hers to look
  // however she has set it.
  // AND THE PIN STOPS AT THE PICKER, WHICH IS THE LAST SCREEN BEFORE THE
  // PRACTICE ROUND. `look` is excluded on purpose: a screen that pins the
  // default while she presses tiles is a picker that does not work, and the
  // window repainting under her hand is the whole of what that screen is for.
  //
  // THIS LINE USED TO NAME THREE STEPS AND THAT IS THE BUG SHE PHOTOGRAPHED ON
  // 2026-08-26. It read `welcome || folder || name`, which was every screen
  // before the picker while the picker was beat four. Moving the picker to beat
  // seven on 08-25 slid the introduction's three slabs in front of it and left
  // them pinning nothing, so they fell through to whatever the store holds. On
  // a Mac that has never chosen, the first-run seed makes that Gouache Valley
  // and the fault is invisible; on one that has chosen, it is plain light.
  //
  // So the question is asked of the step ORDER now (`wearsTheWalksLook`,
  // onboarding.ts) rather than of three names, and moving the picker again
  // moves this with it.
  //
  // AND THEN IT WENT (w-9e434e8671): the walk has no picker any more, so its
  // setup screens wear the chosen look, Light or Dark, like the rest of it.
  const firstRunPinned = false;
  // AND THE INBOX ZERO PIN IS OFF FOR THE WHOLE OF THE WALK (`run === null`).
  //
  // IT STARTED AS ONE STEP AND IT WAS NOT ENOUGH. On 08-24 this read
  // `!pickingLook`, off a measurement of the picker: pressing a tile moved
  // `zero.skin` and the tile's own tick and did NOT move the window, because
  // the app behind the walk is an empty inbox and this pin was painting the
  // default back over the choice on every render. A picker whose picture does
  // not change is a picture of a picker.
  //
  // Two faults wore that one sentence. The harness that took the page pressed
  // Light and then failed to press back (scripts/shot-the-built-walk.mjs, and
  // it throws now rather than carrying on). And this line: the pin is not only
  // on the picker screen, it is on every beat of the practice round where the
  // inbox happens to be empty, which is beats 9, 10 and 17 to 19. So somebody
  // who picked Light walked a tutorial that went dark on five screens and light
  // on six, and somebody who picked one of the other fifteen photographs saw
  // Gouache Valley on those five.
  //
  // THE EARLIER DECISION IS NARROWED BY A LATER ONE, and `skin ===
  // 'none'` is the whole of the narrowing.
  //
  // So the two halves of the rule split exactly here. A PICTURE she picked
  // is remembered at inbox zero, because a picture is the nice theme, and
  // swapping it for a different picture is the app forgetting. Turning that
  // off too would be this clause, and nothing else.
  //
  // AND THEN IT WENT (w-9e434e8671). With three choices, Light, Dark and Match
  // system, a pin to plain dark at inbox zero would show a theme nobody can
  // pick, so inbox zero wears the chosen look like every other page.
  const idlePinned = false;
  // IT IS THIS PAGE ONLY, and nothing here reaches the inbox, the walk or the
  // setup screens.
  useEffect(() => {
    // TWO PINS, TWO RULES. Both live in skins.ts, one function each, so the
    // two screens cannot drift apart.
    //
    // The theme is pinned dark in both, because a picture is dark and because
    // inbox zero is a dark screen either way.
    if (firstRunPinned) {
      // THE WALK OPENS ON A PICTURE, hers if she has one and Gouache Valley if
      // she has not. NOTHING IS WRITTEN HERE: the moment the picker opens, her
      // stored look is back, which is what keeps the earlier fault fixed.
      const pinned: SkinChoice = walkSkin(skin);
      applyTheme('dark');
      applySkin(pinned);
      if (pinned !== 'none') applyTune(resolveTune(localStorage.getItem(TUNE_KEY), pinned));
      return;
    }
    if (idlePinned) {
      // THE IDLE PAGE PAINTS THE PICTURE THAT IS ON, and nothing when none is.
      // An earlier decision, unchanged by this row.
      const pinned: SkinChoice = idleSkin(skin);
      applyTheme('dark');
      applySkin(pinned);
      if (pinned !== 'none') applyTune(resolveTune(localStorage.getItem(TUNE_KEY), pinned));
      return;
    }
    applyTheme(resolveTheme(theme));
    // WHICH WAY THE MAC IS POINTING, written on the root so the Match my system
    // tile can draw it. A rule cannot ask the Mac and the renderer already knows,
    // so this is the one place the answer crosses over into the stylesheet. It is
    // written unconditionally, because the tile is on the screen in Settings and
    // in ⌘K whatever the window is currently wearing.
    document.documentElement.setAttribute('data-machine', machine);
    // Match system on a dark Mac is Dark, which is Ember Grid (skins.ts).
    const worn = wornSkin(theme, skin, machine);
    applySkin(worn);
    if (worn !== 'none') applyTune(resolveTune(localStorage.getItem(TUNE_KEY), worn));
    // `machine` is in the list because on Match my system it is half the answer:
    // without it the effect never re-runs when macOS flips and the window stays
    // on whichever it was at launch.
  }, [idlePinned, firstRunPinned, theme, skin, machine]);

  // THE SAME SCREEN, held for the beat it takes ⌘R to put her back where she
  // was, so the reload never shows her the inbox on its way to the task. Its
  // own line above the boot check rather than another clause inside it: on a
  // fresh launch `restoring` is false before the first paint, and the line
  // below has to go on reading exactly as it always did.
  if (restoring) return <div className="boot">{NAME}</div>;
  if (!snap) return <div className="boot">{NAME}</div>;

  // Searching is never inbox zero, whatever the inbox holds: the zero state
  // takes the whole screen, and it appearing under a query she is typing would
  // read as the search having emptied her inbox.
  //
  // A MODAL OVER THIS PAGE IS STILL THIS PAGE.
  //
  // `!modal` used to sit in this condition, so pressing C or Cmd+K at inbox zero
  // swapped the whole page out for the ordinary list, and an ordinary list with
  // an empty inbox drew that sentence behind her card. The idle page stays up
  // under the overlay now, which is the call `idlePinned` above already makes
  // about the theme for exactly the same reason.
  // THE TEAM VERSION KEEPS ITS TABS ON AN EMPTY INBOX (2026-10-01): the
  // categories must stay on screen even with nothing in them. So the
  // whole-page zero is only the old layout's; the new one draws its zero under
  // the tabs, in the list's place (threads/Pages.tsx, InboxClear).
  const inboxEmpty = !workspaceNavigation && view === 'inbox' && inbox.length === 0 && !focused && !settingsOpen && search === null;

  // AND A VIEW WITH NOTHING IN IT DRAWS NO CARD EITHER. The other half of the
  // same directive: painting the sentence out of the empty pane leaves a large
  // blank slab, which reads as a list that failed to load rather than as a list
  // with nothing in it. So the card goes too and the view shows the ground, the
  // way the inbox zero page already does.
  //
  // SEARCH IS NOT THIS. A query that matches nothing still gets the card and
  // still gets its sentence (List.tsx says why), so this asks for search to be
  // off, not merely empty.
  const emptyView = search === null && !focused && !focusedRepeat && list.length === 0
    && !(view === 'snoozed' && repeats.length > 0);
  const bareView = search === null && !focused && !focusedRepeat && list.length === 0
    && !(view === 'snoozed' && repeats.length > 0) && !workspaceNavigation;
  // ONE SURFACE ON AN OPENED TASK (design C): no card, hairlines
  // only, and the reading column centred on the window rather than on the pane
  // the panel left over. `flat` is the same condition that used to draw the
  // card, so the inbox list is untouched. `panel-up` is here because the
  // centring is arithmetic on the panel's width, and there is nothing to
  // correct for when the panel is down. Both rules live under "ONE SURFACE" in
  // styles.css. `doc-open` is here for one rule and it earns its place: the way
  // out of a task pays the window's own 22px gutter, and the only thing in the
  // app that can take that gutter away is a file opened beside the message,
  // which squeezes the reading column until her heading starts at 32. The rule
  // that slides the mark hard left in that case needs the FOCUS PANE's width,
  // and the pane is only the window's own left edge while a file is open (the
  // panel is hidden then, see panelShown above). So the class says "the pane
  // starts at x=0 and its width is the width that matters", which is exactly
  // when the sliding rule is allowed to run. See ".back-esc" in styles.css. AND
  // `composing` IS ON THAT LIST SO THE TOAST CAN GET OUT OF THE COMPOSER'S WAY.
  // The toast lives at the bottom centre of the window, which is exactly where
  // the reply card is, so a message raised BY the reply box lands ON the reply
  // box. Measured at 900x900 with the mode toast up: it sat squarely over the
  // Send button for its whole 2.5 seconds, right at the moment somebody has
  // just picked a mode and is reaching for the send key. That is a smaller copy
  // of the fault fixed this round, so it is not shipped. The class is
  // `modal === 'reply'` and nothing else; the rule that reads it sits beside
  // `.toast` in the stylesheet and says why it moves to the top rather than
  // merely further up.
  return (
    <TeamContext.Provider value={team}>
    <LiveContext.Provider value={liveIds}>
    <div data-design-toolbar={toolbarExploration ? designToolbar : 'corner'} data-preview-treatment={previewTreatment} data-reading-width={readingWidth} data-artifact-layout={workspaceNavigation && openDoc ? artifactView : undefined} data-chrome={fullScreenDoc ? (chromeUp ? 'up' : 'away') : undefined} className={`app${workspaceNavigation ? ' workspace-layout' : ''}${workspaceNavigation && focused && !settingsOpen ? ' workspace-task' : ''}${settingsOpen ? ' workspace-settings' : ''}${teamShown ? ' workspace-team' : ''}${workspaceCollapsed ? ' workspace-collapsed' : ''}${inFullScreen && !workspaceNavigation ? ' flat' : ''}${panelShown ? ' panel-up' : ''}${openDoc ? ' doc-open' : ''}${inPractice ? ' banded' : ''}${modal === 'reply' ? ' composing' : ''}`}>
      {signInGate && <SignInPage signedOut={signedOutHere} error={snap?.team?.error ?? null} />}
      {/* THE TOP BAR IS NOT DRAWN ON AN OPENED TASK.

          WHAT REPLACES IT IS NOT NOTHING, and the reason is three buttons this
          app does not draw. The window is titleBarStyle hiddenInset, so macOS
          paints its own close, minimise and zoom over the top-left corner of
          whatever we render. Measured off her own screenshot on this row: they
          occupy x 9..68 and y 10..23 in window points. A task drawn from y=0
          puts the back arrow, and at a narrow width the title itself, under
          them. The strip also carries -webkit-app-region: drag, which is the
          only thing on this screen that lets her move the window at all.

          So the strip stays at 34 points, empty and draggable, and that is the
          whole of what is left of the bar. 94 points become 34.
       */}
      {reviewLab && <div className="review-lab-controls"><span>Review exploration</span><select aria-label="Focus controls" value={focusControlStyle} onChange={e=>setFocusControlStyle(e.target.value as FocusControlStyle)}><option value="text">Focus · Text only</option><option value="corners">Focus · Frame corners + label</option><option value="corners-icon">Focus · Frame corners button</option><option value="corners-bare">Focus · Bare frame corners</option><option value="layout">Focus · Workspace layout</option></select><select aria-label="Review file type" value={artifactPreviewSample} onChange={e=>{setArtifactPreviewSample(e.target.value);setOpenDoc(null);}}><option value="code">Code</option><option value="design">Design</option><option value="notes">Text</option><option value="multiple">All three</option></select><select aria-label="Review actions" value={reviewStyle} onChange={e=>setReviewStyle(e.target.value)}><option value="header-balanced-open">1 · Balanced · open only</option><option value="header-tools-open">2 · Compact · open only</option><option value="header-card-only">3 · Clickable card · no controls</option><option value="header-feedback-only">4 · Clickable card · feedback tools</option><option value="header-balanced">Compare · all controls</option></select>{artifactPreviewSample !== "code" &&<select aria-label="Text surface" value={textReviewStyle} onChange={e=>setTextReviewStyle(e.target.value)}><option value="clear">Text · Fully transparent</option><option value="glass">Text · Matched glass</option></select>}</div>}
      {!reviewLab && api.isFixtures && new URLSearchParams(location.search).has('artifactTweaks') && <div className="artifact-tweaks"><select aria-label="Design toolbar" value={designToolbar} onChange={e => setDesignToolbar(e.target.value)}><option value="floating">Floating bar</option><option value="corner">Corner controls</option><option value="edge">Top edge</option><option value="always">Always visible</option></select>{focused && <select aria-label="Sample artifact" value={artifactPreviewSample} onChange={e => { setArtifactPreviewSample(e.target.value); setOpenDoc(null); }}><option value="multiple">Multiple artifacts</option><option value="design">Design sample</option><option value="code">Code sample</option><option value="notes">Notes sample</option></select>}</div>}
      {/* INVITE PEOPLE IS A SHORTCUT INTO SETTINGS (w-8415594d19, 2026-10-01).
          Team management is a pane in Settings and this row routes to it, so
          the sidebar lights Invite people, not Settings, while that pane is
          the one up. The rule is that
          the lit row names the pane you are on, which is why a project page
          lights Settings (`settingsPage` reports `projects` for it) and the
          team pane lights its own shortcut. */}
      {workspaceNavigation && <WorkspaceNavigation
        update={announcesUpdate(snap?.update, { walking, closed: '' }) ? { installing: !!snap?.update?.installing, changes: snap?.update?.changes, behind: snap?.update?.behind, error: snap?.update?.error } : null}
        onUpdate={() => { void api.updateInstall(); }}
        page={settingsOpen ? (settingsPage === 'team' ? 'invite' : 'settings') : null} teamPage={teamOpen && !settingsOpen} hasTeam={!!snap?.team?.configured} team={snap?.team ?? null}
        onInvite={() => { setTeamOpen(false); setOpenCard(null); closeSearch(); setFocused(null); setInviteFocus(true); setSettingsPane('team'); setSettingsOpen(true); }}
        onAccount={() => { setTeamOpen(false); setOpenCard(null); closeSearch(); setFocused(null); setInviteFocus(false); setSettingsPane('team'); setSettingsOpen(true); }}
        onTeam={() => { setSettingsOpen(false); setSettingsPane(null); closeSearch(); setFocused(null); setOpenCard(null); setTeamOpen(true); }} onSettings={() => { setTeamOpen(false); setSettingsPane(null); setSettingsOpen(true); }} inboxCount={inbox.length} scheduledCount={scheduledCount} view={view} collapsed={workspaceCollapsed} onToggle={toggleWorkspace} onSearch={openSearch} onCompose={() => setModal('compose')} onView={next => { setTeamOpen(false); setSettingsOpen(false); setSettingsPane(null); closeSearch(); setView(next); setFocused(null); setFocusedRepeat(null); setSelected(0); setMultiSel(new Set()); }} />}
      {/* THE REACH (w-5dcff78971). The corner is transparent and it is the
          only part of our own document lying over the file, so a pointer
          brought up there wakes the marks that a pointer moving across the
          file itself never could. See full-screen-chrome.ts. */}
      {fullScreenDoc && (
        <div className="chrome-reach" style={{ width: CHROME_REACH.width, height: CHROME_REACH.height }} aria-hidden="true" />
      )}
      {inFullScreen && !workspaceNavigation ? (
        /*
         * WHAT, IF ANYTHING, THE STRIP CARRIES. Four of the six shapes on
           w-b3e35c6e8b put nothing in it and are answered entirely in
           styles.css; these two need words, so they are here. Neither draws a
           way out: that is off an opened task and it stays off. */
        <div className="topbar-quiet">
          {taskShape === 'line' && focused && (
            <div className="quiet-line">
              {focused.productName} · {focused.kind} · {ago(focused.updatedAt)} ago
            </div>
          )}
          {taskShape === 'header' && focused && (
            <div className="quiet-head">
              <span className="quiet-head-title">{focused.title}</span>
              <span className="quiet-head-meta">{focused.productName} · {ago(focused.updatedAt)} ago</span>
            </div>
          )}
        </div>
      ) : (
      <header className="topbar">
        {/* THE TAB KEY IS THE ONE SHORTCUT THE APP NEVER TOLD ANYONE ABOUT
            (w-64c76bfdad). Tab rotates Inbox, Scheduled, In progress and Closed
            and shift-Tab goes back, and on 2026-08-20 that was measured to be
            said nowhere: the four tabs carried no label of any kind, and of the
            forty-seven lines in ⌘K the ten that print a key did not include the
            three that switch these very views.

           The cog is still out of it, because it has no key to print.

            The hover is on the NAV rather than on each button, so crossing the
            gap between two tabs does not flicker it.
         */}
        {/* THE SEARCH FIELD IS THE TAB ROW (design B). Nothing opens over
            anything, nothing has to be dismissed, and the field costs no space
            at rest because it IS the space the tabs were using. The four tabs
            become what she is typing, in the tab row's own size and weight, and
            escape puts them back. */}
        {/* AND IT STEPS ASIDE FOR AN OPENED TASK (w-d883b38446, 2026-09-18).
            `searchFieldInStrip` in workspace-navigation.mjs is the rule and
            carries the measurement: this strip is where an opened task's header
            is drawn, and the field was tested before it, so opening a result
            left her with an empty 88 point bar and a second header inside the
            pane. */}
        {searchFieldInStrip({ searching: search !== null, workspaceNavigation, focused: !!focused, settingsOpen }) ? (
          <nav className="tabs searching">
            <span className="search-glyph"><SearchIcon /></span>
            <input
              ref={searchRef}
              className="search-q"
              // Never null here: the rule above only draws this when `search`
              // is a string. The fallback is what the compiler wants now that
              // the test is a named rule and not an inline `search !== null`.
              value={search ?? ''}
              placeholder="Search threads"
              spellCheck={false}
              autoComplete="off"
              aria-label="Search threads"
              onChange={(e) => { setSearch(e.target.value); setSelected(0); }}
              onKeyDown={(e) => {
                // The list's own keys, forwarded from inside the field, because
                // every other key here is a character she is typing and the
                // global handler has already stood down for that reason.
                if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, Math.max(0, list.length - 1))); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
                else if (e.key === 'Enter' && current) { e.preventDefault(); setFocused(current); markSeen(current); }
              }}
            />
            {/* It is drawn whether or not she has typed anything, because it is the way OUT
               of the search and not a way to clear the query: an X that appears only once
               there is text would be missing at the one moment she is looking for the exit,
               which is the empty field she opened by accident.
             */}
            <button
              className="search-out"
              title="Close search"
              aria-label="Close search"
              onClick={closeSearch}
            >
              <CrossIcon />
            </button>
          </nav>
        ) : workspaceNavigation ? (settingsOpen ? <div className="workspace-page-heading"><button className="workspace-back" aria-label="Back to previous page" title="Back to previous page (Esc)" onClick={() => { setSettingsOpen(false); setSettingsPane(null); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><h1 className="workspace-title">{settingsPage === 'projects' ? 'Projects' : settingsPage === 'team' ? 'Team' : 'Settings'}</h1></div> : focused ? <><div className="workspace-task-header" ref={setTaskHeader} /><div className="workspace-artifact-header" ref={setArtifactHeader} /></> : (teamShown ? <h1 className="workspace-title">{openCard ? 'Threads' : 'Team'}</h1> : <h1 className="workspace-title">Threads</h1>)) : (
        <nav
          className="tabs"
          /* NO HINT ON THIS NAV. This older strip is the layout without the
             sidebar; the tabs she actually sees are the Inbox page's own
             (StateTabs in threads/Pages.tsx), and those wear the Tab hint. */
        >
          <>
          {/* It left the corner because the corner was crowded once the ⌘ mark went
             into it, and because search belongs to the items rather than to the more
             general settings beside it.

              It sits exactly where the open field's own `.search-glyph` lands,
              at x=22 measured, so clicking it moves nothing on the screen: the
              mark she pressed is still under her pointer once the field is up.

              The one thing it costs is 41 points of Inbox-against-the-card
              alignment, measured at 1512, 1440 and 1180, and that trade was
              made with the picture in front of it. 26 wide plus the row's
              26 gap less the 11 it pulls back is exactly those 41 points; do
              not "tidy" the negative margin without re-shooting the strip.
           */}
          {search === null && <button
            className="icon-btn tab-search"
            data-hint="search"
            title="Search threads"
            aria-label="Search threads"
            onClick={openSearch}
          >
            <SearchIcon />
          </button>}
          <button data-tab="inbox" className={view === 'inbox' ? 'tab active' : 'tab'} onClick={() => { setView('inbox'); setFocused(null); setSelected(0); }}>
            <span>Inbox</span> {inbox.length > 0 && <span className="count">{inbox.length}</span>}
          </button>
          <button data-tab="progress" className={view === 'progress' ? 'tab active' : 'tab'} onClick={() => { setView('progress'); setFocused(null); setSelected(0); }}>
            {/* NO NUMBER HERE EITHER, the same rule as the sidebar
                (w-5f02e7b525, 2026-09-22). The strip is what she sees in full
                screen, where the sidebar is not drawn, so a count kept here
                would have full screen contradicting every other screen the day
                after the counts came off. Inbox above keeps its number
                because Inbox is the one tab that is waiting on her. */}
            <span>In progress</span>
          </button>
          {/* IT IS NAMED LIKE THE OTHER THREE, AND THAT IS NOT TIDYING
              (w-45e9cd9573, 2026-08-28). Every other tab carries `data-tab` and
              this one did not. The walk's tab tour rings the tab the next press
              opens, by asking for `.tabs .tab[data-tab="..."]`; with no name on
              it that query found nothing and the ring fell back to `.tabs`,
              which is the whole strip. MEASURED on the first press of that
              beat: the ring came out 418 by 65 with the search glass and all
              four tabs inside it, over a card reading "Press Tab to see where
              it all went". A ring round everything says nothing about where the
              press goes, which is the only thing that beat is for. Named, it is
              108 by 35 and round Scheduled alone.

              IT COMES AFTER IN PROGRESS AND ONLY WHEN IT HOLDS SOMETHING, the
              same rule as the sidebar, because Tab now rotates through the tabs
              that are actually drawn. A strip that kept a stop the rotation
              skips is the September 14 bug again with the halves swapped. */}
          {tabOrder.includes('snoozed') && (
            <button data-tab="snoozed" className={view === 'snoozed' ? 'tab active' : 'tab'} onClick={() => { setView('snoozed'); setFocused(null); setSelected(0); }}>
              <span>Scheduled</span>
            </button>
          )}
          {/* THERE IS NO "YOUR AGENTS" TAB. Her sessions are rows in the Inbox like
             everything else, which is what merging the inbox into one meant. How many of
             them reach it is the Agents page in Settings.
           */}
          {/* CLOSED, not Done. The ledger keeps `done`; only her language changes, the same
             split the Artifact rename made in the other app.
           */}
          <button data-tab="done" className={view === 'done' ? 'tab active' : 'tab'} onClick={() => { setView('done'); setFocused(null); setSelected(0); }}>
            Closed
          </button>
          </>
        </nav>
        )}
        {/* THE PLUS, THE COMMAND MARK AND THE COG STEP OFF WHILE SHE IS
            SEARCHING, and that is the half of the chosen design that is not the
            cross. It is forced, not chosen: .topbar and .body carry the same 22px
            of side padding, so the inbox card's right edge and this group's right
            edge are the SAME point (1688, measured on a window at 1710),
            and the line cannot run the card's width while three buttons stand
            on the end of it. The full-width line wins, and they come back
            the moment she leaves. Escape and the cross both leave.

           AND THEY COME BACK OVER AN OPENED TASK (w-d883b38446). The reason above is about
           the search LINE needing the card's full width, and with a task open there is no
           line: the strip is drawing the task's own header instead (`searchFieldInStrip`).
           One rule now decides both.
         */}
        {!searchFieldInStrip({ searching: search !== null, workspaceNavigation, focused: !!focused, settingsOpen }) && <div className="topbar-right">
          {/* THE HINT THAT USED TO SIT HERE IS GONE (w-2f7fac6027). It printed a
              cap and a word in the strip's own gap, which is the app changing
              under the pointer, and the corner's two buttons are not in the set
              that was kept: the ⌘ mark IS the command button's own key, and search
              already prints / at the right end of its field. What is left in
              this corner with a hint is nothing. */}
          {snap.supervisor.paused && <span className="paused-chip">agents paused</span>}
          <>
          {/* NEW TASK, where search used to be.

              IT IS FIRST IN THE CORNER (w-99d244083d): the plus sits to the
              left of the command button, both in the top right corner. The ⌘
              mark was drawn to its left in the approved picture; this is the
              one change made on top of it. Do not put them back the other way
              round.
           */}
          {/* WHAT IS LEFT OF HER LIMIT, FIRST IN THE CORNER GROUP (w-86ee9da2c9).
              It is a reading rather than a control, so it sits before the three
              things that do something. Absent entirely until a figure has been
              read, which on a fresh launch is a few seconds: the corner is
              unchanged until then rather than holding a space for a number
              nobody has.

             IT NO LONGER OPENS SETTINGS (w-1b725b0e2a, 2026-09-01).
           */}
          {/* AND IT SAYS WHOSE LIMIT IT IS, WHERE THERE ARE TWO TO TELL APART (2026-09-05).
             Nothing new is drawn there.
           */}
          {!workspaceNavigation && <UsagePill
            usage={snap.usage ?? null}
            now={now}
            engineWord={engineWordFor({
              engineChoice: (snap.engines?.choices?.length ?? 1) > 1,
              engine: snap.usage?.engine ?? null,
            })}
          />}
          {/* AND THE SOCKET A THREAD'S OWN CONTROLS ARE TELEPORTED INTO: the
              thread's menu, which holds the code, the terminal and Done
              (w-e731ca9376, 2026-10-01). They are drawn by
              Focus because only Focus knows which of them this thread has, and
              they land here because the corner is where a task's own controls
              live. */}
          {/* Not while Settings or the Team page covers the thread: the thread's
              state and Summary button were left standing in their header. */}
          {workspaceNavigation && focused && !settingsOpen && !teamShown && <span style={{display:'contents'}} ref={setCornerHeaderTarget}/>}
          {/* THE FILTER, LEFT OF THE PLUS (w-aa3fa4cbf0): a small filter icon
              button just left of the plus. Over a box
              only: an opened task has no box to narrow.

              AND NOT WHILE THEY ARE PRACTISING (w-faa5035c50). The project part
              is what scopes the whole app to the practice project, so a tag
              there is a cross that drops somebody out of the middle of their
              first five minutes and into an app they have not been shown. The
              band above the window is what says where they are. */}
          {/* SEARCH, NEW THREAD AND DISPLAY (approved 2026-10-01): the whole of
              the right end on the Inbox, which is the one page of threads now
              (w-05ff3d1438). Display holds the view, the sort and the filters.
              Not over a teammate's card or the team's setup. */}
          {workspaceNavigation && !focused && !settingsOpen && !teamShown && (
            <HeaderActions
              page="inbox"
              display={inboxDisplay}
              onDisplay={setInboxDisplay}
              products={snap.products}
              // The projects she uses most come first in the menu, which takes
              // reading her threads (w-5a08121f99: about forty projects).
              items={items}
              onSearch={openSearch}
              onCompose={() => setModal('compose')}
              shown={displayedBox.length + theirRows.length}
              total={(mineShown ? shownBox.length : 0) + theirRows.length}
              tab={view}
            />
          )}
          {!workspaceNavigation && !focused && !settingsOpen && !inPractice && (
            <BoxFilter
              filter={boxFilter}
              menu={boxFilterMenu ?? { projects: [], moreProjects: [], priorities: [], harnesses: [] }}
              tags={filterTags(boxFilter, snap.products)}
              open={modal === 'filter'}
              onOpen={() => setModal('filter')}
              onClose={closeFilter}
              onPick={(part, value) => { setBoxFilter(toggleFilter(boxFilter, part, value as never)); setModal(null); }}
              onClear={(part: FilterPart) => setBoxFilter(clearFilterPart(boxFilter, part))}
            />
          )}
          {/* NOT WHILE A TASK IS OPEN (w-581dbc6cc4). The '+' and ⌘K buttons
              are not needed on this page, so they stay only on the plain list
              pages. Neither is about the task in front of her, and the
              corner is where the task's own controls live: the terminal and the
              mark that finishes it.

              NEITHER VERB LOSES A ROUTE SHE HAS. The sidebar carries New task on
              every screen including this one, C still opens it, ⌘K still opens
              the palette, and both marks are untouched on the lists. */}
          {!taskOpen && !workspaceNavigation && <button
            className="icon-btn"
            data-hint="new-task"
            data-hint-align="right"
            title="New thread"
            aria-label="New thread"
            onClick={() => setModal('compose')}
          >
            <ComposeIcon />
          </button>}
          {/* THE DOOR TO ⌘K, and it is the whole of what this row asked for.

              A bare ⌘ in the corner family, no label, no keycap, no border. The
              word `Commands` beside it and a 340-point bar across the strip
              were the two she turned down, and a key nobody can see was the
              thing that started the row. Never put a label on it.

              It opens the palette the key opens, so there is exactly one
              palette and one place its rows are written.
           */}
          {/* AND THE ⌘ GOES WITH IT ON A TASK, same answer. It is the
              discovery point for the palette, which otherwise had no easy entry
              point, so it stays on every list, where somebody meeting the app
              for the first time is. */}
          {!taskOpen && !workspaceNavigation && <button
            className="icon-btn"
            data-hint="commands"
            data-hint-align="right"
            title="Commands"
            aria-label="Commands"
            onClick={() => setModal('palette')}
          >
            <span className="cmd-glyph" aria-hidden="true">⌘</span>
          </button>}
          {/* A corner button was built here as layer one for a keyboard-only toggle; she has
             the key, and a third permanent control beside the plus and the cog costs more
             attention than it teaches. The two ways in are ⌘K ("Show/Hide the product
             panel", key printed beside it, Palette) and `\`. Do not put it back without
             her.
           */}
          {/* Both, so it is here and in the palette. It sits after the plus because
             composing is the thing she does constantly and settings is the thing she does
             rarely; the order says so.
           */}
          {/* NO MARK ON IT WHEN AN UPDATE IS WAITING. A dot on this cog was one
              of the four drawn for w-86452550e5 and she did not pick it: the
              news arrives as a row in the inbox instead. */}
          {!workspaceNavigation && <button className="icon-btn" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
          </button>}
          {/* The theme toggle used to sit here and now lives in ⌘K
              (see Palette). It was a permanent control for a decision made
              once, in the corner she reaches for constantly. */}
          </>
        </div>}
      </header>
      )}

      {/* It was solving something real. Spawns dying at birth used to look like
          a silent wall of "queued", an expired login killed the whole fleet and
          nothing on screen said so (2026-08-06). What it did wrong was
          everything after that. It printed the tool's own last words, so she
          read "OAuth session expired and could not be refreshed" about an app
          with no OAuth in it. It lit on the FIRST dead spawn, so a moment's
          trouble after a restart looked like an outage. And it said AGENTS were
          failing when the truth was that ONE of her two Claude accounts was
          signed out and the other was working the whole time.

          All three are fixed underneath rather than here: a dead account is now
          an account-shaped fact that lives on the Accounts page, the fleet-wide
          judgement waits twenty unbroken minutes, and the sentence below is
          ours. What is left on the inbox is a quiet line with no box, no colour
          and no clock, and it only ever appears when not one agent can start
          anywhere and work has been waiting for it.
       */}
      {/* It was right about the mechanism and wrong about the audience. Electron
          reads main/*.mjs once at boot, so a supervisor fix really is invisible
          until a restart, and three of them ran unnoticed for days. But the bar
          fires on any main-process file whose mtime moved, and this repo has
          several sessions editing it at once, so most of what it reported was
          somebody else's work in progress rather than a fix of hers waiting to
          run. A permanent banner that is usually noise trains exactly the
          reaction she describes: restart now, whatever it says.

          The fact is still computed and still on the snapshot; it is reachable
          from ⌘K, where it costs nothing to ignore. The check that matters most
          was never the banner anyway: it is agents reading mtimes against the
          process start time before concluding the app is broken, which is written
          down in CLAUDE.md and is not affected by this.
       */}

      {/* NOTHING STANDS ABOVE THE LIST ANY MORE. The yellow bar, then the two
          quiet lines that replaced it, both said this here; seventeen looks were
          photographed and the one picked is a row in the list itself
          (w-cf0e8821b3). It is built in `troubleItem` and it goes
          into the inbox, so the whole of it is `List` now.

          Never a dead end, which every version of this has kept: the row's
          second line is what happens next, and the opened row says it per cause
          and names the tasks. The retry clock the old bar carried is in none of
          them. After twenty minutes "retrying 12:08" is not reassurance, it is
          the app counting out loud while she waits. */}

      {/* NOTHING ABOUT A NEW VERSION STANDS HERE. A line under the header was
          one of the four drawn for w-86452550e5; it lives in the sidebar
          (components/SidebarUpdate.tsx). */}

      {/* THE TEAM PAGE takes the body's place the way Settings does: drawn
          beside it, with the body hidden while it is up. */}
      {teamShown && (
        <div className="body tm-body">
          <main className="list-pane">
            {/* THE TEAM BOARD IS GONE (w-05ff3d1438): its people are on the
                Inbox, picked by the faces in its tab bar. What is left here is
                a teammate's thread opened from the Inbox, and, until you are
                signed in and on a team, the sign-in page. Managing the team
                moved into Settings (w-8415594d19). */}
            {snap?.team?.signedIn && snap.team.team && openCard ? (
              <div className="tm-team-pane th-pane">
                {openCard && (
                  /* A TEAMMATE'S THREAD (approved round 9): one card with the
                     same summary fields, and Message Maya in its top bar. */
                  <div className="th-card-page">
                    <div className="th-card-bar">
                      {/* Back to Threads, with the same people picked. The
                          page is called Threads since w-05ff3d1438: once a
                          teammate is on it, it is more than an inbox. */}
                      <button type="button" className="th-back" onClick={() => { setOpenCard(null); setTeamOpen(false); }}><span aria-hidden="true">←</span>Threads</button>
                      <MessagePerson person={team?.byId.get(openCard.personId) ?? null}
                        onMessage={() => {
                          const convo = conversationWith(openCard.personId, { products: snap.products, items, me: team?.me ?? null });
                          if (convo) openConversation(convo);
                          else { setComposeInitial({ to: openCard.personId }); setModal('compose'); }
                        }} />
                    </div>
                    {/* Which thread this is, which the card alone never said. */}
                    {openCard.title && <h2 className="th-card-title">{openCard.title}</h2>}
                    <TeammateCard card={openCard} person={team?.byId.get(openCard.personId) ?? null} now={now} />
                  </div>
                )}
              </div>
            ) : (
              <TeamPage team={snap?.team} />
            )}
          </main>
        </div>
      )}
      <div ref={setArtifactBody} hidden={(settingsOpen || teamShown) && workspaceNavigation} className="body">
        {inboxEmpty ? (
          /* * AND DURING THE WALK THIS PAGE IS EMPTY.

             THIS IS THE SCREEN IN QUESTION.

             The tab strip, the plus and the cog stay: they are the app,
             they are what three of the beats point at, and it is the page
             that should be empty, not the window.
          */
          /* `run === null` keeps the coaching card alone on the page. */
          run === null && (
            /* THE INBOX ZERO PAGE. A zero, one line and the field.
               components/IdlePage.tsx says what is on it and what it replaced. */
            <IdlePage
              working={snap.supervisor.running.length}
              onCompose={() => setModal('compose')}
              onAgents={() => { setView('progress'); setFocused(null); setSelected(0); }}
            />
          )
        ) : (
          <>
            <main className={`list-pane${focused || focusedRepeat ? ' pinned' : ''}${bareView ? ' bare' : ''}`}>
              {focusedRepeat ? (
                <RepeatFocus
                  rule={focusedRepeat}
                  items={items}
                  editing={editingRule}
                  onClose={() => { setFocusedRepeat(null); setEditingRule(false); }}
                  onEdit={() => setEditingRule(true)}
                  onEditClose={() => setEditingRule(false)}
                  /*
                   * HER MESSAGE, SPLIT THE SAME WAY IT WAS SPLIT WHEN SHE
                     TYPED IT. The label is derived rather than kept, so the
                     Scheduled row and the instruction cannot drift apart, and
                     the run served tomorrow morning reads the new body
                     (main/repeats.mjs briefs it with `rule.body`). */
                  onSave={async (message) => {
                    const { title, body } = splitMessage(message);
                    try {
                      await api.setRepeat({
                        product: focusedRepeat.product,
                        id: focusedRepeat.id,
                        rule: { title, body },
                      });
                      const fresh = await api.repeats();
                      setRepeats(fresh);
                      // The pane is holding a copy, so it has to be handed the
                      // new one or it redraws the words she just replaced.
                      setFocusedRepeat(fresh.find((r) => r.id === focusedRepeat.id) ?? null);
                      setEditingRule(false);
                      showToast('Changed. The next run reads this.');
                    } catch (err) {
                      // The box stays open with the words in it. A refused write
                      // that also eats what the user typed is two failures.
                      showToast(`Not changed: ${(err as Error).message}`);
                    }
                  }}
                  onEnd={async () => {
                    await api.endRepeat({ product: focusedRepeat.product, id: focusedRepeat.id });
                    setFocusedRepeat(null);
                    setRepeats(await api.repeats());
                    showToast(`Ended: ${focusedRepeat.title}`);
                  }}
                />
              ) : focused ? (
                <Focus
                  // A message from a person can be handed to an agent from
                  // its page.
                  onHandToAgent={handToAgent}
                  onAddPeople={addPeopleToConversation}
                  headerTarget={workspaceNavigation ? taskHeader : null}
                  cornerHeaderTarget={cornerHeaderTarget}
                  inlineArtifacts={workspaceNavigation}
                  previewSample={api.isFixtures && (reviewLab || new URLSearchParams(location.search).has('artifactTweaks')) ? artifactPreviewSample : undefined}
                  artifactView={openDoc ? artifactView : undefined}
                  onOpenArtifact={(src, mode) => { setArtifactReturnBeside(false); setArtifactMode(mode); setOpenDoc({product: focused.product, src}); }}
                  item={focused}
                  resumeAt={resumeAt}
                  onScrolled={(top) => {
                    const at = Date.now();
                    if (at - scrollWrittenAt.current < 250) return;
                    scrollWrittenAt.current = at;
                    writeScroll(window.localStorage, top);
                  }}
                  openDoc={openDoc?.src ?? null}
                  onOpenDoc={(src, at) => setOpenDoc({
                    product: focused.product,
                    src,
                    at,
                    // Stamped on every press so pressing the same chip a second
                    // time lands a second time (OpenDoc, DocPane.tsx).
                    ...(at ? { atFrom: Date.now() } : {}),
                  })}
                  parent={focused.parent ? items.find((i) => i.id === focused.parent && i.product === focused.product) ?? null : null}
                  blockedBy={items.find((i) => i.parent === focused.id && i.product === focused.product && i.status !== 'done') ?? null}
                  onOpenItem={(item) => { setFocused(item); markSeen(item); }}
                  onNotice={showToast}
                  /*
                   * What THIS row's agents really run as, so the reply footer
                     prints the truth rather than the workspace's answer over a
                     project that overrides it. Resolved in main; the fallback
                     is the workspace entry. */
                  runningMode={snap.config?.permission?.[focused.product] ?? snap.config?.permission?.['']}
                  /*
                   * WHETHER THERE IS A CODING AGENT TO NAME, AND WHICH ONE THIS
                     ROW RUNS ON (w-250cd74811). Both are main's answers, off the
                     snapshot. The second is resolved once at the top of this
                     component, because the reply callback needs the same word
                     and two copies of it are two opinions about which engine a
                     row is on. On every Mac with one coding agent `choices` is
                     one entry, the byline names nothing, and the line is
                     byte-identical to today's. */
                  engineChoice={(snap.engines?.choices?.length ?? 1) > 1}
                  runningEngine={runningEngine}
                  productDir={snap.products.find((p) => p.slug === focused.product)?.dir ?? null}
                  repoDir={snap.products.find((p) => p.slug === focused.product)?.repoPath ?? null}
                  selectedOption={optionSel}
                  interruptedFrom={heldByUrgent && heldByUrgent.id !== focused.id ? heldByUrgent.title : null}
                  onBackToInterrupted={() => setFocused(null)}
                  returnedFromSnooze={dueAt(focused) > 0 && dueAt(focused) <= now}
                  scheduledUntil={dueAt(focused) > now ? dueAt(focused) : 0}
                  scheduledByAgent={parkedByAgent(focused, now)}
                  onUnschedule={() => unsnooze(focused)}
                  replyOpen={modal === 'reply'}
                  /*
                   * WHAT SHE HAS SENT TO THIS ROW'S RUNNING AGENT IN THE LAST
                     few seconds and the row has not recorded yet
                     (w-1ef03d6f27). Only this row's: a message in flight on
                     another task belongs in that task's conversation. */
                  sending={sendingOn(focused)}
                  stalled={snap.supervisor.stalled?.includes(focused.id) ?? false}
                  onRedeliver={() => redeliver(focused)}
                  onClose={() => setFocused(null)}
                  onResolve={() => markDone(focused)}
                  onPick={(n) => pickOption(focused, n)}
                  onReply={() => setModal('reply')}
                  // The reply box's model drawer reads the same list the
                  // new-task card does.
                  codexModels={codexModels}
                  codexModelDefault={codexModelDefault}
                  onReplySend={(text, priority, repeat, sent, mode, pick) => {
                    // THE REPLY GOES WHERE THE ROW ACTUALLY LIVES. On an agent
                    // row there is no ledger to answer; the text is handed to
                    // the running session itself, and the toast says what came
                    // back rather than assuming it landed.
                    if (focused.agent) { replyToAgent(focused, text); return; }
                    // A schedule set on a reply, by the control or by the
                    // words. Applying the rule instead of delivering them would
                    // be the system swallowing something the user wrote, which is the
                    // failure this app cares about most.
                    if (repeat) applyRepeat(focused, repeat);
                    answerWith(focused, text, priority, sent, mode, runningEngine, pick);
                  }}
                  onReplyClose={() => setModal(null)}
                  onStop={() => stopAgent(focused)}
                  onRunNow={() => runNow(focused)}
                  onReveal={() => revealAgent(focused)}
                  // Remind me later and stop this task are neither of the two
                  // ways a task ends, and the card beside the bar names exactly
                  // two. Both are back the moment the walk ends.
                  onSnooze={walking ? undefined : () => openSnooze(focused)}
                  onReopen={() => sendBack(focused)}
                  session={snap.supervisor.running.find((r) => r.itemId === focused.id) ?? null}
                  // WHAT THE FLEET IS DOING ABOUT THIS ROW. All of it was
                  // already on the snapshot; the pane simply never read any of
                  // it, so a task she opened could not say whether an agent was
                  // on it, waiting for a slot, or not coming. `inProgress` is
                  // the tab's own rule rather than a fourth definition of what
                  // is under way: `stoppable` IS `belongsInProgress`, and one
                  // rule is the point of that file.
                  live={{
                    queued: snap.supervisor.queued,
                    runNow: snap.supervisor.runNow,
                    paused: snap.supervisor.paused,
                    running: snap.supervisor.running.length,
                    capacity: snap.supervisor.capacity,
                    inProgress: belongsInProgress(focused, { deferredUntil: dueAt(focused), now }),
                    // A run ended on this row and wrote nothing down. The pane
                    // says so wherever the row is sitting, which is why this one
                    // fact is read above the In progress test in live-line.
                    silent: snap.supervisor.silent?.[focused.id] ?? null,
                  }}
                  stoppable={!walking && stoppableNow(focused)}
                />
              ) : (
                <>
                {/* THE STATE TABS (approved 2026-10-01): Needs you, Running,
                    Scheduled, Done and All, on the Inbox itself. They replace
                    the sidebar places they used to be. */}
                {workspaceNavigation && search === null && inboxDisplay.view === 'board' ? (
                  <InboxBoard items={items} products={snap.products} display={inboxDisplay} now={now} stateOf={stateOfMine}
                    cards={cards} picked={team ? picked : undefined} end={peoplePicker}
                    onOpenCard={openTeammateCard}
                    onOpenItem={(item) => { setFocused(item); markSeen(item); }} />
                ) : <>
                {workspaceNavigation && search === null && (
                  <StateTabs
                    view={view}
                    // Yours while you are on the page, and the picked teammates' added in.
                    counts={{
                      inbox: (mineShown ? shownCount(inbox) : 0) + theirCount('inbox'),
                      progress: (mineShown ? shownCount(progress) : 0) + theirCount('progress'),
                      snoozed: (mineShown ? shownCount(snoozed) : 0) + theirCount('snoozed'),
                      done: (mineShown ? shownCount(done) : 0) + theirCount('done'),
                      all: (mineShown ? shownCount(allOpen) : 0) + theirCount('all'),
                    }}
                    needs={team ? needsWord(picked, team.me) : undefined}
                    end={peoplePicker}
                    onView={(next) => { setView(next as View); setSelected(0); setMultiSel(new Set()); }}
                  />
                )}
                {workspaceNavigation && emptyView && !theirRows.length ? (
                  // A FILTER IS READ FIRST, so it can never fall through to
                  // "Nothing needs you" (w-5a08121f99). That sentence is a
                  // statement about her inbox and the page was saying it about
                  // her own filter, over a tab that still read 13.
                  hiddenNow > 0
                    ? <FilteredEmpty view={view} hidden={hiddenNow}
                        onClear={() => setInboxDisplay({ ...inboxDisplay, priorities: [], projects: [], updated: 'any' })} />
                    // "Nothing needs you" is about you alone; with a teammate
                    // on the page the quiet line says it instead.
                    : view === 'inbox' && !withOthers
                      ? run === null && <InboxClear running={progress.length} scheduled={snoozed.length}
                          onView={(next) => { setView(next as View); setSelected(0); setMultiSel(new Set()); }}
                          onCompose={() => setModal('compose')} />
                      : <EmptyTab view={view} />
                ) : <List
                  table={workspaceNavigation && search === null}
                  products={snap.products}
                  team={team}
                  mixed={search === null ? mixedRows : null}
                  personCell={personCell}
                  onOpenCard={openTeammateCard}
                  items={list}
                  // Results are grouped and stamped like the inbox, whatever
                  // tab she opened search from. Scheduled would otherwise label
                  // every group "Returns …", which is a promise about rows that
                  // are mostly closed and not coming back at all.
                  view={search !== null ? 'inbox' : view}
                  selected={selected}
                  seen={seen}
                  running={runningRows}
                  engineChoice={(snap.engines?.choices?.length ?? 1) > 1}
                  engines={snap.engines}
                  stalled={snap.supervisor.stalled}
                  queued={snap.supervisor.queued}
                  silent={snap.supervisor.silent}
                  paused={snap.supervisor.paused}
                  multiSel={multiSel}
                  snoozes={snoozes}
                  repeats={search !== null ? [] : repeats}
                  allItems={items}
                  terms={query?.terms}
                  phrase={query?.phrase}
                  summaries={searchSummaries}
                  ranked={ranked}
                  /*
                   * A ROW MAY NOT PROMISE A KEY THE WALK IS ABOUT TO EAT. See
                     `walkRowKeys`: null here is no walk at all, and then every
                     row says exactly what it always said. */
                  walk={run && search === null ? { key: walkKey, rows: walkBeat } : null}
                  // Only a typed query can empty this list now: with the field
                  // blank every task is in it, so the old "type to search" line
                  // has nothing left to describe.
                  emptyText={search ? `Nothing matches “${search}”.` : undefined}
                  keyView={view}
                  hoveredId={hoveredId}
                  onHover={keyHints ? setHoveredId : undefined}
                  onSelect={(i) => setSelected(i)}
                  onOpenRepeat={(rule) => { setFocused(null); setFocusedRepeat(rule); }}
                  onOpen={(item) => { setFocused(item); markSeen(item); }}
                  onAnswerImport={answerImport}
                  onToggle={(i) => {
                    const id = list[i]?.id;
                    if (!id) return;
                    setMultiSel((m) => { const c = new Set(m); c.has(id) ? c.delete(id) : c.add(id); return c; });
                    setSelected(i);
                  }}
                  onRange={(i) => {
                    const [lo, hi] = [Math.min(selected, i), Math.max(selected, i)];
                    setMultiSel((m) => new Set([...m, ...list.slice(lo, hi + 1).map((x) => x.id)]));
                    setSelected(i);
                  }}
                />}
                </>}
                </>
              )}
            </main>
            {/* THE RIGHT HALF OF THE WINDOW IS THE FILE ITSELF (w-74b0b5cd87).
             */}
            {openDoc && (
              <ArtifactSurface target={artifactBody}><DocPane
                doc={openDoc}
                roots={docRoots}
                focusControlStyle={reviewLab ? focusControlStyle : 'corners-bare'}
                headerTarget={workspaceNavigation && artifactView === 'focus' ? artifactHeader : null}
              mode={workspaceNavigation ? artifactMode : undefined}
                onMode={workspaceNavigation ? mode => { setArtifactReturnBeside(artifactMode === 'beside'); setArtifactMode(mode); } : undefined}
                split={workspaceNavigation ? artifactFraction(split, artifactWidth) : split}
                onSplit={resizeDoc}
                onClose={closeArtifact}
                onNotice={showToast}
              /></ArtifactSurface>
            )}
            {/* THE PANEL IS UP ON BOTH SCREENS, and \ drops it on either.

                In full screen the panel follows the task she is READING, not
                the row the list left selected, or it would be answering a
                question about some other product — and it is not drawn at all
                when that task belongs to no project (see `panelShown`).
             */}

          </>
        )}
      </div>

      {/* THE NEW THREAD CARD (w-e731ca9376): To, Model, the message, then the
          project, priority and who sees it. It sends by itself and hands back
          what went out, so this only closes it, says so, and puts the way back
          on the undo pile exactly as the old card's send did below. The draft
          is read FIRST, before the card clears it, because it is the only copy
          an undo can hand back. */}
      {modal === 'compose' && (
        <ThreadComposer
          products={rankedProducts}
          items={items}
          engines={snap.engines?.choices}
          codexModels={codexModels}
          codexModelDefault={codexModelDefault}
          // THE TUTORIAL SENDS ITS TASK INTO THE PRACTICE PROJECT, so the card
          // opens on that project rather than on whatever was last used.
          defaultProduct={walkCard ? (run!.practice ?? run!.product) : productFilter}
          /* THE WALK'S OWN TASK, ALREADY WRITTEN. The beat is about pressing
             send, not about thinking of something to ask, so the words are in
             the box when the card opens. `scripted` is what lets this one task
             into the practice project and what stamps the label the supervisor
             reads; everything else about the card is the card anybody uses. */
          initial={walkCard ? { body: `${TASK_TITLE}\n\n${TASK_BODY}` } : composeInitial}
          scripted={walkCard ? { labels: [FIRST_RUN_LABEL] } : null}
          // AND THE BEAT ABOUT WHO IT IS FOR ENDS WHEN THE LIST IS REALLY OPEN,
          // the way every other beat ends on the thing it asked for happening.
          onOpenMenu={(which) => {
            if (which === 'to' && runRef.current?.step === 'who') setRun((r) => (r ? stepTo(r, 'task') : r));
          }}
          onOpenConversation={openConversation}
          // "Reorder" beside the project menu's heading: Settings on the
          // Projects page, which is where the order is set. The draft is
          // already saved, so closing loses nothing.
          onReorderProjects={() => { setModal(null); setComposeInitial(null); setTeamOpen(false); setSettingsPane('projects'); setSettingsOpen(true); }}
          onClose={() => { setModal(null); setComposeInitial(null); }}
          onSent={async (made, how) => {
            setComposeInitial(null);
            const sent = readComposeDraft();
            setModal(null);
            // THE TUTORIAL'S OWN TASK, AND IT LEAVES NO TOAST AND NO UNDO.
            // The walk goes on from here with the ringed sentence beside the
            // row, and an undo key nobody has been taught yet, over a walk it
            // would strand somebody in the middle of, is not a way back. The
            // `sent` event is what moves the beat on.
            if (runRef.current?.step === 'task') {
              if (made?.id) fire({ t: 'sent', item: made.id, at: Date.now() });
              await refresh();
              return;
            }
            if (how?.kind === 'message') {
              const firsts = (how.toMany ?? [how.to ?? '']).map((id) => team?.byId.get(id)?.name?.split(/\s+/)[0]).filter(Boolean) as string[];
              const said = firsts.length > 1 ? `${firsts.slice(0, -1).join(', ')} and ${firsts[firsts.length - 1]}` : firsts[0];
              showToast(said ? `Sent to ${said}` : 'Message sent');
              await refresh();
              return;
            }
            const slug = how?.product ?? made?.product ?? '';
            const to = snap.products.find((x) => x.slug === slug)?.name;
            if (how?.kind === 'repeat') {
              if (how.ruleId) {
                noteNewTask(`Repeating task canceled: ${clipToSentence(how.title ?? '', TOAST_TITLE)}`, 'cancel that repeating task', sent, async () => {
                  await api.endRepeat({ product: slug, id: how.ruleId! });
                  setRepeats(await api.repeats());
                });
              }
              showToast(`Repeating → ${to ?? slug} · Z to undo`);
              await refresh();
              return;
            }
            if (made?.id) {
              noteNewTask(`Withdrawn: ${clipToSentence(made.title, TOAST_TITLE)}`, 'take back the task you just made', sent, async () => {
                await api.answer({ product: made.product, id: made.id, status: 'done' });
              });
            }
            showToast(sentLine({
              to: to ?? slug,
              when: how?.runAt ? whenLabel({ runAt: how.runAt, repeat: null }) : null,
              held: how?.start === 'later',
            }), made?.id ? { product: made.product, id: made.id } : undefined);
            // SHOW WHERE IT WENT (2026-10-01: a new thread looked as if it
            // was never made, since it was not in the inbox). A thread sent to an agent is not
            // waiting on her, so it never lands in Needs you. On the Inbox the
            // tab moves to where it did land, Running or Scheduled, so she
            // sees the row arrive instead of an unchanged page.
            if (workspaceNavigation && !teamOpen && !focused && (['inbox', 'progress', 'snoozed'] as View[]).includes(view)) {
              setView((how?.runAt && how.runAt > Date.now()) || how?.start === 'later' ? 'snoozed' : 'progress');
              setSelected(0);
              setMultiSel(new Set());
            }
            await refresh();
          }}
        />
      )}
      {/* THE OLD COMPOSE CARD IS GONE FROM HERE (2026-10-01). The walk kept it
          for one round, because the new card refuses a task into the practice
          project and the walk's task is the one exception; the new card takes
          a `scripted` prop for that now, so the tutorial opens the same card
          everybody else opens. Her words: "the tutorial is using the wrong
          component here, we no longer use this". */}
      {modal === 'palette' && (
        <Palette
          onFirstRun={walkAgain}
          onTutorial={() => startTutorial(comeBackTo(snap.products, productFilter, rememberedProject()))}
          onImportAgents={() => { setModal(null); setImportAgents(true); }}
          onFreshUser={openAsNewUser}
          onDemo={openDemoInbox}
          products={rankedProducts}
          supervisorPaused={snap.supervisor.paused}
          batch={multiSel.size > 0}
          look={look}
          onSetLook={(l) => { setLook(l); setModal(null); }}
          staleFiles={snap.restartNeeded?.files ?? []}
          /*
           * A newer Agentbox that has already downloaded itself. The palette is
             the glance surface for it, not the rail (main/updater.mjs).

             `closed` is empty ON PURPOSE and it is the whole of "rejecting an
             update loses nothing": closing the row hides the ROW, and ⌘K goes
             on carrying the restart for the version she closed. What it shares
             with the row is the walk: ⌘K is a beat of the tutorial, and a
             command about a new version appearing in the middle of the one she
             is being taught is the same interruption the walk must not have. */
          updateReady={announcesUpdate(snap.update, { walking, closed: '' })
            ? (snap.update?.newVersion ?? null)
            : null}
          onInstallUpdate={() => { setModal(null); void api.updateInstall(); }}
          panelUp={panelUp}
          onTogglePanel={() => { setModal(null); togglePanel(); }}
          boardUp={inboxDisplay.view === 'board'}
          onFlipView={!inFullScreen && search === null && !teamShown && !openCard
            ? () => { setModal(null); setInboxDisplay(flipView(inboxDisplay)); setSelected(0); }
            : undefined}
          keyHints={keyHints}
          onSetKeyHints={(v) => { setModal(null); setHints(v); }}
          onSearch={openSearch}
          itemCommands={(() => {
            // A cmd-A (or shift-J/K) selection turns the palette into batch
            // mode: every command it offers acts on the whole selection, and
            // single-item commands (Reply, Approve) drop out rather than
            // silently acting on one row of a many-row selection.
            if (multiSel.size) {
              const sel = selectable.filter((i) => multiSel.has(i.id));
              const n = sel.length;
              return [
                ...(view !== 'snoozed'
                  ? [{ id: 'done', label: `Close (${n} selected)`, keyHint: 'E', run: () => { setModal(null); batchDone(multiSel); } }]
                  : []),
                { id: 'snooze', label: `Remind Me (Snooze ${n} selected)`, keyHint: 'L', run: () => openSnooze(sel) },
                ...(sel.some((i) => dueAt(i) > Date.now())
                  ? [{ id: 'unsnooze', label: `Back to Inbox (${n} selected)`, run: () => unsnooze(sel) }]
                  : []),
                { id: 'read', label: `Mark Read (${n} selected)`, run: () => {
                  setSeen((s) => new Set([...s, ...sel.map((i) => i.id)]));
                  setMultiSel(new Set());
                  setModal(null);
                } },
                // Resume only what she ticked. Some of what stops is work she
                // has moved past, and all-or-nothing made her choose between
                // restarting things she had written off and restarting nothing
                // (2026-08-07). Counted by what will actually move, not by the
                // ticks: a row a worker is already on is not resumed by asking.
                //
                // ONE command, deliberately. It used to reach only stalled rows,
                // which left the ones that most need reviving (a worker's `done`
                // over a live thread) unreachable by every path there is. Adding
                // a second command for those put two matches under "resum",
                // which is the choice this command was rewritten this morning to
                // stop her having to make correctly at speed.
                ...(sel.filter((i) => !working(i)).length
                  ? [{ id: 'resume',
                       label: `Resume Agents (${sel.filter((i) => !working(i)).length} of ${n} selected)`,
                       run: () => { setModal(null); putAgentBackOn(sel.filter((i) => !working(i))); } }]
                  : []),
                ...priorityCommands(sel).map((c) => ({
                  ...c, run: () => { setModal(null); void retag(sel, c.value); },
                })),
              ];
            }
            // The same row the hint and the keys are on, so ⌘K opened over a
            // row cannot mean a different task than E pressed over it.
            const target = focused ?? pointed;
            if (!target) return [];
            const options = itemOptions(target);
            const recommended = options.find((o) => o.recommended) ?? options[0];
            const open = () => { setFocused(target); markSeen(target); };
            return [
              ...(focused
                ? [{id:'remote-control',label:'Remote Control',keywords:'phone mobile continue claude rc',run:()=>{setModal(null);window.dispatchEvent(new Event('task-remote-control-open'));}}, {id:'open-terminal',label:'Open Terminal',keywords:'shell command console',run:()=>{setModal(null);window.dispatchEvent(new Event('task-terminal-open'));}}]
                : []),
              // Approve lives here by NAME only, for everything resolve
              // covers; no key drives it. E is archive, never approval.
              ...(!target.agent && !target.answer && (target.kind === 'review' || (target.kind === 'question' && recommended)
                || (target.status === 'open' && target.kind !== 'question' && !(target.labels ?? []).includes('founder')))
                ? [{ id: 'approve',
                    label: target.kind === 'question' ? 'Approve Recommended'
                      : target.kind === 'review' ? 'Approve (Proceed as Proposed)' : 'Approve (Run It)',
                    run: () => { setModal(null); resolve(target); } }]
                : []),
              { id: 'done', label: target.agent ? DONE.verb : `${DONE.verb} Task`, keyHint: 'E', run: () => { setModal(null); markDone(target); } },
              { id: 'reply', label: 'Reply', keyHint: 'R', run: () => { open(); setModal('reply'); } },
              // Carry on with this row. Offered on ANY status a worker is not
              // already on, because the row that needed it most was `done`:
              // filed by the worker that answered her one-word question, and
              // then unreachable by every path that spawns anything. Resume is
              // for a row that has STOPPED. A row already under way is
              // excluded, and the stop above is what it gets instead.
              ...(!target.agent && !working(target) && !stoppableNow(target)
                ? [{ id: 'resume-any',
                     label: target.status === 'done' ? 'Resume This Agent (Reopen and Carry On)' : 'Resume This Agent',
                     run: () => { setModal(null); putAgentBackOn([target]); } }]
                : []),
              // No Decline here, by design. Close This Task above
              // is the one way to say no.
              seen.has(target.id)
                ? { id: 'unread', label: 'Mark Unread', run: () => { setSeen((s) => { const c = new Set(s); c.delete(target.id); return c; }); setModal(null); } }
                : { id: 'read', label: 'Mark Read', run: () => { markSeen(target); setModal(null); } },
              ...(dueAt(target) > Date.now()
                ? [{
                    id: 'unsnooze',
                    label: parkedByAgent(target, now) ? 'Let It Run Now' : 'Back to Inbox',
                    keyHint: 'E',
                    run: () => unsnooze(target),
                  }]
                : []),
              { id: 'snooze', label: 'Remind Me (Snooze)', keyHint: 'L', run: () => openSnooze(target) },
              // THE FIRST PLACE SHE LOOKED. It asked `supervisor.running`, so on
              // a task she had just composed there was no Stop in ⌘K at all —
              // and, because nothing was running, the one agent command that DID
              // appear was "Resume This Agent". It now asks the same question
              // the tab asks.
              //
              // A stop that only says "stopped" reads as parked, and a parked
              // row is one that gets forgotten for days. The row does land in the inbox (the
              // IPC parks it blocked, and `belongsInInbox` ends on exactly
              // that), so this is the surface catching up with what already
              // happens.
              //
              // So the two surfaces carry the same promise in different lengths
              // on purpose: the footer button has a whole row to itself and
              // keeps her longer sentence, the ⌘K row sits in a column of short
              // commands and must not stick out of it. Her exact string, and
              // the agent variant shortened the same way, since it is the same
              // row with a worker running.
              ...(stoppableNow(target)
                ? [{ id: 'stop',
                     label: working(target)
                       ? 'Stop Agent (Moves to Inbox)'
                       : 'Stop Task (Moves to Inbox)',
                     hint: working(target) ? undefined : 'nothing has started on it yet',
                     run: () => { setModal(null); stopAgent(target); } }]
                : []),
              ...(target.status === 'blocked'
                ? [{ id: 'send-back', label: 'Send Back to Agent', run: () => { setModal(null); sendBack(target); } }]
                : []),
              ...(snap.supervisor.stalled?.includes(target.id)
                ? [{ id: 'redeliver', label: 'Restart the Agent (It Stopped)', run: () => { setModal(null); redeliver(target); } }]
                : []),
              ...(!focused ? [{ id: 'open', label: 'Open', keyHint: '↵', run: () => { setModal(null); open(); } }] : []),
              // ⌘K is the ONLY keyboard route to a level now: the ⌘1..4 chord
              // was removed on her word. It had no entry here once, and the
              // one place she went looking for it was the one place it was
              // missing.
              ...priorityCommands([target]).map((c) => ({
                ...c, run: () => { setModal(null); void retag([target], c.value); },
              })),
            ];
          })()}
          filtering={isFiltering(boxFilter)}
          // "Filter…" hands the keyboard straight to the corner's menu, so ⌘K
          // is one line however many projects she has (w-aa3fa4cbf0).
          onOpenFilter={() => setModal('filter')}
          onClearFilter={() => { setBoxFilter(NO_FILTER); setModal(null); }}
          onView={(v) => { setView(v); setModal(null); setSelected(0); }}
          onPause={async (paused) => { await api.pauseSupervisor(paused); setModal(null); await refresh(); }}
          order={snap.supervisor.productOrder ?? []}
          onRankFirst={async (slug) => {
            setModal(null);
            // The palette can only say "put this at the top", because a running
            // order is not something to type your way through one step at a
            // time. Fine grained ordering is the drag in the composer.
            const next = moveProduct(rankedProducts.map((p) => p.slug), slug, 0);
            await (window.zero as any)?.setProductOrder?.({ order: next });
            const name = snap.products.find((p) => p.slug === slug)?.name ?? slug;
            showToast(`${name} is now first`);
            await refresh();
          }}
          onResume={() => { setModal(null); resumeAgents(null); }}
          onNewProject={() => { setModal(null); setNewProject(true); }}
          onStanding={() => setModal('standing')}
          onSettings={() => { setModal(null); setSettingsPane(null); setSettingsOpen(true); }}
          onShortcuts={() => { setModal(null); setSettingsPane('shortcuts'); setSettingsOpen(true); }}
          onOpenProjects={() => { setModal(null); setTeamOpen(false); setSettingsPane('projects'); setSettingsOpen(true); }}
          onClose={() => setModal(null)}
        />
      )}
      {/* SETTINGS, as a screen over everything. Not inside the modal stack:
          its own General pane opens the standing-instructions box, and a single
          state for both would have that box close the screen it was opened
          from. The standing modal below therefore renders over it. */}
      {settingsOpen && (
        <Settings
          key={settingsPane ?? 'general'}
          embedded={workspaceNavigation}
          usageReadings={snap.usageByEngine ?? (snap.usage ? [snap.usage] : [])}
          now={now}
          onSectionChange={setSettingsPage}
          look={pickedLook ?? look}
          onSetLook={setLook}
          keyHints={keyHints}
          onSetKeyHints={setHints}
          tune={tune}
          onSetTune={setTune}
          onResetTune={resetTune}
          startPane={settingsPane}
          onNewProject={() => setNewProject(true)}
          // The Priority page: the same running order every project list
          // reads, written the one way it is always written.
          ranked={rankedProducts}
          onSetOrder={async (slugs) => {
            await (window.zero as any)?.setProductOrder?.({ order: slugs });
            await refresh();
          }}
          /* TEAM MANAGEMENT, handed to Settings rather than imported by it
             (w-8415594d19): the Settings screen is shared with the build that
             has no team in it, and this keeps the team's code in the team's
             files. No team cloud, no pane and no Team row. */
          teamPane={snap?.team?.configured ? <TeamPage team={snap?.team} inviteFocus={inviteFocus} /> : undefined}
          onClose={() => { setSettingsOpen(false); setSettingsPane(null); setSettingsPage(null); }}
        />
      )}
      {/* HER CLAUDE CODE AGENTS, BROUGHT IN FROM ⌘K (w-7fd38422b5).
       */}
      {importAgents && (
        <ImportAgents
          products={snap.products}
          filter={productFilter}
          onNewProject={() => { setImportAgents(false); setNewProject(true); }}
          /*
           * A project was made on the card, around a folder that had agents in
             it (w-7fd38422b5). The sidebar redraws; the card stays open on it,
             because she opened this card to bring agents in and making the
             project was a step on the way rather than the errand. */
          onProjectMade={(slug) => { rememberProject(slug); refresh(); }}
          onDone={async ({ added, already, name, inboxes, made, noun }) => {
            setImportAgents(false);
            showToast(importedLine({ added, already, name, inboxes, made, noun }));
            await refresh();
          }}
          onClose={() => setImportAgents(false)}
        />
      )}
      {/* THE NEW PROJECT CARD. Last, so it draws over the composer it can be
          opened from AND over the Settings screen, which is not in the modal
          stack. One card, three doors. */}
      {newProject && (
        <NewProject
          // WHERE THE FOLDER IS PROPOSED. Beside the projects she already
          // has; `~/dev` only when there are none to learn from. It was
          // `~/Desktop/dev` for everybody, and Desktop is guarded by macOS,
          // so the first project anybody made asked for their Desktop.
          parent={proposeParent(
            (snap?.products ?? []).map((p) => p.repoPath).filter((p): p is string => !!p),
            { home: home || '~' },
          )}
          onCreate={async ({ name, repoPath }) => {
            try {
              const made = await api.createProduct({ name, repoPath }) as { slug?: string } | null;
              setNewProject(false);
              const slug = made?.slug ?? null;
              // The composer remembers by slug, so the project just made is the
              // one the next task is addressed to.
              if (slug) { rememberProject(slug); setPickProject(slug); }
              showToast(repoPath ? `New project: ${name} · its code is in ${repoPath}` : `New project: ${name}`);
              await refresh();
              /* * AND THE TUTORIAL OFFERS ITSELF HERE.

                 THIS IS THE MOMENT AND NOT A GUESS. Making a project is the one
                 point in this app where somebody has just said out loud that
                 they are about to start work somewhere they have never worked
                 before. It is also the last moment before they type something
                 real into it, which is the half a tester needed: she went
                 looking for the practice round AFTER she had already been handed
                 the whole app.

                 WHO GETS IT, AND HOW OFTEN, IS ./tutorial.ts. In one line: once,
                 ever, and never again once it has been answered either way. A
                 person making their fifth project has already been asked; a
                 person who has just walked the whole onboarding has just been
                 shown around. Neither is asked again, which is the difference
                 between one helpful offer and nagging.

                 IT IS AFTER THE TOAST, ON PURPOSE. The project really is made
                 and the app really says so, and then a question is asked over
                 the top of it. A question arriving INSTEAD of the confirmation
                 is one somebody has to answer before being told that the thing
                 they did worked.
              */
              if (offerOnNewProject({
                made: !!slug,
                walking: runRef.current !== null,
                offered: !neverOffered(localStorage),
              })) setOffer({ product: slug });
            } catch (err) {
              // The card stays open holding what was typed. A failure that also
              // eats the name is two failures.
              // In words, the way the walk's own name screen says it, not the
              // store's "product x already exists".
              showToast(whyNotMade((err as Error).message, name));
            }
          }}
          onClose={() => setNewProject(false)}
        />
      )}
      {/* THREE DRAWINGS OF ONE UNBUILT SCREEN, reachable only from ?modes=a,b,e
          and drawn by nothing else. w-45e9cd9573, proposed, awaiting a pick.
          There were five until both of the ones that hung the mode copy off the
          folder card were thrown out. See ./components/ModeScreen.tsx.

         Nothing in the walk reaches them and no step count moved: the walk's
         redesign comes before this.
       */}
      {modeDraft && (
        <ModeScreen variant={modeDraft} value={modeDraftValue} onPick={setModeDraftValue} />
      )}
      {/* THE FIRST RUN, LAST, so its three setup screens cover everything and
          its tether draws over whatever the app has open. w-82bb9e2c69.
          A ?modes= drawing stands INSTEAD of it, never over it: two full
          surfaces at once would photograph the welcome screen. */}
      {run && !modeDraft && (
        <Onboarding
          run={run}
          claude={claude}
          home={home}
          opened={!!focused}
          waiting={waitingId(run, WAITING_AT)}
          later={laterId(run, LATER_AT)}
          /*
           * WHICH ROWS THIS BEAT'S KEY IS RIGHT FOR, AND WHERE THE KEYS WOULD
             LAND (w-7fd38422b5, 2026-08-27). The walk rings the first of them
             and answers a press of its own key aimed anywhere else, so the card
             beside the list is the only instruction on the screen. `pointed` is
             the app's own answer to "which row do E, R and S act on", which is
             the hovered row when the pointer is on one: she had the pointer on
             the row an agent is stopped on, which is why her E went there while
             the ring was on a row at the top. */
          beat={walkBeat}
          pointed={pointed?.id ?? null}
          picking={modal === 'snooze'}
          /*
           * THE LAST BEAT NEEDS TO KNOW THE PALETTE IS UP, so it can say
             something on the one screen it is for (w-45e9cd9573, 2026-08-28).
             Separate from `picking` because they are two different things open
             over two different beats, and a single "something is open" flag
             would have the snooze card talking about ⌘K. */
          palette={modal === 'palette'}
          view={view}
          /* THE TABS THE WALK NAMES ARE THE TABS TAB MOVES ALONG. Its tour
             tells somebody to press Tab and then says where that press lands,
             so it has to read the rotation Tab actually takes rather than the
             sidebar's shorter list (w-5a08121f99). */
          tabs={stateTabOrder}
          /*
           * THE LAST CARD FILES INTO A PROJECT, so it needs the list to find
             the one this walk made (w-7fd38422b5, 2026-08-27). It takes only
             that one; see `Finished`. */
          products={snap.products}
          onEvent={fire}
          onStep={(step) => setRun((r) => (r ? stepTo(r, step) : r))}
          onSkipToApp={async ({ name, folder }) => {
            try {
              const made = await api.createProduct({ name, repoPath: folder }) as { slug?: string } | null;
              const slug = made?.slug ?? null;
              if (!slug) throw new Error('the project was not made');
              // The composer remembers by slug, so the example task is
              // addressed to the project they just made and to nothing else.
              rememberProject(slug);
              setPickProject(slug);
              await refresh();
              fire({ t: 'made', product: slug });
              return null;
            } catch (err) {
              // THE REASON GOES BACK TO THE CARD, NOT TO A TOAST.
              // `whyNotMade` turns whatever the store said into a sentence
              // with a way out in it.
              return whyNotMade((err as Error).message, name);
            }
          }}
          onPractice={async () => {
            // THE PRACTICE PROJECT, MADE FOR REAL.One call makes the project
            // and writes the three rows already waiting in it.
            //
            // A REFUSAL DOES NOT STRAND ANYBODY. Fixtures and an old preload
            // both answer null, and a store that will not take it throws; both
            // land in the project they made, which is where the walk used to
            // happen anyway. A first run that stops dead on its eighth screen
            // is worse than one that practises in the wrong place.
            let made: { slug: string; examples: string[]; backdrop?: string[] } | null = null;
            try { made = await api.firstRunPractice(); } catch { made = null; }
            const slug = made?.slug ?? null;
            if (slug) {
              rememberProject(slug);
              setPickProject(slug);
            }
            await refresh();
            fire({ t: 'practice', product: slug ?? '', examples: made?.examples ?? [], backdrop: made?.backdrop ?? [] });
          }}
          /*
           * AND REACHING THIS CARD IS BEING SHOWN AROUND. The
             new project offer is never asked of somebody who has just walked
             the whole thing; the quiet way out below passes nothing, because
             skipping is not practising. */
          onDone={(chosen) => finishRun(chosen, { practised: true })}
          /*
           * THE IMPORT CARD ENDED THE WALK AND HAD ALREADY FILED. Nothing is
             imported here a second time; the toast is the same sentence ⌘K
             says, because it is the same press. */
          onFiled={({ added, already, inboxes, made, noun }) => {
            finishRun([], { filed: added, practised: true });
            if (added || already) {
              showToast(importedLine({
                added, already, name: made.length === 1 ? made[0] : '', inboxes, made, noun,
              }));
            }
          }}
          onProjectMade={(slug) => { rememberProject(slug); refresh(); }}
          onRecheck={recheckClaude}
        />
      )}
      {/* THE FIRST SECOND OF HER OWN PROJECT. It takes no clicks and takes itself down.
       */}
      {/* THE QUIET WAY OUT OF THE WALK.
       */}
      {run && (
        <WayOut
          run={run}
          blocked={!mayOpenInbox(claude)}
          onLeave={() => finishRun([], { celebrate: false })}
        />
      )}
      {landing && <Landed agents={landing.agents} onGone={() => setLanding(null)} />}
      {/* THE TUTORIAL, OFFERING ITSELF ON A NEW PROJECT (w-9a6ea066d6).
          Out here beside the walk's own cards rather than in the modal stack,
          because it is not one of her modals: nothing opened it, ⌘K does not
          close it, and it draws over whatever the app happens to have up. It
          cannot be on the screen at the same time as a walk — `offerOnNewProject`
          vetoes it while one is running — so the two never argue about the
          window. */}
      {offer && !run && (
        <TutorialOffer
          onStart={() => startTutorial(offer.product)}
          onNot={() => {
            // THE ONE MOMENT SAYING WHERE IT LIVES IS WORTH A SENTENCE. She has
            // just proved she knows the tutorial exists and decided not to take
            // it, so this is the last thing said about it and it names the key
            // AND the word to type. "Hit Command+K" on its own did not work on a
            // tester's call; it also needed the word to type after it.
            rememberOffered(localStorage);
            setOffer(null);
            showToast(WALK_COPY.offerLater);
          }}
        />
      )}
      {/* THE PRACTICE BAND, over the real app at full size and never over a
          smaller copy of it. Outside <Onboarding> because it belongs to the
          project rather than to the step: it has to stay through six beats and
          through everything those beats open. */}
      {inPractice && <PracticeBand />}
      {modal === 'standing' && <Standing kind={STANDING} onClose={() => setModal(null)} />}

      {(() => {
        // ONE card, with the queue as a visible trail behind it. A column of
        // full cards filled the screen in seconds and forced whack-a-mole:
        // she could not use the app OR tell which card cmd-Y would answer
        // (2026-08-06). The front card is always the oldest, exactly what
        // cmd-Y and cmd-N act on; the rest wait as stacked edges.
        //
        // An answered card holds its place for one beat on the way out, so a
        // press reads as a decision landing rather than as a card that blinked
        // out of existence. approval-stage.ts decides that, and in particular
        // decides that the next card does NOT slide forward until this one has
        // gone.
        const { card: a, verdict, waiting } = approvalStage(snap.approvals, answered, frontApproval.current);
        if (!a) return null;
        // WHAT IT IS ASKING AND WHAT IT IS ASKING ABOUT, and neither is
        // hardcoded any more: "asks to run" over a diff is a lie, and it is the
        // first thing she reads. approval-card.ts is the only copy.
        const reads = approvalReads(a.input, a.tool);
        return (
          <div className="approvals">
            <div className="approval-stack">
              {waiting > 1 && <div className="approval-ghost g2" />}
              {waiting > 0 && <div className="approval-ghost g1" />}
              <div className={`approval-card${verdict ? ` answered ${verdict}` : ''}`} key={a.id}>
                {verdict && (
                  // The acknowledgement: a mark stamped over the card as it
                  // leaves, and the one word for what she decided.
                  <div className="approval-verdict" aria-live="polite">
                    <span className="approval-verdict-mark" aria-hidden="true">{verdict === 'allow' ? '✓' : '✕'}</span>
                    <span className="approval-verdict-word">{verdict === 'allow' ? 'Allowed' : 'Denied'}</span>
                  </div>
                )}
                {/* THE ORDER OF THIS CARD. The most important thing to see is
                    what the command will do; the chat and the folder are lower
                    in the hierarchy; and too many stacked lines of text are
                    hard to process, so anything unnecessary is cut.

                    So the card is four blocks and was six:

                      1. WHAT WILL HAPPEN, in words. The worker's own
                         description of the command, which is the most
                         important thing on the card.
                      2. THE COMMAND ITSELF, which is the thing being
                         authorised and the only part that has to be exact.
                      3. ONE quiet line carrying the two lower things, the
                         chat and the folder, plus the verb.
                      4. Allow and Deny.

                    "<Product> asks to run" is no longer a block of its own. It
                    is the fallback for block 1 and appears only when there is
                    no description, which is the only case where it is the best
                    sentence the card has. The verb is never lost: with a
                    description it rides the quiet line, because "asks to run"
                    over a patch would still be a lie and approval-card.ts is
                    still the only place that decides it.

                    The transparency is not touched; it was already right. */}
                {(() => {
                  const row = approvalRow(a.item);
                  const mcp = a.tool.startsWith('mcp__');
                  const product = snap.products.find((p) => p.slug === a.product)?.name ?? a.product ?? 'an agent';
                  const said = !mcp && (a.input as any)?.description
                    ? String((a.input as any).description).slice(0, 200)
                    : null;
                  const cwd = !mcp && (a.input as any)?.cwd ? String((a.input as any).cwd) : null;
                  // WITH a description the verb goes quiet and keeps the folder
                  // company. WITHOUT one it is already the loudest line on the
                  // card, and repeating it underneath would be the card saying
                  // one thing twice, which is the clutter this card cuts.
                  const where = [said ? reads.what : null, cwd ? `in ${cwd}` : null]
                    .filter(Boolean).join(' ');
                  return (
                    <>
                      <div className="approval-lede">
                        <span className="approval-lede-text">
                          {said ?? <>{product} {reads.what}</>}
                        </span>
                        {waiting > 0 && <span className="approval-count">+{waiting} waiting</span>}
                      </div>
                      {/* THE WHOLE THING SHE IS ANSWERING ABOUT, AND THE CAP IS
                          NOT HERE. This sliced to 400 characters with no mark on
                          it while nothing capped the card at the source, so she
                          read four hundred characters and authorised however
                          many there were. The display boundary and the
                          enforcement boundary must not differ, and on Codex they
                          differ constantly: it reads, searches and edits by
                          running shell commands, so a long one is the ordinary
                          case, and a patch is longer again. The one cap left is
                          in main/codex-approvals.mjs, which says out loud how
                          much it dropped, and this <pre> scrolls (styles.css). */}
                      <pre className="approval-cmd">{reads.body}</pre>
                      {/* AND WHAT ELSE THE YES OPENS, which is the half a card
                          can be silent about while still looking complete. A
                          command approval carries the host the sandbox would be
                          opened to, and a patch approval can carry a root it
                          asks to write anywhere under for the rest of the run.
                          Both were on the params and neither reached her.

                          THEY STAY WITH THE COMMAND, ABOVE THE QUIET LINE. They
                          are not the same kind of fact as the folder any more:
                          the folder is context that belongs lower, and these two
                          widen what the yes does. A round that cut the card to
                          four blocks left these below the chat for one commit,
                          which put the most dangerous sentence on the card
                          under the least important one. */}
                      {!mcp && (a.input as any)?.host && (
                        <div className="approval-opens">opens the network to {String((a.input as any).host)}</div>
                      )}
                      {!mcp && (a.input as any)?.grantRoot && (
                        <div className="approval-opens">and asks to write anywhere under {String((a.input as any).grantRoot)} for the rest of this run</div>
                      )}
                      {/* THE TWO THINGS SHE PUT AT THE BOTTOM, on one line
                          between them. The folder is still here and still
                          matters: `cat auth.json` in a scratch clone and in her
                          home directory are the same eleven characters and two
                          different questions. It is simply no longer a stack of
                          its own.

                          The chat is the way into the agent, and pressing it
                          opens that row BEHIND the card without answering
                          anything. A row that has gone draws no button: a title
                          she cannot click through to is a caption pretending to
                          be a door. */}
                      {(where || row) && (
                        <div className="approval-meta">
                          {where && <span className="approval-where">{where}</span>}
                          {row && (
                            <button
                              type="button"
                              className="approval-task"
                              title="Open this agent. The card stays where it is."
                              onClick={() => openApprovalRow(a.item)}
                            >
                              <span className="approval-task-title">{row.title}</span>
                              <span className="approval-task-go" aria-hidden="true">↗</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="approval-actions">
                  {/* The acknowledgement starts on the press, not on the round
                      trip: main answers the file and echoes the same verdict
                      back, so the click and the chord land on one behaviour. */}
                  <button className="approval-allow" onClick={async () => { setAnswered({ id: a.id, allow: true }); await window.zero?.approve?.({ id: a.id, allow: true }); await refresh(); }}>Allow</button>
                  <button className="approval-deny" onClick={async () => { setAnswered({ id: a.id, allow: false }); await window.zero?.approve?.({ id: a.id, allow: false }); await refresh(); }}>Deny</button>
                  <span className="approval-hint">⌘Y / ⌘N · {a.tool}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {modal === 'snooze' && snoozeItem && (
        <Snooze
          item={Array.isArray(snoozeItem) ? snoozeItem[0] : snoozeItem}
          count={Array.isArray(snoozeItem) ? snoozeItem.length : 1}
          onPick={(ts, label) => snoozeUntil(snoozeItem, ts, label)}
          onNow={(Array.isArray(snoozeItem) ? snoozeItem : [snoozeItem]).some((i) => dueAt(i) > Date.now())
            ? () => unsnooze(snoozeItem)
            : undefined}
          onClose={() => { setModal(null); setSnoozeItem(null); }}
        />
      )}
      {/* A TOAST WITH SOMEWHERE TO GO IS A BUTTON, and it says so in words on
          its right end. The whole pill is the target rather than just those
          words, because a 13px phrase is a small thing to hit before it fades,
          and the pill is the thing she is already looking at. Without a
          destination it stays the plain div it always was, so nothing that is
          only an announcement grows a pointer or a focus ring. */}
      {toast && (toast.goes
        ? <button type="button" className="toast toast-goes" onClick={() => {
            const row = [...inbox, ...progress, ...snoozed, ...done]
              .find((i) => i.id === toast.goes!.id && i.product === toast.goes!.product);
            setToast(null);
            if (!row) return;
            setSearch(null);
            setFocused(row);
            markSeen(row);
          }}>{toast.text}<span className="toast-go">Open it</span></button>
        : <div className="toast">{toast.text}</div>)}
      {/* AND NO TOAST FOR A NEW VERSION. It was the third of the four drawn for
          w-86452550e5 and the argument against it is the one she agreed with: a
          toast that fires while she is away from the Mac was seen by nobody. */}
      {/* THE KEY HINT, over everything and part of nothing. It is drawn here
          rather than beside the component it belongs to because it is
          position: fixed and measured against the window: a plate rendered
          inside the sidebar would be clipped by the sidebar. Which component it
          is for is `data-hint` on that component, and what it says is
          `hint-plate.ts`. */}
      {hintsOn && shownHint && HINTS[shownHint.id] && (
        <HintPlate
          lines={HINTS[shownHint.id]}
          comp={shownHint.el.getBoundingClientRect()}
          align={shownHint.el.dataset.hintAlign === 'right' ? 'right' : 'left'}
          /* `data-hint-text` names the words inside the component, so the plate
             lines up with the title rather than with the card's edge: a plate
             is expected to be left-aligned with the text, not pushed past it. */
          text={shownHint.el.dataset.hintText
            ? shownHint.el.querySelector(shownHint.el.dataset.hintText)?.getBoundingClientRect() ?? null
            : null}
        />
      )}
      {/* Last, and outside everything: the zoom percent is over whatever is on
          screen, including an opened task. */}
      <ZoomPercent />
      {/* ⌘F, on every screen, for the same reason. */}
      <FindBar />
    </div>
    </LiveContext.Provider>
    </TeamContext.Provider>
  );
}
