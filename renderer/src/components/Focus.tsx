import { RemoteControl } from './RemoteControl';
import { SEND } from '../this-keyboard';
import { onPhone } from '../phone-screen';
import { pollEvery } from '../phone-polls';
import {DirectReview} from './DirectReview';
import {MessageFiles} from './MessageFiles';
import {reviewLabEnabled, reviewContextDraft} from '../review-lab';
import { sourceReference } from '../source-reference.mjs';
import { remarkTicketReferences, resolveTicket, ticketReference, TICKET_HREF } from '../ticket-references';
import { TicketItems, TicketLink, TicketNavigation } from './TicketReference';
import { Mention, MentionIcon } from './Mention';
import { folderTitle, mentionKind, mentionLabel, mentionName, type MentionKind } from '../mentions';
import { TaskTerminal } from './TaskTerminal';
import { whereALinkGoes, type LinkClick } from '../link-click';
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

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as BoxKeyEvent, type ReactNode } from 'react';
import { TeamContext, firstName } from '../team/people';
import {
  allModels, joinNames, moreCount, recentModels, type Harness, type ModelPick,
} from '../threads/composer-rules';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AnswerMode, CodexModeId, PermissionMode, RunningSession, WorkItem } from '../types';
import type { ReplyPick } from '../reply-pick';
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
import { commandBeingWritten, enterWaitsForWords, holdingHint, rowKey, rowSays, slashRows, type SlashRow } from '../slash-menu';
import { commandDraft } from '../../../shared/claude-commands.mjs';
import { CompactionResult, runCompaction, runCommand } from './CompactionResult';
import { codexCommand, COMPACTION_COPY } from '../../../shared/codex-commands.mjs';
import { DEFAULT_ENGINE } from '../../../shared/engines.mjs';
import { dayLabel, itemOptions, offerIsLive, optionsFrom, parseOptions, parseRepeat, stripOptionsSection, type ParsedOption } from '../format';
import { ruleIdOf } from '../../../shared/repeats.mjs';
import { shownPriority } from '../../../shared/rank.mjs';
import { WhenPicker } from './When';
import { ReplyModel } from './ReplyModel';
import type { ModelChoice } from '../models';
import { sameRule, type RepeatShape as RepeatRuleValue } from '../../../shared/repeats.mjs';
import { collectFiles, fromPaste, persistAttachments, type PendingAttachment } from '../attachments';
import { onPictureLinks, pictureLinksVersion, pictureUrl, sentPictureLink } from '../picture';
import { Listening, MicButton, useWebDictation } from './WebDictation';
import { firstFrameSrc, playerShelf } from '../player-shelf';
import { handleCopyOut, blockCopyText } from '../copy-out';
import { diagramSource } from '../diagram-fence';
import { DiagramBlock } from './DiagramBlock';
import { referencedFiles, isImagePath } from '../referenced-files';
import { pictureRoots } from '../message-folders';
import { changePathFor } from '../code-artifact';
import { fileCount, figuresFrom, figuresLabel, signed, type ChangeFigures } from '../change-figures';
import { embeddedDocuments, isBookkeeping } from '../message-artifacts';
import { PictureView, picturesFor, type Picture } from './PictureView';
import { watchScrollGutter } from '../scroll-gutter';
import { CODE_PATH, artifactUrlTransform, isMediaPath, productPath, remarkArtifactPaths } from '../remark-artifact-paths';
import { api } from '../api';
import { draftKey, readDraft, saveDraft, clearDraft, readDraftAttachments, saveDraftAttachments, readDraftPick, saveDraftPick, type SentDraft } from '../drafts';
import { effortSaid, pickOnTheRow, pickToSend, replyOpensOn } from '../reply-pick';
import { withQuote } from '../team/chat-quote';
import { THREAD_WIDTH, THREAD_WIDTH_KEY, clampThreadWidth, threadToOpen } from '../team/chat-threads';
import { whatWaits } from '../../../shared/team-rules.mjs';
import { FormatBar } from '../team/FormatBar';
import { forgetVoiceDraft, markVoiceSent, sendTurnedBack, type Recorded, type VoiceControl } from '../team/useVoiceRecorder';
import { VoiceNote } from '../team/VoiceNote';
import { voiceNoteName, voiceNoteOf } from '../team/voice-note';
import { voiceDraftsFor } from '../team/voice-drafts';
import { editLast } from '../team/chat-events';
import { RichReply, type RichBox } from '../team/RichReply';
import { OptionsOffer } from './OptionsOffer';
import { foldedReply } from '../folded-reply';
import { applyDockHeight } from '../dock-height';
import { resumeTo } from '../thread-bottom';
import { optionIsClipped, optionPeek } from '../option-peek';
import { shipOfferFor, shipOfferLive, standingFrom, UNREAD, type Standing } from '../ship-offer';
import { MOVED_PX, THE_OPTIONS_MOVED, clickLandsOnTheRowYouSaw } from '../pick-settles';
import { askHeading, askFull, askIsClipped } from '../ask-line';
import { replyIsSwallowed, replyReaches } from '../../../shared/agents.mjs';
import { recapFor } from '../recap';
import type { LedgerLine } from '../thread-history';
import type { LiveFacts } from '../live-line';
import { whyWords } from '../where-why';
import { offersRunNow } from '../run-now';
import { AttachRow } from './AttachRow';
import { BackToWhatSheWasReading } from './UrgentBar';
import { AgentThread } from './AgentThread';
import { Live } from './Live';
import { SidebarIcon } from './SidebarIcon';
import { Byline, ConversationAside } from './Byline';
import { ItemThread } from './ItemThread';
import type { PendingSaid } from '../item-thread';
import { isTroubleRow } from '../trouble-row';
import { rowTitle } from '../list-rules';
import { useKeepInWindow } from '../keep-in-window';
import { isUpdateRow } from '../update-row';
import { TeamRouteStrip, teamHeld } from '../team/TeamFocus';
import {
  PriorityPicker, priorityIdOf, priorityValueOf, type PriorityId,
} from './Priority';
import { SummaryPanel, SummaryRail, ThreadCrumb, ThreadStateMark, useSummaryOpen, useSummaryShortcut, type RepeatHandle } from '../threads/Summary';
import { summaryFits, summaryPlace } from '../room';
import { ThreadMenu, type PlaceAct, type ThreadPlace } from '../threads/ThreadMenu';
import { ThreadsMade, type MadeRow } from './ThreadsMade';
import { ChatAgentsContext, useChatMentions } from '../team/ChatAgents';
import { useThreadMentions } from './ThreadMentions';
import { AGENT_SCHEME } from '../team/agent-mentions';
import { defaultModelFor, engineModelLabel } from '../models';
import { defaultEffortFor, effortChoicesFor, effortShown } from '../effort';
import { ENGINES } from '../../../shared/engines.mjs';
import { lookAgainAfter } from '../picture-looks-again';
import { focusAtEnd } from '../focus-at-end';
import type { Spot } from '../one-thing-at-a-time';
import { ChoicesFold, ChoicesShow, QueueFile, QueueNav, readsInPlace } from './OneThingAtATime';
import { foldKey, foldedKeys, toggleFold } from '../one-thing-at-a-time';

// A relative product path is an artifact, however the worker wrote it:
// images render inline, other files become links, and .html demos embed
// below as live frames. Mechanism, not prompt hope.
const PATH_RE = CODE_PATH;

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
//
// AND WHEN EVERY ROOT MISSES, IT ASKS MAIN BEFORE IT GIVES UP (2026-10-04).
// `find` is the same finder a click goes through (main/artifact-path.mjs),
// which also hunts the project for the name. A picture a click could open and
// the window drew as "missing image" was the screenshot on w-7fe215448b.
export function ArtifactImg({ src, alt, roots, onOpen, find }: {
  src?: string; alt?: string; roots: string[]; onOpen?: (src: string, from?: HTMLElement) => void;
  find?: (src: string) => Promise<string | null>;
}) {
  const [attempt, setAttempt] = useState(0);
  // undefined: not asked yet; a path: main found it; null: nobody did.
  const [found, setFound] = useState<string | null | undefined>(undefined);
  // A full path the scheme refused or that is not on disk. Said in words, not
  // as the browser's broken-picture mark, and looked for again on the same
  // schedule as a relative one: a cloud run's picture can land after its
  // message names it.
  const [broken, setBroken] = useState(false);
  const [tries, setTries] = useState(0);
  useSyncExternalStore(onPictureLinks, pictureLinksVersion, pictureLinksVersion);
  useEffect(() => {
    if (!broken) return;
    const wait = lookAgainAfter(tries);
    if (wait === null) return;
    const timer = setTimeout(() => { setTries(tries + 1); setBroken(false); }, wait);
    return () => clearTimeout(timer);
  }, [broken, tries]);
  const again = (url: string) => (tries ? `${url}?look=${tries}` : url);
  const relative = !!src && !/^(data|https?|file):/.test(src) && !src.startsWith('/');
  const exhausted = relative && attempt >= roots.length;
  useEffect(() => {
    if (!exhausted || found !== undefined || !find) return;
    let live = true;
    find(src!.replace(/^\.\//, '')).then((p) => { if (live) setFound(p || null); }).catch(() => { if (live) setFound(null); });
    return () => { live = false; };
  }, [exhausted, found, src]);
  // AND A MISSING ONE LOOKS AGAIN (../picture-looks-again.ts): a teammate's
  // picture can land after its message, and asking once left it missing until
  // the thread was reopened.
  const [looks, setLooks] = useState(0);
  const lookNow = () => {
    find?.(src!.replace(/^\.\//, '')).then((p) => { if (p) setFound(p); }).catch(() => {});
  };
  useEffect(() => {
    if (found !== null || !find || !src) return;
    const wait = lookAgainAfter(looks);
    if (wait === null) return;
    const timer = setTimeout(() => { lookNow(); setLooks(looks + 1); }, wait);
    return () => clearTimeout(timer);
  }, [found, looks, src]);
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
        data-picture={path}
        title={path}
        onClick={(e) => onOpen(path, e.currentTarget)}
      >{picture}</button>
    )
    : picture);
  // A picture sent from the web app holds its place until its link comes,
  // rather than trying addresses that cannot answer and saying it is missing.
  const sent = sentPictureLink(src);
  if (sent === null) return <span className="inline-image arriving" aria-hidden="true" />;
  if (sent) return door(src, <img src={sent} alt={alt ?? ''} className="inline-image" />);
  if (/^https?:/.test(src)) return door(src, <img src={src} alt={alt ?? ''} className="inline-image" />);
  // A worker that wrote the whole path, either bare or as a file:// url, said
  // exactly which picture it meant, so there is nothing to guess: it goes
  // straight to the app's picture scheme (../picture.ts). `crossOrigin` IS WHAT
  // LETS A COPY CARRY THE PICTURE. Without it the picture taints a canvas and
  // ../copy-out.ts has nothing to inline, so a message pasted into an email
  // arrives with a dead url where it should be.
  if (/^file:\/\//.test(src) || src.startsWith('/')) {
    const file = src.startsWith('/') ? src : decodeURIComponent(src.slice(7));
    if (broken) return <button type="button" className="missing-artifact" title="Look for it again" onClick={() => { setTries(tries + 1); setBroken(false); }}>missing image: {file}</button>;
    return door(file, <img src={again(pictureUrl(file))} alt={alt ?? ''} className="inline-image" crossOrigin="anonymous" onError={() => setBroken(true)} />);
  }
  const rel = src.replace(/^\.\//, '');
  const candidates = roots.map((r) => pictureUrl(`${r}/${rel}`));
  if (attempt >= candidates.length) {
    const asked = find ? found : null;
    if (asked) return door(asked, <img src={pictureUrl(asked)} alt={alt ?? ''} className="inline-image" crossOrigin="anonymous" onError={() => setFound(null)} />);
    // Still asking: a picture's box, rather than a "missing" that turns into a picture.
    if (asked === undefined) return <span className="inline-image arriving" aria-hidden="true" />;
    if (find) return <button type="button" className="missing-artifact" title="Look for it again" onClick={lookNow}>missing image: {rel}</button>;
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
//
// ITS NAME IS A MENTION LIKE ANY OTHER FILE'S (w-a3a7d1a1ec, 2026-10-12). The
// first round of mentions only took this name's orange away, so four films a
// worker named by their full path read as plain black lines nobody had
// detected. It carries the film icon and the file's name now; the path waits
// in the hover title.
//
// THE PLAYER ITSELF IS KEPT ON A SHELF, NOT DRAWN (w-22c362edd1). A film she was
// watching started again from nothing every time she replied or a worker wrote a
// note, because each of those draws the message again. ../player-shelf.ts says
// why, and this hands the same player back to the message drawn in its place.
const players = playerShelf<HTMLMediaElement>({
  make: (url) => {
    const film = /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(decodeURIComponent(url));
    const player = document.createElement(film ? 'video' : 'audio');
    player.controls = true;
    player.preload = 'metadata';
    // Kept in the page on an iPhone, which otherwise opens it full screen.
    if (film) (player as HTMLVideoElement).playsInline = true;
    player.src = film ? firstFrameSrc(url) : url;
    return player;
  },
  drop: (player) => { player.pause(); player.removeAttribute('src'); player.load(); player.remove(); },
});

/** The first of these addresses that answers, as bytes. */
async function firstFound(urls: string[]): Promise<Blob | null> {
  for (const url of urls) {
    try { const r = await fetch(url); if (r.ok) return await r.blob(); } catch { /* try the next */ }
  }
  return null;
}

export function ArtifactMedia({ src, label, roots, onOpen }: { src: string; label?: string; roots: string[]; onOpen?: (src: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const rel = src.replace(/^\.\//, '');
  const candidates = src.startsWith('/') ? [pictureUrl(src)] : roots.map((r) => pictureUrl(`${r}/${rel}`));
  const looked = candidates.join('\n');
  const spot = useRef<HTMLSpanElement | null>(null);
  // Taken in the commit that drew this message, so the one that went out in the
  // same commit hands its player straight over.
  useLayoutEffect(() => {
    const host = spot.current;
    const got = host && players.take(looked.split('\n'), attempt);
    if (!host || !got) return;
    const { player } = got;
    let broken = false;
    const next = () => { broken = true; setAttempt((was) => Math.max(was, candidates.indexOf(got.url)) + 1); };
    player.addEventListener('error', next);
    if (player.parentNode !== host) host.appendChild(player);
    return () => {
      player.removeEventListener('error', next);
      players.give(player, { broken });
    };
  }, [looked, attempt]);
  const name = (
    <button type="button" className="inline-media-name mention mention-media" data-copy-file={rel} title={rel} onClick={() => onOpen?.(rel)}>
      <MentionIcon kind="media" /><span className="mention-name">{mentionLabel(rel, label) ?? label}</span>
    </button>
  );
  // Not in any root: it stays a name she can press, and the press says it is missing.
  if (attempt >= candidates.length) return <span className="inline-media-missing">{name}</span>;
  return (
    <span className="inline-media">
      {name}
      <span className="inline-media-player" ref={spot} />
    </span>
  );
}

// A FOLDER A WORKER NAMES ON ITS OWN LINE SHOWS WHAT IS IN IT (2026-10-04).
//
// Her words: the previews she should be able to open from the chat, "and maybe
// even show a little preview component", had stopped showing up. A worker that
// drew several versions names their folder under the message, and that line was
// grey text. Now it is the folder's name, which opens it in Finder, over its
// newest pictures, each of which opens the way a picture in a message does.
//
// `quiet` is a message that already draws its own pictures. Those are the ones
// it is pointing at, and the folder beside them also holds every older round,
// so it stays one line rather than drawing the same pictures twice.
const FOLDER_SHOWS = 6;
// What each folder showed last, so a thread opened again draws it at once.
const folderSeen = new Map<string, { pictures: string[]; total: number }>();
//
// ITS NAME SAYS IT IS A FOLDER (w-a3a7d1a1ec). It was an orange path,
// `designs/w-7a670f07bb/`, that said nothing about being a folder until she
// clicked it. Now it is a folder icon and the name the folder goes by, which
// for a thread's own designs is "Designs for this thread" (mentions.ts); the
// path waits in the hover title.
export function FolderPreview({ product, folder, onOpen, quiet, thread }: {
  product: string; folder: string; onOpen: (src: string, from?: HTMLElement) => void; quiet?: boolean; thread?: string;
}) {
  const navigation = useContext(TicketNavigation);
  const key = `${product}\n${folder}`;
  const [shown, setShown] = useState<{ pictures: string[]; total: number } | null>(() => folderSeen.get(key) ?? null);
  const [asking, setAsking] = useState(!quiet && !folderSeen.has(key));
  useEffect(() => {
    const api = (window as any).zero;
    if (quiet || !api?.folderPictures) { setAsking(false); return; }
    let live = true;
    api.folderPictures({ product, src: folder })
      .then((r: { ok: boolean; pictures?: string[]; total?: number }) => {
        if (!live) return;
        const got = r?.ok && r.pictures ? { pictures: r.pictures, total: r.total ?? r.pictures.length } : null;
        if (got) folderSeen.set(key, got);
        setShown(got);
      })
      .catch(() => {})
      .finally(() => { if (live) setAsking(false); });
    return () => { live = false; };
  }, [product, folder, quiet]);
  const short = folder.replace(/\/+$/, '');
  const count = shown?.total ? `${shown.total} picture${shown.total === 1 ? '' : 's'}` : null;
  const name = (
    <button type="button" className="folder-preview-name" data-folder={short} title={`${short}/`} onClick={() => onOpen(folder)}>
      <MentionIcon kind="folder" />
      <span className="folder-preview-path">{folderTitle(folder, { thread, name: navigation?.name })}</span>
      {count && <span className="folder-preview-count">{count}</span>}
    </button>
  );
  if (!shown?.pictures.length) {
    if (!asking) return name;
    return (
      <span className="folder-preview">
        {name}
        <span className="folder-preview-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} className="folder-preview-shot arriving" />)}
        </span>
      </span>
    );
  }
  const pictures = shown.pictures.slice(0, FOLDER_SHOWS);
  const more = shown.total - pictures.length;
  return (
    <span className="folder-preview">
      {name}
      <span className="folder-preview-grid">
        {pictures.map((file) => {
          const base = file.split('/').pop() ?? file;
          return (
            <button key={file} type="button" className="folder-preview-shot" data-copy-file={file} data-picture={file} title={base} onClick={(e) => onOpen(file, e.currentTarget)}>
              <img src={pictureUrl(file)} alt={base} crossOrigin="anonymous" loading="lazy" />
              <span className="folder-preview-label">{base}</span>
            </button>
          );
        })}
      </span>
      {more > 0 && (
        <button type="button" className="folder-preview-more" onClick={() => onOpen(folder)}>
          {more} more in the folder
        </button>
      )}
    </span>
  );
}

// WHAT THE MESSAGE PIECES READ THAT GROWS WITH THE THREAD: the folders a film or
// a picture is looked for in, which the messages themselves name, and whether a
// message already draws its own pictures. It is handed down rather than built
// into the pieces, because building it in rebuilt the pieces on every reply and
// every note, and a rebuilt piece is a new player (w-22c362edd1).
const MessagePlace = createContext<{ roots: string[]; drawsPictures: boolean }>({ roots: [], drawsPictures: false });

// A worker's link, its href corrected to the file that actually exists (the
// main process resolves across every plausible root). Until then the naive
// guess stands in; Copy Link must hand out a URL that works.
//
// It is drawn as a quiet mention (Mention.tsx): the kind's icon and the name,
// with the full path in the hover title rather than orange in the sentence.
function ArtifactLink({ kind, product, src, fallback, onOpen, children }: {
  kind: MentionKind; product: string; src?: string; fallback?: string; onOpen: (click: LinkClick) => void; children: ReactNode;
}) {
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    setHref(fallback);
    if (!src || /^https?:/.test(src)) return;
    (window as any).zero?.openArtifact?.({ product, src: sourceReference(src) ?? src, mode: 'resolve' })
      .then((r: { ok: boolean; opened?: string }) => { if (r?.ok && r.opened) setHref(`file://${r.opened}`); })
      .catch(() => {});
  }, [product, src]);
  return <Mention kind={kind} href={href} title={src} onClick={(e) => { e.preventDefault(); onOpen(e); }}>{children}</Mention>;
}

// What a link's own words become. A path or an address the worker wrote out
// is shortened to the name it goes by; words the worker chose stay theirs.
function textOf(children: ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.every((c) => typeof c === 'string')) return children.join('');
  return null;
}
function linkLabel(href: string, children: ReactNode): ReactNode {
  const raw = textOf(children);
  if (raw === null) return children;
  return mentionLabel(href, raw) ?? children;
}

// A document a message named, shown whole under the message.
//
// It resolves through the same main-process lookup the links and the chips use,
// across every root a worker might have written against, and it draws NOTHING
// when the file is not there. The old frame guessed one root and, when the
// guess was wrong, printed a white rectangle with the path over it, which reads
// like a document that has gone blank rather than a path we could not find.
export function ArtifactEmbed({ product, path, fallback, open, onOpen }: {
  product: string; path: string; fallback?: string;
  // Is this the document already open in the pane on the right.
  open?: boolean;
  onOpen?: () => void;
}) {
  // undefined while the first answer is out; null once it said not there.
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  // A page not there yet is looked for again (../picture-looks-again.ts): a
  // cloud run's page can land after the message that names it.
  const [looks, setLooks] = useState(0);
  useEffect(() => { setLooks(0); }, [product, path]);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const api = (window as any).zero;
    if (!api?.openArtifact) { setSrc(fallback ?? null); return () => { live = false; }; }
    api.openArtifact({ product, src: path, mode: 'resolve' })
      .then((r: { ok: boolean; opened?: string }) => {
        if (!live) return;
        const found = r?.ok && r.opened ? `file://${r.opened}` : null;
        setSrc(found);
        const wait = found ? null : lookAgainAfter(looks);
        if (wait !== null) timer = setTimeout(() => { if (live) setLooks(looks + 1); }, wait);
      })
      .catch(() => { if (live) setSrc(null); });
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [product, path, looks]);
  if (src === null) return null;
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
        {src && <a href={src} target="_blank" rel="noreferrer">open ↗</a>}
      </div>
      {src
        ? <iframe src={src} tabIndex={-1} sandbox="allow-scripts" title={path} />
        : <span className="artifact-embed-arriving arriving" aria-hidden="true" />}
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

/** Which threads' choices are folded, kept on this machine. */
const CHOICES_FOLDED = 'one.choicesFoldedOn';

export function Focus({ artifactView, previewSample, onOpenArtifact, artifactSlot, inlineArtifacts, headerTarget, cornerHeaderTarget, crumbFrom, item, parent, blockedBy, filed = [], runningMode, engineChoice, runningEngine, codexModels, codexModelDefault, engines, items, session, live, stoppable: stoppableIn, productDir, repoDir, selectedOption, interruptedFrom, onBackToInterrupted, returnedFromSnooze, scheduledUntil, scheduledByAgent, replyOpen, sending, stalled, openDoc, resumeAt, onScrolled, onOpenDoc, onRedeliver, onUnschedule, onClose, onResolve, onPick, onReply, onReplySend, onReplyClose, onStop, onRunNow, onPin, place: runsIn = null, onPlace, onReopen, onSnooze, onReveal, onOpenItem, onApproveFiled, onHereFiled, onDismissFiled, onStartAllFiled, onDismissAllFiled, closeAsk, onNotice, onHandToAgent, onAddPeople, repeat = null, pageAsk = null, onAsked, onShown, aboveDock, queue = null, onePage = false, inChats = false }: {
  /** One thing at a time (w-65bcefb857): this thread's place in Needs you and the arrows that walk it. */
  queue?: { spot: Spot; onStep: (dir: 1 | -1) => void } | null;
  /** Drawn on the one-at-a-time page outside Needs you too: every thread with an agent. */
  onePage?: boolean;
  previewSample?: string;
  /** The repeating task this thread is a run of, drawn in its summary. */
  repeat?: RepeatHandle | null;
  /** A ⌘K row that acts on this thread's own page (../thread-commands.ts):
   *  fold the summary, open its people list, or open the name box. A new `at`
   *  is a new press; `onAsked` says it has been carried out. */
  pageAsk?: { what: 'summary' | 'people' | 'rename'; at: number } | null;
  onAsked?: () => void;
  /** What this page draws that ⌘K offers rows for. */
  onShown?: (shown: { key: string; change: boolean; summary: 'open' | 'closed' | null; ship: ParsedOption[] | null }) => void;
  /** Drawn right above the reply box: where a reply that moved her here went (./SentLine). */
  aboveDock?: ReactNode;
  /**
   * A MESSAGE FROM A PERSON IS NOT WORK UNTIL SHE SAYS SO. The one line under
   *  the latest message on a message thread calls this to make it a task for
   *  an agent. Absent, the line is not drawn, because a word that does nothing
   *  when pressed is worse than no word. */
  onHandToAgent?: (item: WorkItem) => void;
  /** Opens New thread with this conversation's people already in To, so adding
   *  one more starts the group's conversation and leaves this one alone. */
  onAddPeople?: (who: { to: string; also: string[] }) => void;
  artifactSlot?: (node: HTMLDivElement | null) => void;
  inlineArtifacts?: boolean;
  artifactView?: 'beside' | 'focus';
  onOpenArtifact?: (src: string, mode: 'beside' | 'focus') => void;
  headerTarget?: HTMLElement | null;
  /** THE SOCKET IN THE CORNER: the thread's menu (w-e731ca9376, 2026-10-01;
   *  the Summary button beside it moved onto the summary on w-a3482b8c2c).
   *  Only Focus knows whether this thread changed
   *  code, has a terminal or can still be finished, which is why the menu is
   *  drawn here and teleported there. */
  cornerHeaderTarget?: HTMLElement | null;
  /** WHERE THIS THREAD WAS OPENED FROM, as its tab says it ("Needs you",
   *  "Done"), for the thin bar the thread wears while its summary is open
   *  (w-922f66bb06). Absent, the bar is always the full one. */
  crumbFrom?: string;
  /** Drawn inside Chats beside its list: the bar says its name, as a group's does, with no way back to a list. */
  inChats?: boolean;
  item: WorkItem;
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
  /** The same two the card is handed: the agents this Mac offers, and every
   *  thread she has, for the models she has used lately. */
  engines?: { id: string; label: string }[];
  items?: WorkItem[];
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
  // THE THREADS THIS ONE MADE, with where each stands (w-2e8aa16f0f). Drawn in
  // the conversation, each on the turn that filed it (w-2e13752a85); absent or
  // empty draws nothing.
  filed?: Array<MadeRow & { item: WorkItem }>;
  onOpenItem: (item: WorkItem) => void;
  // SAYING GO TO ONE OF THEM FROM HERE (w-9cf2b43110), on the rows whose
  // `approve` says they are waiting on it. The same approval ⌘K makes on the
  // row itself, except that it does not take you off the thread you are
  // reading: that is the whole point of the press being here.
  onApproveFiled?: (item: WorkItem) => void;
  // AND DOING IT HERE INSTEAD (w-554834e749): the proposal goes back to this
  // thread's agent as a message, and its own thread closes.
  onHereFiled?: (item: WorkItem) => void;
  /** Drop a proposal this thread filed: it closes and never runs (w-fcb5fdc2e5). */
  onDismissFiled?: (item: WorkItem) => void;
  /** Start, or drop, every proposal in one list at once (w-fe64f35bdd). */
  onStartAllFiled?: (items: WorkItem[]) => void;
  onDismissAllFiled?: (items: WorkItem[]) => void;
  /**
   * THE QUESTION A CLOSE ASKS when tasks this thread filed are still waiting
   * (w-d2744c6daa, ../close-asks-first.ts). While it is up it stands where the
   * thread's own options stand, and the number keys answer it (App.tsx).
   * `raised` counts each close that raised it, so each one scrolls to it.
   */
  closeAsk?: { ask: string; options: ParsedOption[]; raised: number; onPick: (n: number) => void; keep?: { label: string; onKeep: () => void } } | null;
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
  onReplySend: (text: string, priority?: number, repeat?: RepeatRuleValue | null, sent?: SentDraft, mode?: AnswerMode | null, pick?: ReplyPick) => void;
  onReplyClose: () => void;
  onStop: () => void;
  // Run now, the three-dot menu's row on a waiting task.
  onRunNow?: () => void;
  // Pin thread / Unpin thread, the menu's row (w-20323283e6). Absent where a
  // thread cannot be pinned.
  onPin?: (pin: boolean) => void;
  // Where it runs, and the menu's row that moves it (ThreadMenu PLACE_ROW).
  place?: ThreadPlace | null;
  onPlace?: (keep: PlaceAct) => void;
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
  const chatAgents = useContext(ChatAgentsContext);
  const heldByPerson = teamHeld(item, teamCtx);

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
  //
  // THE ASK IS WHAT SHE SAID ON THE PARENT BEFORE THIS THREAD WAS FILED. When
  // she has replied there since, the parent's `answer` is that later reply, so
  // its lines up to this row's creation are read to find the one that asked
  // (../recap.ts, recapFor). Read only then, which is rarely.
  const [parentLines, setParentLines] = useState<{ key: string; lines: LedgerLine[] } | null>(null);
  const parentReplyAt = parent?.wrote?.answer?.ts ?? 0;
  const askKey = parent && !item.answer && parentReplyAt > item.createdAt ? `${parent.product}/${parent.id}@${item.createdAt}` : null;
  useEffect(() => {
    if (!askKey || !parent) return;
    let live = true;
    api.itemHistory({ product: parent.product, id: parent.id, before: item.createdAt })
      .then((r) => { if (live) setParentLines({ key: askKey, lines: r?.lines ?? [] }); })
      .catch(() => { if (live) setParentLines({ key: askKey, lines: [] }); });
    return () => { live = false; };
  }, [askKey]);
  const said = recapFor(item, parent, parentLines?.key === askKey ? parentLines.lines : undefined);
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
  // The door into a thread this one filed, wherever that list ends up drawn.
  const openFiled = (id: string) => { const hit = filed.find((r) => r.id === id); if (hit) onOpenItem(hit.item); };
  const referenceItems = useContext(TicketItems);
  const openTicket = (id: string) => {
    const hit = resolveTicket(referenceItems, id, item.product);
    if (hit) onOpenItem(hit);
    else onNotice(`Ticket ${id} is not available in your threads.`);
  };
  const ticketName = (id: string) => {
    const hit = resolveTicket(referenceItems, id, item.product);
    return hit ? rowTitle(hit) : null;
  };
  const approveFiled = (id: string) => { const hit = filed.find((r) => r.id === id); if (hit) onApproveFiled?.(hit.item); };
  const hereFiled = (id: string) => { const hit = filed.find((r) => r.id === id); if (hit) onHereFiled?.(hit.item); };
  const dismissFiled = (id: string) => { const hit = filed.find((r) => r.id === id); if (hit) onDismissFiled?.(hit.item); };
  const filedItems = (ids: string[]) => ids.flatMap((id) => filed.find((r) => r.id === id)?.item ?? []);
  const startAllFiled = (ids: string[]) => onStartAllFiled?.(filedItems(ids));
  const dismissAllFiled = (ids: string[]) => onDismissAllFiled?.(filedItems(ids));
  // ONE REASON THERE IS NO REPLY BOX, and it is a box. There was not one. A
  // quiet session is not stuck on anything — it is sitting at its prompt,
  // listening — and a message written to it lands and is worked on, measured
  // 2026-08-17. The only agent a message really is swallowed by is the one
  // frozen on a permission prompt, and that is now the only one without a box.
  const replyBlocked = agent ? replyIsSwallowed(agent) : false;

  // THE THREAD'S SUMMARY (approved 2026-10-01, w-e731ca9376): the panel beside
  // the conversation, folded to a rail when closed (w-a3482b8c2c).
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
  // A conversation with a person has nothing running to stop.
  const stoppable = stoppableIn && !direct;
  // Who a conversation is with, from where you sit, for its title and reply box.
  const talkPerson = direct && teamCtx
    ? teamCtx.byId.get((item.people ?? []).find((p) => p !== teamCtx.me) ?? (item.createdBy !== teamCtx.me ? item.createdBy ?? '' : item.assignee ?? '')) ?? null
    : null;
  // A group conversation: everyone in it but you, from its record.
  const talkTeam = direct ? teamCtx?.products.get(item.product)?.team : null;
  const talkOthers = talkTeam && teamCtx
    ? [...new Set([...(talkTeam.people ?? []), ...(talkTeam.sharedBy ? [talkTeam.sharedBy] : [])])].filter((p) => p !== teamCtx.me).map((id) => teamCtx.byId.get(id) ?? null).filter((p): p is NonNullable<typeof p> => !!p)
    : [];
  // Everyone this conversation is with, first names, in the order the record
  // holds them. The reply box joins them and says where a reply lands, so it is
  // handed the names rather than a sentence (../threads/composer-rules.ts).
  const talkNames = direct && teamCtx
    ? (talkOthers.length > 1 ? talkOthers.map((p) => firstName(p)) : [firstName(talkPerson)].filter(Boolean))
    : null;
  const talkName = talkNames?.length ? joinNames(talkNames) : null;
  const talkFull = talkOthers.length > 1 ? talkOthers.map((p) => p.name).join(', ') : talkPerson?.name || talkName;
  const summarised = !agent && !made && !direct;
  // The pane's own width decides whether the summary has room (../room.ts),
  // read before the first paint so a narrow window never flashes it open.
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(Infinity);
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return undefined;
    setPaneWidth(pane.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setPaneWidth(pane.clientWidth));
    ro.observe(pane);
    return () => ro.disconnect();
  }, []);
  // A CHAT'S THREAD, OPEN IN THE PANEL BESIDE IT (w-920461cbe6): which one, by
  // its message's uid, and how wide the panel was last dragged. A thread is not
  // carried from one conversation to the next, and a document open beside the
  // task closes it, because the pane is then too narrow for two columns.
  const [openThread, setOpenThread] = useState<string | null>(null);
  // WHAT WAITS ON YOU IN THIS CHAT (w-920461cbe6): the threads with replies to
  // you are marked, and when one of them is the only news it opens by itself as
  // you arrive. Only on arriving: a thread you close stays closed while you read.
  const waits = direct ? whatWaits(item, teamCtx?.me ?? null) : null;
  const freshThreads = waits ? Object.fromEntries(waits.threads.map((t) => [t.uid, t.fresh])) : undefined;
  useEffect(() => { setOpenThread(openDoc ? null : threadToOpen(waits)); }, [item.product, item.id]);
  const [threadWant, setThreadWant] = useState<number>(() => {
    const kept = Number(typeof localStorage === 'undefined' ? NaN : localStorage.getItem(THREAD_WIDTH_KEY));
    return Number.isFinite(kept) && kept > 0 ? kept : THREAD_WIDTH.start;
  });
  const threadWidth = clampThreadWidth(threadWant, Number.isFinite(paneWidth) ? paneWidth : 1400);
  const resizeThread = useCallback((width: number) => {
    const held = clampThreadWidth(width, paneRef.current?.clientWidth ?? 1400);
    setThreadWant(held);
    try { localStorage.setItem(THREAD_WIDTH_KEY, String(held)); } catch { /* storage full or off */ }
  }, []);
  // ESC CLOSES THE THREAD FIRST, and only then means "leave this conversation".
  // Taken at the window before anything else hears it, and left alone while a
  // menu, or any box outside the thread you are typing in, has the key.
  useEffect(() => {
    if (!openThread) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const at = e.target as HTMLElement | null;
      if (at?.closest?.('.chat-emoji, .chat-emoji-all, .prio-menu, .th-menu, [role="dialog"]')) return;
      if (at?.closest?.('textarea, input, [contenteditable="true"]') && !at.closest('.chat-thread-panel')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpenThread(null);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [openThread]);
  useEffect(() => { if (openDoc) setOpenThread(null); }, [openDoc]);
  const [summaryOpen, toggleSummary] = useSummaryOpen(paneWidth);
  // One thing at a time keeps its summary on top of the page, so no panel beside it.
  const page = !!queue || !!onePage;
  // The choices at the foot fold away from a small arrow and leave a sign on
  // the reply box. A fold holds this thread's current choices only.
  const [foldedChoices, setFoldedChoices] = useState(() => { try { return foldedKeys(localStorage.getItem(CHOICES_FOLDED)); } catch { return [] as string[]; } });
  const choicesFolded = foldedChoices.includes(foldKey(item));
  const foldChoices = () => setFoldedChoices((was) => {
    const now = toggleFold(was, foldKey(item));
    try { localStorage.setItem(CHOICES_FOLDED, JSON.stringify(now)); } catch { /* storage full or off */ }
    return now;
  });
  const summaryOffered = summarised && !openDoc && !page;
  // On this page the line saying where an answer went sits in the bar's empty
  // middle, where it covers nothing and takes no row from the answer.
  const sentUp = page && !!cornerHeaderTarget && !onPhone();
  const summaryShown = summaryOffered && summaryOpen;
  useSummaryShortcut(toggleSummary, summaryOffered);
  useEffect(() => {
    if (!pageAsk || !summaryOffered) return;
    if (pageAsk.what === 'summary') { toggleSummary(); onAsked?.(); }
    else if (pageAsk.what === 'people' && !summaryOpen) toggleSummary();
  }, [pageAsk?.at, summaryOffered]);
  // THE MODEL, IN THE REPLY BOX AND NOT THE HEADER. The folded box says which
  // model picks up what she sends next, at its right end, and pressing the word
  // opens the box with the model drawer already open: the same drawer and the
  // same pick the composer's sentence has, so there is one place it is chosen.
  // Not on a running agent's row (a message goes straight into it) or on a
  // message to a person (no agent reads it).
  const modelWord = !agent && !direct
    // Through `pickOnTheRow`, because a cleared model is stored as '' and this
    // read it with `??`: the pill then drew no model word at all, on every
    // thread she had ever changed the model of (../reply-pick.ts).
    ? engineModelLabel(runningEngine ?? null, pickOnTheRow(item).model, { codexModels, codexDefault: codexModelDefault })
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
  // The same when the reply box is folded shut: a note that went with an
  // undone send is the box's again, for when it opens.
  useEffect(() => {
    const back = (event: Event) => {
      if ((event as CustomEvent).detail !== draftKey(item)) return;
      void sendTurnedBack(`direct:${item.product}:${item.id}`, readDraftAttachments(item).map((a) => a.draftId));
    };
    window.addEventListener('zero:reply-restored', back);
    return () => window.removeEventListener('zero:reply-restored', back);
  }, [item.product, item.id]);
  const folded = useMemo(() => {
    // A voice note kept for this box, and not in the draft, still counts.
    const drafted = readDraftAttachments(item);
    const kept = voiceDraftsFor(`direct:${item.product}:${item.id}`)
      .filter((v) => !drafted.some((a) => a.draftId === v.id))
      .map((v) => ({ name: voiceNoteName(v.ms ?? 1000), image: false }));
    const said = foldedReply(readDraft(item), [...drafted, ...kept], agent?.name);
    return inChats && !said.draft && talkNames?.length ? { ...said, text: `Message ${joinNames(talkNames)}` } : said;
  }, [replyOpen, item.product, item.id, agent?.name, inChats, talkNames?.join()]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // THE REPLY BOX CENTRES IN THE WIDTH THE WORDS DO. The scrollbar narrows this
  // box and not the dock under it, so without this the box began half a
  // scrollbar right of the first word (../scroll-gutter.ts).
  useEffect(() => watchScrollGutter(scrollRef.current), [item.id]);

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

  // THE OPTIONS NO LONGER FOLD, AND THERE IS NOTHING HELD HERE FOR IT
  // (w-2e13752a85). The chevron and the flag behind it were right while the
  // block was docked over the composer, where folding was the only way to get
  // the screen back. It is drawn at its own turn now and scrolls away with it,
  // so the fold answered a question that had stopped being asked: "just remove
  // the dropdown as it's not needed and it'd be perfect." Full screen still
  // hides the WHOLE block until the box is open, which is `stripShown` below.

  // Arrowing onto an option that has scrolled offscreen brings it into view.
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selectedOption !== null) selRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedOption]);

  // A close raises its question at the foot of the thread, which is off
  // screen whenever the reader has scrolled up (w-23de8a26c0).
  const closeAskRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (closeAsk) closeAskRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [closeAsk?.raised]);

  // THE OPTION UNDER THE POINTER, IN FULL, IN A CARD OVER THE MESSAGE. The
  // rules live in ../option-peek: hover only, and only on an option the strip
  // is cutting.
  //
  // The measurement happens on the way in rather than on every render, because
  // whether two lines are enough depends on the width the pane happens to have
  // right now, and reading it once per hover is both current and free.
  const [peek, setPeek] = useState<number | null>(null);
  useEffect(() => { setPeek(null); }, [item.id]);
  const onOptionEnter = (n: number, el: HTMLElement) => {
    const text = el.querySelector('.opt-text');
    setPeek(optionPeek(n, !!text && optionIsClipped(text)));
  };

  // AND THE QUESTION ITSELF, ON THE SAME TERMS.
  //
  // The heading is the one line in the strip she had no way to finish reading,
  // which is the worst place in the pane for it to happen: the options
  // underneath are answers to a sentence she can only see half of.
  const [askPeek, setAskPeek] = useState(false);
  useEffect(() => { setAskPeek(false); }, [item.id]);
  const onAskEnter = (el: HTMLElement) => {
    setAskPeek(!!ask && askIsClipped(ask, askAll, el.querySelector('span')));
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
  // And where its folder stands, off the same file, because the figures alone
  // cannot say whether any of this reached a commit (../ship-offer.ts).
  const [standing, setStanding] = useState<Standing>(UNREAD);
  useEffect(() => {
    let live = true;
    setFigures(null);
    setStanding(UNREAD);
    // One of her own Claude Code sessions is not one of our runs: nothing wrote
    // a change for it, so there is nothing to ask for.
    if (agent) return () => { live = false; };
    const read = () => {
      api.codeChange({ product: item.product, src: changePathFor(item.id) })
        .then((r) => {
          if (!live) return;
          setFigures(r?.ok ? figuresFrom(r.change) : null);
          setStanding(r?.ok ? standingFrom(r.change) : UNREAD);
        })
        .catch(() => { if (live) { setFigures(null); setStanding(UNREAD); } });
    };
    read();
    if (!session) return () => { live = false; };
    const timer = setInterval(read, pollEvery(4000, onPhone()));
    return () => { live = false; clearInterval(timer); };
  }, [item.product, item.id, item.updatedAt, session?.startedAt, agent]);
  const summaryNow = summaryOffered ? (summaryShown ? 'open' : 'closed') : null;

  // Parent callbacks change on polling and when a document opens. Keep the
  // current actions without making them React component identities: replacing
  // an `a` renderer remounts all its players and resets missing-file retries.
  const [picture, setPicture] = useState<{ pictures: Picture[]; start: number } | null>(null);
  const openPicture = (href: string, from?: HTMLElement) => setPicture(picturesFor(paneRef.current, href, from));
  const markdownActions = useRef({ onOpenDoc, onNotice, openPicture });
  useLayoutEffect(() => { markdownActions.current = { onOpenDoc, onNotice, openPicture }; });

  // Everything the markdown renderer closes over, memoized as ONE stable
  // object. The component functions' identity is what React reconciles by:
  // fresh arrows every render meant every store push (workers stream one per
  // second) remounted the whole markdown tree, so images reloaded from disk
  // and links re-resolved, and the screen visibly flashed and shifted.
  //
  // AND NOT WHEN THE THREAD SAYS SOMETHING NEW (w-22c362edd1). They were rebuilt
  // whenever the result, the note, the ask or the answer changed, so every reply
  // she sent and every note a worker wrote remounted every player and picture on
  // the screen: a film she was watching started again from nothing. What those
  // words decide comes down through `MessagePlace` instead.
  const { resolveSrc, mdComponents, openHref } = useMemo(() => {
    const resolveSrc = (src?: string) => {
      if (!src) return src;
      if (/^(https?|file|data):/.test(src)) return src;
      if (!productDir) return src;
      return `file://${productDir}/${src.replace(/^\.\//, '')}`;
    };

    const find = (src: string) => {
      const zero = (window as any).zero;
      if (!zero?.openArtifact) return Promise.resolve(null);
      return zero.openArtifact({ product, src, mode: 'resolve' })
        .then((r: { ok: boolean; opened?: string }) => (r?.ok && r.opened && isImagePath(r.opened) ? r.opened : null));
    };

    // Clicks resolve in the main process, across the roots a worker might have
    // meant WITHIN THIS CARD'S OWN PRODUCT (main/artifact-path.mjs): a
    // single-root file:// href opened nothing, silently, when the worker wrote
    // it against a different root, and reaching into other products opened the
    // wrong file, which is worse.
    //
    // A miss now SAYS SO.
    const openHref = (href?: string, from?: HTMLElement, click?: LinkClick) => {
      if (!href) return;
      const { onOpenDoc, onNotice, openPicture } = markdownActions.current;
      // A picture opens large over the thread, a page or a web address opens
      // in the pane, and a ⌘-click sends any of them out (../link-click.ts).
      const goes = whereALinkGoes(href, click, { pane: !!onOpenDoc });
      if (goes === 'picture') { openPicture(href, from); return; }
      if (goes === 'pane') { onOpenDoc?.(href); return; }
      const api = (window as any).zero;
      if (!api?.openArtifact) { window.open(resolveSrc(href), '_blank'); return; }
      const source = sourceReference(href);
      api.openArtifact({ product, src: source ?? href, ...(source ? { mode: 'source' } : {}) }).then((r: { ok: boolean; error?: string }) => {
        if (!r?.ok) onNotice(r?.error || `${href} could not be opened.`);
      }).catch(() => onNotice(`${href} could not be opened.`));
    };

    const mdComponents = {
      pre: ({ children }: { children?: ReactNode }) => {
        // A MERMAID CHART IS DRAWN, with its source as the fallback (DiagramBlock).
        const code = (Array.isArray(children) ? children[0] : children) as { props?: { className?: string; children?: ReactNode } } | undefined;
        const lang = /language-([\w-]+)/.exec(code?.props?.className ?? '')?.[1];
        const source = diagramSource(lang, String(code?.props?.children ?? ''));
        if (source) return <DiagramBlock source={source} fallback={<CodePre>{children}</CodePre>} />;
        return <CodePre>{children}</CodePre>;
      },
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        const { roots, drawsPictures } = useContext(MessagePlace);
        const ticket = href?.startsWith(TICKET_HREF)
          ? ticketReference(href.slice(TICKET_HREF.length)) : ticketReference(href ?? '');
        if (ticket) return <TicketLink id={ticket}>{children}</TicketLink>;
        // AN AGENT MENTIONED IN A CONVERSATION is drawn as the mention it is;
        // its address is for the app, which draws the answer under the message
        // (w-7b9cb8636a, ../team/agent-mentions.ts).
        if (href?.startsWith(AGENT_SCHEME)) return <span className="chat-at">{children}</span>;
        // A FOLDER, written on its own line, shows its pictures (FolderPreview).
        if (href && /\/$/.test(href) && !/^(https?|data|file|mailto):/i.test(href)) {
          return <FolderPreview key={href} product={product} folder={href} onOpen={openHref} quiet={drawsPictures} thread={item.id} />;
        }
        // A LINK TO A PICTURE DRAWS THE PICTURE. The code span below has done
        // this since 08-29 and the bare path now does it too, so the last form
        // a worker reaches for that showed her only blue text is `[the
        // shot](designs/x.png)`. Her link text becomes the alt, which is what a
        // missing file falls back to.
        if (href && !/^(https?|data):/.test(href) && /\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(href)) {
          const label = typeof children === 'string' ? children : href;
          return <ArtifactImg key={href} src={href} alt={label} roots={roots} onOpen={openHref} find={find} />;
        }
        // A VOICE NOTE PLAYS AS ONE, from wherever its file is found.
        const note = href && !/^(https?|data):/.test(href) ? voiceNoteOf(href) : null;
        if (href && note) {
          const rel = href.replace(/^\.\//, '');
          const urls = href.startsWith('/') ? [pictureUrl(href)] : roots.map((r) => pictureUrl(`${r}/${rel}`));
          return <VoiceNote key={href} id={`${product}:${rel}`} ms={note.ms} load={() => firstFound(urls)} />;
        }
        // A SOUND OR A FILM PLAYS IN PLACE (ArtifactMedia, above).
        if (href && isMediaPath(href)) {
          return <ArtifactMedia key={href} src={href} label={textOf(children) ?? undefined} roots={roots} onOpen={openHref} />;
        }
        return <ArtifactLink kind={mentionKind(href ?? '')} product={product} src={href} fallback={resolveSrc(href)} onOpen={(click) => openHref(href, undefined, click)}>{href ? linkLabel(href, children) : children}</ArtifactLink>;
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        const { roots } = useContext(MessagePlace);
        return <ArtifactImg key={src} src={src} alt={alt} roots={roots} onOpen={openHref} find={find} />;
      },
      code: ({ children, className }: { children?: ReactNode; className?: string }) => {
        const { roots } = useContext(MessagePlace);
        const value = String(children ?? '');
        if (!className && ticketReference(value)) return <code>{children}</code>;
        const source = !className && sourceReference(value);
        if (source) return <ArtifactLink kind="code" product={product} src={source} fallback={resolveSrc(source)} onOpen={(click) => openHref(source, undefined, click)}>{mentionName(value)}</ArtifactLink>;
        // Written out in full into this product's folder counts as the short
        // path it names, the same rule a full path in a sentence follows.
        const shown = value.trim();
        const path = (!className && productDir && productPath(shown, productDir)) || shown;
        if (!className && PATH_RE.test(path)) {
          if (/\.(png|jpe?g|gif|webp)$/i.test(path)) {
            return <ArtifactImg key={path} src={path} alt={shown} roots={roots} onOpen={openHref} find={find} />;
          }
          if (isMediaPath(path)) {
            return <ArtifactMedia key={path} src={path} label={shown} roots={roots} onOpen={openHref} />;
          }
          return <ArtifactLink kind={mentionKind(path)} product={product} src={path} fallback={resolveSrc(path)} onOpen={(click) => openHref(path, undefined, click)}>{mentionName(path)}</ArtifactLink>;
        }
        return <code className={className}>{children}</code>;
      },
    };
    return { resolveSrc, mdComponents, openHref };
  }, [product, productDir, repoDir, item.id]);

  // Where a worker's relative path might actually live: the folders this
  // message names and the thread's own designs folder first, then the docs
  // dir, its designs/ and attachments/ folders, and the code repo. Workers
  // write paths relative to whichever one they were thinking about
  // (../message-folders.ts). The message's own words are read because the
  // folders they name are where its pictures are looked for.
  const place = useMemo(() => {
    const texts = [item.result, item.note, item.body, item.answer];
    return {
      roots: pictureRoots({ dir: productDir, repo: repoDir, id: item.id, texts }),
      // A message that draws pictures of its own keeps its folder to one line.
      drawsPictures: referencedFiles(...texts, { dir: productDir }).some(isImagePath),
    };
  }, [productDir, repoDir, item.id, item.result, item.note, item.body, item.answer]);

  const mdPlugins = useMemo(
    () => [remarkGfm, remarkTicketReferences, [remarkArtifactPaths, { dir: productDir ?? null }]] as NonNullable<Parameters<typeof ReactMarkdown>[0]['remarkPlugins']>,
    [productDir],
  );

  const md = (text: string) => (
    <MessagePlace.Provider value={place}>
      <ReactMarkdown remarkPlugins={mdPlugins} components={mdComponents} urlTransform={artifactUrlTransform}>{text}</ReactMarkdown>
    </MessagePlace.Provider>
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
  // WHETHER THE OFFER IS DRAWN AT ALL. Unchanged, and it has to stay the whole
  // question rather than either half below, because this is also the flag that
  // takes the options list out of the message text (`cleanMessage`). Narrowed,
  // a row would print its own options twice.
  //
  // AND THE APP'S OWN OFFER IS THE OTHER HALF OF IT (../ship-offer.ts): a run
  // that ended, left a change and asked nothing is asked about here instead.
  // It widens the strip and nothing else, which is what this seam is for.
  //
  // AND WHICH WORDS IT ASKS IN COME OFF THE FOLDER, not off a fixed pair:
  // work with a commit on it is shipped, work nobody committed is committed
  // first, and work that has been thrown away is not asked about at all.
  const shipAsk = shipOfferLive(item, { change: !!figures, running: !!session || !!agent }) ? shipOfferFor(standing) : null;
  const shipOffer = !!shipAsk;
  const stripShown = showOptions || shipOffer;
  // Whatever the pane is leading with, not the ask alone: on a row the user
  // wrote, the ask is the one field a worker cannot answer in (format.ts says
  // why). The agent's own offer wins wherever there is one.
  const options = showOptions ? itemOptions(item) : shipAsk ? shipAsk.options : [];
  const peekOption = peek === null ? null : options.find((o) => o.n === peek) ?? null;
  // WHAT THIS PAGE IS DRAWING, for the keys and the ⌘K rows that act on it.
  // The app's own offer goes up with it because only this page knows it is
  // there, and a number has to answer what is on the screen.
  useEffect(() => {
    onShown?.({ key: `${item.product}/${item.id}`, change: !!figures, summary: summaryNow, ship: shipAsk?.options ?? null });
  }, [item.product, item.id, !!figures, summaryNow, shipOffer]);
  // AND WHERE IT IS DRAWN (w-560647d4db). Almost always in the pane, at the foot
  // of the turn that made the offer, which is the whole of this round: pinned to
  // the reply card it followed the reader down the page.
  //
  // FULL SCREEN IS THE ONE PLACE IT CANNOT GO THERE. With a document full
  // screen the pane's whole scrolling body is hidden and only its dock is on
  // the screen (`.list-pane .focus-scroll { display:none }`,
  // workspace-navigation.css), so an offer in the pane would not be hidden
  // tastefully — it would be unreachable, and the only way to answer a question
  // would be to leave the document. So there, and only there, it keeps its old
  // home on the card, on the old terms: with the box, gone when the box folds.
  // It is not pinned under anything in that mode, because there is no
  // conversation on the screen for it to be pinned under.
  const fullScreenDoc = artifactView === 'focus';
  const offerInPane = stripShown && !fullScreenDoc;
  const offerInDock = stripShown && fullScreenDoc && replyOpen;
  // The strip already draws the list, so the field that carried it prints
  // without it. Only that field: a result offering a pick must not silently
  // eat an "## Options" heading left behind in an older body.
  const optSource = optionsFrom(item);
  const offered = (item[optSource] ?? '').trim();
  // The sentence the options answer, drawn as the strip's heading below, and
  // the whole of it for the card that opens when the heading cannot hold it.
  const askLine = useMemo(() => askHeading(item), [item.result, item.note, item.body, item.title]);
  const askAllLines = useMemo(() => askFull(item), [item.result, item.note, item.body, item.title]);
  // The app's own question is its own sentence. Read off the result it would be
  // whatever the run happened to end on, which answers nothing.
  const ask = shipAsk ? shipAsk.ask : askLine;
  const askAll = shipAsk ? shipAsk.ask : askAllLines;

  // A ROW THAT JUMPED UNDER THE POINTER DOES NOT TAKE THE NEXT CLICK
  // (../pick-settles.ts says why). Where the strip actually is, read after
  // every render, because nothing else here knows the pane has scrolled under
  // a hand that is not moving.
  const stripRef = useRef<HTMLDivElement>(null);
  const overStrip = useRef(false);
  const stripTop = useRef<number | null>(null);
  const [stripMovedAt, setStripMovedAt] = useState<number | null>(null);
  useLayoutEffect(() => {
    const top = stripRef.current?.getBoundingClientRect().top ?? null;
    const was = stripTop.current;
    stripTop.current = top;
    if (top === null || was === null) return;
    if (overStrip.current && Math.abs(top - was) >= MOVED_PX) setStripMovedAt(Date.now());
  });
  useEffect(() => { setStripMovedAt(null); overStrip.current = false; }, [item.id]);
  // The keys are not aimed at a place on the screen, so they are untouched.
  const pickByClick = (n: number) => {
    if (!clickLandsOnTheRowYouSaw(stripMovedAt, Date.now())) {
      setStripMovedAt(null);
      onNotice(THE_OPTIONS_MOVED);
      return;
    }
    onPick(n);
  };

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
        inProgress: stoppable,
      }}
      /* THE STATE IS SAID ONCE (w-a3482b8c2c). The rail says it while the
         summary is closed and the Status row while it is open, so the line
         under the title leads with it only when neither is on screen, which
         is while a document fills the thread. */
      lead={summarised && !summaryOffered ? <ThreadStateMark item={item} /> : null}
      stateShown={summarised && summaryOffered}
      /* ADD PEOPLE, beside the faces (w-71e6af492d). A conversation only: the
         control decides that for itself off the record on screen, so nothing
         here has to ask again. */
      onAddPeople={onAddPeople}
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
  // RUN NOW is offered while the task is waiting for a slot and has not been
  // pushed yet: on the waiting list or In progress with nothing running. The
  // one rule ⌘K asks too (run-now.ts); a push the supervisor cannot act on is
  // refused with a reason rather than hidden.
  const waiting = offersRunNow(item, { session, queued: live.queued, runNow: live.runNow, inProgress: live.inProgress });
  const [terminalOpen, setTerminalOpen] = useState(false);
  const threadMenu = (
    <ThreadMenu
      key={`${item.product}:${item.id}`}
      change={changeFigures}
      onViewChange={() => onOpenDoc?.(changePathFor(item.id))}
      /* A PHONE HAS NO TERMINAL AND NO ⌘J (QA batch 005, F-118), and it is the
         only way it has of putting a thread off (F-117). */
      terminal={direct || onPhone() ? null : terminalOpen ? 'open' : 'closed'}
      onToggleTerminal={() => window.dispatchEvent(new Event('task-terminal-toggle'))}
      onFinish={canFinish ? onResolve : null}
      onRunNow={waiting && onRunNow ? onRunNow : null}
      onLater={onPhone() && canFinish ? onSnooze ?? null : null}
      // A finished thread has nothing to be pinned for.
      pinned={canFinish && onPin ? !!item.pinned : null}
      onPin={onPin}
      // A finished thread runs nowhere.
      place={canFinish ? runsIn : null}
      placeFacts={{
        running: !!session && session.where !== 'cloud',
        moving: live.whyNotCloud?.why === 'moving',
        why: live.whyNotCloud ? whyWords(live.whyNotCloud).body : null,
        needs: item.needsMac ?? null,
      }}
      onPlace={onPlace}
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
  const stopButton = stoppable ? (
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

  // A THREAD WITH A SUMMARY WEARS THE THIN BAR (w-922f66bb06): one line, the
  // tab this thread was opened from and its name, all of it the way back
  // (Summary.tsx ThreadCrumb). The full band would say again what the summary
  // beside it says. It stays thin when the summary folds (w-20292d329f): the
  // crumb still names the thread, and a bar that changed shape every time the
  // summary opened or closed "looks a little weird".
  // Its name renames it (w-ab3d51dc7d), except a conversation, which is named
  // for the person in it.
  const named = direct && talkFull;
  const threadName = named ? talkFull : rowTitle(item);
  const rename = named ? undefined
    : (label: string) => api.threadEdit(item.product, item.id, { label }).then((r) => r.ok);
  // Every thread opened from a list wears it, summary or not, document open or not.
  const barContent = inChats
    ? <><h1 className="workspace-title gc-head-group cx-person"><span className="rm-one">{threadName}</span></h1>{direct && <ConversationAside item={item} onAddPeople={onAddPeople} />}</>
    : crumbFrom
    ? <><ThreadCrumb from={crumbFrom} name={threadName} onBack={onClose} onRename={rename} threadKey={`${item.product}/${item.id}`} renameAsk={pageAsk?.what === 'rename' ? pageAsk.at : 0} onAsked={onAsked} />
      {direct && <ConversationAside item={item} onAddPeople={onAddPeople} />}</>
    : <>{backButton}{bandLine}</>;

  // ANYTHING ADDED TO THIS ELEMENT RIDES BESIDE THE LITERAL, NEVER INSIDE IT.
  // `the way out of an opened task` finds this element by the literal string
  // `className="focus-pane"` to prove the chevron is a sibling of the scroll
  // rather than inside it, which is the thing that stops the way out scrolling
  // away with the words. An earlier cut of folded state into the className and
  // turned that guard off silently.
  return (
    <TicketNavigation.Provider value={{open: openTicket, name: ticketName}}>
    <div className="focus-pane" ref={paneRef} data-file-previews={page && !inChats ? 'page' : undefined} data-summary={summaryPlace({ offered: summaryOffered, shown: summaryShown, fits: summaryFits(paneWidth) })}>
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
    {headerTarget ? createPortal(barContent, headerTarget) : bandLine}
    {/* THE CORNER: THE THREAD'S MENU, and nothing else. The Summary button
        that stood beside it (w-e731ca9376) moved onto the summary itself on
        w-a3482b8c2c: the rail opens it, the icon beside its title closes it. */}
    {cornerHeaderTarget && createPortal(<span className="ts-top">{sentUp && aboveDock}{queue && <QueueNav spot={queue.spot} onStep={queue.onStep} />}{threadMenu}</span>, cornerHeaderTarget)}
    {picture && (
      <PictureView
        pictures={picture.pictures}
        start={picture.start}
        resolve={(src) => api.resolveDoc({ product, src }).then((r) => (r?.ok && r.opened ? pictureUrl(r.opened) : null))}
        onClose={() => setPicture(null)}
        onBeside={(src) => { setPicture(null); onOpenDoc?.(src); }}
        onPreview={(src) => { api.openArtifactExternally({ product, src }).then((r) => { if (!r.ok) onNotice(r.error || `${src} could not be opened.`); }); }}
      />
    )}
    <div className="focus-scroll" data-thread-id={item.id} ref={scrollRef}>
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

        {/* NOTHING IS QUOTED ABOVE THE MESSAGE. A grey box headed "In response
            to" stood here naming the row this one answers, and everything it
            said is already on the screen: the parent's words open the thread
            below, its title is in the breadcrumb, and the message restates the
            ask. The words that are the user's own still go to the thread as its
            first message (`openingSaid`, w-23db941885).
         */}

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
              // One thing at a time: the summary on top and the newest answer, the rest behind one line.
              queue={page ? { context: item.problem ?? null } : undefined}
              /*
               * WHICH CODING AGENT THIS ROW RUNS ON, because one sentence in the
                 conversation depends on it: `blocked` after one of Claude Code's
                 eight commands is an ANSWER, and on Codex the same reply is an
                 ordinary message and `blocked` means what it always meant.
                 thread-history.ts holds the reasoning. */
              engine={runningEngine}
              /* AND WHAT EACH ANSWER RAN ON, which is the other half of the
                 same question: the thread names the agent only where this Mac
                 has two, and the model off the row's own record of it
                 (byline.ts, `ranWords`). */
              engineChoice={engineChoice}
              codexModels={codexModels}
              codexModelDefault={codexModelDefault}
              session={session}
              opening={openingSaid}
              /*
               * HER MESSAGE, FROM THE MOMENT SHE PRESSES SEND, rather than from
                 the moment the running agent gets round to acknowledging it
                 (w-1ef03d6f27). */
              sending={sending}
              onSendNow={() => api.sendNow({ product: item.product, id: item.id }).catch(() => {})}
              onOpenOrigin={() => parent && onOpenItem(parent)}
              md={md}
              clean={cleanMessage}
              onOpenDoc={onOpenDoc}
              /* WHAT THIS THREAD FILED, EACH ON THE TURN THAT FILED IT
                 (w-2e13752a85). It used to be one block hung under the whole
                 conversation, drawn right here, so threads filed in the morning
                 were still standing over the composer in the evening, under an
                 answer from a run that had nothing to do with them. The
                 conversation places them now, by the moment each was created,
                 and they scroll away with the turn that came back with them. */
              filed={filed.map((r) => ({ ...r, at: r.item.createdAt ?? 0 }))}
              onOpenFiled={openFiled}
              onApproveFiled={onApproveFiled && approveFiled}
              onHereFiled={onHereFiled && hereFiled}
              onDismissFiled={onDismissFiled && dismissFiled}
              onStartAllFiled={onStartAllFiled && startAllFiled}
              onDismissAllFiled={onDismissAllFiled && dismissAllFiled}
              // REPLY, AND HAND IT TO AN AGENT, both on the message rather than
              // under the conversation (w-560647d4db). Reply takes the same
              // road the review strip already takes into the reply box: write
              // the draft, say so, open the box.
              onQuote={(said) => {
                saveDraft(item, withQuote(readDraft(item), said));
                window.dispatchEvent(new CustomEvent('zero:reply-restored', { detail: draftKey(item) }));
                onReply();
              }}
              onHandToAgent={onHandToAgent ? () => onHandToAgent(item) : undefined}
              thread={direct ? {
                open: openThread,
                host: paneRef.current,
                width: threadWidth,
                onOpen: (uid) => setOpenThread(uid),
                onClose: () => setOpenThread(null),
                onResize: resizeThread,
                // A REPLY IN A THREAD is an answer on this conversation like any
                // other, so it reaches the same inboxes and syncs the same way;
                // it only names the message it answers. An agent it mentions
                // starts first, as from the chat's own box.
                onSend: (uid, text) => (chatAgents?.start ? chatAgents.start(item, text) : Promise.resolve(text))
                  .then((answer) => api.answer({ product: item.product, id: item.id, answer, inReplyTo: uid }).then(() => answer))
                  .catch(() => { onNotice('That reply did not send. Try again.'); return false; }),
                fresh: freshThreads,
                people: talkNames ?? [],
              } : undefined}
            />
          )}

        {/* NEITHER OF THOSE TWO ROWS HAS A CONVERSATION TO PUT THE LIST IN, so
            the list keeps its old place under what they said instead. */}
        {(made || agent) && (
          <ThreadsMade
            rows={filed}
            label="Filed from this thread"
            onOpen={openFiled}
            onApprove={onApproveFiled && approveFiled}
            onHere={onHereFiled && hereFiled}
            onDismiss={onDismissFiled && dismissFiled}
            onStartAll={onStartAllFiled && startAllFiled}
            onDismissAll={onDismissAllFiled && dismissAllFiled}
          />
        )}

        {/* AND THE OPTIONS IT OFFERED, AT THE FOOT OF THAT SAME TURN
            (w-560647d4db).

            Everywhere but full screen, where the pane's body is not on the
            screen at all and the offer keeps its old home on the reply card
            (see `offerInPane` for the whole of that). */}
        {/* AND WHILE A CLOSE IS ASKING ABOUT THE TASKS STILL WAITING, ITS
            QUESTION STANDS HERE INSTEAD (w-d2744c6daa), on any row, offer or
            not, because the close is what raised it. */}
        {closeAsk && !fullScreenDoc && (
          <OptionsOffer
            ask={closeAsk.ask} askAll={closeAsk.ask} options={closeAsk.options}
            peekOption={null} askPeek={false}
            selectedOption={selectedOption} selRef={selRef}
            onPick={closeAsk.onPick} onOptionEnter={() => {}} onAskEnter={() => {}}
            setPeek={() => {}} setAskPeek={() => {}} keep={closeAsk.keep}
            stripRef={closeAskRef}
          />
        )}
        {/* One at a time draws them at the foot instead, apart from the reply box. */}
        {offerInPane && (page || closeAsk ? null : (
          <OptionsOffer
            ask={ask} askAll={askAll} options={options}
            peekOption={peekOption} askPeek={askPeek}
            selectedOption={selectedOption} selRef={selRef}
            onPick={pickByClick} onOptionEnter={onOptionEnter} onAskEnter={onAskEnter}
            setPeek={setPeek} setAskPeek={setAskPeek}
            stripRef={stripRef} onOver={(over) => { overStrip.current = over; }}
          />
        ))}

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
        {/* A chat says nothing about agents until one you called in is working. */}
        {!heldByPerson && !(inChats && !session) && <Live item={item} facts={{ ...live, session, stalled, scheduledUntil }} />}

        {/* NO LINE UNDER A CONVERSATION OFFERING TO HAND IT TO AN AGENT
            (w-2e8aa16f0f): it read as one more message, and it made the whole
            conversation one task. An agent comes in with @ in the reply box,
            in the project its mention names (../team/ChatAgents.tsx).

            AND WHERE A HAND-OFF SURVIVES, IT IS ON A MESSAGE (w-560647d4db).
            Pinned under the conversation the deleted line had no subject: it
            offered the same thing under the newest message whatever that
            message was, and the thing you want work made of is usually one
            message further up. The action is in the bar that appears when you
            point at a message (team/ChatActions.tsx), which is where drawing A
            puts it and what `onHandToAgent` is still here for. */}

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
      {/* THE FILES A MESSAGE NAMES ARE SMALL FRAMED TILES (w-9ed13d72b3), and
          a file nothing can read gets none. The big review card below is
          only the review lab's sample now. */}
      {/* One thing at a time reads a page or a note in place rather than as a
          tile, and not a second time while it is open on the side. */}
      {inlineArtifacts && !previewSample && page && previewPaths.filter(readsInPlace).map((path) => path !== openDoc && <QueueFile key={path} product={product} path={path} md={md}
        onOpen={() => onOpenArtifact?.(path, 'focus')} onSide={() => onOpenArtifact?.(path, 'beside')} />)}
      {!page && inlineArtifacts && !previewSample && <MessageFiles product={product} paths={previewPaths} revision={item.updatedAt} openDoc={openDoc} onOpen={path => onOpenArtifact?.(path, 'beside')} />}
      {inlineArtifacts && previewSample && <div className="artifact-entry-list" aria-label="Attachments">{previewPaths.map(path =>
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
      {((item.start === 'later' && !!onUnschedule)
        || ((scheduledUntil ?? 0) > 0 && !!onUnschedule)
        || (!!agent && !agentTakesReply && !!onReveal)
        || (!agent && item.status === 'blocked' && !session)) && (
      <div className="focus-actions">
        {/* ADDED TO LATER (w-afb66e6661): it has no moment to read back, so
            the line says the one thing there is to say and the press starts
            it. Same button, same place as the one below. */}
        {item.start === 'later' && onUnschedule && (
          <button className="focus-unschedule" onClick={onUnschedule}>
            start it now
            <span className="dim">{' · '}not started yet</span>
          </button>
        )}
        {item.start !== 'later' && (scheduledUntil ?? 0) > 0 && onUnschedule && (
          // The two cases want different words because the button does two
          // different things. A row SHE scheduled is somewhere else and comes
          // back; a row an agent parked is already right here in her inbox, so
          // "back to inbox" would name a move that does not happen. What
          // clearing an agent's park actually does is let the work start.
          <button className="focus-unschedule" onClick={onUnschedule}>
            {scheduledByAgent ? 'let it run now' : 'back to inbox'}
            <span className="dim">
              {' · '}
              {(item.snoozedUntil ?? 0) > Date.now() ? 'in Later until' : scheduledByAgent ? 'the agent paused this until' : 'scheduled for'} {whenLabel(scheduledUntil!)}
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
        {/* Under a full screen page they come up with the box instead, below. */}
        {/* Bare here because an agent's question is already the page's own
            headline. The heading comes back for the one offer that says
            something the page does not: there was nothing over "Ship it
            (recommended)" saying the change had never been committed (F-79,
            ../ship-offer.ts). */}
        {page && stripShown && !fullScreenDoc && !closeAsk && (
          <div className={`one-choices${choicesFolded ? ' one-choices-folded' : ''}`}>
            <OptionsOffer
              ask={ask} askAll={askAll} options={options}
              peekOption={peekOption} askPeek={askPeek}
              selectedOption={selectedOption} selRef={selRef}
              onPick={pickByClick} onOptionEnter={onOptionEnter} onAskEnter={onAskEnter}
              setPeek={setPeek} setAskPeek={setAskPeek}
              stripRef={stripRef} onOver={(over) => { overStrip.current = over; }}
              bare={!shipAsk?.headed}
            />
            <ChoicesFold onFold={foldChoices} />
          </div>
        )}
        {!sentUp && aboveDock}
        <div className="dock-card">
          {/* A TASK A TEAMMATE GAVE YOU: to an agent, keep it, or hand it back.
              Unless they wrote options of their own, which are the better
              answers to their question and are drawn instead. */}
          {!stripShown && <TeamRouteStrip item={item} />}
          {/* THE OPTIONS ARE NOT DOWN HERE ANY MORE, EXCEPT IN FULL SCREEN
              (w-560647d4db). They are drawn in the pane, at the foot of the turn
              that offered them, and the note at that call site says why.

              With a document full screen the pane's body is not on the screen —
              only this dock is — so an offer in the pane would be unreachable
              rather than merely out of the way, and answering a question would
              mean leaving the document first. There it keeps its old home and
              its old terms: it comes up with the box and goes when the box
              folds. It follows nobody down a page, because in that mode there
              is no page of conversation on the screen. */}
          {closeAsk && fullScreenDoc && (
            <OptionsOffer
              ask={closeAsk.ask} askAll={closeAsk.ask} options={closeAsk.options}
              peekOption={null} askPeek={false}
              selectedOption={selectedOption} selRef={selRef}
              onPick={closeAsk.onPick} onOptionEnter={() => {}} onAskEnter={() => {}}
              setPeek={() => {}} setAskPeek={() => {}} keep={closeAsk.keep}
              stripRef={closeAskRef}
            />
          )}
          {offerInDock && (closeAsk ? null : (
            <OptionsOffer
              ask={ask} askAll={askAll} options={options}
              peekOption={peekOption} askPeek={askPeek}
              selectedOption={selectedOption} selRef={selRef}
              onPick={pickByClick} onOptionEnter={onOptionEnter} onAskEnter={onAskEnter}
              setPeek={setPeek} setAskPeek={setAskPeek}
              stripRef={stripRef} onOver={(over) => { overStrip.current = over; }}
            />
          ))}
          {/* NO REPLY BOX ON THE TROUBLE ROW EITHER, and for the same reason as
              the one below: there is nobody on the other end of it. A box that
              looks like it sends is the failure this codebase cares about most.
              What to do instead is in the message itself, per cause.
           */}
          {update || trouble ? null : replyBlocked ? (
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
            <DockComposer item={item} runningMode={runningMode} runningEngine={runningEngine} codexModels={codexModels} codexModelDefault={codexModelDefault} engines={engines} items={items} onSend={onReplySend} onClose={onReplyClose} onNotice={onNotice} openModel={openModel} talkTo={direct ? talkNames : null} talkWord={inChats ? 'Message' : undefined} stop={stopButton} />
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
               what picks up her next message, which is a fact about the box.
               And with the choices folded away, the sign that they are there
               (w-65bcefb857). */
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
              {choicesFolded && page && stripShown && !fullScreenDoc && !closeAsk && <ChoicesShow count={options.length} onShow={foldChoices} />}
            </button>
          )}
        </div>
      </div>
    </div>
    {/* THE SUMMARY, beside the conversation and the dock rather than inside
        either: both give up its width (`data-summary` above, summary.css), so
        the words narrow instead of running under it, and it scrolls on its own. */}
    {/* `onFinish` is the SAME ONE the three-dot menu's Mark done row takes
        (`canFinish ? onResolve : null` above), so the Status row's Done and
        that row and E are one action with one undo and one toast. */}
    {/* Opened without room, it lies over the words, and a click on them puts it away. */}
    {summaryShown && !summaryFits(paneWidth) && <div className="ts-scrim" aria-hidden="true" onClick={toggleSummary} />}
    {summaryShown && <SummaryPanel item={item} team={teamCtx} onFinish={canFinish ? onResolve : null} onClose={toggleSummary} repeat={repeat} peopleAsk={pageAsk?.what === 'people' ? pageAsk.at : 0} onAsked={onAsked} />}
    {summaryOffered && !summaryOpen && <SummaryRail item={item} team={teamCtx} onOpen={toggleSummary} />}
    {!direct && <TaskTerminal key={`${item.product}:${item.id}`} product={item.product} id={item.id} onOpenChange={setTerminalOpen}/>}
    </div>
    </TicketNavigation.Provider>
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

function DockComposer({ item, runningMode, runningEngine, codexModels = [], codexModelDefault = null, engines, items = [], onSend, onClose, onNotice, stop, openModel = false, talkTo = null, talkWord = 'Reply to' }: {
  item: WorkItem;
  /** "Message" on the Chats page, as a group's box says it. */
  talkWord?: string;
  /** The coding agents this Mac offers, off the snapshot. One is no choice. */
  engines?: { id: string; label: string }[];
  /** Every thread she has, for the models she has used lately (`recentModels`). */
  items?: WorkItem[];
  /** On a conversation with a person, everyone's first name: the box replies
   *  to them, and nothing about an agent, a priority or a model is offered. */
  talkTo?: string[] | null;
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
  onSend: (text: string, priority?: number, repeat?: RepeatRuleValue | null, sent?: SentDraft, mode?: AnswerMode | null, pick?: ReplyPick) => void;
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
    if (box) box.placeholder = talkTo?.length ? `${talkWord} ${joinNames(talkTo)}` : 'What should the agent do next?';
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
      const back = readDraftAttachments(item);
      setAttachments(back);
      // A voice note that went with the undone or refused send comes back
      // too, whether or not the draft had room to carry it.
      void sendTurnedBack(`direct:${item.product}:${item.id}`, back.map((a) => a.draftId)).then(() => voiceCtl.current?.restore());
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
  // The level it runs at (shared/rank.mjs shownPriority). A conversation is
  // offered no tag at all, so this is only ever a work thread's.
  const itemPrio: PriorityId = priorityIdOf(shownPriority(item));
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
  const [touched, setTouched] = useState(() => replyOpensOn(item, readDraftPick(item)).touched);
  const [model, setModel] = useState<string | null>(() => replyOpensOn(item, readDraftPick(item)).pick.model);
  const [effort, setEffort] = useState<string | null>(() => replyOpensOn(item, readDraftPick(item)).pick.effort);
  // AND WHICH CODING AGENT, now the menu offers both (w-e1a42f6b21). Null is
  // the row's own, which main resolved and handed down as `runningEngine`; a
  // value here is a pick that MOVES the thread, and the session cannot follow
  // it. It is kept with the model, so a fold loses neither.
  const [engineChosen, setEngine] = useState<string | null>(() => replyOpensOn(item, readDraftPick(item)).pick.engine ?? null);
  // ON THE ROW'S IDENTITY ONLY, the rule the mode below already follows and
  // for the reason spelled out there: a snapshot arriving mid-sentence must
  // not overwrite a pick she just made. The dependency list is pinned by
  // tests/the-reply-box-keeps-the-model-you-picked-when-it-folds.
  useEffect(() => {
    const opens = replyOpensOn(item, readDraftPick(item));
    setTouched(opens.touched);
    setModel(opens.pick.model);
    setEffort(opens.pick.effort);
    setEngine(opens.pick.engine ?? null);
  }, [item.product, item.id]);
  // Written down as she makes it, beside her words, because this box dies when
  // it folds and her sentence used to come back without it (../drafts.ts).
  const pickTo = (next: { model?: string | null; effort?: string | null; engine?: string | null }) => {
    const pick = {
      model: next.model === undefined ? model : next.model,
      effort: next.effort === undefined ? effort : next.effort,
      engine: next.engine === undefined ? engineChosen : next.engine,
    };
    setTouched(true);
    setModel(pick.model);
    setEffort(pick.effort);
    setEngine(pick.engine);
    saveDraftPick(item, pick);
  };
  /* THE MENU'S OWN FACTS, worked out the way the new thread card works them
     out, from the same pure rules, so the two boxes cannot offer different
     lists (../threads/composer-rules.ts). */
  const engineRows = engines?.length ? engines : [ENGINES[0]];
  const codexOffered = engineRows.some((e) => e.id === 'codex');
  const claudeOffered = engineRows.some((e) => e.id === 'claude');
  const modelOpts = { codexModels, codexDefault: codexModelDefault };
  // The agent the row runs on now, as main resolved it, and the one the menu
  // is showing, which is the same until she picks the other.
  const engineNow: Harness = (runningEngine === 'codex' ? 'codex' : 'claude');
  const engineShown: Harness = engineChosen === 'codex' ? 'codex' : engineChosen === 'claude' ? 'claude' : engineNow;
  const pick: ModelPick = { engine: engineShown, model: model ?? defaultModelFor(engineShown, codexModelDefault) };
  const recent = useMemo(
    () => recentModels(items, { codexModels, codexDefault: codexModelDefault, codexOffered, claudeOffered }),
    [items, codexModels, codexModelDefault, codexOffered, claudeOffered],
  );
  const every = useMemo(() => allModels({ codexModels, codexOffered, claudeOffered }), [codexModels, codexOffered, claudeOffered]);
  const effortRows = effortChoicesFor(engineShown, pick.model, modelOpts);
  const effortLit = effortShown(effort, effortRows, defaultEffortFor(engineShown, pick.model, modelOpts));
  // A LEVEL BELONGS TO THE MODEL IT WAS PICKED FOR, so crossing to the other
  // agent drops it rather than keeping a word that agent does not know.
  const pickModel = (p: ModelPick) => {
    pickTo({ engine: p.engine, model: p.model, ...(p.engine !== engineShown ? { effort: null } : {}) });
  };
  // What a move costs, said only while it is true (drawn below the box).
  const freshNote = engineShown !== engineNow
    ? `${engineRows.find((e) => e.id === engineShown)?.label ?? 'It'} starts fresh with this thread.`
    : null;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  // The hidden file input the formatting bar's attach button opens.
  const filePicker = useRef<HTMLInputElement>(null);
  const pickFiles = () => filePicker.current?.click();
  // A finished voice note waits with the other attachments until Send, once.
  const addVoice = (note: Recorded) => setAttachments((a) => (a.some((x) => x.draftId === note.draftId)
    ? a : [...a, { name: note.name, dataBase64: note.dataBase64, image: false, draftId: note.draftId }]));
  const voiceCtl = useRef<VoiceControl | null>(null);
  const finishing = useRef(false);
  const [recording, setRecording] = useState(false);
  const attachedNow = attachments;
  // AGENTS IN A CONVERSATION WITH A PERSON (w-7b9cb8636a, ../team/ChatAgents.tsx):
  // the @ menu, mentions that carry their own project, model and effort, and
  // the rule that Send waits until every agent has a project.
  //
  // THE FORMATTING BAR'S @ BUTTON IS A WAY INTO THIS and not a second
  // mechanism: it types an @ into the box at the caret, which is exactly what
  // the menu below watches for, so pressing it and typing it are the same act.
  //
  // A CHAT'S BOX SHOWS ITS FORMATTING (w-0d55a2b160, ../team/RichReply.tsx):
  // ⌘B makes the words bold rather than typing asterisks. `text` is still the
  // markdown that is saved and sent; the @ menu counts in the words somebody
  // sees, which are `plain`, and edits them through the editor so the bold
  // around a mention stays.
  const richBox = !!talkTo?.length;
  const [plain, setPlain] = useState('');
  const chat = useChatMentions({
    on: !!talkTo?.length && !item.agent, where: item, people: talkTo ?? [], input: ref,
    ...(richBox
      ? { text: plain, setText: (next: string) => (ref.current as RichBox | null)?.rich.setPlain(next) }
      : { text, setText }),
  });
  // # NAMES ANOTHER THREAD, in any reply box (w-c110f2371d, ./ThreadMentions.tsx).
  const named = useThreadMentions({
    ...(richBox
      ? { text: plain, setText: (next: string) => (ref.current as RichBox | null)?.rich.setPlain(next) }
      : { text, setText }),
    input: ref, here: item.id, rise: true,
  });
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
  // While the box starts with a slash, not only while the menu is open: once
  // she types past /loop the box still has to know /loop is a command.
  const discoveringCommands = !item.agent && (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE && text.startsWith('/');
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
  // A layout effect, for the reason the New thread card's is one: R opens this
  // box inside a keydown, and a passive effect can land after the key behind it
  // has been dispatched, so that key goes nowhere — or into whatever still had
  // the keyboard (w-abed8ae491).
  useLayoutEffect(() => { focusAtEnd(ref.current); }, []);
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
  const [saving, setSaving] = useState(false);
  const send = async (spoken?: string) => {
    // SEND WHILE A NOTE RECORDS finishes the note and sends it with the words.
    // It comes straight here rather than through the box, which this send is
    // about to empty, so it can never come back and go twice.
    let attachments = attachedNow;
    if (voiceCtl.current?.recording()) {
      // A second press while the note is being finished is the same send.
      if (finishing.current) return;
      finishing.current = true;
      const note = await voiceCtl.current.finish().finally(() => { finishing.current = false; });
      if (note) {
        // In the box at once, so a send that stops short below keeps it there.
        addVoice(note);
        attachments = [...attachments, { name: note.name, dataBase64: note.dataBase64, image: false, draftId: note.draftId }];
      }
    } else if (finishing.current) return;
    if (saving || (!(spoken ?? text).trim() && !attachments.length)) return;
    // AN AGENT WITH NO PROJECT DOES NOT GO OUT. The footer already says why;
    // ⌘↵ says it again rather than doing nothing.
    if (chat.block) { onNotice(chat.block); return; }
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
    // On the phone each file goes up first, which takes a moment on a mobile network.
    let attachedMd: string;
    setSaving(attachments.length > 0);
    try {
      attachedMd = await persistAttachments(item.product, attachments);
    } catch (err) {
      // A note finished by this Send waits in the box for the next try.
      setAttachments(attachments);
      onNotice(`Not sent: ${String((err as Error)?.message ?? err)} Your draft has been kept.`);
      return;
    } finally {
      setSaving(false);
    }
    clearDraft(item);
    // Saved with the conversation now. The spare copy is kept a while, out of
    // the box, in case this send is undone or turned back.
    markVoiceSent(`direct:${item.product}:${item.id}`, attachments.map((a) => a.draftId));
    // AND WHAT THIS ONE MESSAGE MAY DO, if she changed it. `null` is not the
    // same as leaving it out: it CLEARS a mode set on an earlier reply and puts
    // the thread back on the project's own setting, so it is sent whenever the
    // chip has been touched at all.
    // The model rides along ONLY when she opened the drawer, on the priority
    // tag's rule: an untouched box must not write what it is merely displaying.
    // In a conversation, every agent mention goes out as its link, carrying the
    // project, model and effort the card holds (../team/agent-mentions.ts).
    // THROUGH `pickToSend`, because the drawer reports the engine's own default
    // as null and the store reads a null model as "clear it", so picking the
    // default unpinned the thread rather than pinning it (../reply-pick.ts).
    onSend([named.encode(chat.encode(words)), attachedMd].filter(Boolean).join('\n\n'), prio ? priorityValueOf(prio) : undefined, repeat, sent, mode,
      touched
        ? pickToSend({ model, effort }, { engine: engineShown, was: engineNow, engineCount: engineRows.length })
        : undefined);
  };
  // A note being recorded is a draft: the box stays open round it.
  const hasDraft = !!text.trim() || attachments.length > 0 || recording;
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
  // The command waiting on her words, once Enter has put it in the box.
  const holding = !item.agent ? commandBeingWritten(text, claudeCode, nativeNames) : null;
  // WHAT THIS SEND WILL ACTUALLY RUN AS: the mode picked for this one message
  // if there is one, otherwise whatever the fleet is set to. Never a guess and
  // never a blank: a footer that says nothing when nothing is picked is the
  // footer she could not find.
  const running: PermissionMode | CodexModeId = mode
    ?? (claudeCode ? (runningMode ?? 'auto') : CODEX_DEFAULT_MODE);
  // The level this thread is set to, for the footer, or null when it is set to
  // nothing and the engine is choosing.
  const levelSaid = effortSaid({ model, effort }, { engine: runningEngine, codexModels, codexDefault: codexModelDefault });
  // The drawer has been open at least once, so a close is really a close and
  // not the first render reporting that it is shut.
  const drawerWasOpen = useRef(false);
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
   *  A COMMAND IS PUT IN THE BOX AND WAITS FOR SEND, every one of them, the
   *  way a terminal does (w-2c8ef9ed9e). Enter on /loop used to start a loop
   *  with nothing to loop on. Picking a command, by Enter, Tab or a click,
   *  writes it with its trailing space; she adds whatever it takes; Send runs
   *  it. slash-menu.ts `enterWaitsForWords` says why it is every command
   *  rather than a list.
   *
   *  Enter on a command ran it from w-5d1ad29efa until then, because Enter
   *  that only filled the box looked like a dead key: `/usage ` appeared, the
   *  menu closed, nothing else moved. What answers that now is the faint words
   *  after the caret saying what the command takes and that ⌘↵ runs it. */
  const pickRow = (row: SlashRow) => {
    if (row.kind === 'mode' || row.kind === 'codexMode') { pickMode(row.mode); return; }
    if (enterWaitsForWords(row)) { setText(commandDraft(row.cmd)); ref.current?.focus(); }
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
  const talk = useWebDictation({ text, setText, field: ref }, () => void send());
  // A box that is listening is in use before its first word arrives.
  const held = hasDraft || talk.on;
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
    if (held) return;
    const away = (e: MouseEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.dock-card');
      if (!card) onClose();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [held, onClose]);
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
  // THE BOX'S KEYS, whichever box it is: the text field on a thread with an
  // agent, the editor in a chat.
  const boxKey = (e: BoxKeyEvent<HTMLTextAreaElement>) => {
    // THE MENU TAKES THE KEYS FIRST WHILE IT IS OPEN, and gives every
    // one of them back the moment it closes. Escape here clears the
    // SLASH rather than folding the box, because folding a box on the
    // first character somebody typed reads as the app refusing them.
    // CLAUDE CODE'S OWN KEY, DOING CLAUDE CODE'S OWN THING. Their docs:
    // "press Shift+Tab to cycle permission modes". It is checked before
    // the menu because it works whether the menu is open or shut, and
    // because a bare Tab inside the menu is a pick, which is a different
    // key.
    // The @ menu and a mention's card take their keys first, and only
    // while one of them is up.
    if (chat.keyDown(e)) return;
    if (named.keyDown(e)) return;
    // ↑ in an empty box to a person edits your newest message, as in Slack.
    if (e.key === 'ArrowUp' && talkTo?.length && !text.trim() && !attachments.length) {
      e.preventDefault();
      editLast();
      return;
    }
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
       * ENTER AND TAB BOTH PICK THE ROW, and neither sends: a command
         goes into the box and waits for Send, a mode is set (pickRow).
         ⌘↵ falls through to Send, so `/usage` typed out and sent still
         runs in one key. */
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        pickRow(menuRows[slashAt] ?? menuRows[0]);
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
      if (held) ref.current?.blur();
      else onClose();
    }
  };
  return (
    <>
      {/* THE MENU RIDES ON THE CARD, NOT ON THE BOX, and it opens upward for
          the same reason the priority drawer does: the reply box is at the
          bottom of the window and there is nothing under it. */}
      {slashOpen && (
        <SlashMenu rows={menuRows} at={slashAt} onPick={pickRow} onHover={setSlashAt} />
      )}
      {/* THE COMMAND THE BOX IS HOLDING, SAID IN THE BOX (w-2c8ef9ed9e). Once
          Enter has put `/loop ` there the menu closes on the space, so what she
          still has to write is drawn faintly after the caret, the way a
          terminal draws a command's argument hint, and goes as she types. */}
      {holding && /^\/\S+\s*$/.test(text) && (
        <div className="dock-ghost" style={{ top: ref.current?.offsetTop ?? 0 }} aria-hidden>
          <span className="dock-ghost-typed">{text.endsWith(' ') ? text : `${text} `}</span>
          {holdingHint(holding)}
        </div>
      )}
      {/* AGENTS IN A CONVERSATION (w-7b9cb8636a): the @ menu, a mention's
          card, and the mentions drawn as chips under the text. Nothing here
          draws outside a conversation with a person. */}
      {chat.menu}
      {chat.card}
      {named.menu}
      {richBox ? (
        // The editor draws a mention's chip on its own words; the layer of
        // chips behind a text field has no text field to sit behind.
        // Not `with-mentions`: that lifts a text field over the layer, and
        // lifted, the box covered the emoji plate rising out of the bar.
        <RichReply
          className="dock-input"
          boxRef={ref}
          value={text}
          onChange={changeText}
          onPlain={setPlain}
          placeholder={`${talkWord} ${joinNames(talkTo ?? [])}`}
          mentions={[
            ...chat.mentions.map((m) => ({ start: m.start, end: m.end, loose: !m.project })),
            ...named.mentions.map((m) => ({ start: m.start, end: m.end, loose: false })),
          ]}
          // ⌘↵ and Escape are taken even where nothing above stops them, or
          // the editor's own ⌘↵ would add a line break under the send.
          onKeyDown={(e) => {
            boxKey(e as unknown as BoxKeyEvent<HTMLTextAreaElement>);
            return e.defaultPrevented || e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter');
          }}
          onFiles={async (files) => {
            const got = await collectFiles(files);
            if (got.length) setAttachments((a) => [...a, ...got]);
          }}
          onCaret={(box) => { chat.track(box as unknown as HTMLTextAreaElement); named.track(box as unknown as HTMLTextAreaElement); }}
          onClick={(box) => chat.click(box as unknown as HTMLTextAreaElement)}
        />
      ) : <>
      {chat.chips}
      {named.chips}
      <textarea
        className={`dock-input${chat.live ? ' with-mentions' : ''} ${named.over}`}
        ref={ref}
        value={text}
        onChange={(e) => { talk.typed(); changeText(e.target.value); chat.track(e.target); named.track(e.target); }}
        onSelect={(e) => { chat.track(e.currentTarget); named.track(e.currentTarget); }}
        onScroll={(e) => { chat.track(e.currentTarget); named.track(e.currentTarget); }}
        onClick={(e) => { chat.click(e.currentTarget); named.track(e.currentTarget); }}
        /* * ONE CLEAR SENTENCE. The old placeholder was unclear about what it even meant,
           and a reply box needs one simple sentence.

           It also says the one true thing the old line was reaching for, that what is
           typed here becomes the agent's next instruction, without having to explain it.
           `tests/the-reply-box-asks-one-question.test.mjs` holds the sentence count.
        */
        placeholder="What should the agent do next?"
        onKeyDown={boxKey}
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
      </>}
      {/* THE FILE PICKER THE ATTACH BUTTON OPENS. The box already took files by
          paste and by drop; the bar's + is the third way in, and all three end
          in the same `collectFiles` and the same row of thumbnails below. The
          input is hidden rather than styled: an <input type=file> cannot be
          drawn as one of these buttons, and a second-looking control beside
          them would be the one rounded thing on the screen. */}
      <input
        ref={filePicker}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const picked = await collectFiles(e.target.files ?? []);
          if (picked.length) setAttachments((a) => [...a, ...picked]);
          // Cleared so picking the same file twice in a row still fires.
          e.target.value = '';
        }}
      />
      <AttachRow attachments={attachments} onRemove={(i) => { forgetVoiceDraft(attachments[i]?.draftId); setAttachments((x) => x.filter((_, j) => j !== i)); }} />
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
      {/* THE THREAD IS ABOUT TO MOVE TO THE OTHER CODING AGENT, and a session
          cannot cross, so what runs next is a fresh one briefed with the
          thread. A note and not a clause in the sentence below, for the reason
          every note here is one: a sentence that grows a clause when something
          changes is a sentence that moves under her. */}
      {freshNote && <div className="compose-note">{freshNote}</div>}
      {!talk.on && talk.problem && <div className="compose-note">{talk.problem}</div>}
      {/* ONE text run, ONE size, ONE baseline, and the app's own send button:
          the new-task card's footer, on the reply box, because they are the same
          act. See the note at the top of this file for the measurements. */}
      <div className="compose-sentence">
        {talk.on ? <Listening talk={talk} /> : <>
        {/* NO PRIORITY AND NO REPEAT ON A MESSAGE TO AN AGENT. Both are
            work-item fields with nowhere to be written, and "Urgent priority.
            Runs once." under a message going into somebody's terminal is a
            sentence about a thing that is not happening. What is left is the
            send button, which is the whole act. */}
        {/* THE FORMATTING BAR, IN A CHAT AND NOWHERE ELSE (w-560647d4db). It
            goes first on the footer line, which is where drawing A has it:
            left of "Goes to Maya's inbox." and left of Send. A reply to an agent
            is an instruction rather than a formatted message, so that box keeps
            exactly the footer it had. */}
        {talkTo?.length ? <FormatBar box={ref} onChange={changeText} onAttach={pickFiles} onVoice={addVoice} onNotice={onNotice}
          voiceKey={`direct:${item.product}:${item.id}`} voice={voiceCtl} onRecording={setRecording} /> : null}
        {/* A PHONE HAS NO PASTE OF A FILE AND NO DROP, so a reply to an agent,
            which takes files only those two ways on the desktop, took none
            ("I can't upload files in mobile", 2026-10-12). It gets the same
            picker the chat's + opens. */}
        {!talkTo?.length && onPhone() ? (
          <button type="button" className="compose-attach" aria-label="Attach a file or picture" title="Attach a file or picture" onClick={pickFiles}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l8-8" /></svg>
          </button>
        ) : null}
        {!talkTo?.length && talk.allowed && <MicButton talk={talk} />}
        <span className="compose-clauses">
          {/* NOTHING ABOUT WHERE IT GOES (w-140ac855b1, 2026-10-13). This
              slot read "Goes to Maya's inbox.", put there so the corner was
              never bare; the formatting bar now sits in that corner, and the
              person asked for the line to go. The conversation's header
              already names who it is with. */}
          {/* AN AGENT IN THE MESSAGE WITH NO PROJECT says so here, and Send
              waits (w-7b9cb8636a). */}
          {item.agent ? <span className="dim">Goes straight into {item.agent.name}.</span> : talkTo?.length ? (chat.block ? <span className="dim">{chat.block}</span> : null) : <>
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
                  : CODEX_MODE_ORDER.map((m) => ({ value: m, label: CODEX_MODES[m].label }))}
                onChange={(v) => pickMode(v as PermissionMode | CodexModeId)}
              />
              {' Mode. '}
            </>
          )}
          {/* One span, so the cloud hides "On" and the stop with the model. */}
          <span className="dock-model">
          {'On '}
          <ReplyModel
            label={engineModelLabel(engineShown, model, modelOpts)}
            pick={pick}
            onPick={pickModel}
            recent={recent}
            every={every}
            more={moreCount(recent, every)}
            labelOf={(p) => engineModelLabel(p.engine, p.model, modelOpts)}
            engineLabel={(id) => engineRows.find((e) => e.id === id)?.label ?? ENGINES.find((e) => e.id === id)?.label ?? id}
            // The agent is named beside each model only where there are two of
            // them; on every other Mac the menu reads as it always did.
            engineTags={engineRows.length > 1}
            effortRows={effortRows}
            effortLit={effortLit}
            // Toggled against HER pick, not against what is lit, so pressing
            // the lit default sets it and pressing her own clears it.
            onEffort={(id) => pickTo({ effort: id === effort ? null : id })}
            // AND THE BOX TAKES FOCUS BACK WHEN THE DRAWER SHUTS, because every
            // way of closing it leaves focus on a button that has just been
            // unmounted, which is the body, and ⌘↵ sends from the box.
            onOpenChange={(drawer) => {
              if (drawer) drawerWasOpen.current = true;
              else if (drawerWasOpen.current) ref.current?.focus();
            }}
            // TRUE WHETHER OR NOT A RUN IS UP. On an idle row the reply starts
            // a run on this model; on a running one the pick lands on the row
            // and the next run takes it, because a spawned harness cannot
            // change model mid-flight.
            title="Which model this conversation runs on"
            // Open already when she got here by pressing the model word on
            // the folded box, which is what that word promised.
            openAtStart={openModel}
          />
          {/* AND HOW HARD IT THINKS, WHEN THIS THREAD IS SET TO ANYTHING. The
              level was readable in one place only, lit inside the drawer, and
              the drawer is shut while she reads this line and decides to send.

              ONLY WHEN THERE IS SOMETHING TO SAY. A level nobody set is the
              engine's own choice for the model, which the drawer lights and
              nothing sends, so the resting sentence is unchanged. It is also
              why this clause is not on the new task card: that card opens
              carrying a remembered level every time, so the word would be
              permanent furniture there, and more words on that line is the one
              thing she ruled out (./Model.tsx). */}
          {levelSaid ? `, ${levelSaid}.` : '.'}
          </span>
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
          disabled={!hasDraft || !!chat.block || saving}
          title={chat.block ?? `Send · ${SEND}`}
        >{saving ? 'Sending…' : <>Send <kbd>{SEND}</kbd></>}</button>
        )}
        </>}
      </div>
    </>
  );
}
