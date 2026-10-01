import { RemoteControl } from './RemoteControl';
import {DirectReview} from './DirectReview';
import {reviewLabEnabled, reviewContextDraft} from '../review-lab';
import { sourceReference } from '../source-reference.mjs';
import { TaskTerminal } from './TaskTerminal';
import { isLocalPreview } from '../artifact-layout';
import { watchCommandCatalog } from '../command-catalog';
import { providerCommand } from '../../../shared/provider-commands.mjs';
// Focus mode: the whole interruption, rendered to be decidable in seconds.
//
// THE MESSAGE IS A CONVERSATION, ON EVERY ROW.An imported Claude Code session
// and one of her own tasks are both threads and are both drawn by Thread.tsx;
// what differs is only where their events are read (AgentThread.tsx,
// ItemThread.tsx). Everything else here — the recap of the parent, the blocked
// line, the files at the foot, the options strip on the composer — sits around
// that thread and is unchanged.
//
// One typographic system throughout (markdown, no cards, no stripes). Reply is
// a docked composer, never a modal over the text.

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TeamContext, firstName } from '../team/people';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AnswerMode, CodexModeId, PermissionMode, RunningSession, WorkItem } from '../types';
import {
  MENU_TITLE, MODE_ORDER, MODE_STATUS, MODE_WORDS, exactClear, exactMode, nextMode, slashQuery,
} from '../modes';
import {
  CODEX_DEFAULT_MODE,
  CODEX_MODES,
  CODEX_MODE_ORDER,
  CODEX_MODE_STATUS,
  exactCodexMode,
  nextCodexMode,
} from '../../../shared/codex-modes.mjs';
/*
 * THE ROW'S TWO WORDS COME FROM `rowSays` NOW, not from six constants pulled
   apart here. One list, one row shape (w-23a7b3f568, 2026-08-27). */
import { rowKey, rowSays, slashRows, type SlashRow } from '../slash-menu';
import { commandDraft } from '../../../shared/claude-commands.mjs';
import { CompactionResult, runCompaction, runCommand } from './CompactionResult';
import { codexCommand, COMPACTION_COPY } from '../../../shared/codex-commands.mjs';
import { DEFAULT_ENGINE } from '../../../shared/engines.mjs';
import { ago, dayLabel, itemOptions, offerIsLive, optionsFrom, parseOptions, parseRepeat } from '../format';
import { ruleIdOf } from '../../../shared/repeats.mjs';
import { WhenPicker } from './When';
import { ModelPicker } from './Model';
import type { ModelChoice } from '../models';
import { sameRule, type RepeatShape as RepeatRuleValue } from '../../../shared/repeats.mjs';
import { collectFiles, fromPaste, persistAttachments, type PendingAttachment } from '../attachments';
import { pictureUrl } from '../picture';
import { handleCopyOut, blockCopyText } from '../copy-out';
import { referencedFiles } from '../referenced-files';
import { changePathFor } from '../code-artifact';
import { fileCount, figuresFrom, figuresLabel, signed, type ChangeFigures } from '../change-figures';
import { embeddedDocuments, isBookkeeping } from '../message-artifacts';
import { opensInPane } from '../doc-pane';
import { artifactUrlTransform, isMediaPath, productPath, remarkArtifactPaths } from '../remark-artifact-paths';
import { api } from '../api';
import { draftKey, readDraft, saveDraft, clearDraft, readDraftAttachments, saveDraftAttachments, type SentDraft } from '../drafts';
import { foldedReply } from '../folded-reply';
import { applyDockHeight } from '../dock-height';
import { resumeTo } from '../thread-bottom';
import { optionIsClipped, optionPeek } from '../option-peek';
import { askLine, askFull, askIsClipped } from '../ask-line';
import { replyIsSwallowed, replyReaches } from '../../../shared/agents.mjs';
import { recapFor, type Recap as RecapValue } from '../recap';
import type { LiveFacts } from '../live-line';
import { AttachRow } from './AttachRow';
import { BackToWhatSheWasReading } from './UrgentBar';
import { AgentThread } from './AgentThread';
import { Live } from './Live';
import { SidebarIcon } from './SidebarIcon';
import { Byline } from './Byline';
import { ItemThread } from './ItemThread';
import type { PendingSaid } from '../item-thread';
import { isTroubleRow } from '../trouble-row';
import { rowTitle } from '../list-rules';
import { useKeepInWindow } from '../keep-in-window';
import { isUpdateRow, SAY as UPDATE_SAY } from '../update-row';
import { TeamRouteStrip, teamHeld } from '../team/TeamFocus';
import {
  PriorityPicker, priorityIdOf, priorityValueOf, type PriorityId,
} from './Priority';
import { SummaryPanel, SummaryToggle, ThreadStateMark, useSummaryOpen, useSummaryShortcut } from '../threads/Summary';
import { ThreadMenu } from '../threads/ThreadMenu';
import { engineModelLabel } from '../models';

// With the options strip riding on the composer, the field's own "## Options"
// section would say everything twice; drop the heading and its numbered items
// (prose after the list stays). Only called while the strip is visible, and
// only on the field the offer actually came from: an answered item keeps the
// list where it was written, as the record of what was offered.
function stripOptionsSection(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let inOptions = false;
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) inOptions = /option/i.test(line);
    else if (inOptions && line.trim() && !/^\s*\d+[.)]\s/.test(line)) inOptions = false;
    if (!inOptions) out.push(line);
  }
  return out.join('\n');
}

// A relative product path is an artifact, however the worker wrote it:
// images render inline, other files become links, and .html demos embed
// below as live frames. Mechanism, not prompt hope.
const PATH_RE = /^[\w-][\w./-]*\.(png|jpe?g|gif|webp|html?|pdf|md|csv|txt|json|mp3|wav|m4a|aac|ogg|mp4|mov|m4v|webm)$/i;

// remarkArtifactPaths is what makes a path a worker typed into a sentence a
// link like any other. Three ways to name a file were already in use and only
// two of them opened anything. It is handed the product's folder so a path
// written out in full from the root links too; the list is memoized on that
// folder in Focus, so its identity never churns a render.

// "tomorrow 8:00 AM". The same day words the Scheduled list uses, so the row
// and the open task never name the same moment two different ways.
function whenLabel(ts: number, now = Date.now()): string {
  const time = new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dayLabel(ts, now).toLowerCase()} ${time}`;
}

// The priority vocabulary and its control live in ./Priority, shared with the
// composer. They used to be defined here and again there, in two different
// cases, which is how "Medium" and "medium" ended up on adjacent screens.
export type { PriorityId } from './Priority';

// Every code block carries its own copy button: workers hand the user
// commands to paste, and hand-selecting inside a scrolling <pre> is daily
// friction.
//
// What leaves on the clipboard is not always what is in the block. A worker
// writing an email draft wraps it at eighty columns out of habit, and those
// newlines are real characters, so the mail client drew every one of them and
// the paragraphs arrived folded. `blockCopyText` takes those breaks back out,
// and leaves anything that might be a command exactly as it is. The rule and
// what it was measured against are in renderer/src/unwrap-lines.ts.
function CodePre({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-wrap">
      <pre ref={ref}>{children}</pre>
      <button
        className={`code-copy ${copied ? 'copied' : ''}`}
        onClick={() => {
          navigator.clipboard.writeText(blockCopyText(ref.current)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }).catch(() => {});
        }}
      >{copied ? 'copied ✓' : 'copy'}</button>
    </div>
  );
}

// A worker's image path, tried against every plausible root until one loads.
// One guessed URL was the old behavior, and it broke often: the file lives in
// the docs dir, or its designs/, or the repo, depending on who wrote it.
//
// So the thing on the card that most looks like the picture was the one thing
// that could not be opened, and the markdown image is the form the worker brief
// itself asks for.
//
// It opens the way the chip already does, which sends a png to Preview.
export function ArtifactImg({ src, alt, roots, onOpen }: { src?: string; alt?: string; roots: string[]; onOpen?: (src: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  if (!src) return null;
  // A picture pasted straight into a message carries its own bytes, so there is
  // no file anywhere for a click to open and it stays a picture and nothing else.
  if (/^data:/.test(src)) return <img src={src} alt={alt ?? ''} className="inline-image" />;
  // `data-copy-file` is what a right click reads (main/main.mjs), so the
  // picture itself offers the file. The chips at the foot used to carry it too
  // and they are gone, so this is now the only one in the message: a right
  // click on the drawing is how she copies the file out.
  const door = (path: string, picture: ReactNode) => (onOpen
    ? (
      <button
        type="button"
        className="inline-image-open"
        data-copy-file={/^https?:/.test(path) ? undefined : path}
        title={path}
        onClick={() => onOpen(path)}
      >{picture}</button>
    )
    : picture);
  if (/^https?:/.test(src)) return door(src, <img src={src} alt={alt ?? ''} className="inline-image" />);
  // A worker that wrote the whole path, either bare or as a file:// url, said
  // exactly which picture it meant, so there is nothing to guess: it goes
  // straight to the app's picture scheme (../picture.ts). `crossOrigin` IS WHAT
  // LETS A COPY CARRY THE PICTURE. Without it the picture taints a canvas and
  // ../copy-out.ts has nothing to inline, so a message pasted into an email
  // arrives with a dead url where it should be.
  if (/^file:\/\//.test(src)) {
    const file = decodeURIComponent(src.slice(7));
    return door(file, <img src={pictureUrl(file)} alt={alt ?? ''} className="inline-image" crossOrigin="anonymous" />);
  }
  if (src.startsWith('/')) return door(src, <img src={pictureUrl(src)} alt={alt ?? ''} className="inline-image" crossOrigin="anonymous" />);
  const rel = src.replace(/^\.\//, '');
  const candidates = roots.map((r) => pictureUrl(`${r}/${rel}`));
  if (attempt >= candidates.length) {
    return <span className="missing-artifact">missing image: {rel}</span>;
  }
  return door(rel, <img src={candidates[attempt]} alt={alt ?? ''} className="inline-image" crossOrigin="anonymous" onError={() => setAttempt(attempt + 1)} />);
}

// A SOUND OR A FILM A WORKER NAMES PLAYS WHERE IT IS NAMED.
//
// She sent a result naming five voice samples she was meant to choose between,
// and all five were grey paths with nothing to press. A sound is chosen by
// listening, so the player is the link: the name above it still opens the file
// in the app that owns it, and the player tries every root the way a picture
// does. The file comes on the app's own scheme, which serves sound and film
// from the folders the app owns (main/img-scheme.mjs), because her window is
// served over http and may not load a file:// url.
export function ArtifactMedia({ src, label, roots, onOpen }: { src: string; label?: ReactNode; roots: string[]; onOpen?: (src: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const rel = src.replace(/^\.\//, '');
  const candidates = src.startsWith('/') ? [pictureUrl(src)] : roots.map((r) => pictureUrl(`${r}/${rel}`));
  const name = (
    <button type="button" className="inline-media-name" data-copy-file={rel} title={rel} onClick={() => onOpen?.(rel)}>
      {label ?? rel}
    </button>
  );
  // Not in any root: it stays a name she can press, and the press says it is missing.
  if (attempt >= candidates.length) return <span className="inline-media-missing">{name}</span>;
  const next = () => setAttempt(attempt + 1);
  const film = /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(rel);
  return (
    <span className="inline-media">
      {name}
      {film
        ? <video key={candidates[attempt]} src={candidates[attempt]} controls preload="metadata" onError={next} />
        : <audio key={candidates[attempt]} src={candidates[attempt]} controls preload="metadata" onError={next} />}
    </span>
  );
}

// A worker's link, its href corrected to the file that actually exists (the
// main process resolves across every plausible root). Until then the naive
// guess stands in; Copy Link must hand out a URL that works.
function ArtifactLink({ product, src, fallback, onOpen, children }: {
  product: string; src?: string; fallback?: string; onOpen: () => void; children: ReactNode;
}) {
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    setHref(fallback);
    if (!src || /^https?:/.test(src)) return;
    (window as any).zero?.openArtifact?.({ product, src: sourceReference(src) ?? src, mode: 'resolve' })
      .then((r: { ok: boolean; opened?: string }) => { if (r?.ok && r.opened) setHref(`file://${r.opened}`); })
      .catch(() => {});
  }, [product, src]);
  return <a href={href} onClick={(e) => { e.preventDefault(); onOpen(); }} rel="noreferrer">{children}</a>;
}

// A document a message named, shown whole under the message.
//
// It resolves through the same main-process lookup the links and the chips use,
// across every root a worker might have written against, and it draws NOTHING
// when the file is not there. The old frame guessed one root and, when the
// guess was wrong, printed a white rectangle with the path over it, which reads
// like a document that has gone blank rather than a path we could not find.
function ArtifactEmbed({ product, path, fallback, open, onOpen }: {
  product: string; path: string; fallback?: string;
  // Is this the document already open in the pane on the right.
  open?: boolean;
  onOpen?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const api = (window as any).zero;
    if (!api?.openArtifact) { setSrc(fallback ?? null); return () => { live = false; }; }
    api.openArtifact({ product, src: path, mode: 'resolve' })
      .then((r: { ok: boolean; opened?: string }) => {
        if (live) setSrc(r?.ok && r.opened ? `file://${r.opened}` : null);
      })
      .catch(() => { if (live) setSrc(null); });
    return () => { live = false; };
  }, [product, path]);
  if (!src) return null;
  // THE SAME DOCUMENT IS NEVER ON THE SCREEN TWICE. With the pane open on the
  // right, the frame under the message is the same page at half the size, so
  // it stands down to one line that says where its document went.
  if (open) {
    return (
      <button type="button" className="embed-collapsed" onClick={onOpen}>
        <span className="ec-mark" aria-hidden="true" />
        <span className="ec-name">{path}</span>
        <span className="ec-state">open on the right</span>
      </button>
    );
  }
  return (
    <div className="artifact-embed">
      <div className="artifact-embed-bar">
        <button type="button" className="artifact-embed-path" onClick={onOpen}>{path}</button>
        <a href={src} target="_blank" rel="noreferrer">open ↗</a>
      </div>
      <iframe src={src} tabIndex={-1} sandbox="allow-scripts" title={path} />
    </div>
  );
}

// THE ATTACHMENT ROW IS GONE (w-38d7d32c88).
//
// Images the user uploads and images or files the agent returns are already in
// the chat, a scroll away. A row of rectangular file tags at the bottom
// repeated them, was confusing and took up space.
//
// The reason it can go is that everything the row carried now has a
// door of its own IN the message. A picture she pastes is a markdown image. A
// picture or a page a worker names in a sentence is drawn or linked where it is
// named (renderer/src/remark-artifact-paths.ts). A design or a
// change frames under the message and opens beside the card. So a chip was a
// second drawing of a file the message had already shown: the chips were
// usually pictures sitting a scroll above them.
//
// What it alone carried was a file a RUN made and never named. That is ours,
// not the user's, and it is the part that was unnecessary. `filesFromRuns` stays,
// because App.tsx still reads it to choose the design a card opens itself on.

export function Focus({ artifactView, previewSample, onOpenArtifact, artifactSlot, inlineArtifacts, headerTarget, cornerHeaderTarget, item, parent, blockedBy, runningMode, engineChoice, runningEngine, codexModels, codexModelDefault, session, live, stoppable, productDir, repoDir, selectedOption, interruptedFrom, onBackToInterrupted, returnedFromSnooze, scheduledUntil, scheduledByAgent, replyOpen, sending, stalled, openDoc, resumeAt, onScrolled, onOpenDoc, onRedeliver, onUnschedule, onClose, onResolve, onPick, onReply, onReplySend, onReplyClose, onStop, onReopen, onSnooze, onReveal, onOpenItem, onNotice, onInstallUpdate, items, onHandToAgent }: {
  previewSample?: string;
  /**
   * EVERY THREAD THE WINDOW HOLDS, for the summary's linked titles and the
   *  menu that adds a link. Optional because App.tsx does not hand it over yet;
   *  until it does, the summary reads the snapshot once for itself. */
  items?: WorkItem[];
  /**
   * A MESSAGE FROM A PERSON IS NOT WORK UNTIL SHE SAYS SO. The one line under
   *  the latest message on a message thread calls this to make it a task for
   *  an agent. Absent, the line is not drawn, because a word that does nothing
   *  when pressed is worse than no word. */
  onHandToAgent?: (item: WorkItem) => void;
  artifactSlot?: (node: HTMLDivElement | null) => void;
  inlineArtifacts?: boolean;
  artifactView?: 'beside' | 'focus';
  onOpenArtifact?: (src: string, mode: 'beside' | 'focus') => void;
  headerTarget?: HTMLElement | null;
  /** THE SOCKET IN THE CORNER: the Summary button and the thread's menu
   *  (w-e731ca9376, 2026-10-01). Only Focus knows whether this thread changed
   *  code, has a terminal or can still be finished, which is why the menu is
   *  drawn here and teleported there. */
  cornerHeaderTarget?: HTMLElement | null;
  item: WorkItem;
  /**
   * Quit and come back on the new version. Only the update row has it, and
   * only it draws the button that calls it. */
  onInstallUpdate?: () => void;
  // WHAT AGENTS ARE ALLOWED TO DO RIGHT NOW, so the reply footer can print it
  // whether or not this message has changed it. Claude Code prints its own
  // mode in the status bar the whole time; this is the same fact.
  runningMode?: PermissionMode;
  // WHETHER THIS MAC OFFERS A CHOICE OF CODING AGENT, and which one this row
  // runs on. Both off the snapshot and both answered by main: the byline may
  // name an engine only where there is one to name, and the two rules that
  // decide that are pinned to main/supervisor.mjs. False and absent on every
  // Mac until the gate is opened, and the line is then the one already chosen,
  // unchanged.
  engineChoice?: boolean;
  /**
   * Handed straight to the reply box's model drawer. Read once in App.tsx off
   * the workspace, so this box and the new-task card can never show two
   * different lists of the same Mac's Codex models. */
  codexModels?: ModelChoice[];
  codexModelDefault?: string | null;
  runningEngine?: string | null;
  // WHERE A RELOAD SAYS SHE WAS, and only a reload: it names the task it
  // belongs to so it can never be spent on the wrong one, and clicking into a
  // task never sets it.
  resumeAt?: { id: string; top: number } | null;
  // Where she is now, so ⌘R has something to remember. Called as she scrolls.
  onScrolled?: (top: number) => void;
  // The document open beside this message, by the path the message named, and
  // the way to open one. A page or a markdown file opens HERE now rather than
  // in whatever app owns the extension.
  openDoc?: string | null;
  onOpenDoc?: (src: string, at?: string) => void;
  parent: WorkItem | null;
  blockedBy: WorkItem | null;
  onOpenItem: (item: WorkItem) => void;
  // Said out loud when a file a worker named is not in this product. Nothing
  // else on the card can tell her a chip failed.
  onNotice: (text: string) => void;
  session: RunningSession | null;
  // WHAT THE FLEET IS DOING ABOUT THIS ROW: queued, paused, how many agents are
  // up and how many there can be. Read straight off the supervisor's status in
  // App.tsx and handed over whole, because `live-line.ts` owns which of them
  // becomes a sentence and this component owns none of that decision.
  live: LiveFacts;
  // Is this row under way at all (In progress), which is a broader thing than
  // having a live session and is the question the stop actually asks.
  stoppable: boolean;
  productDir: string | null;
  repoDir: string | null;
  selectedOption: number | null;
  // The task this one took her off, by name, when an Urgent row arrived while
  // she was reading something else. Null the rest of the time, which is
  // nearly always. The card has to SAY it: a screen that changes under her
  // with no explanation and no way back breaks every design rule this app
  // keeps, and the way back is the half that matters most.
  interruptedFrom?: string | null;
  // What pressing that control does. Only ever set alongside interruptedFrom.
  onBackToInterrupted?: () => void;
  returnedFromSnooze?: boolean;
  // The moment nothing happens to this task until, and whether an agent is the
  // one who said so. 0 when it is not waiting on a moment at all.
  scheduledUntil?: number;
  scheduledByAgent?: boolean;
  replyOpen: boolean;
  // WHAT SHE HAS SENT TO THE RUNNING AGENT AND THE ROW HAS NOT RECORDED YET.
  // Straight through to the conversation, which draws each one as her message
  // from the moment she pressed send. Empty on every row where nothing is in
  // flight, which is nearly all of them.
  sending?: PendingSaid[];
  stalled?: boolean;
  onRedeliver: () => void;
  onUnschedule?: () => void;
  onClose: () => void;
  onResolve: () => void;
  onPick: (n: number) => void;
  onReply: () => void;
  onReplySend: (text: string, priority?: number, repeat?: RepeatRuleValue | null, sent?: SentDraft, mode?: AnswerMode | null, pick?: { model: string | null; effort: string | null }) => void;
  onReplyClose: () => void;
  onStop: () => void;
  // Only ever called on an agent row a reply cannot reach: brings the app that
  // session is running inside to the front.
  onReveal?: () => void;
  onReopen: () => void;
  // Putting something off had no button anywhere in the app: S, and only S.
  // Every other verb in this footer is clickable, so the one verb that is not
  // is the one a hand that has never read a shortcut list cannot reach.
  onSnooze?: () => void;
}) {
  // A TASK GIVEN TO A PERSON has no agent on it, so nothing says one is not running.
  const teamCtx = useContext(TeamContext);
  const heldByPerson = teamHeld(item, teamCtx);
  // Whatever the pane is leading with, not the ask alone: on a row the user wrote,
  // the ask is the one field a worker cannot answer in (format.ts says why).
  const options = itemOptions(item);

  // A ROW THAT STANDS FOR A RUNNING AGENT, not for work in a ledger. Almost
  // every verb this pane offers means nothing to one: there is no task to
  // close, nothing to defer, no worker to stop and no thread to page back
  // through. What is left is reading what it said and answering it, so that is
  // all this draws. The two waiting states differ and the difference is the
  // whole honesty of the feature: a message clears an agent waiting for
  // somebody to type, and it queues behind a permission box without clearing
  // anything, so the second one gets its window instead of a reply box.
  const agent = item.agent ?? null;
  const agentTakesReply = agent ? replyReaches(agent) : false;
  // THE USER'S ASK, HEADED FOR THE THREAD RATHER THAN FOR A BOX ABOVE IT. Only
  // the `said` shape moves: that one is the user's own text, and a conversation that
  // starts with somebody else's summary of what she asked is the thing this row
  // is about. An agent row draws its own thread and has no parent of ours to
  // open, so nothing moves there either.
  const said = recapFor(item, parent);
  const openingSaid = !agent && said?.kind === 'said'
    ? { text: said.text, at: said.at, on: said.on }
    : null;
  // THE ROW THAT SAYS HER TASKS ARE NOT RUNNING OPENS HERE LIKE ANYTHING ELSE.
  // Three things about it differ, and every one of them is a promise this pane
  // would otherwise draw and not keep: there is no ledger behind it, so there
  // is no conversation to read; there is nobody on the other end, so there is
  // nothing to reply to; and there is no row to carry a moment, so it cannot be
  // put off. Everything else on this screen is the same.
  const trouble = isTroubleRow(item);
  // AND THE ROW THAT SAYS A NEW AGENTBOX IS READY OPENS THE SAME WAY, with the
  // same three differences and one addition of its own: it has a thing to
  // press, so it gets a button where every other row gets a reply box. `made`
  // is the pair of them, which is what this pane checks wherever the reason is
  // "there is no ledger row behind this one".
  const update = isUpdateRow(item);
  const made = trouble || update;
  // ONE REASON THERE IS NO REPLY BOX, and it is a box. There was not one. A
  // quiet session is not stuck on anything — it is sitting at its prompt,
  // listening — and a message written to it lands and is worked on, measured
  // 2026-08-17. The only agent a message really is swallowed by is the one
  // frozen on a permission prompt, and that is now the only one without a box.
  const replyBlocked = agent ? replyIsSwallowed(agent) : false;

  // THE THREAD'S SUMMARY (approved 2026-10-01, w-e731ca9376): the state and a
  // Summary button in the top bar, and the panel beside the conversation.
  //
  // NOT ON A MESSAGE FROM A PERSON. A message between two people lives in a
  // record of its own (main/team/projects.mjs makeDirect), is not work, and is
  // never carded for the team, so it has no state to report and nothing to
  // summarise. Not on the rows with no ledger behind them either: a running
  // agent's row, the trouble row and the update row have no fields to keep.
  //
  // AND IT GIVES WAY TO A DOCUMENT. With a file open beside the task the pane
  // is a narrow column, and a 352 point panel inside it would leave the words
  // no room; the button goes with it, so nothing on screen does nothing.
  const direct = teamCtx?.products.get(item.product)?.team?.direct === true;
  // Who a conversation is with, from where you sit, for its title and reply box.
  const talkPerson = direct && teamCtx
    ? teamCtx.byId.get((item.people ?? []).find((p) => p !== teamCtx.me) ?? (item.createdBy !== teamCtx.me ? item.createdBy ?? '' : item.assignee ?? '')) ?? null
    : null;
  // A group conversation: everyone in it but you, from its record.
  const talkTeam = direct ? teamCtx?.products.get(item.product)?.team : null;
  const talkOthers = talkTeam && teamCtx
    ? [...new Set([...(talkTeam.people ?? []), ...(talkTeam.sharedBy ? [talkTeam.sharedBy] : [])])].filter((p) => p !== teamCtx.me).map((id) => teamCtx.byId.get(id) ?? null).filter((p): p is NonNullable<typeof p> => !!p)
    : [];
  const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
  const talkName = direct && teamCtx ? (talkOthers.length > 1 ? join(talkOthers.map((p) => firstName(p))) : firstName(talkPerson)) : null;
  const talkFull = talkOthers.length > 1 ? talkOthers.map((p) => p.name).join(', ') : talkPerson?.name || talkName;
  const summarised = !agent && !made && !direct;
  const [summaryOpen, toggleSummary] = useSummaryOpen();
  const summaryOffered = summarised && !openDoc;
  const summaryShown = summaryOffered && summaryOpen;
  useSummaryShortcut(toggleSummary, summaryOffered);
  // The window's threads, read once for the panel when App.tsx has not handed
  // them over (see `items` above). Only while the panel is up, and once per
  // thread, so a closed panel costs nothing.
  const [ownItems, setOwnItems] = useState<WorkItem[]>([]);
  useEffect(() => {
    if (items || !summaryShown) return undefined;
    let live = true;
    void api.snapshot().then((s) => { if (live) setOwnItems(s?.items ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [items, summaryShown, item.product, item.id]);

  // THE MODEL, IN THE REPLY BOX AND NOT THE HEADER. The folded box says which
  // model picks up what she sends next, at its right end, and pressing the word
  // opens the box with the model drawer already open: the same drawer and the
  // same pick the composer's sentence has, so there is one place it is chosen.
  // Not on a running agent's row (a message goes straight into it) or on a
  // message to a person (no agent reads it).
  const modelWord = !agent && !direct
    ? engineModelLabel(runningEngine ?? null, item.model ?? null, { codexModels, codexDefault: codexModelDefault })
    : null;
  const [openModel, setOpenModel] = useState(false);
  useEffect(() => { if (!replyOpen) setOpenModel(false); }, [replyOpen]);

  // WHAT THE DOCK SAYS ONCE IT HAS FOLDED SHUT.
  //
  // It is read out of the store rather than held here, because the composer
  // that owned her sentence is unmounted by the time this pill draws and the
  // store is the only copy left. `replyOpen` is in the dependencies because
  // closing the box is the exact moment this has to change: that close is what
  // re-renders this pane, and the pill has to come back already carrying her
  // words. Nothing here can lose them; it only decides what is shown.
  const folded = useMemo(
    () => foldedReply(readDraft(item), readDraftAttachments(item), agent?.name),
    [replyOpen, item.product, item.id, agent?.name],
  );

  // A TASK OPENS AT ITS END, NOT AT ITS BEGINNING.
  //
  // This used to send the pane to scrollTop 0 on every change of item, on the
  // reasoning that the box keeps its position across renders and advancing from
  // the bottom of one task would otherwise land mid-message in the next. That
  // reasoning is right about the box and wrong about where to put it. The thread
  // sticks itself to the bottom (../thread-bottom), and an effect here writing
  // 0 was a second hand on the same box pulling the other way.
  //
  // WHERE SHE WAS, BUT ONLY ACROSS A RELOAD. Clicking into a task is never a
  // reload, so clicking into a task always ends at the bottom.
  //
  // It is not one write. The conversation is read off her disk AFTER the pane is
  // drawn, so at the moment a reload finishes the box is a few hundred pixels
  // tall and a scrollTop of four thousand clamps to whatever fits; resumeTo
  // keeps reaching for the place while the page grows into it.
  const scrollRef = useRef<HTMLDivElement>(null);
  // The box the message is drawn in, so a copy out of it can be rewritten
  // before it reaches the clipboard (../copy-out.ts).
  const bodyRef = useRef<HTMLDivElement>(null);
  const resumed = useRef<string>('');
  useEffect(() => {
    if (!resumeAt || resumeAt.id !== item.id || resumed.current === item.id) return;
    // Spent only once the box was actually there to spend it on. Marking it
    // before this check burned the restore on the render where the pane had not
    // mounted yet, and it never came back: the reload landed at the bottom with
    // her place sitting in localStorage unread.
    if (!scrollRef.current) return;
    resumed.current = item.id;
    return resumeTo(scrollRef.current, resumeAt.top);
  }, [item.id, resumeAt]);

  // A CONVERSATION OPENS AT ITS NEWEST MESSAGE AND STAYS THERE, the way a chat
  // does: hundreds of lines above are one scroll up, and a new message keeps
  // the page at the bottom unless she has scrolled up to read.
  useEffect(() => {
    if (!direct) return;
    const box = scrollRef.current;
    if (!box) return;
    let pinned = true;
    const onScroll = () => { pinned = box.scrollHeight - box.scrollTop - box.clientHeight < 80; };
    const stick = () => { if (pinned) box.scrollTop = box.scrollHeight; };
    box.addEventListener('scroll', onScroll, { passive: true });
    const grew = new MutationObserver(stick);
    grew.observe(box, { childList: true, subtree: true, characterData: true });
    stick();
    return () => { box.removeEventListener('scroll', onScroll); grew.disconnect(); };
  }, [direct, item.id]);

  // WHERE SHE IS, SO ⌘R HAS SOMETHING TO REMEMBER. Only the number, and only
  // while a task is open; App.tsx decides whether it is ever worth reading back.
  //
  // AND ONLY WHERE SHE PUT HERSELF. The thread scrolls this box on its own — it
  // lands the conversation at the end and follows it as it grows — and every one
  // of those writes fires a scroll event that is indistinguishable from hers by
  // position alone. Recording them overwrote the place she was actually at:
  // measured on a reload 2026-08-23, a position of 2998 became 11 within 50ms of the page
  // coming back, which is the thread landing on a page that had not finished
  // loading. So nothing is written down until she has touched the box, and after
  // that everything is, because from then on the position is hers.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !onScrolled) return;
    let hers = false;
    const took = () => { hers = true; };
    const tell = () => { if (hers) onScrolled(Math.round(box.scrollTop)); };
    const HERS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    for (const ev of HERS) box.addEventListener(ev, took, { passive: true });
    box.addEventListener('scroll', tell, { passive: true });
    return () => {
      for (const ev of HERS) box.removeEventListener(ev, took);
      box.removeEventListener('scroll', tell);
    };
  }, [item.id, onScrolled]);

  // The options strip on the composer collapses (chevron), and reopens fresh
  // for every task: a fold is a reading preference, not a standing setting.
  //
  // THE HALF FOLD IT HAD FOR ONE DAY IS GONE. Under a full screen document
  // this started false, so the strip drew its heading and nothing else. She is
  // right: a heading with no options under it is neither the question answered
  // nor the page unobstructed, it is a third state nobody asked for. Full
  // screen hides the WHOLE strip until she opens the box, which is
  // `stripShown` below.
  const [optsOpen, setOptsOpen] = useState(true);
  useEffect(() => { setOptsOpen(true); }, [item.id]);

  // Arrowing onto an option that has scrolled offscreen brings it into view.
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selectedOption !== null) selRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedOption]);

  // THE OPTION UNDER THE POINTER, IN FULL, IN A CARD OVER THE MESSAGE. The
  // rules live in ../option-peek: hover only, and only on an option the strip
  // is cutting.
  //
  // The measurement happens on the way in rather than on every render, because
  // whether two lines are enough depends on the width the pane happens to have
  // right now, and reading it once per hover is both current and free.
  const [peek, setPeek] = useState<number | null>(null);
  useEffect(() => { setPeek(null); }, [item.id, optsOpen]);
  const onOptionEnter = (n: number, el: HTMLElement) => {
    const text = el.querySelector('.opt-text');
    setPeek(optionPeek(n, !!text && optionIsClipped(text)));
  };
  const peekOption = peek === null ? null : options.find((o) => o.n === peek) ?? null;

  // AND THE QUESTION ITSELF, ON THE SAME TERMS.
  //
  // The heading is the one line in the strip she had no way to finish reading,
  // which is the worst place in the pane for it to happen: the options
  // underneath are answers to a sentence she can only see half of.
  const [askPeek, setAskPeek] = useState(false);
  useEffect(() => { setAskPeek(false); }, [item.id]);
  const onAskEnter = (el: HTMLElement) => {
    setAskPeek(askIsClipped(ask, askAll, el.querySelector('span')));
  };

  const product = item.product;

  // WHAT THIS RUN CHANGED, READ ONCE PER CARD.
  //
  // The change is a file the supervisor writes when a worker exits, at
  // `runs/<item>/the-change-it-made.change`, and this asks for it by name
  // rather than hunting for it: a row with no run answers not-ok in a stat and
  // nothing is drawn. Only the three figures are kept; the hunks are read again
  // by the pane when she actually opens it.
  //
  // IT IS RE-READ WHILE A RUN IS LIVE, and only then, for the same reason the
  // conversation is: the run that is writing the trace writes the change the
  // moment it exits, and without this she would have to leave the card and come
  // back before the code she watched being written became pressable. A finished
  // row does not change under her, so it is read once.
  const [figures, setFigures] = useState<ChangeFigures | null>(null);
  useEffect(() => {
    let live = true;
    setFigures(null);
    // One of her own Claude Code sessions is not one of our runs: nothing wrote
    // a change for it, so there is nothing to ask for.
    if (agent) return () => { live = false; };
    const read = () => {
      api.codeChange({ product: item.product, src: changePathFor(item.id) })
        .then((r) => { if (live) setFigures(r?.ok ? figuresFrom(r.change) : null); })
        .catch(() => { if (live) setFigures(null); });
    };
    read();
    if (!session) return () => { live = false; };
    const timer = setInterval(read, 4000);
    return () => { live = false; clearInterval(timer); };
  }, [item.product, item.id, item.updatedAt, session?.startedAt, agent]);

  // Parent callbacks change on polling and when a document opens. Keep the
  // current actions without making them React component identities: replacing
  // an `a` renderer remounts all its players and resets missing-file retries.
  const markdownActions = useRef({ onOpenDoc, onNotice });
  useLayoutEffect(() => { markdownActions.current = { onOpenDoc, onNotice }; });

  // Everything the markdown renderer closes over, memoized as ONE stable
  // object. The component functions' identity is what React reconciles by:
  // fresh arrows every render meant every store push (workers stream one per
  // second) remounted the whole markdown tree, so images reloaded from disk
  // and links re-resolved, and the screen visibly flashed and shifted.
  const { resolveSrc, mdComponents, openHref, roots } = useMemo(() => {
    const resolveSrc = (src?: string) => {
      if (!src) return src;
      if (/^(https?|file|data):/.test(src)) return src;
      if (!productDir) return src;
      return `file://${productDir}/${src.replace(/^\.\//, '')}`;
    };

    // Where a worker's relative path might actually live: the docs dir, its
    // designs/ and attachments/ folders, and the code repo. Workers write
    // paths relative to whichever one they were thinking about.
    const roots = [
      productDir,
      productDir && `${productDir}/designs`,
      productDir && `${productDir}/attachments`,
      repoDir,
      repoDir && `${repoDir}/designs`,
    ].filter(Boolean) as string[];

    // Clicks resolve in the main process, across the roots a worker might have
    // meant WITHIN THIS CARD'S OWN PRODUCT (main/artifact-path.mjs): a
    // single-root file:// href opened nothing, silently, when the worker wrote
    // it against a different root, and reaching into other products opened the
    // wrong file, which is worse.
    //
    // A miss now SAYS SO.
    const openHref = (href?: string) => {
      if (!href) return;
      const { onOpenDoc, onNotice } = markdownActions.current;
      // A PAGE OR A MARKDOWN FILE OPENS IN THE PANE.Everything else still goes
      // to the app that owns it, because Preview draws a png better than we
      // ever will.
      if (onOpenDoc && ((!/^https?:/.test(href) && opensInPane(href)) || isLocalPreview(href))) { onOpenDoc(href); return; }
      const api = (window as any).zero;
      if (!api?.openArtifact) { window.open(resolveSrc(href), '_blank'); return; }
      const source = sourceReference(href);
      api.openArtifact({ product, src: source ?? href, ...(source ? { mode: 'source' } : {}) }).then((r: { ok: boolean; error?: string }) => {
        if (!r?.ok) onNotice(r?.error || `${href} could not be opened.`);
      }).catch(() => onNotice(`${href} could not be opened.`));
    };

    const mdComponents = {
      pre: ({ children }: { children?: ReactNode }) => <CodePre>{children}</CodePre>,
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        // A LINK TO A PICTURE DRAWS THE PICTURE. The code span below has done
        // this since 08-29 and the bare path now does it too, so the last form
        // a worker reaches for that showed her only blue text is `[the
        // shot](designs/x.png)`. Her link text becomes the alt, which is what a
        // missing file falls back to.
        if (href && !/^(https?|data):/.test(href) && /\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(href)) {
          const label = typeof children === 'string' ? children : href;
          return <ArtifactImg key={href} src={href} alt={label} roots={roots} onOpen={openHref} />;
        }
        // A SOUND OR A FILM PLAYS IN PLACE (ArtifactMedia, above).
        if (href && isMediaPath(href)) {
          return <ArtifactMedia key={href} src={href} label={children} roots={roots} onOpen={openHref} />;
        }
        return <ArtifactLink product={product} src={href} fallback={resolveSrc(href)} onOpen={() => openHref(href)}>{children}</ArtifactLink>;
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => <ArtifactImg key={src} src={src} alt={alt} roots={roots} onOpen={openHref} />,
      code: ({ children, className }: { children?: ReactNode; className?: string }) => {
        const value = String(children ?? '');
        const source = !className && sourceReference(value);
        if (source) return <ArtifactLink product={product} src={source} fallback={resolveSrc(source)} onOpen={() => openHref(source)}><code>{value}</code></ArtifactLink>;
        // Written out in full into this product's folder counts as the short
        // path it names, the same rule a full path in a sentence follows.
        const shown = value.trim();
        const path = (!className && productDir && productPath(shown, productDir)) || shown;
        if (!className && PATH_RE.test(path)) {
          if (/\.(png|jpe?g|gif|webp)$/i.test(path)) {
            return <ArtifactImg key={path} src={path} alt={shown} roots={roots} onOpen={openHref} />;
          }
          if (isMediaPath(path)) {
            return <ArtifactMedia key={path} src={path} label={<code>{shown}</code>} roots={roots} onOpen={openHref} />;
          }
          return <ArtifactLink product={product} src={path} fallback={resolveSrc(path)} onOpen={() => openHref(path)}><code>{shown}</code></ArtifactLink>;
        }
        return <code className={className}>{children}</code>;
      },
    };
    return { resolveSrc, mdComponents, openHref, roots };
  }, [product, productDir, repoDir]);

  const mdPlugins = useMemo(
    () => [remarkGfm, [remarkArtifactPaths, { dir: productDir ?? null }]] as NonNullable<Parameters<typeof ReactMarkdown>[0]['remarkPlugins']>,
    [productDir],
  );

  const md = (text: string) => (
    <ReactMarkdown remarkPlugins={mdPlugins} components={mdComponents} urlTransform={artifactUrlTransform}>{text}</ReactMarkdown>
  );

  // Every design THIS MESSAGE names, embedded live under it. The whole
  // message, not just the ask she opened with: on her own rows the ask is the
  // only field a worker cannot write, so the document is always somewhere else
  // (message-artifacts.ts carries the count).
  const inlineArtifactRef = useRef<HTMLDivElement | null>(null);
  const attachInlineArtifact = useCallback((node: HTMLDivElement | null) => {
    inlineArtifactRef.current = node;
    artifactSlot?.(node);
  }, [artifactSlot]);
  useEffect(() => {
    if (artifactSlot) inlineArtifactRef.current?.scrollIntoView({ block: 'nearest' });
  }, [openDoc, !!artifactSlot]);
  const htmlArtifacts = useMemo(
    () => embeddedDocuments(item, productDir),
    [item.result, item.note, item.body, item.answer, productDir],
  );

  const codeSamplePath = reviewLabEnabled(api.isFixtures,location.search) ? 'review-bundle.change' : 'artifact-layout-sample.change';
  const previewPaths = previewSample === 'multiple'
    ? ['designs/w-n13/the-first-row.html', codeSamplePath, 'artifact-layout-sample.md']
    : previewSample
    ? [previewSample === 'code' ? codeSamplePath : previewSample === 'notes' ? 'artifact-layout-sample.md' : 'designs/w-n13/the-first-row.html']
    // She is right that it was the same thing twice. The byline's own figures
    // button, `.change-figures` below, opens `changePathFor(item.id)`, which is
    // the very path this list was adding a second door onto. So `.change` comes
    // out of the pattern AND the figures term goes, and a run that changed code
    // now has exactly one way in.
    //
    // A DESIGN OR A NOTE STILL GETS ITS CARD. Only code is doubled up; an html
    // page and a markdown file have no second door anywhere, and her screenshot
    // has one of each sitting above the code card she was pointing at.
    : [...new Set([...htmlArtifacts, ...referencedFiles(item.result, item.note, item.body, item.answer, {dir: productDir}).filter(path => /\.(md|markdown)$/i.test(path) && !isBookkeeping(path))])];
  const showOptions = offerIsLive(item);
  // WHETHER THE STRIP IS DRAWN, which is not the same question as whether the
  // row has a live offer. Everywhere else the two are the same. Opening the box
  // brings the options with it, and clicking away from the box takes them away
  // again (App.tsx, `closeReplyOnTheWayOut`).
  //
  // `showOptions` itself must NOT be narrowed for this. It also decides whether
  // the options list is stripped out of the message text below (`cleanMessage`),
  // so a full screen row would have printed its own options twice.
  const stripShown = showOptions && (artifactView !== 'focus' || replyOpen);
  // The strip already draws the list, so the field that carried it prints
  // without it. Only that field: a result offering a pick must not silently
  // eat an "## Options" heading left behind in an older body.
  const optSource = optionsFrom(item);
  const offered = (item[optSource] ?? '').trim();
  // The sentence the options answer, drawn as the strip's heading below, and
  // the whole of it for the card that opens when the heading cannot hold it.
  const ask = useMemo(() => askLine(item), [item.result, item.note, item.body, item.title]);
  const askAll = useMemo(() => askFull(item), [item.result, item.note, item.body, item.title]);

  // WHAT A MESSAGE LOOKS LIKE ONCE THE PANE HAS TAKEN ITS SHARE. The thread
  // reads its messages out of the row's ledger, so the two things the pane
  // already draws elsewhere have to come off them here or they print twice.
  //
  // The options list is drawn on the composer, on the strip she picks from
  // (`stripOptionsSection` above says why), and only the field the live offer
  // actually came from loses it. A message that merely HOLDS the same words as
  // an older offer keeps them, because on a finished row the list is the record
  // of what was offered.
  //
  // "## Gist" is a heading old workers wrote above their first paragraph and
  // she reads straight past.
  const cleanMessage = (text: string) => {
    const off = showOptions && !!offered && text.trim() === offered
      ? stripOptionsSection(text) : text;
    return off.replace(/^##\s*Gist\s*\n+/i, '');
  };

  /* * THE LINE UNDER THE TITLE.

     THE TIME IS STILL NOT A DOOR. Her count on w-18b063a72f was ONE way to look
     back under a task's title, and the conversation below is it. The reading
     here is a reading and nothing opens from it.

     IT OPENS ON THE THREAD'S STATE (w-e731ca9376, 2026-10-01): the mark and one
     of the four words, which stood at the right of the bar until she asked for
     it here in place of "Working". Only a thread has one, so an agent's own
     session, the trouble row and the update row keep the line they had.

     IT IS WRITTEN ONCE AND IT LIVES IN THE BAND. There is no second copy under
     a big title inside the scroll any more: that header is gone. Written out
     twice it would be two turning marks with two clocks, and the one she was
     not looking at would still be ticking.
  */
  const theByline = (
    <Byline
      // A conversation's record is called "Direct" on disk; on the page it is Messages.
      item={direct ? { ...item, productName: 'Messages' } : item}
      returned={!!returnedFromSnooze}
      facts={{
        ...live, session, stalled, scheduledUntil,
        engineChoice, engine: runningEngine,
        // `stoppable` IS `belongsInProgress` (App.tsx hands over the tab's own
        // rule), so the line says which tab this row is on by asking the tab
        // rather than by inventing a second definition of under way.
        inProgress: stoppable && !direct,
      }}
      lead={summarised ? <ThreadStateMark item={item} /> : null}
    />
  );

  /* WHAT THIS RUN CHANGED, AS THE DETAIL ON THE MENU'S CODE ROW
     (w-e731ca9376, 2026-10-01). It closed the line under the title until she
     asked for viewing the code to go into the thread's menu with the terminal
     and Done. The figures are the same ones, built once, here: the two colours
     the code pane already uses and the count of files. The row is the one way
     into the change, the same change the chip in the conversation used to
     open (w-c1d09f0638).

     Most threads draw no row at all: a run that answered a question or drew a
     page changed no code, and figures is null. */
  const changeFigures = figures ? (
    <span className="change-figures" title={figuresLabel(figures)}>
      {signed(figures).map(({ sign, text }) => (
        <span key={sign} className={sign === '+' ? 'code-plus' : 'code-minus'}>{text}</span>
      ))}
      <span className="cf-files">in {fileCount(figures)}</span>
    </span>
  ) : null;

  /* THE THREAD'S MENU: the three verbs that crowded the right of the bar
     (the terminal mark, the code figures, the Done mark), as rows under one
     square three-dot button beside Summary. Every key still works where it
     did, E and ⌘J in App.tsx, and each row prints its own. ThreadMenu.tsx has
     the rest of the reasoning. A conversation with a person has no terminal
     and no code, so it is offered Mark done alone. NOTHING TO FINISH ON A
     FINISHED THREAD. */
  const canFinish = item.status !== 'done';
  const [terminalOpen, setTerminalOpen] = useState(false);
  const threadMenu = (
    <ThreadMenu
      key={`${item.product}:${item.id}`}
      change={changeFigures}
      onViewChange={() => onOpenDoc?.(changePathFor(item.id))}
      terminal={direct ? null : terminalOpen ? 'open' : 'closed'}
      onToggleTerminal={() => window.dispatchEvent(new Event('task-terminal-toggle'))}
      onFinish={canFinish ? onResolve : null}
    />
  );

  /* THE STOP, AND IT TAKES THE SEND SLOT RATHER THAN SITTING BESIDE IT
     (w-581dbc6cc4). A stop that sat on the box all the time was turned down.
     The box has a send control, the stop appears in its place while a run is
     under way, and typing anything turns it back into send, the way Codex
     works.

     WHEN IT SHOWS: `stoppable` is `belongsInProgress`, the tab's own rule, so
     anything In progress can be stopped whether or not a worker has reached it
     yet. WHERE THE ROW GOES is said by the toast the press raises rather than
     on the button, which is why the button can be two words: "Agent stopped.
     Back in your inbox. Reply to redirect it." */
  // A conversation with a person has nothing running to stop.
  const stopButton = stoppable && !direct ? (
    <button
      type="button"
      className="dock-stop"
      onClick={onStop}
      aria-label={session ? 'Stop this agent' : 'Stop this task'}
      title={session
        ? 'Stop this agent. It goes back to your inbox.'
        : 'Stop this task. It goes back to your inbox.'}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <rect x="1.5" y="1.5" width="9" height="9" fill="currentColor" />
      </svg>
      Stop
    </button>
  ) : null;

  /* * THE BAND —, and it is HER TITLE AND HER BYLINE, in that order.

     THIS IS THE WHOLE HEADER OF A TASK NOW. Nothing draws her title inside the
     scroll, so there is no state in which it can scroll away, which is the
     sentence this row was opened with.
  */
  const backButton = (<button className="back-esc" data-hint="back" onClick={onClose} aria-label="Back (esc)" title="Back (esc)">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
    </button>);

  const bandLine = (
    <div className="keep-line">
      {/* THE SAME NAME THE ROW HAS (w-b8c8958a12). An opened task used to go
          back to the user's own dictated title, which in the band is one line
          cut off mid-sentence, so the title of an opened task is now the same
          summary the row shows. The original text stays one hover away, and in
          full at the top of the thread. */}
      {/* A conversation is named for the person in it, never for what the
          first message happened to be about. */}
      <div className="keep-line-title" title={item.title}>{direct && talkFull ? talkFull : rowTitle(item)}</div>
      {theByline}
    </div>
  );

  // ANYTHING ADDED TO THIS ELEMENT RIDES BESIDE THE LITERAL, NEVER INSIDE IT.
  // `the way out of an opened task` finds this element by the literal string
  // `className="focus-pane"` to prove the chevron is a sibling of the scroll
  // rather than inside it, which is the thing that stops the way out scrolling
  // away with the words. An earlier cut of folded state into the className and
  // turned that guard off silently.
  return (
    <div className="focus-pane" data-summary={summaryShown ? 'open' : undefined}>
    {/* THERE IS NO WAY-OUT CONTROL ON AN OPENED TASK ANY MORE.

        Both faults were real and both are measured on this row. With a
        document open the word esc was drawn ON the first letter of her title at
        every window width below 1707, and at 1707 itself it cleared it by 3.9
        points, which is why it never looked lined up: its box ran to x=72.8 and
        the title's box began at x=68.8. `roomWithDoc` in
        `designs/w-b3e35c6e8b/measured.json` has the whole sweep.

       SHE IS NOT LEFT WITHOUT A WAY OUT. What went is the drawing in the corner, not the
       way out.

       `.back-esc` takes Settings' own rule rather than copying it, so the two cannot drift
       into two looks for one thing.
     */}
    {/* THE MARK ONLY, AND NO WORD.

        THIS REVERSES w-9fa482b8ea AND THAT IS DELIBERATE. The comment that used
        to stand here said the word was settled forever, because the chevron
        AND the lowercase word had been picked out of five drawings. Then it was
        seen drawn over the heading of a card with a file open and the whole set
        was rejected. The later decision wins over the earlier one. Do not
        put the word back on this control and do not quote the old comment,
        which is in `decisions.md` with the rest of the history.

        The key still works exactly as it did, and the word coming off does not
        change that; what it costs is that this control no longer names the key,
        which is the accepted price of an icon with no esc text. Settings
        and the Scheduled rule page still say it, so the key is still named in
        the app. `.focus-pane > .back-esc` in `styles.css` closes the box up
        around the mark.
     */}
    {!headerTarget && backButton}
    {/* THE BAND, ABOVE THE SCROLLING BOX AND OUTSIDE IT. That is the whole of
        the arrangement chosen: it is a sibling with real layout height, so
        it covers no words, it is there before you scroll as well as after, and
        there is no stretch of the page where nothing says which task this is.
        How it is DRAWN is entirely CSS, at the foot of styles.css. It is not a
        setting and there is nothing left to choose: the place, the size and
        the height are all settled. w-7bc66fced1. */}
    {headerTarget ? createPortal(<>{backButton}{bandLine}</>, headerTarget) : bandLine}
    {/* THE CORNER: THE SUMMARY BUTTON AND THE THREAD'S MENU, and nothing
        else (w-e731ca9376, 2026-10-01). The way into the summary stays in the
        top bar however far down the conversation she has read; the state that
        stood beside it is first on the line under the title now. */}
    {cornerHeaderTarget && createPortal(<span className="ts-top">{summaryOffered && <SummaryToggle open={summaryOpen} onToggle={toggleSummary} />}{threadMenu}</span>, cornerHeaderTarget)}
    <div className="focus-scroll" ref={scrollRef}>
    <div className="focus">
      {/* ONE LEFT EDGE FOR EVERY WORD, the list's rule applied here: the title, the meta
         line and the notes start exactly where the message below them starts, and nothing
         in this header pushes them in.
       */}
      {/* WHY THE SCREEN CHANGED, AND HOW TO UNDO IT, in one plain sentence.
          w-2c0db3395f: an Urgent row interrupts what she is reading, and
          then she is brought back. This line is the whole of her being told
          that, so it names the task she was on rather than saying "the
          previous task", and it names the key rather than describing it. */}
      
      {interruptedFrom && (
        <BackToWhatSheWasReading title={interruptedFrom} onBack={onBackToInterrupted ?? onClose} />
      )}
      {/* The band is not a second copy of this header, it IS this header, which is why the
         byline went with it: hiding `.focus-head` and drawing the title alone lost the
         working mark and the code figures. w-7bc66fced1.
       */}
      {/* THE MONO FAMILY IS FROSTED IN EVERY CHAT, WHICH IS NOW EVERY TASK. It was scoped to
         an agent's item because an agent's item was the only conversation in the app; on
         w-c61a4f5ad3 it became one screen style across all of them, so the class rides
         the pane rather than the kind of row. The four variables it carries are answered by
         both themes. Every other surface keeps what it had.
       */}
      <div
        className="focus-body markdown agent-thread"
        ref={bodyRef}
        /*
         * WHAT LEAVES THE APP WHEN SHE COPIES, rewritten on the way out so a
           picture arrives as a picture and a path on this Mac does not arrive at
           all. ../copy-out.ts has the measurement. */
        onCopy={(e) => handleCopyOut(e.nativeEvent as ClipboardEvent, bodyRef.current)}
      >
        {/* THE TERMINAL AT THE TOP IS GONE, AND WITH IT THE LAST PLACE A CHAT WAS DRAWN
           TWICE.

            What stood here was a block of the running worker's lines, three
            showing, above everything else on the task. It is not missing: the
            same lines are in the conversation below, at the moment each one
            was typed, and they arrive there while she watches. That is all
            three cases on this row met by one component: a task started in
            Agentbox, a task with a worker on it right now, and an imported
            Claude Code session all draw through Thread.tsx.
         */}

        {/* What this row answers, when it answers something the user wrote.
            The user's own text on THIS row is not here any more: it is events
            in the history above, at the time it was written. Which words these are is
            recap.ts's decision, not this component's, because picking the wrong
            ones leaves a screen that still looks perfectly plausible.

           AND WHEN THOSE WORDS ARE THE USER'S, THEY ARE NOT DRAWN HERE AT ALL. They go to the
           thread as its first message, whole (w-23db941885).
         */}
        <Recap
          recap={openingSaid ? null : recapFor(item, parent)}
          onOpen={() => parent && onOpenItem(parent)}
        />

        {/* The agent stopped without finishing: the answer sits delivered-
            on-paper with nobody on it. Say so, and make the fix one click. */}
        {stalled && (
          <button className="stalled-bar" onClick={onRedeliver}>
            <span className="stalled-bar-label">The agent stopped without finishing this. Your answer is still waiting.</span>
            <span className="stalled-bar-go">restart the agent →</span>
          </button>
        )}

        {/* A blocked item names its blocker and takes you to it. If the
            blocker is an open child ask, resolving THAT is how this moves. */}
        {item.status === 'blocked' && blockedBy && (
          <button className="blocked-by" onClick={() => onOpenItem(blockedBy)}>
            <span className="blocked-by-label">Waiting on</span>
            <span className="blocked-by-title">{blockedBy.title}</span>
            <span className="blocked-by-go">open →</span>
          </button>
        )}

        {item.answer === '(withdrawn)' && (
          <div className="your-reply your-reply-withdrawn">
            <div className="your-reply-label">You withdrew your reply (Z undoes a send)</div>
          </div>
        )}

        {/* An agent-closed row is in her inbox BECAUSE it is news, so the news
            leads and the ask it settled goes behind a toggle. The body was
            written before the answer that ended it and can be flatly untrue by
            now: on w-fe3c042d00 it still recommended merging a branch the
            result had just explained would never be merged. recap.ts owns the
            decision, and briefs/worker.md owns the title, which no rendering
            can fix. */}
        {/* THE NEWEST THING LEADS. An agent-closed row leads with its result at
            full strength; anything still in flight leads with the agent's last
            word under its own label. Either way her ask, which is the oldest
            thing here, goes behind the one line below (recap.ts owns both
            decisions). Old items open with a "## Gist" label a reader skips
            past, and the options section lives on the composer now, so both
            leave the prose on the way through. */}
        {/* AN AGENT ROW IS THE CONVERSATION, and nothing above it is a summary of one.
           Shape B on w-b30af3ba07: the item is the thread, each thing it ran on its own
           line between the messages, opening at the bottom.

            The card is still WRITTEN, because the inbox row reads the body and
            two lines is all that surface has. It is simply not what she reads
            once she is inside the row, where the real thing fits.
         */}
        {agent && (
          <AgentThread
            pid={agent.pid}
            sessionId={agent.sessionId}
            cwd={agent.cwd}
            name={agent.name}
            movedAt={agent.lastActiveAt ?? 0}
            md={md}
          />
        )}

        {/* WHAT WAS HERE WAS ONE FIELD. The newest of the result, the
            checkpoint and the ask, and nothing else: `leadField` picked it and
            the other two did not render. That is the mechanism behind three
            separate reports in one week, all of them the same shape.
            On w-941ba0e0f8 and w-c3e88e56cf a worker's checkpoint filled the
            pane and the ask underneath it was never drawn, so what she read was
            a handoff addressed to the next agent. There was no way to write a
            message that survived the next `update_work_item`, which is why the
            rules for writing one grew to four paragraphs.

            None of that is a rendering problem any more, because nothing is
            being chosen. Everything said on this row is in the thread, in the
            order it was said, and the newest answer is the last message in it,
            at the bottom where the eye lands.
         */}
        {/* NEITHER MADE ROW HAS A CONVERSATION AND NEITHER IS WAITING FOR ONE.
            `ItemThread` reads the ledger, and there is no ledger row called
            `trouble` or `update`, so it would draw "Nothing has been said here
            yet." over the one thing she opened it for. Both get the shape a
            finished row's news already gets: the message bare, no label, no
            thread head. For one it is which tasks are stopped and what each is
            waiting on (w-cf0e8821b3); for the other it is what restarting costs
            and which two versions this is between (w-86452550e5). */}
        {made
          ? <div className="outcome">{md(item.body ?? '')}</div>
          : !agent && (
            <ItemThread
              item={item}
              chat={direct}
              /*
               * WHICH CODING AGENT THIS ROW RUNS ON, because one sentence in the
                 conversation depends on it: `blocked` after one of Claude Code's
                 eight commands is an ANSWER, and on Codex the same reply is an
                 ordinary message and `blocked` means what it always meant.
                 thread-history.ts holds the reasoning. */
              engine={runningEngine}
              session={session}
              opening={openingSaid}
              /*
               * HER MESSAGE, FROM THE MOMENT SHE PRESSES SEND, rather than from
                 the moment the running agent gets round to acknowledging it
                 (w-1ef03d6f27). */
              sending={sending}
              onOpenOrigin={() => parent && onOpenItem(parent)}
              md={md}
              clean={cleanMessage}
              onOpenDoc={onOpenDoc}
            />
          )}

        {!agent && <RemoteControl key={`remote:${item.product}:${item.id}`} product={item.product} id={item.id} />}
        {!agent && <CompactionResult engine={runningEngine ?? 'claude-code'} key={`${item.product}:${item.id}`} item={item} />}

        {/* AND THEN WHETHER ANYTHING IS HAPPENING, under the last message and over the
           composer.

            The In progress LIST had said this since August, at the right end of
            a row: "working · 4m", "queued", "stopped · 2h". The task itself said
            nothing, so the screen she opens to find out what an agent is doing
            was the one screen that would not tell her. Nothing new is stored and
            nothing new is computed in the main process; every fact this reads was
            already on the snapshot the pane is drawn from.
         */}
        {/* NO ENGINE FACTS GO DOWN HERE. The agent is named under the title, on
            the byline this pane already draws, and nowhere else on this screen
            (w-6246b0c91f). Handing them to `Live` as
            well is what made one screen say "Codex" twice. */}
        {!heldByPerson && <Live item={item} facts={{ ...live, session, stalled, scheduledUntil }} />}

        {/* A MESSAGE FROM A PERSON BECOMES WORK ONLY WHEN SHE SAYS SO: one quiet
            line under the latest message, and the dotted words are the door. */}
        {direct && onHandToAgent && (
          <p className="ts-hand">
            <button type="button" onClick={() => onHandToAgent(item)}>Hand it to an agent</button> to turn it into a task.
          </p>
        )}

      </div>

      {/* NOTHING NAMES FILES DOWN HERE ANY MORE (w-38d7d32c88, 2026-09-23).
          The row of chips that stood between these two is deleted; a file
          reaches her in the message that named it, or in the frame below. */}
      {artifactSlot && <div className="inline-artifact" ref={attachInlineArtifact} />}

      {/* THE THIRD COPY, AND IT IS GONE. With the artifact open this frame used
          to stand down to one line naming the document on the right — beside a
          chip for the same document that was already lit, under a paragraph
          that already linked it. Measured on w-d161451598: one path,
          three drawings, 34px. Tidy drops that line and keeps the frame, which
          is still what draws the document when it is NOT already open. */}
      {inlineArtifacts && <div className="artifact-entry-list" aria-label="Attachments">{previewPaths.map(path =>
        <DirectReview key={path} product={product} path={path} revision={item.updatedAt} open={openDoc === path}
          onOpen={()=>onOpenArtifact?.(path, 'beside')}
          onAddContext={reviewLabEnabled(api.isFixtures,location.search) ? action=>{
            saveDraft(item,reviewContextDraft(readDraft(item),path,action));
            window.dispatchEvent(new CustomEvent('zero:reply-restored',{detail:draftKey(item)}));
            onReply();
          } : undefined}/>
      )}</div>}

      {!inlineArtifacts && htmlArtifacts.map((path) => {
        const isOpen = !!openDoc && openDoc === path;
        if (isOpen) return null;
        return (
          <ArtifactEmbed
            key={path}
            product={product}
            path={path}
            fallback={resolveSrc(path)}
            open={isOpen}
            onOpen={() => openHref(path)}
          />
        );
      })}

      {/* GETTING A TASK BACK IS A BUTTON, not a keystroke nobody mentions. The only way out
         of a schedule was E pressed inside the Scheduled tab: the menu items that offered
         it were still testing the localStorage snooze map the picker stopped writing in
         81189c3, so the condition was always false and the command had quietly disappeared
         from every menu.
       */}
      {/* NOTHING IS UNBOUND. E, S and Escape are window handlers and none of them lived in
         this row.

         WHAT IS LEFT IS THE BUTTONS WITH NO KEY AT ALL, and they are left alone on purpose.
         On a finished row none of them apply and the row is not drawn at all, which is the
         screen that was measured and the whole 51px.
       */}
      {(((scheduledUntil ?? 0) > 0 && !!onUnschedule)
        || (!!agent && !agentTakesReply && !!onReveal)
        || (!agent && item.status === 'blocked' && !session)) && (
      <div className="focus-actions">
        {(scheduledUntil ?? 0) > 0 && onUnschedule && (
          // The two cases want different words because the button does two
          // different things. A row SHE scheduled is somewhere else and comes
          // back; a row an agent parked is already right here in her inbox, so
          // "back to inbox" would name a move that does not happen. What
          // clearing an agent's park actually does is let the work start.
          <button className="focus-unschedule" onClick={onUnschedule}>
            {scheduledByAgent ? 'let it run now' : 'back to inbox'}
            <span className="dim">
              {' · '}
              {scheduledByAgent ? 'the agent paused this until' : 'scheduled for'} {whenLabel(scheduledUntil!)}
            </span>
          </button>
        )}
        {/* "E close this task" AND "S remind me later" USED TO SIT HERE. They
            were the first two of three removed, and they were the two with a
            real problem behind them: a task that could not be marked done
            blocked the user from getting on with anything else (w-617a55c276).
            Both verbs are still reachable by mouse, in Cmd+K, which is where
            the palette has offered them all along, and both keys still work
            from here. */}
        {/* THE STOP IS NOT IN THIS ROW ANY MORE. IT IS ON THE REPLY BOX
            (w-581dbc6cc4). The row was too long and complex, took up critical
            space at the bottom of the chat, and sat in an illogical place; most
            apps put the stop in the chat message box.

            That is the whole reasoning and it is not only convention. Stopping
            is something she says TO the agent, and a reply already reaches a
            running session mid-run (`session.child.steer`, main/live-replies.mjs),
            so the box she says things in is where the verb belongs. What was
            here was a 290 point sentence on a bordered button, under a rule of
            the same weight as the rules between messages, in the one strip of
            the pane her eye crosses on its way to the reply box. Measured in the
            built app: 51 points tall, 30 below the last message,
            and never scrolled away, because this row is a sibling of the scroll.

            THE PROMISE ON IT IS KEPT, in the toast rather than on the button:
            "Agent stopped. Back in your inbox. Reply to redirect it." Stopping
            a task moves it to the inbox and the words have to say so. The
            button could not both say that and be short; the toast says it at
            the moment it is true.

            The ⌘K row is untouched and still reads "Stop Agent (Moves to
            Inbox)", which is the settled wording for that surface. */}
        {/* Offered on any agent that has not stopped for her, which since
            w-9348b8d148 includes ones she can also write to: a quiet session
            takes a message AND is sometimes just the thing she wants to go sit
            in. This is honestly named: it brings the APPLICATION the session is
            running inside to the front, which is the whole of what is actually
            available. Nothing public focuses one pane inside another app. */}
        {agent && !agentTakesReply && onReveal && (
          <button className="focus-stop" onClick={onReveal}>
            take me to it
            <span className="dim">{' · '}opens the app it is running in</span>
          </button>
        )}
        {!agent && item.status === 'blocked' && !session && <button onClick={onReopen}>send back to agent</button>}
        {/* "esc back" was the third one removed. Escape still closes the pane
            and so does clicking away from it. */}
      </div>
      )}
    </div>
    </div>

    {/* The reply surface: docked, always in view while the task scrolls, and
        folded to one quiet line until she writes (the chosen design,
        2026-08-04). The agents' options live ON it, where the answer happens,
        not buried at the end of a long body.

        AND THE STOP IS ON IT TOO, SINCE w-581dbc6cc4, because most apps put
        the stop in the chat message box. It is drawn once, above, and handed to whichever state the card is in,
        so the folded box and the open composer cannot drift into two stops. */}
    <div className="focus-dock">
      <div className="focus-dock-inner">
        <div className="dock-card">
          {/* A TASK A TEAMMATE GAVE YOU: to an agent, keep it, or hand it back.
              Unless they wrote options of their own, which are the better
              answers to their question and are drawn instead. */}
          {!stripShown && <TeamRouteStrip item={item} />}
          {stripShown && (
            <div className="opt-strip">
              {/* THE HEADING IS THE QUESTION, NOT THE NAME OF THE CONTROL.

                  The ask is up in the message and the message scrolls; this
                  strip is docked and does not, so by the time she has read
                  down to the answers the sentence they answer is off the top
                  of the screen. It comes off the same field the options came
                  off, so the two can never be from different rounds
                  (ask-line.ts).

                  The old words are the fallback and nothing more: a row whose
                  offering field opens with no sentence still needs a heading
                  saying what the numbers under it are.
               */}
              {/* THE HOVER SITS ON THE WHOLE HEADING ROW, not on the text node
                  inside it. A pointer travelling down the pane crosses the
                  padding before it crosses the words, and a card that opens
                  only on the glyphs themselves blinks shut in the gaps between
                  the two lines. The chevron is inside this row and keeps its
                  own click; reading the question while reaching for it is not
                  a conflict. */}
              <div
                className={`opt-head ${ask ? 'opt-head-ask' : ''}`}
                onMouseEnter={(e) => onAskEnter(e.currentTarget)}
                onMouseLeave={() => setAskPeek(false)}
              >
                <span>{ask || 'Their options · pick or write your own'}</span>
                <button className="opt-collapse" onClick={() => setOptsOpen((o) => !o)} title={optsOpen ? 'Collapse options' : 'Expand options'}>
                  <svg viewBox="0 0 16 16" className={optsOpen ? '' : 'flipped'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                </button>
              </div>
              {/* The card, drawn FIRST so it is the strip's first child: appended
                  last it stole the last row's 4px of bottom padding and the
                  strip measured 4px short. It is out of the flow entirely
                  (`bottom: 100%`), which is the promise of this design: the
                  strip is the same height with the card open as without it. */}
              {optsOpen && peekOption && (
                <div className="opt-peek">
                  <div className="opt-peek-head">Option {peekOption.n}, in full</div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {peekOption.text.replace(/\s*\(recommended\)/i, '')}
                  </ReactMarkdown>
                </div>
              )}
              {/* ONE SLOT, SO NEVER TWO CARDS. The option card wins when both
                  could be open, which cannot happen from one pointer but can
                  from a stale state, and two of these stacked would cover the
                  message they are supposed to be read against.

                  IT OPENS WITH THE STRIP COLLAPSED TOO. The chevron folds the
                  answers away and leaves the question, so a folded strip is
                  exactly the case where this line is all she has. */}
              {!peekOption && askPeek && (
                <div className="opt-peek">
                  <div className="opt-peek-head">The question, in full</div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{askAll}</ReactMarkdown>
                </div>
              )}
              {optsOpen && options.map((o) => (
                <button
                  key={o.n}
                  ref={o.n === selectedOption ? selRef : undefined}
                  className={`opt-row ${o.n === selectedOption ? 'selected' : ''}`}
                  onClick={() => onPick(o.n)}
                  onMouseEnter={(e) => onOptionEnter(o.n, e.currentTarget)}
                  onMouseLeave={() => setPeek(null)}
                >
                  <span className="opt-key">{o.n}</span>
                  <span className="opt-text">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{ p: ({ children }) => <>{children}</> }}
                    >
                      {o.text.replace(/\s*\(recommended\)/i, '')}
                    </ReactMarkdown>
                  </span>
                  {o.n === selectedOption
                    ? <span className="opt-rec">↵ send</span>
                    : o.recommended && <span className="opt-rec">recommended</span>}
                </button>
              ))}
            </div>
          )}
          {/* NO REPLY BOX ON THE TROUBLE ROW EITHER, and for the same reason as
              the one below: there is nobody on the other end of it. A box that
              looks like it sends is the failure this codebase cares about most.
              What to do instead is in the message itself, per cause.

             THE NEW VERSION GETS A BUTTON IN THAT SLOT INSTEAD, because unlike the trouble
             row it has exactly one thing to do, and a button in the app is the expected
             way to do it. Closing the row is still E
             and still costs her nothing: the update is downloaded and Settings keeps it.
           */}
          {update ? (
            <button className="dock-pill" onClick={() => onInstallUpdate?.()}>
              <span className="dock-pill-text">{UPDATE_SAY.restart}</span>
            </button>
          ) : trouble ? null : replyBlocked ? (
            /*
             * NO REPLY BOX ON AN AGENT A REPLY CANNOT CLEAR. It is frozen on a
               box asking to approve something, and a message queues behind that
               box: sending one would look like it worked and change nothing.
               The system swallowing something the user wrote is the failure this
               codebase cares about most, so the box is simply not offered.

               THIS IS THE ONLY ONE. A quiet agent used to get this pill too,
               saying there was nothing there to answer, and that was false: it
               is sitting at its prompt and it is listening. w-9348b8d148. */
            <div className="dock-pill dock-pill-static">
              <span className="dock-pill-text">
                Answer this one in its own window. A message from here would wait behind the box it is stuck on.
              </span>
            </div>
          ) : replyOpen ? (
            /* THE STOP RIDES IN THE COMPOSER'S OWN FOOTER, beside Send, rather
               than beside the box: that row is where this card already keeps
               the things you press. It is handed in whole so there is one stop
               button in the app and this card cannot grow a second. */
            <DockComposer item={item} runningMode={runningMode} runningEngine={runningEngine} codexModels={codexModels} codexModelDefault={codexModelDefault} onSend={onReplySend} onClose={onReplyClose} onNotice={onNotice} openModel={openModel} stop={stopButton} talkTo={direct ? talkName : null} />
          ) : (
            /*
             * THE FOLDED BOX SHOWS WHAT IS IN IT. A pill saying "Reply…" over
               a thread she is part way through a sentence on says the same
               thing as a pill over a thread she has never touched, and the
               sentence it is covering is the difference. The draft survives
               either way and always did; what could not be told was that it
               had. See ../folded-reply.ts. */
            /* NOTHING RIDES ON THE FOLDED BOX. The stop belongs in the slot
               that appears when she clicks in, not on a box she has not
               touched, and Done is up in the corner row. The one word it
               carries is the model, at its right end (w-e731ca9376): it says
               what picks up her next message, which is a fact about the box. */
            <button className={`dock-pill${folded.draft ? ' dock-pill-kept' : ''}`} onClick={onReply}>
              <span className="dock-pill-text">{folded.text}</span>
              {folded.files && <span className="dock-pill-files">{folded.files}</span>}
              {modelWord && (
                <span
                  className="ts-model"
                  title="Which model this conversation runs on"
                  onClick={(e) => { e.stopPropagation(); setOpenModel(true); onReply(); }}
                >{modelWord}</span>
              )}
              <span className="dock-pill-key"><kbd>R</kbd></span>
            </button>
          )}
        </div>
      </div>
    </div>
    {/* THE SUMMARY, beside the conversation and the dock rather than inside
        either: both give up its width (`data-summary` above, summary.css), so
        the words narrow instead of running under it, and it scrolls on its own. */}
    {summaryShown && <SummaryPanel item={item} items={items ?? ownItems} team={teamCtx} onOpenItem={onOpenItem} />}
    {!direct && <TaskTerminal key={`${item.product}:${item.id}`} product={item.product} id={item.id} onOpenChange={setTerminalOpen}/>}
    </div>
  );
}

// The one block above the message. Two shapes now, one voice: hers.
function Recap({ recap, onOpen }: {
  recap: RecapValue;
  onOpen: () => void;
}) {
  if (!recap) return null;

  // SHE HAS ALREADY ANSWERED THIS ROW, and the band that used to say so is
  // gone. The verdict it also carried is the one thing lost, and that trade
  // was visible in the drawing before it was picked. Keeping it is option two:
  // this branch returning the old block again.
  if (recap.kind === 'replied') return null;

  /* * AND NEITHER DOES "You said", SINCE 2026-08-30.

     This box had two shapes and one of them printed her own last answer, or a whole
     directive body, back at her above an agent's message under the heading "You said". Now
     it is true of both: ONE shape, and it names the row this one answers rather than
     repeating the user's words. Those words are not lost, they open the thread below as its
     first message (`openingSaid`), which is where a conversation's first line goes.

     THE WORD "thread" WENT WITH IT. This box said "open thread" and carried
     "Open the full thread" as its tooltip, and those were the only places the
     pane put that word in front of her. What the click does is open the PARENT
     ROW, an ordinary row in her inbox, so the line names that row and going to
     it needs no vocabulary of its own.

     Naming the parent and stopping is the whole job: the parent's body is the
     message below, restated, and printing it twice is what made this pane
     unreadable.
  */
  const answering = recap.kind === 'said' ? recap.on : recap.title;
  return (
    <div className="origin origin-oneline" onClick={onOpen} title={`Open ${answering}`}>
      <div className="origin-label">
        In response to · {ago(recap.at)} ago<span className="origin-open">open →</span>
      </div>
      <div className="origin-title">{answering}</div>
    </div>
  );
}

/**
 * THE SLASH MENU. ONE LIST, ONE ROW SHAPE, NO HEADINGS. Typing a slash opens
 *  it across the card. Same order, same cursor, same keys, because a second menu
 *  shape in one card is a second thing to learn about a control she uses once in
 *  a blue moon. */
/*
 * ONE SHAPE, NOT TWO, SINCE 2026-08-26. This took a `footer` flag that drew it
   downward from the chip beside Send; the chip is gone (her word, see the note
   in the footer) and the only thing that opens this now is a slash at the start
   of the box, which always draws it upward off the card. */
/* `renderer/src/slash-menu.ts` says why that is the same decision rather than two.
*/
function SlashMenu({ rows, at, onPick, onHover }: {
  /* * A MODE ROW'S `null` IS THE WAY BACK, NOT A SEVENTH MODE. It is a row here because the
     footer chip's `×` was the only other way to reach it and she had the chip taken off the
     screen on 2026-08-26; modes.ts says all of that at length.
  */
  rows: SlashRow[];
  at: number;
  onPick: (row: SlashRow) => void;
  onHover: (i: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /*
   * THE LIST IS NOW LONG ENOUGH TO SCROLL, so the cursor has to be dragged into
     view or ArrowDown walks off the bottom edge and appears to do nothing. Six
     modes and eight commands is fourteen rows; the menu opens upward off a card
     that is already near the bottom of the window. */
  useEffect(() => {
    box.current?.querySelector('.slash-row.cursor')?.scrollIntoView({ block: 'nearest' });
  }, [at, rows.length]);
  return (
    <div
      className="slash-menu"
      role="listbox"
      aria-label={MENU_TITLE}
      ref={box}
    >
      {rows.map((row, i) => {
        /*
         * THE SAME TWO SPANS WHATEVER THE ROW IS. A command's sentence is
           Claude Code's own, read out of the installed binary at build time and
           printed unchanged; a mode's is ours. Neither gets a name column
           beside it. Inventing a two-word name for one of their commands is how
           our vocabulary drifted from theirs the last time (modes.ts,
           2026-08-23), and the mode names that used to sit there mostly
           repeated the command word next to them. */
        const { typed, says } = rowSays(row);
        return (
          <button
            key={rowKey(row)}
            className={i === at ? 'slash-row cursor' : 'slash-row'}
            role="option"
            aria-selected={i === at}
            /*
             * mousedown, not click: a click would blur the box first and the
               menu would be gone before the press landed. */
            onMouseDown={(e) => { e.preventDefault(); onPick(row); }}
            onMouseEnter={() => onHover(i)}
          >
            <span className="slash-cmd">{typed}</span>
            <span className="slash-hint">{says}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * THE MODE, AS A WORD IN THE REPLY SENTENCE.
 *
 *  Codex rows needed to show their mode. The old mode chip was taken off
 *  the footer on 2026-08-26 and is not coming back: what replaced it is this
 *  sentence, where the priority, the repeat rule and the model are already
 *  words she can click. So the mode joins them rather than growing a second
 *  control beside them, and it does so on BOTH engines, because a clause that
 *  appeared only on Codex rows would read as a Codex feature rather than as
 *  what this row is set to.
 *
 *  IT IS `.compose-word`, the app's own dropdown: a bare word with a dotted
 *  underline, no box and no icon. The menu is `.prio-menu`, the same list the
 *  priority and the engine already open. Nothing new is drawn.
 */
function ModePicker({ value, options, label, onChange }: {
  value: string;
  options: Array<{ value: string; label: string }>;
  label: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  useKeepInWindow(wrap, open);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const now = options.find((o) => o.value === value);
  return (
    <span className="compose-word-wrap" ref={wrap}>
      {open && (
        <span className="prio-menu model-menu" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`prio-menu-row ${o.value === value ? 'on' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span className="prio-menu-label">{o.label}</span>
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className={`compose-word set ${open ? 'open' : ''}`}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* TITLE CASE, with "Mode" after it capitalised too: "In Auto Mode."
            Settled on w-86dd93ab0d. */}
        {(now?.label ?? value).replace(/(^|\s)\S/g, (c) => c.toUpperCase())}
      </button>
    </span>
  );
}

function DockComposer({ item, runningMode, runningEngine, codexModels = [], codexModelDefault = null, onSend, onClose, onNotice, stop, openModel = false, talkTo = null }: {
  item: WorkItem;
  /** On a conversation with a person, their first name: the box replies to
   *  them, and nothing about an agent, a priority or a model is offered. */
  talkTo?: string | null;
  runningMode?: PermissionMode;
  /**
   * WHICH CODING AGENT THIS ROW'S NEXT SEND WILL REACH, for the slash menu and
   *  nothing else. Everything in that menu is Claude Code's -- the eight
   *  commands by name, the six permission modes by value -- so on a row that
   *  runs through Codex the menu has nothing it can honestly offer. slash-menu.ts
   *  carries the argument and the measurement.
   *
   *  Read the same way the byline reads it: the row's own answer if it has one,
   *  else the workspace setting, both resolved in main by `engineFor` and handed
   *  down on the snapshot. Never re-derived here, because a second copy of
   *  "which engine is this row on" is a copy that can disagree with the one the
   *  supervisor actually spawns. */
  runningEngine?: string | null;
  /**
   * The Codex models this Mac has and the one it defaults to, for the model
   *  drawer. Empty on a Mac with no Codex on it, which is what `ModelPicker`
   *  already expects; they are read once in App.tsx and handed down so this box
   *  and the new-task card cannot show two different lists. */
  codexModels?: ModelChoice[];
  codexModelDefault?: string | null;
  onSend: (text: string, priority?: number, repeat?: RepeatRuleValue | null, sent?: SentDraft, mode?: AnswerMode | null, pick?: { model: string | null; effort: string | null }) => void;
  onClose: () => void;
  /**
   * HOW A MODE CHANGE IS ANNOUNCED NOW THAT NOTHING SITS IN THE FOOTER.So the
   * chip is gone and this is the indication. */
  onNotice: (text: string) => void;
  /** THE STOP BUTTON, BUILT BY FOCUS AND PASSED IN WHOLE (w-581dbc6cc4). Null
   *  on anything that is not under way. It takes the send slot while the box is
   *  empty and gives it back the moment she types, so typing anything makes
   *  the slot send again, the way Codex works. */
  stop?: ReactNode;
  /** She opened the box by pressing the model word on the folded box, so the
   *  model drawer opens with it (w-e731ca9376). */
  openModel?: boolean;
}) {
  // A CONVERSATION WITH A PERSON ASKS FOR A REPLY TO THEM, not for the
  // agent's next step. Set on the box itself so the one literal sentence the
  // reply box is pinned to stays the agent's.
  useEffect(() => {
    const box = document.querySelector<HTMLTextAreaElement>('.dock-input');
    if (box) box.placeholder = talkTo ? `Reply to ${talkTo}` : 'What should the agent do next?';
  });
  // The draft outlives the dock. Tab away, click elsewhere, even restart the
  // app: coming back to this item finds your words where you left them. A
  // draft holds the composer open: esc folds only an empty one.
  //
  // A draft used to die by being sent, full stop. Every send in the app is held
  // open for three seconds though, and a Z inside that window cancelled a write
  // that had never happened while the draft was already deleted (2026-08-06).
  // So sending only TAKES the draft; undo hands it back (renderer/src/drafts.ts).
  //
  // The IMAGES outlive the dock on exactly the same terms, since 2026-08-16.
  // They used to live only in the state below, which dies with the box, so a
  // screenshot she pasted and then closed the box on was gone. Reopening now
  // finds the same thumbnails with the same remove buttons: the draft she comes
  // back to is the draft she left.
  const [text, setText] = useState(() => readDraft(item));
  const [attachments, setAttachments] = useState<PendingAttachment[]>(() => readDraftAttachments(item));
  useEffect(() => {
    const restored = (event: Event) => {
      if ((event as CustomEvent).detail !== draftKey(item)) return;
      setText(readDraft(item));
      setAttachments(readDraftAttachments(item));
    };
    window.addEventListener('zero:reply-restored', restored);
    return () => window.removeEventListener('zero:reply-restored', restored);
  }, [item.product, item.id]);
  // One image was too big to keep (drafts.ts holds the budget and the reason).
  // It is still in the box and it still sends; the box just does not pretend it
  // will be here after a close, because finding that out later is the bug.
  const [tooBig, setTooBig] = useState(0);
  // The priority tag. Untouched means "leave the agent's value alone": only a
  // deliberate pick (click or Cmd+1..4) writes priority with the answer. The
  // tag DISPLAYS the item's real level, though: an urgent thread's reply box
  // showing "medium" read as the reply demoting it.
  const [prio, setPrio] = useState<PriorityId | null>(null);
  const itemPrio: PriorityId = priorityIdOf(item.priority);
  const shown = prio ?? itemPrio;
  /* * WHICH MODEL PICKS UP WHAT SHE SENDS NEXT.

     IT DISPLAYS THE ROW'S OWN VALUE and writes only on a deliberate pick, which
     is the priority tag's rule two fields up and for the same reason: a box that
     showed a default while the row was on Opus would read as the reply demoting
     it. `null` here is "she has not touched it", which is not the same as the
     `null` the picker passes up meaning "clear it", so the two are kept apart by
     `touched`.

     AND THE PICK IS ABOUT THE NEXT RUN, which is what ./Model.tsx says on
     itself: every turn is a fresh spawn, so there is no session to switch
     mid-flight. On a row with a worker already on it this sets what picks up the
     turn after, and the drawer's own sentence is the only promise made.
  */
  const [touched, setTouched] = useState(false);
  const [model, setModel] = useState<string | null>(item.model ?? null);
  const [effort, setEffort] = useState<string | null>(item.effort ?? null);
  useEffect(() => {
    setTouched(false);
    setModel(item.model ?? null);
    setEffort(item.effort ?? null);
  }, [item.product, item.id, item.model, item.effort]);
  const ref = useRef<HTMLTextAreaElement>(null);
  // WHAT THIS ONE MESSAGE MAY DO.So it is not a project setting and not a
  // workspace one; it rides on the send.
  //
  // Null means the message carries no opinion and the session keeps whatever
  // the project already runs in, which is what nearly every message does.
  // Seeded from the item, because a mode she set on a reply lives on the row
  // until the run it belongs to launches and spends it. Reopening the box
  // before that has happened must show her the choice she already made rather
  // than the fleet default, or the footer is lying about the next send.
  // EITHER ENGINE'S VOCABULARY, in one piece of state, because a row has one
  // engine and so only one of the two lists is ever reachable from it. The
  // readers below resolve the word against `claudeCode` rather than guessing.
  const [mode, setMode] = useState<PermissionMode | CodexModeId | null>(item.answerMode ?? null);
  // Which row the arrow keys are on. Reset every time the query changes,
  // because a selection left on row three of a four row menu is a selection
  // pointing at nothing once the list shortens to two.
  const [slashAt, setSlashAt] = useState(0);
  const [nativeNames, setNativeNames] = useState<string[]>([]);
  const discoveringCommands = !item.agent && (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE && slashQuery(text) !== null;
  useEffect(() => {
    setNativeNames([]);
    if (!discoveringCommands) return;
    return watchCommandCatalog(() => api.commandCatalog(item), setNativeNames);
  }, [item.product, item.id, runningEngine, discoveringCommands]);
  useEffect(() => { saveDraft(item, text); }, [text, item.product, item.id]);
  useEffect(() => {
    const { dropped } = saveDraftAttachments(item, attachments);
    setTooBig(dropped.length);
  }, [attachments, item.product, item.id]);
  useEffect(() => { ref.current?.focus(); }, []);
  // AND IT FOLLOWS THE ROW, not just the first row this box was opened on.
  // `useState(item.answerMode)` is an initial value and React keeps the old one
  // when a mounted composer is handed a different item, so navigating between
  // rows with the dock open carried one row's one-off onto the next and would
  // have SENT it. Caught in review, 2026-08-23.
  //
  // ON THE ROW'S IDENTITY ONLY, never on the value. Watching `answerMode` as
  // well would let a snapshot arriving mid-sentence overwrite a mode she just
  // picked, which is the thing this footer may least do. A value that changes
  // under an open box is a value she is about to be told about anyway, on the
  // next open.
  useEffect(() => { setMode(item.answerMode ?? null); }, [item.id, item.product]);
  // THE BOX GROWS AS SHE WRITES, AND STOPS AT 40% OF THE PANE (her yes,
  // 2026-08-17; the rule and the numbers are in dock-height.ts).
  //
  // typing, a draft restored from a previous session, an option picked off the
  // strip, and undo handing a sent draft back. A handler on the textarea
  // catches the first and leaves a restored eight-line draft sitting in a
  // three-line box, which is the bug she opened this row about.
  //
  // It carries no dependency list for the same reason: everything that changes
  // the right answer is not in one variable. The card's other furniture spends
  // the same 40% (an attachment row, a repeat note, the options strip), so a
  // ceiling computed only when `text` moves walks past her share the moment she
  // pastes a screenshot. Running after every render costs two style writes and
  // one layout read on an element the size of a paragraph, and is right by
  // construction rather than by remembering to add the next dep.
  //
  // The pane is watched rather than the window, because it changes height for
  // reasons the window does not: the side panel opening, a zoom change, the
  // window being dragged between two displays with different scaling.
  useEffect(() => {
    applyDockHeight(ref.current);
  });
  useEffect(() => {
    const pane = ref.current?.closest('.focus-pane');
    if (!pane || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => applyDockHeight(ref.current));
    ro.observe(pane);
    return () => ro.disconnect();
  }, []);
  /*
   * WHAT IS SENT MAY BE HANDED IN, because one caller cannot read it off the
     box. Picking `/usage` off the menu now sends that command in the same beat,
     and `setText` is a state write React has not applied by the time the send
     runs, so reading `text` there would send the box as it stood BEFORE the
     pick. Every other caller passes nothing and sends the box, exactly as it
     always did. (w-5d1ad29efa, 2026-08-29.) */
  const send = async (spoken?: string) => {
    if (!(spoken ?? text).trim() && !attachments.length) return;
    const originalDraft = text;
    const consumeCommand = () => {
      if (ref.current?.value !== originalDraft) return;
      setText(''); clearDraft(item);
    };
    const operation = runningEngine === 'codex' && !item.agent ? codexCommand(spoken ?? text) : null;
    if (operation) {
      if (!operation.valid || attachments.length) { onNotice(COMPACTION_COPY.invalid); return; }
      const result = await runCompaction({ product: item.product, id: item.id });
      if (result.state === 'running' || result.state === 'done') { consumeCommand(); }
      return;
    }
    const parsed = !item.agent ? providerCommand(spoken ?? text, runningEngine ?? 'claude-code') : null;
    if (parsed) {
      if (attachments.length) { onNotice('Send this command without attachments. Your draft has been kept.'); return; }
      const result = await runCommand({product: item.product, id: item.id}, spoken ?? text);
      if (result.state === 'copy') {
        try { await navigator.clipboard.writeText(result.text ?? ''); onNotice('Response copied.'); }
        catch { onNotice('Could not copy the response. Your draft has been kept.'); return; }
      }
      if (['done', 'copy'].includes(result.state)) { consumeCommand(); }
      if (result.state !== 'forward') return;
    }
    // THE BOX HANDS BACK WHAT IT HAD, NOT WHAT IT SENT. The message that goes
    // out is the typed words with the attachment markdown appended; the draft an
    // undo restores is those words and the images themselves, so Z reopens the box she
    // was looking at rather than one with `![pasted-3347.png](attachments/…)`
    // typed into it. drafts.ts holds the why.
    const words = (spoken ?? text).trim();
    const sent: SentDraft = { words, attachments };
    const attachedMd = await persistAttachments(item.product, attachments);
    clearDraft(item);
    // AND WHAT THIS ONE MESSAGE MAY DO, if she changed it. `null` is not the
    // same as leaving it out: it CLEARS a mode set on an earlier reply and puts
    // the thread back on the project's own setting, so it is sent whenever the
    // chip has been touched at all.
    // The model rides along ONLY when she opened the drawer, on the priority
    // tag's rule: an untouched box must not write what it is merely displaying.
    onSend([words, attachedMd].filter(Boolean).join('\n\n'), prio ? priorityValueOf(prio) : undefined, repeat, sent, mode,
      touched ? { model, effort } : undefined);
  };
  const hasDraft = !!text.trim() || attachments.length > 0;
  // THE SLASH MENU, AND THE MODE THAT IS ALWAYS ON THE SCREEN.
  //
  // It does. Claude Code has no backslash TRIGGER: `/` opens its commands and
  // Shift+Tab cycles the permission modes. Both work here now and the backslash
  // is gone. (An earlier draft said Claude Code "has no backslash key at all",
  // which is a claim about a keyboard rather than about the app.)
  //
  // It was a real hole rather than a bad photograph. The only
  // way in was a character you had to already know to type, so a person who did
  // not know it had no way of finding out the feature existed.
  //
  // That is what the chip below is. It is not a picker taking up the footer; it
  // is the same sentence Claude Code prints, and it happens to be clickable.
  /*
   * WHETHER THIS ROW REACHES CLAUDE CODE, ASKED ONCE AND READ BY EVERY CONTROL
     ON THIS BOX. It is main's answer off the snapshot (`byItem[id] ?? workspace`,
     App.tsx), which is the word the supervisor will really spawn on; the
     renderer never works it out for itself.

     ONE EXPRESSION, BECAUSE TWO IS THE BUG. The menu has asked this question
     since the second engine came back and the two keys below never did, so on a
     Codex row "/" drew nothing while Shift+Tab and `/plan ` typed straight
     through both still set a permission mode. Everything below reads this const,
     so the next control cannot be taught separately from the rest. */
  const claudeCode = (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE;
  // No mode control at all on an external agent row: the value would be thrown
  // away by the send. See the note where the chip used to stand, in the footer.
  //
  // AND NONE ON A CODEX ROW, for the same reason one layer along: the value is
  // thrown away by the RUN. `spawnPlan` turns `answerMode` into a
  // `--permission-mode` flag inside a Claude Code argv that the Codex path never
  // reads, `codexThreadParamsFor` has no field it could go in, and `spawnWorker`
  // cleared the mode on `spawn` whatever the engine (it restamps it instead
  // since w-34b7b861b6, which does not change this paragraph's point). Measured in
  // tests/the-slash-menu-offers-nothing-codex-cannot-run.test.mjs: the two Codex
  // thread params are `toEqual` with the mode set and without it, where Claude
  // Code's argv differs by the whole flag. It also LOOKED like it stuck --
  // `answerMode` rides into the ledger and the box re-seeds from it -- so
  // nothing on her screen ever said the mode had been spent.
  //
  // AND NOTHING IS DRAWN IN ITS PLACE. A Codex worker runs one posture,
  // `untrusted` + `workspace-write`, and the other two approval policies were
  // measured on 2026-09-04 and neither gates anything (main/codex-session.mjs).
  // Which of the six would stand for which Codex setting is a judgement about
  // what an agent may do on her Mac, and it is hers to make with an approval
  // path built for it. Until then the honest control is no control.
  // BOTH ENGINES NOW (2026-09-23). This was `&& claudeCode`, because a mode
  // picked on a Codex row was accepted by the box and then dropped by the run:
  // `codexThreadParamsFor` had no field to put it in. It has one, so the
  // control is honest on either engine. An external agent row still has none,
  // because that value is thrown away by the send.
  const canSetMode = !item.agent;
  // Commands are provider-specific; canSetMode still gates every permission path.
  const query = !item.agent ? slashQuery(text) : null;
  /*
   * ONE LIST, AND IT IS THE ONE THE MENU DRAWS. This was `modeMatches(query)`
     with a second expression below deciding what to render, which was fine
     while the chip could open the menu on no query at all. The chip is gone,
     the menu only ever opens on a slash, and the rows now include the way back
     (`null`, "use the project's setting") when there is a mode to come back
     from. Two expressions would mean the list that decides whether the menu is
     OPEN could differ from the list it SHOWS, and then Enter picks row three of
     a list nobody is looking at. */
  /*
   * AND THE SECOND HALF OF THE LIST IS CLAUDE CODE'S OWN COMMANDS (2026-08-27,
     w-23a7b3f568), OFFERED ONLY ON A ROW THAT REACHES CLAUDE CODE. So are the
     six modes: `/context` is not a word Codex knows, and `--permission-mode` is
     not a flag it takes. On a Codex row this list is empty and `slashOpen`
     below is therefore false, which is the whole of the behaviour. */
  const menuRows = slashRows(query, mode !== null, claudeCode, nativeNames);
  // OPENED BY THE SLASH AND BY NOTHING ELSE, since 2026-08-26. It used to open
  // from the footer chip too; the chip is gone (see the note where it stood)
  // and with it went `chipOpen` and the click-away that shut it.
  const slashOpen = menuRows.length > 0;
  // WHAT THIS SEND WILL ACTUALLY RUN AS: the mode picked for this one message
  // if there is one, otherwise whatever the fleet is set to. Never a guess and
  // never a blank: a footer that says nothing when nothing is picked is the
  // footer she could not find.
  const running: PermissionMode | CodexModeId = mode
    ?? (claudeCode ? (runningMode ?? 'auto') : CODEX_DEFAULT_MODE);
  /** What the chip and the toast say, in whichever engine's words this row is. */
  const statusOf = (m: PermissionMode | CodexModeId) => (claudeCode
    ? MODE_STATUS[m as PermissionMode]
    : CODEX_MODE_STATUS[m as CodexModeId]);
  // The cursor goes back to the top whenever the list changes underneath it,
  // because row three of four is row three of nothing once the query narrows
  // the list to two.
  useEffect(() => { setSlashAt(0); }, [query, nativeNames]);
  /*
   * THE TOAST, AND WHY IT SAYS WHAT IT SAYS.
   *
   *  It opens on the word Permissions because that is the word a person goes
   *  looking for and could not find, and because with the chip gone this
   *  sentence is the only place in the reply flow that word now appears.
   *
   *  Then Claude Code's own status line, unchanged: "auto mode on". Somebody
   *  who has seen their terminal recognises it without being taught. The glyphs
   *  are NOT carried over; they are a grouping in their status bar and they
   *  mean nothing on their own in a line of prose.
   *
   * A toast saying only the mode would read as a change to the whole project.
   *
   * AND THE LAST CLAUSE CHANGED ON 2026-09-24. It said "for this message", and
   * that was true: the supervisor spent the grant on the first spawn. It does
   * not any more (w-34b7b861b6). A mode now holds for every run on this thread
   * until she moves it, so the toast says that, or it is telling her the
   * opposite of what the app will do. "for this thread" and not "for this
   * project": the grant is still one row's, and the project's own setting is
   * what the clear row goes back to.
   * */
  const announce = (m: PermissionMode | CodexModeId | null) => {
    /*
     * AND CLEARING SAYS SOMETHING TOO, in the same shape. It has to name what
       the message will run as NOW rather than only that something was undone,
       because "back to the project's setting" is not an answer to the question
       somebody is actually asking, which is what this send will do. `running`
       resolves to the project's own value the moment `mode` is null. */
    if (m === null) {
      onNotice(`Permissions · back to this project's setting, ${statusOf(claudeCode ? (runningMode ?? 'auto') : CODEX_DEFAULT_MODE)}`);
      return;
    }
    onNotice(`Permissions · ${statusOf(m)} for this thread`);
  };
  const pickMode = (m: PermissionMode | CodexModeId | null) => {
    setMode(m);
    announce(m);
    // Only the query is cleared, never the user's words. The menu can only be open on
    // a box holding nothing but the slash and a word, or on no text at all.
    if (slashQuery(text) !== null) setText('');
    ref.current?.focus();
  };
  /*
   * PICKING A ROW, AND THE TWO HALVES DO DIFFERENT THINGS ON PURPOSE.
   *
   *  A MODE sets a value and empties the box, because it is a thing she is
   *  saying about the message she is about to write.
   *
   *  A COMMAND RUNS. Enter on it sends it, the same beat, with no second key.
   *
   * IT USED TO ONLY FILL THE BOX, and that was wrong, and it is the row this
   * change is on. Measured in the running app before the change
   * (`scripts/probe-a-slash-command-on-enter.mjs`): Enter left `/usage ` in the
   * box, closed the menu, and sent nothing. A second Enter typed a newline.
   * Only Cmd+Enter ever sent, so the one key anybody presses on a highlighted
   * menu row did nothing she could see.
   *
   *  The old reasoning was that half of the eight take an argument she still has
   *  to type, and that is true and it is what TAB is for now. Tab completes the
   *  command into the box with its trailing space and waits; Enter runs it. That
   *  is Claude Code's own division of the same two keys, so there is nothing new
   *  to learn, and typing `/model opus` by hand still works because the space
   *  closes the menu and Cmd+Enter still sends.
   *
   *  A command bare is never destructive and usually still answers: measured
   *  against 2.1.251 on 2026-08-29, `/model` prints the current model and its
   *  usage line, `/effort` and `/goal` print theirs, `/mcp` prints the server
   *  count, and `/usage` and `/context` print the tables she is asking for.
   *
   * Nothing is announced by a run, because the answer itself arrives in the
   * thread on this row within a few seconds, which is the confirmation. */
  const pickRow = (row: SlashRow, how: 'run' | 'fill' = 'run') => {
    if (row.kind === 'mode' || row.kind === 'codexMode') { pickMode(row.mode); return; }
    if (how === 'fill') { setText(commandDraft(row.cmd)); ref.current?.focus(); return; }
    /*
     * A COMMAND THAT REQUIRES AN ARGUMENT RUNS TOO, AND IS TOLD WHAT IT WANTS.
       This line used to fill the box for those instead, which on `/fork` means
       replacing the text she just typed with the same text and a space: the
       menu closes, nothing else moves, and the key looks broken: typing /fork
       and pressing return did nothing. It is the same fault w-5d1ad29efa fixed for the commands that take nothing,
       one case further along. Both of the commands this reaches refuse
       harmlessly and say what they want, which is something she can act on.
       Tab still completes into the box for somebody who knows the word. */
    if (providerCommand(`/${row.cmd.name}`, runningEngine ?? 'claude-code')?.route !== 'claude') { void send(`/${row.cmd.name}`); return; }
    /*
     * The box is emptied AND the command is handed to `send` by hand. Both,
       because they answer two different questions: the box has to stop showing
       a command that has already gone, and the send cannot wait a render for
       state React has not applied yet. */
    setText('');
    send(`/${row.cmd.name}`);
  };
  // TYPING IT STRAIGHT THROUGH. Somebody who already knows the word does not
  // want a menu; they want to type /auto and a space and carry on writing the
  // message. Without this the space closes the menu and the characters /auto
  // are sent to the agent as text.
  const changeText = (next: string) => {
    const q = canSetMode && next.startsWith('/') && next.endsWith(' ') ? next.slice(1, -1).toLowerCase() : null;
    const hit = claudeCode ? exactMode(q) : exactCodexMode(q);
    if (hit) { pickMode(hit); return; }
    /*
     * AND `/clear ` TYPED STRAIGHT THROUGH, on the same terms as the six modes:
       somebody who knows the word should not have to look at a menu. It is only
       a command while there is a mode to undo; with nothing set it is ordinary
       text, because a word that silently does nothing is worse than a word the
       app does not know. */
    if (mode !== null && exactClear(q)) { pickMode(null); return; }
    setText(next);
  };
  // Clicking away folds the composer, on EXACTLY the rule Escape already
  // follows: a draft holds it open. The modals already did this; the dock is
  // the one composer that is not a modal, so it never had a way out except a
  // key.
  //
  // The emptiness check is the whole safety of it. Folding a box she has typed
  // into is the failure this repo keeps coming back to, where the system
  // swallows something the user wrote and they cannot tell that from the work
  // not happening. The draft survives either way (saveDraft runs on every
  // keystroke), but a box that vanishes mid-sentence still reads as loss.
  useEffect(() => {
    if (hasDraft) return;
    const away = (e: MouseEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.dock-card');
      if (!card) onClose();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [hasDraft, onClose]);
  /*
   * THE CLICK-AWAY THAT SHUT THE MODE MENU IS GONE WITH THE CHIP THAT OPENED
     IT (2026-08-26). The menu is now only ever open because a slash is the
     first character in the box, so what closes it is deleting that character,
     picking a row, or Escape. There is no longer a state where the menu is up
     and the box holds nothing to explain why. */
  // Whether this thread is already one run of a repeating task, which decides
  // whether a schedule set here CHANGES one or makes one.
  const onRule = !!ruleIdOf(item);
  const [repeat, setRepeat] = useState<RepeatRuleValue | null>(null);
  const parsed = parseRepeat(text);
  const lastParsed = useRef<RepeatRuleValue | null>(null);
  useEffect(() => {
    const rule = parsed && 'rule' in parsed ? parsed.rule : null;
    if (rule && !sameRule(rule, lastParsed.current)) setRepeat(rule);
    if (!rule && lastParsed.current && sameRule(repeat, lastParsed.current)) setRepeat(null);
    lastParsed.current = rule;
  }, [parsed && 'rule' in parsed ? parsed.rule.at : null]);
  return (
    <>
      {/* THE MENU RIDES ON THE CARD, NOT ON THE BOX, and it opens upward for
          the same reason the priority drawer does: the reply box is at the
          bottom of the window and there is nothing under it. */}
      {slashOpen && (
        <SlashMenu rows={menuRows} at={slashAt} onPick={pickRow} onHover={setSlashAt} />
      )}
      <textarea
        className="dock-input"
        ref={ref}
        value={text}
        onChange={(e) => changeText(e.target.value)}
        /* * ONE CLEAR SENTENCE. The old placeholder was unclear about what it even meant,
           and a reply box needs one simple sentence.

           It also says the one true thing the old line was reaching for, that what is
           typed here becomes the agent's next instruction, without having to explain it.
           `tests/the-reply-box-asks-one-question.test.mjs` holds the sentence count.
        */
        placeholder="What should the agent do next?"
        onKeyDown={(e) => {
          // THE MENU TAKES THE KEYS FIRST WHILE IT IS OPEN, and gives every
          // one of them back the moment it closes. Escape here clears the
          // SLASH rather than folding the box, because folding a box on the
          // first character somebody typed reads as the app refusing them.
          // CLAUDE CODE'S OWN KEY, DOING CLAUDE CODE'S OWN THING. Their docs:
          // "press Shift+Tab to cycle permission modes". It is checked before
          // the menu because it works whether the menu is open or shut, and
          // because a bare Tab inside the menu is a pick, which is a different
          // key.
          if (e.key === 'Tab' && e.shiftKey && canSetMode) {
            e.preventDefault();
            const next = claudeCode ? nextMode(running as PermissionMode) : nextCodexMode(running as CodexModeId);
            setMode(next);
            // AND IT SAYS SO OUT LOUD NOW. Cycling used to be readable off the
            // chip in the footer, which is where somebody's eye already was.
            // With the chip gone this key would otherwise change what an agent
            // is allowed to do on somebody's Mac and show nothing at all.
            announce(next);
            return;
          }
          if (slashOpen) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSlashAt((i) => (i + 1) % menuRows.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSlashAt((i) => (i - 1 + menuRows.length) % menuRows.length); return; }
            /*
             * ENTER RUNS THE ROW AND TAB COMPLETES IT, which is the whole of
               w-5d1ad29efa. They used to be the same key doing the same thing,
               and that thing was "fill the box", so Enter on `/usage` showed her
               nothing. On a MODE row both still set the mode: a mode is not a
               message and there is nothing to run. */
            if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
              e.preventDefault();
              pickRow(menuRows[slashAt] ?? menuRows[0], e.key === 'Tab' ? 'fill' : 'run');
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault(); e.stopPropagation();
              setText('');
              return;
            }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (hasDraft) ref.current?.blur();
            else onClose();
          }
        }}
        onPaste={async (e) => {
          const pasted = await fromPaste(e);
          if (pasted.length) { e.preventDefault(); setAttachments((a) => [...a, ...pasted]); }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const dropped = await collectFiles(e.dataTransfer.files);
          if (dropped.length) setAttachments((a) => [...a, ...dropped]);
        }}
      />
      <AttachRow attachments={attachments} onRemove={(i) => setAttachments((x) => x.filter((_, j) => j !== i))} />
      {/* The notes, which cost a line only when there is something true to say,
          and which are NOT in the sentence: a sentence that grows a clause when
          something goes wrong is a sentence that moves under her. Same rule and
          same class as the new-task card. */}
      {repeat && (
        <div className="compose-note">
          {onRule ? 'This changes the repeating task.' : 'This makes it repeating.'}
        </div>
      )}
      {parsed && 'unreadable' in parsed && (
        <div className="compose-note">Not understood, so this happens once.</div>
      )}
      {/* The one case a pasted image does not survive a close. It is still in
          the box above and it still sends; saying so here is the difference
          between a limit and a loss. WORD FOR WORD the new task card's line
          (Compose.tsx, w-f3076922cc), with its own noun: the same event in two
          boxes she uses side by side must not be described two ways. */}
      {tooBig > 0 && (
        <div className="compose-note">
          {tooBig === 1
            ? 'One pasted image is too big to save. Closing the box loses it.'
            : `${tooBig} pasted images are too big to save. Closing the box loses them.`}
        </div>
      )}
      {/* ONE text run, ONE size, ONE baseline, and the app's own send button:
          the new-task card's footer, on the reply box, because they are the same
          act. See the note at the top of this file for the measurements. */}
      <div className="compose-sentence">
        {/* NO PRIORITY AND NO REPEAT ON A MESSAGE TO AN AGENT. Both are
            work-item fields with nowhere to be written, and "Urgent priority.
            Runs once." under a message going into somebody's terminal is a
            sentence about a thing that is not happening. What is left is the
            send button, which is the whole act. */}
        <span className="compose-clauses">
          {item.agent ? <span className="dim">Goes straight into {item.agent.name}.</span> : talkTo ? <span className="dim">{`Only you${talkTo.includes(' and ') ? ', ' : ' and '}${talkTo} see this.`}</span> : <>
          <PriorityPicker
            variant="word"
            value={shown}
            set={!!prio}
            onChange={setPrio}
            // NO KEYS IN HERE, BECAUSE THERE ARE NONE. The twin of the same
            // line in Compose.tsx; the reasoning is written out there (and
            // the chord went on, 2026-08-20).
            title="Priority"
          />
          {' priority. '}
          {/* The same control as the card's clock, opened on its repeats page,
              because "make this daily" is something she says to a thread as
              often as she sets it up front. Said on one RUN of a repeating task
              it moves that task's rule rather than making a second one, and the
              note above says which of the two is about to happen.

              "RUNS ONCE" IS GONE FROM THE REPLY BOX (w-86dd93ab0d, 2026-09-24):
              on an ordinary thread it said nothing she needed. The clause only
              shows once the thread actually repeats, so a daily task still says
              so and can still be changed here. */}
          {repeat && (
            <>
              <WhenPicker
                value={{ runAt: 0, repeat }}
                onChange={(v) => setRepeat(v.repeat)}
                only="repeat"
                empty="Runs once"
              />
              {'. '}
            </>
          )}
          {/* AND WHICH MODEL PICKS IT UP. The new task card's own drawer, the
              same component and the same words, because "On Opus." should mean
              one thing wherever she reads it. It goes LAST in the sentence, so
              the two clauses she has had here for weeks keep the positions she
              knows them by. The effort strip comes with the drawer; it is the
              same one the card draws, and it stays off the line
              (w-f4d7bb2a73, where A inside the model menu works well).

              AND IT WEARS THE CARD'S PREPOSITION. "On Opus 5." is the whole
              clause there, so it is the whole clause here too, or one word
              means two things in two boxes she uses side by side. Measured in
              the built renderer before this line went in: the footer read
              "Medium priority. Runs once. Opus 5." */}
          {/* WHAT IT MAY DO, in whichever engine's words this row speaks. It
              goes BEFORE the model clause, not after it: "On Opus 5." is the
              clause that ends this sentence on the new task card too, and two
              boxes she uses side by side should end the same way. Reads
              "Urgent priority. Runs once. In auto mode. On Codex's own."

              Hidden on an external agent row for the same reason every other
              mode control is: the value would be thrown away by the send. */}
          {canSetMode && (
            <>
              {'In '}
              <ModePicker
                label="What this message may do"
                value={running}
                options={claudeCode
                  ? MODE_ORDER.map((m) => ({ value: m, label: MODE_WORDS[m] }))
                  : CODEX_MODE_ORDER.map((m: string) => ({ value: m, label: CODEX_MODES[m].label }))}
                onChange={(v) => pickMode(v as PermissionMode | CodexModeId)}
              />
              {' Mode. '}
            </>
          )}
          {'On '}
          <ModelPicker
            value={model}
            onChange={(id) => { setTouched(true); setModel(id); }}
            engine={runningEngine}
            codexModels={codexModels}
            codexDefault={codexModelDefault}
            effort={effort}
            onEffortChange={(id) => { setTouched(true); setEffort(id); }}
            // TRUE WHETHER OR NOT A RUN IS UP. On an idle row the reply starts
            // a run on this model; on a running one the pick lands on the row
            // and the next run takes it, because a spawned harness cannot
            // change model mid-flight.
            title="Which model this conversation runs on"
            // Open already when she got here by pressing the model word on
            // the folded box, which is what that word promised.
            openAtStart={openModel}
          />
          {'.'}
          </>}
        </span>
        {/* WHAT WAS PHOTOGRAPHED WAS A REAL COLLISION, NOT A PREFERENCE. The
            footer is one flex row and the chip was the widest thing in it at
            184x24; on a narrow reply card the clauses ahead of it ("High
            priority. Runs once.") wrap to four lines and the chip, which does
            not wrap, is laid across them. The screenshot has the word Runs
            printed underneath the word Permissions.

            SO THE STATUS LINE IS GONE AND THE THREE WAYS IN ARE NOW TWO. `/`
            still opens the menu and Shift+Tab still cycles, both Claude Code's
            own; only the thing that was permanently on the screen has left. The
            change is announced by `announce` above instead, as a toast.

           This is the settled choice between the two. Do not put a chip back on this
           footer. The deleted markup is in decisions.md.
         */}
        {/* IT IS CALLED WITH NOTHING, not handed the click, and that pair of
            brackets is load bearing. `send` grew an optional first argument for
            the slash menu above, and React hands a bare handler its MouseEvent,
            so `onClick={send}` sent the CLICK as the words: send trims them
            first, a MouseEvent cannot be trimmed, and the button threw with
            nothing sent. The typecheck is what found it. `vite build` does not
            typecheck and was perfectly happy, so this shipped a working Enter
            and a dead Send. Caught before it left the branch, w-c77bec1d0c. */}
        {/* ONE SLOT, AND WHAT IS IN IT DEPENDS ON WHETHER SHE HAS TYPED
            (w-581dbc6cc4). A stop that sat on the box all the time was turned
            down in favour of the way Codex works: the box has one send slot,
            the stop appears in it, and typing anything makes it send.

            So while a run is up and the box is empty, this button stops the
            agent. The first character she types turns it into Send, and it is
            Send for as long as there are words in the box. Nothing is added to
            the screen and nothing is added to the folded box: the control she
            already had is doing the other job in the moment the other job is
            the only one available.

            THE SWAP IS THE WHOLE POINT, so the two states share this slot
            rather than sitting side by side. A stop next to a live Send is two
            things to choose between; a stop INSTEAD of a dead Send is one
            thing that is always the thing she can do. */}
        {stop && !hasDraft ? stop : (
        <button
          className="dock-send"
          onClick={() => send()}
          disabled={!hasDraft}
          title="Send · ⌘↵"
        >Send <kbd>⌘↵</kbd></button>
        )}
      </div>
    </>
  );
}
