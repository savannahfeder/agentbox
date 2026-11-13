import { openSourceFile } from './open-source-file.mts';
import {submitReply} from './live-replies.mts';
import { noteToItsAgent, replyWithWaitingNotes, waitingNotes } from './notes-wake.mts';
import { leftByAMove } from '../shared/move-thread.mts';
import { moveThread } from './move-thread.mts';
import { whereTheWorkStands } from './git-change.mts';
import { taskFolderPath } from './task-folders.mts';
import { GROUPS } from '../shared/connections-catalog.mts';
import { projectSeenBy } from '../shared/thread-cards.mts';
import { createEngineSetup, engineSetUpHere } from './engine-setup.mts';
// IPC: a thin, typed-by-convention surface. The renderer asks; the main
// process derives from files and answers. Pushes go one way: "state changed,
// refetch." No state is cached on either side of the bridge.

// NOTHING IN THIS FILE IMPORTS ELECTRON, AND THAT IS WHAT THE `host` ARGUMENT
// BELOW IS FOR.
//
// This is the contract between the screen and the half of the app that does
// things: 78 channels, nine lines of code each, nearly all of them wrappers
// over modules that are ordinary Node. Only three Electron things were ever
// reached for in here, `ipcMain` to register a channel, `dialog` for the
// folder picker, and `app` for two flags and the quit hook. They arrive as
// arguments now.
//
// What that buys is a second front door. `main/main.mts` hands over the real
// Electron three and nothing about the desktop app changes. A plain Node
// process can hand over its own, and the same 78 channels then answer a
// browser over http without one line of this file being written twice.
import {terminalSenderAllowed} from './terminal-access.mts';
import {TaskTerminals,terminalPlace,terminalEnv} from './task-terminals.mts';
import {TerminalHosts,taskClosed} from './terminal-hosts.mts';
import {SETTINGS_TERMINAL} from '../shared/settings-terminal.mts';
import {AgentUpdates,installedAgent} from './agent-updates.mts';
import {refreshAgentModels} from './refresh-agent-models.mts';
import {readInstruction,writeInstruction,listVersions,readVersion} from './instruction-settings.mts';
import path from 'node:path';
import os from 'node:os';
import { looksLikeClaudeCode } from '../shared/claude-code-shape.mts';
import fsWatch from 'node:fs';
import { listFolders, startFolder } from './folders.mts';
import { feedbackUrl, sendFeedback } from './feedback.mts';
import { feedbackPayload } from '../shared/feedback.mts';
import * as approvals from './approvals.mts';
import { cardsInFront } from '../shared/which-card-is-in-front.mts';
import { restartNeeded } from './staleness.mts';
import { artifactRoots, resolveArtifact } from './artifact-path.mts';
import { folderPictures } from './folder-pictures.mts';
import { docUrl } from './doc-scheme.mts';
import { readDoc, writeDoc } from './doc-file.mts';
import { linkCopyOf, linkKindOf, linkSource } from './file-link.mts';
import { bringSharedFile, fileLinkToken, projectToBringInto } from './bring-shared-file.mts';
import { familyKeyOf, type Mark } from '../shared/artifact-marks.mts';
import { readItemHistory } from './store/work-items.mts';
import { readChange, readChangeSummary } from './code-change.mts';
import { findFile, readCodeFile, writeCodeFile } from './code-file.mts';
import { readNote, writeNote } from './rail-note.mts';
import { teamForWindow } from './team/index.mts';
import { isOnTeam } from '../shared/rooms-on.mts';
import { liveForTheWholeTeam, liveRoomFor } from './team/live-room.mts';
import { openForThePerson } from './opens-a-program.mts';
import { addClaudeAccount, addCodexAccount, alphaFeatures, cornerTagTurnedOff, countsTurnedOff, lookAgainFor, outsideAgentsMode, permissionMode, pointAtEngineBin, readSettings, searchForEngineBin, setProjectSetting, setWorkspaceSetting } from './settings.mts';
import { ICON_KINDS, clearProjectIcon, setProjectIcon, setProjectName } from './project-identity.mts';
import { ClaudeUsage } from './claude-usage.mts';
import { AccountUsage } from './account-usage.mts';
import { effectiveProfiles } from './account-discovery.mts';
import { accountIdentity } from './account-tooling.mts';
import { usageEngine } from '../shared/usage.mts';
import { DEFAULT_ENGINE, isEngine } from '../shared/engines.mts';
import { routedPatch, PICKED_WHY } from '../shared/auto-route.mts';
import * as agents from './agents.mts';
import { findAgentFolders, readAgentFiles, readFolderAgents } from './agent-files.mts';
import { readCodexThreadsOffThread } from './codex-threads.mts';
import { appSessionFolders } from './agent-homes.mts';
import { readImportableThreads, readSearchableThreads } from './importable-threads.mts';
import { readChatEnds } from './agent-sessions.mts';
import { markImported } from '../shared/agent-import.mts';
import { codexIdOf, importChoice, isCodexImportRow, isNotImportedRow } from '../shared/codex-import.mts';
import { checkProjectFolder, chooserStartsIn, folderFromChooser } from '../shared/project-folder-check.mts';
import { openFreshUser } from './fresh-user.mts';
import { openDemo } from './demo.mts';
import { AgentSchedule } from './agent-schedule.mts';
import { agentKey } from '../shared/agents.mts';
import { machineryPath } from './store/home.mts';
import { EVENT_NAMES } from '../shared/analytics-events.mts';
import { appFinder } from './everything-found.mts';
import { appFilesPlace } from './files-place.mts';
import { Name } from '../shared/product-name.mjs';
import { setUpGit, startGhLogin } from './github-browser-sign-in.mts';
import type { GhLogin } from './github-browser-sign-in.mts';
import { handedOnByReply, isGivenTask, visibilityWhenMade } from '../shared/team-rules.mts';
import { closeRefusal, closedAnywayNote } from '../shared/not-shipped.mts';
import { lightRunning, snapshotSender } from '../shared/snapshot-delta.mts';
import { wakesItselfAt } from '../shared/answers.mts';
import { traceAnswer } from '../shared/trace-delta.mts';
import { saveAttachments } from './save-attachments.mts';
import { stageAttachment, stageAttachmentPart } from './stage-attachment.mts';
import type { StagedPart } from './stage-attachment.mts';
import { readRunTraces } from './run-traces.mts';
import { openInBrowser } from './open-in-browser.mts';
import type { AnswerInput, ComposeInput, Store, StoreConfig } from './store.mts';
import type { Supervisor, SupervisorConfig } from './supervisor.mts';
import type { SettingsConfig } from './settings.mts';
import type { createTeamService } from './team/index.mts';
import type { UpdateTerminals } from './agent-updates.mts';
import type { AttachmentFile } from './save-attachments.mts';
import type { PostInput } from './teammates.mts';
import type { ConversationInput } from './agents.mts';
import type { ConnectionTile } from './connections/index.mts';

export interface IpcEvent { sender?: unknown; senderFrame?: { parent?: unknown } | null }
export type IpcListener = { bivarianceHack(event: IpcEvent, payload?: unknown): unknown }['bivarianceHack'];

export interface IpcWindow {
  isDestroyed(): boolean;
  webContents: { send(channel: string, ...args: unknown[]): void };
  isMinimized?(): boolean;
  restore?(): void;
  show?(): void;
}

export interface IpcShell { openExternal(url: string): unknown; openPath?(path: string): Promise<string>; showItemInFolder?(path: string): void }

export interface IpcOpenDialog {
  title: string;
  buttonLabel: string;
  properties: NonNullable<import('electron').OpenDialogOptions['properties']>;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

/** `W` is the window the deps hand over, so the dialog is opened over the same kind of window. */
export interface IpcHost<W extends IpcWindow = IpcWindow> {
  ipcMain: { handle(channel: string, listener: IpcListener): unknown };
  app: {
    isPackaged: boolean;
    getVersion(): string;
    on(event: string, fn: (event: { preventDefault(): void }) => void): unknown;
    quit(): void;
    focus?(options?: { steal: boolean }): void;
    accessibilitySupportEnabled?: boolean;
  };
  dialog: { showOpenDialog(window: W, options: IpcOpenDialog): Promise<{ canceled: boolean; noDialog?: boolean; filePaths: string[] }> };
  shell?: IpcShell;
  micAccess?(): unknown;
  readClipboardText?(): unknown;
}

export interface IpcAnalytics {
  enabled: boolean;
  installId?: unknown;
  track(name: string, props?: Record<string, unknown>): unknown;
  flush(): unknown;
  onboardingArm?(): string;
}

export interface IpcUpdater {
  state(): unknown;
  check(options: { manual: boolean }): Promise<unknown>;
  install(): unknown;
  move?(): unknown;
}

export interface IpcConnections {
  connectedIds(): Promise<string[]>;
  checkStale(): Promise<unknown>;
  list(): Promise<{ tiles: ConnectionTile[]; canEncrypt: boolean }>;
  connect(id: string, creds: { clientId?: string; clientSecret?: string; key?: string }): Promise<{ ok: boolean } & Record<string, unknown>>;
  addByAddress(ask: { address?: string; key?: string }): Promise<unknown>;
  chooseReads(id: string, names: unknown[]): Promise<unknown>;
  cancelConnect(id: string): unknown;
  check(id: string): Promise<unknown>;
  disconnect(id: string): Promise<unknown>;
  acceptTools(id: string): Promise<unknown>;
}
export interface IpcCopies {
  bindPlace(place: () => unknown): unknown;
  all(): Record<string, unknown>;
  kick(id: string): Promise<unknown> | null;
  start(id: string, ask: { project?: string; channels?: string[] }): Promise<unknown>;
  stopKeeping(id: string): Promise<unknown>;
  run(id: string): Promise<unknown>;
}
export type IpcTeam = ReturnType<typeof createTeamService>;
export type IpcConfig = StoreConfig & SupervisorConfig & SettingsConfig & { accountRoot: string; storeRoot: string; feedbackUrl?: unknown };

export interface IpcDeps<W extends IpcWindow = IpcWindow> {
  store: Store;
  supervisor: Supervisor;
  config: IpcConfig;
  window: W;
  analytics?: IpcAnalytics;
  docGrants?: { grant(file: string, roots: string[]): unknown } | null;
  updater?: IpcUpdater;
  host: IpcHost<W>;
  team?: IpcTeam | null;
  connections?: IpcConnections | null;
  copies?: IpcCopies | null;
  onCount?: () => void;
  /** The live relay's address, null when this cloud has none. */
  liveAt?: string | null;
  /** Turns the window's glass on or off when the Alpha switch flips. */
  glass?: (on: boolean) => void;
}

export interface TeammateArgs {
  id: string;
  engine?: unknown;
  start?: boolean;
  patch?: Record<string, unknown>;
  text: string;
  to?: PostInput['to'];
  fresh?: boolean;
  answers?: unknown;
  filesIn?: unknown;
  priority?: unknown;
  ref: string;
  memory: string;
}

type TerminalPayload = { product: unknown; id: unknown; action?: string; data?: string; cols: number; rows: number; offset: number; wait: number };
type LookedAgain = Awaited<ReturnType<typeof lookAgainFor>>;
// A handler that imports Electron's own dialog runs only in the app, whose window is a BrowserWindow.
type AppWindow = import('electron').BrowserWindow;
type WorkspaceSet = { key: string; value?: unknown };
interface FilesPlace {
  forAgents(): Promise<unknown>;
  list(): Promise<unknown>;
  makeFolder(ask: { project?: string; name?: string; parent: string | null }): Promise<{ id?: string }>;
  renameFolder(ask: { id: string; name?: string }): Promise<{ id?: string }>;
  moveFile(ask: { key: string; folder: string | null }): Promise<{ id?: string }>;
  newDocument(ask: { project: string; name: string; kind: 'document' | 'table'; folder: string | null }): Promise<{ key: string }>;
  addFiles(ask: { project: string; folder: string | null; paths: string[] }): Promise<{ added: number; refused: string[]; keys: string[] }>;
  open(key: string): Promise<unknown>;
  edit(key: string, text?: string): Promise<{ ok: boolean } & Record<string, unknown>>;
  editOnThread(ask: { product: string; id: string; path: string; baseId?: string; text: string; taken?: unknown; since?: unknown }): { ok: boolean } & Record<string, unknown>;
  sameFiles(ask: { product: string; id: string; room?: string | null; copies: unknown[] }): Promise<unknown>;
  lineFor(ask: { product: string; id: string; room?: string | null }): Promise<unknown>;
  mark(key: string, mark: unknown): Promise<{ ok: boolean; wrote?: { product: string; id: string } } & Record<string, unknown>>;
  pictureNamed(src: unknown): Promise<string | null>;
  newDocument(ask: { project: string; name: string; kind?: 'document' | 'table'; folder?: string | null; by?: string | null }): Promise<{ key: string }>;
  addFiles(ask: { project: string; paths?: string[]; folder?: string | null; by?: string | null }): Promise<{ added: number; refused: string[]; keys: string[] }>;
}
// The JS defaults `team = null` and `nameOf = () => ...` read as the whole type.
const filesPlaceFor = appFilesPlace as (deps: { store: Store; team: IpcTeam | null; accountRoot: string; storeRoot: string; notify?: () => void }) => FilesPlace;
type RoomCalls = Record<RoomOp, (...args: unknown[]) => unknown>;
type ImportableThreads = Awaited<ReturnType<typeof readImportableThreads>>;
type SetProjectPayload = { product?: string; key: string; value?: unknown };
type CloudAccountModule = typeof import('./cloud/account.mts');
type CloudAccountHold = { config: string; value: NonNullable<ReturnType<CloudAccountModule['cloudAccountConfig']>>; session: ReturnType<CloudAccountModule['cloudAccountSession']> };

// WHAT A WORKER IS TOLD WHEN HER DECISION COULD NOT BE RECORDED.
const SPOOL_REFUSED = `${Name} could not record the founder's decision, so nothing was allowed. Finish what your grants cover and file the rest as a review.`;

// AND WHAT A CODEX WORKER IS TOLD WHEN THE CARD SHE READ IS NOT THE QUESTION IT
// IS PARKED ON. The request file lives in the spool a Claude Code worker is
// granted, so a card can be rewritten under its own id between being drawn and
// being answered; her Allow was for the other one. Same reading as above, for
// the same reason: this is a no.
const CARD_CHANGED = 'The approval request changed between being drawn and being answered, so the founder\'s decision was for a different action and nothing was allowed. Finish what your grants cover and file the rest as a review with the exact commands.';

// WHAT COUNTS AS SENT WHEN NOTHING IS. Analytics is optional here on purpose:
// every test and every copy without a key gets an object that answers no to
// everything, so no call site has to ask whether it exists.
const NO_ANALYTICS: IpcAnalytics = { enabled: false, track: () => false, flush: () => {} };

// A copy with no updater wired in: the tests, and any host that constructs the
// IPC surface by hand. It reports the state a build from source really is in
// rather than a cheerful "up to date" nobody checked.
const NO_UPDATER: IpcUpdater = {
  state: () => ({
    phase: 'unsupported',
    currentVersion: null,
    newVersion: null,
    percent: null,
    error: `${Name} only updates itself when it is installed as an app.`,
    checkedAt: null,
    ready: false,
  }),
  check: async () => NO_UPDATER.state(),
  install: () => false,
  // Nowhere to move to and nothing to move: a copy with no updater behind it
  // is a copy run from source (shared/where-it-runs-from.mts).
  move: () => ({ moved: false, error: null }),
};

const TEAMMATE_OPS = new Set(['create', 'describe', 'start', 'update', 'stop', 'remove', 'post', 'goAhead', 'remember', 'forget', 'method', 'unsend']);
const ROOM_OPS = new Set(['refresh', 'send', 'markRead', 'markDone', 'markUnread', 'react', 'decide','edit', 'deleteMessage', 'putFile', 'putFileFrom', 'file', 'fileOnDisk', 'fileText', 'markFile', 'older', 'saveProfile', 'goInvisible', 'comeBack', 'link', 'revokeLink', 'preview', 'listed', 'invitesSent', 'joinByLink', 'joinListed', 'acceptInvite', 'invite', 'create', 'rename', 'leave', 'remove', 'pin', 'mute'] as const);
type RoomOp = typeof ROOM_OPS extends Set<infer O> ? O : never;

export function registerIpc<W extends IpcWindow>({ store, supervisor, config, window, analytics = NO_ANALYTICS, docGrants = null, updater = NO_UPDATER, host, team = null, connections = null, copies = null, onCount = () => {}, liveAt = null, glass = () => {} }: IpcDeps<W>) {
  // The three Electron things, or a plain Node stand-in for them. There is no
  // default: a caller that forgets says so here rather than throwing eighty
  // lines further down on `ipcMain.handle` of undefined.
  if (!host?.ipcMain || !host?.app || !host?.dialog) {
    throw new Error('registerIpc needs host: { ipcMain, app, dialog }');
  }
  const { ipcMain, app, dialog } = host;
  // Rooms reads it (shared/rooms-on.mts), here and in the Rooms service alike.
  const onTeamNow = () => isOnTeam(team?.state());
  // A browser copy hands in its own; outside Electron, the `electron` package has no shell.
  const shellNow = async () => host.shell ?? (await import('electron')).shell;
  // Coalesced: the supervisor fires onChange per worker stream line, which is
  // every second or two per running session. Each push makes the renderer
  // refetch the whole snapshot, so unthrottled pushes had the UI visibly
  // re-rendering (flashing images, shifting layout) the entire time any
  // worker was streaming. One push per window is plenty for a live tail.
  let pushTimer: NodeJS.Timeout | null = null;
  const push = () => {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      if (!window.isDestroyed()) window.webContents.send('zero:changed');
    }, 400);
  };
  store.onChange = push;
  supervisor.onChange = push;

  // A worker mid-approval is frozen until the founder answers, so the spool
  // pushes like the store does.
  try {
    const spool = approvals.spoolDir(config.storeRoot);
    fsWatch.mkdirSync(spool, { recursive: true });
    fsWatch.watch(spool, () => push());
  } catch {}

  // THE ONE PLACE AN APPROVAL IS ANSWERED, and there are three ways to reach
  // it: the buttons on the card, the ⌘Y/⌘N chord (which main catches itself,
  // ahead of the page, so it outranks anything holding the keyboard) and
  // Allow/Deny Pending Approval in the Agents menu. All three go through here
  // so all three tell the renderer what was just decided: without that, the
  // card only ever "disappeared" on the next store push and nothing on screen
  // acknowledged the press. The card's exit is drawn
  // from this.
  //
  // THE MENU WAS NOT ONE OF THE THREE UNTIL NOW, AND THIS PARAGRAPH SAID IT
  // WAS. It wrote `<id>.answer.json` itself, which is a real answer to a Claude
  // Code worker in another process and NO answer at all to a Codex worker
  // waiting on a promise in this one -- so her own Allow appeared on disk for a
  // request still waiting, which is the definition of a forgery on that path,
  // and `sweepForgery` deleted it two seconds later while logging that the
  // founder had not written it. `installMenu` runs before this function exists,
  // which is why it did that; main/main.mts late-binds the door instead, and
  // tests/the-menu-answers-a-card-through-the-one-door.test.mts holds it.
  //
  // AND IT ANSWERS BOTH ENGINES, in two ways rather than one. A Claude Code
  // worker waits on the answer FILE, in another process, so the file is the
  // whole of its answer. A Codex worker waits on a promise inside THIS process
  // and is told directly: a worker that can write into the store root could
  // otherwise write itself an approval, and on this engine there is a channel
  // that cannot be forged, so that is the one its decision travels down
  // (main/codex-approvals.mts). The file is still written either way, because
  // it is what takes the card out of `listPending` and what the audit line is
  // made of.
  //
  // AND AN ANSWER THAT COULD NOT BE WRITTEN IS A DENY, NOT A SILENCE
  // (2026-09-04). `approvals.answer` is hardened now -- it will not write
  // through a link a worker planted at `<id>.answer.json`, and it removes
  // whatever is squatting the name instead -- so the only way it can still come
  // back false is a request that is no longer there (she answered it already)
  // or a spool that will not take a write at all. That second case used to
  // THROW, out of an ipc handler and out of the ⌘Y `before-input-event`
  // listener, which is worse than either outcome here. A Codex worker is parked
  // on a promise in this process, so it is told the refusal directly and
  // unblocks; a Claude Code worker has only the file, so it goes on waiting on
  // its own card, which stays on screen and answerable. Nothing on this
  // path can turn a failure into an allow, and the deny falls out of the SAME
  // two calls the yes does rather than a second door beside them: `allow` and
  // `note` stop meaning what she pressed the moment the write fails, and start
  // meaning what was actually recorded, which is what everything downstream of
  // here has to be told.
  //
  // AND HER PRESS IS BOUND TO THE CARD SHE READ, NOT TO ITS ID (2026-09-05).
  // The request file is worker-writable and a rewrite keeps the name and the id
  // while replacing the body, so "yes to <uuid>" was an allow for whatever the
  // engine happened to be holding. `approvals.cardShown` is the digest of what
  // was last drawn -- `answer` signs it, so the Claude Code worker's own server
  // can check it against the request IT is holding -- and `codexCardChanged` is
  // the same question asked of the engine holding its request in THIS process,
  // which is the only one that can be asked here. A yes on a card that moved
  // becomes a no, by the same rule and in the same place as a yes the spool
  // would not take: `allow` and `note` stop meaning what she pressed and start
  // meaning what was actually recorded.
  const answerApproval = (id: string, allow: boolean, note?: string) => {
    const shown = approvals.cardShown(config.storeRoot, id);
    if (allow && supervisor.codexCardChanged?.(id, shown)) {
      console.warn(`zero: approval ${id} was drawn from a request that has since been rewritten; the founder's Allow was for a different card and nothing has been allowed`);
      allow = false;
      note = CARD_CHANGED;
    }
    const ok = approvals.answer(config.storeRoot, id, allow, note);
    if (!ok) { allow = false; note = SPOOL_REFUSED; }
    const settled = supervisor.settleCodexApproval?.(id, allow, note) ?? false;
    if (!ok && settled) console.warn(`zero: approval ${id} could not be recorded in the spool; the worker waiting on it has been denied`);
    if ((ok || settled) && !window.isDestroyed()) {
      window.webContents.send('zero:approval-answered', { id, allow: !!allow });
    }
    return ok || settled;
  };

  // THE RENDERER'S ONLY WAY TO COUNT ANYTHING, and it cannot send: it hands a
  // name to the main process, which checks the name against her approved list
  // and attaches the properties itself. This is the reason there is no
  // analytics SDK in the renderer at all (a test fails the build if one
  // appears): a browser SDK autocaptures the text of what was clicked, and in
  // Agentbox that text is task titles. A NUMBER MAY RIDE WITH THE NAME, and only
  // a number (2026-10-06): which setup step was reached.
  ipcMain.handle('zero:onboarding-arm', () => analytics.onboardingArm?.() ?? 'classic');
  ipcMain.handle('zero:track', (_e, { name, count }: { name: string; count?: unknown } = {} as { name: string; count?: unknown }) => {
    if (!EVENT_NAMES.includes(name)) return false;
    onCount();
    return analytics.track(name, Number.isFinite(count) ? { count } : undefined);
  });

  // WHETHER A COUNT CAME FROM SETUP'S PRACTICE PROJECT, read off the project's
  // own flag rather than its name, so the walkthrough and real use part.
  const isPractice = (slug: string) => {
    try { return store.listProducts().some((p) => p.slug === slug && p.practice === true); } catch { return false; }
  };

  // THE THREAD ON SCREEN, WHICH IS WHOSE CARD IS IN FRONT. The rule itself is
  // shared/which-card-is-in-front.mts, because the chord and the Agents menu
  // answer in THIS process, ahead of the page: reading a different order from
  // the one on screen means ⌘Y allows a command nobody was reading.
  let looking: { product: string | null; id: string } | null = null;
  const pendingApprovals = () => cardsInFront(approvals.listPending(config.storeRoot), looking);
  // When each card was first sent to the window, so a chord in its first moment answers nothing (shared/card-settles.mts).
  const sentAt = new Map<string, number>();
  const sendingApprovals = () => {
    const cards = pendingApprovals();
    const now = Date.now();
    for (const id of [...sentAt.keys()]) if (!cards.some((c) => c.id === id)) sentAt.delete(id);
    for (const c of cards) if (!sentAt.has(c.id)) sentAt.set(c.id, now);
    return cards;
  };
  const cardSentAt = (id: string) => sentAt.get(id) ?? null;
  ipcMain.handle('zero:looking', (event, { product = null, id = null }: { product?: string | null; id?: string | null } = {}) => {
    // The window's own top frame and nothing else, the guard
    // `zero:refresh-usage` carries: this moves which card ⌘Y answers. A page
    // the app shows in a pane gets no preload and cannot reach here at all, so
    // this is the second lock.
    if (event?.senderFrame?.parent || (event?.sender && event.sender !== window.webContents)) return false;
    const next = id ? { product: product ?? null, id: String(id) } : null;
    if (next?.id === looking?.id && next?.product === looking?.product) return true;
    looking = next;
    // The snapshot carries the order, so the card only moves on a push.
    push();
    return true;
  });

  // From her phone the answer names the card it drew (main/phone-inbox.mts),
  // and a request rewritten since gets nothing.
  ipcMain.handle('zero:approve', (_e, { id, allow, note, card }: { id: string; allow: boolean; note?: string; card?: string }) => {
    if (card !== undefined && !approvals.cardStillShown(config.storeRoot, id, card)) return { ok: false, error: 'the card changed after your phone showed it, so nothing was allowed' };
    return { ok: answerApproval(id, allow, note) };
  });

  // AN AGENT ROW IS NOT A WORK ITEM. Rows for her Claude Code agents are drawn
  // in the same list as her work and carry the same shape, so every keystroke
  // the list already understands is aimed at them too. They belong to no
  // ledger, and a write against `agent:41234` would append a line to a real
  // product's work-items.jsonl for an item that does not exist. The renderer
  // does not offer those actions; this is the second lock, here because the
  // first one is a UI and UIs get edited.
  const isAgentRow = (id: unknown) => typeof id === 'string' && id.startsWith('agent:');

  // EVERY CLAUDE CODE AGENT ON THE MACHINE, minus the ones the app started itself.
  // It rides the snapshot because it is exactly the same kind of fact as the
  // rest of it — what is happening right now — and because a second poll would
  // be a second clock the two lists could disagree about. This call NEVER
  // blocks: it hands back the last measurement and asks for a fresh one in the
  // background (main/agents.mts), because measuring costs a quarter of a second
  // of subprocess and this is the thread the window is drawn on.
  // A newly-stuck agent should reach her without waiting for the renderer's
  // ten-second poll, and the reader only fires this when the list actually
  // changed rather than on every measurement.
  agents.setOnChange(push);

  // The moments she set on agents she is not ready for. Deferring one is about
  // her inbox and nothing else: no message is sent and no process is touched,
  // so this is a moment kept beside the reading rather than a write into
  // somebody else's terminal. See main/agent-schedule.mts.
  const agentSchedule = new AgentSchedule(config.storeRoot);

  // WHAT IS LEFT OF HER LIMIT. It rides the snapshot for the same reason
  // `restartNeeded` does: it changes WHILE the app is open, and the corner that
  // draws it is on every screen. Reading it costs twenty-five seconds, so
  // nothing here ever waits for it: the object answers instantly out of its
  // last measurement and refreshes itself behind the window
  // (main/claude-usage.mts).
  const usage = new ClaudeUsage({
    // Asked each time rather than captured, because Claude Code can be installed
    // while the app is running and the settings screen already promises that
    // works without a restart.
    bin: () => config.claudeBin ?? null,
    // The account marked In use, asked each time so a switch is read at once.
    account: () => supervisor.usageAccount(),
    onChange: () => {
      const reading = usage.peek();
      if (reading) supervisor.noteUsageReading(reading.profile, reading);
      push();
    },
  });

  ipcMain.handle('zero:refresh-usage', async (event, { engine = DEFAULT_ENGINE }: { engine?: string } = {}) => {
    if (event.senderFrame?.parent || (event.sender && event.sender !== window.webContents)) throw Error('Usage refresh is only available in the main app window.');
    // Codex is asked of this computer and not of OpenAI; main/codex-usage.mts
    // says why there is no explicit read.
    if (engine !== DEFAULT_ENGINE) {
      const reading = supervisor.refreshCodexUsage();
      return reading ? { ok: true, reading: { engine, ...reading } } : { ok: false, error: 'Codex has reported no usage on this computer yet.' };
    }
    const result = await usage.refreshNow();
    return result.reading ? { ...result, reading: { engine: DEFAULT_ENGINE, ...result.reading } } : result;
  });

  // Every Claude login's own reading, asked for only by the Settings page.
  const accountUsage = new AccountUsage({
    bin: () => config.claudeBin ?? null,
    env: () => supervisor._workerEnv(DEFAULT_ENGINE),
    onReading: (profile, reading) => supervisor.noteUsageReading(profile, reading),
    identity: (profile) => accountIdentity(profile === 'default' ? null : profile, { home: config.home }),
  });
  ipcMain.handle('zero:account-usage', async (event, { refresh = false, engine = DEFAULT_ENGINE }: { refresh?: boolean; engine?: string } = {}) => {
    if (event.senderFrame?.parent || (event.sender && event.sender !== window.webContents)) throw Error('Usage is only available in the main app window.');
    // Codex's are files on this computer, read on every ask.
    if (engine === 'codex') return { readings: supervisor.codexAccountUsage() };
    const profiles = effectiveProfiles(config.authProfiles, { home: config.home });
    // The cloud's logins too; a look takes a sandbox session, so the page is
    // not held for it and redraws off the snapshot when it lands.
    void supervisor.lookAtCloudLogins({ force: !!refresh });
    return { readings: await accountUsage.readAll(profiles.length ? profiles : ['default'], { refresh: !!refresh }) };
  });

  // Last readings only: the phone pass runs every minute and must never start
  // a `claude /usage` of its own (main/main.mts phoneSettings).
  const usageForPhone = () => {
    const current = usage.peek();
    const newer = <R extends { at?: number }>(a: R | null, b: R | null) => (!a ? b : !b ? a : (b.at ?? 0) > (a.at ?? 0) ? b : a);
    const profiles = effectiveProfiles(config.authProfiles, { home: config.home });
    const claude = (profiles.length ? profiles : ['default'])
      .map((profile) => newer(accountUsage.peek(profile), current?.profile === profile ? current : null))
      .filter(Boolean);
    let codex: unknown[] = [];
    try { codex = supervisor.codexAccountUsage(); } catch { /* no Codex reading */ }
    return { claude, codex };
  };

  // Agents this run has already counted. In memory on purpose: a fresh launch
  // seeing the same agent again is a fresh fact about the app being used.
  const seenAgents = new Set<string>();

  const liveAgents = () => {
    try {
      const live = agentSchedule.decorate(agents.listAgents({
        zeroPid: process.pid,
        sessionIds: Object.values(supervisor._liveSessions ?? {}).map((s) => s?.sessionId),
        products: store.listProducts(),
        claudeBin: config.claudeBin,
      }));
      // "An agent was seen", ONCE per agent per run of the app. This list is
      // rebuilt every few seconds, so counting it here without the set would
      // send one event per agent per tick, all day. The keys are only ever
      // compared in this process; nothing about an agent is sent with the
      // count, which carries no name, no path and no title.
      //
      // AND WHICH ENGINE IT WAS (w-1116fbb68a, 2026-10-08). This list is Claude
      // Code processes and only ever has been; a Codex conversation has no
      // process to find and is counted from main/codex-watch.mts instead. The
      // engine is what lets the two be read apart, and without it on this side
      // the Codex count would look like a drop in the Claude one.
      for (const agent of live) {
        const key = agentKey(agent);
        if (!key || seenAgents.has(key)) continue;
        seenAgents.add(key);
        analytics.track('agent_seen', { engine: 'claude' });
      }
      return live;
    } catch {
      // Her inbox is not allowed to fail because a `ps` did. An empty list here
      // reads as "no outside agents", which is the state of most machines.
      return [];
    }
  };

  /*
   * THE FOLDER THE NEXT SIGN IN BELONGS TO, for either coding agent.
     Remembered in main, not passed in from the window, because a terminal's
     working directory is the one thing the renderer must never get to choose:
     `resolve` is the only gate between a key and a shell, and every other key
     goes through a work item that has to exist. w-dc88147919.

     IT IS ONE VARIABLE FOR BOTH ENGINES because there is one settings terminal,
     so there is only ever one sign in going on. Adding a Claude account after a
     Codex one replaces the folder, and the shell the old one was holding is
     closed in the same breath. */
  let pendingLogin: string | null=null;

  const terminals=new TaskTerminals({resolve:key=>{
    const {product,id}=JSON.parse(key);
    /*
     * THE SETTINGS TERMINAL, which belongs to no task. There is exactly one of
       it and it opens in the folder main just made for the login; if nothing is
       pending it opens at home, which is where a shell with nothing to do
       belongs. */
    if(product===SETTINGS_TERMINAL.product&&id===SETTINGS_TERMINAL.id){
      return pendingLogin ?? config.home ?? os.homedir();
    }
    return taskPlace(product,id);
  }});
  const taskPlace=(product: string,id: string)=>{
    const agent=id.startsWith('agent:')?liveAgents().find(a=>'agent:'+a.pid===id && (a.product??'')===product):null;
    return terminalPlace({store,supervisor,product,id,agent});
  };
  /*
   * A TASK'S TERMINAL LIVES AS LONG AS THE TASK IS OPEN, in a process that
     outlives the app (main/terminal-host.mts). The sign-in terminal on
     Settings belongs to no task and stays in the app. */
  const taskTerminals=new TerminalHosts({local:terminals,logFile:path.join(supervisor.userDir,'terminal-host.log'),log:line=>console.warn(`zero: ${line}`)});
  // A task's folder is not deleted while its terminal is open (supervisor.mts, `_folderInUse`).
  supervisor.terminalOpen=itemId=>taskTerminals.hasTerminal(itemId);
  const lookAtTerminals=()=>taskTerminals.endClosed(taskClosed(store)).catch(e=>console.warn('zero: terminals:',e.message));
  void taskTerminals.ready().then(lookAtTerminals);
  setInterval(lookAtTerminals,60_000).unref?.();
  const agentUpdates=new AgentUpdates({
    installation:async engine=>{await lookAgainFor(engine,config);return installedAgent(engine,config);},
    refresh:async engine=>{await lookAgainFor(engine,config);await refreshAgentModels(engine,config,supervisor._codexOfferHomes());if(engine==='codex')for(const profile of supervisor._codexProfiles())supervisor._releaseIdleCodex(profile);},
  });
  ipcMain.handle('zero:agent-update',async(event,{engine,action}: {engine: string; action?: string}={} as {engine: string; action?: string})=>{
    if(event.senderFrame?.parent||(event.sender&&event.sender!==window.webContents))throw Error('Updates are only available in the main app window.');
    if(!['claude','codex'].includes(engine))throw Error('Unknown agent.');
    if(action==='check')return agentUpdates.check(engine);
    if(action==='recheck')return agentUpdates.check(engine,true);
    if(action==='start')return agentUpdates.start(engine);
    if(action==='status')return agentUpdates.status(engine);
    if(action==='refresh'){await refreshAgentModels(engine,config,supervisor._codexOfferHomes());return true;}
    throw Error('Unknown update action.');
  });
  let terminalQuitPending=false,terminalQuitReady=false;
  app.on('before-quit',event=>{
    if(terminalQuitReady||(!terminalQuitPending&&!terminals.sessions.size&&!(agentUpdates.terminals as UpdateTerminals & {sessions: Map<unknown,unknown>}).sessions.size))return;
    event.preventDefault();
    if(!terminalQuitPending){terminalQuitPending=true;void Promise.all([terminals.shutdown(),agentUpdates.shutdown()]).finally(()=>{terminalQuitReady=true;app.quit();});}
  });
  ipcMain.handle('zero:terminal',async(_event,payload: TerminalPayload={} as TerminalPayload)=>{
    if(_event.senderFrame?.parent || (_event.sender && _event.sender!==window.webContents)) throw Error('Terminal is only available in the main app window.');
    const {product,id,action,data,cols,rows,offset,wait}=payload;
    if(typeof product!=='string'||typeof id!=='string'||!id||id.length>300)throw Error('Invalid task.');
    const key=JSON.stringify({product,id});
    if(product==='@agent-update')return agentUpdates.terminal(id,payload);
    if(product===SETTINGS_TERMINAL.product&&id===SETTINGS_TERMINAL.id)switch(action){
      case 'open':return terminals.open(key);
      case 'read':return terminals.read(key,offset,wait);
      case 'write':terminals.write(key,data);return true;
      case 'resize':terminals.resize(key,cols,rows);return true;
      case 'close':terminals.close(key);return true;
      default:throw Error('Unknown terminal action.');
    }
    switch(action){
      case 'open':return taskTerminals.open(key,{...taskPlace(product,id),env:terminalEnv()});
      case 'read':return taskTerminals.read(key,offset,wait);
      case 'write':await taskTerminals.write(key,data);return true;
      case 'resize':await taskTerminals.resize(key,cols,rows);return true;
      case 'close':await taskTerminals.close(key);return true;
      default:throw Error('Unknown terminal action.');
    }
  });

  // The Done and All tabs' next page of finished threads the snapshot's 8 MB
  // read left out, asked for as she scrolls to their foot (main/store.mts).
  ipcMain.handle('zero:older-items', (_e, { offset = 0, limit = 50 }: { offset?: unknown; limit?: unknown } = {}) =>
    store.listOlderItems({ offset: Number(offset) || 0, limit: Math.min(Number(limit) || 50, 200) }));

  // IS ANYBODY ACTUALLY USING A SCREEN READER. Asked by the terminal pane
  // before it builds an xterm, because xterm's accessibility tree is what
  // `screenReaderMode` turns on and we used to turn it on for everybody.
  // Electron's own words beside this property: "Rendering accessibility tree
  // can significantly affect the performance of your app. It should not be
  // enabled by default." It also carried xterm's 'invalid range' bug to an
  // install that had no use for it (one crash report, 2026-10-08).
  //
  // Absent on Linux and before `ready`, where absent means no, and reading it
  // may not throw: this is on the path that opens a terminal, and a terminal
  // that cannot ask the question still has to open.
  ipcMain.handle('zero:assistiveTech', () => {
    try { return !!host.app?.accessibilitySupportEnabled; } catch { return false; }
  });

  // `ask.since` names the last answer the screen holds, and the threads that
  // did not change since are left out (shared/snapshot-delta.mts).
  const snapshots = snapshotSender();
  ipcMain.handle('zero:snapshot', (_e, ask?: { since?: string; open?: { id?: string; product?: string } | null }) => {
    const now = Date.now();
    const items = store.listItems(now);
    const running = supervisor.status(items);
    const engines = supervisor.engineFacts(items);
    // WHICH CODING AGENT THE CORNER IS ABOUT, ANSWERED ONCE, HERE.
    // `usageEngine` is the rule (shared/usage.mts) and it is the byline's own
    // -- what is running beats what would run -- asked about the app instead of
    // about a row.
    const usageFor = usageEngine({ workspace: engines.workspace, running: running.running });
    // ASKING IS THE BRANCH, WHICH IS WHY THIS IS NOT TWO READS AND A CHOICE.
    // `usage.read` starts a `claude -p /usage` child whenever its figure has
    // gone stale, so calling it on a snapshot whose corner is about Codex
    // spends twenty-five seconds of somebody's machine on a number nothing will
    // draw -- which is what a Codex-only workflow paid every five minutes until
    // now. The Codex side never starts anything at all (main/codex-usage.mts).
    const reading = usageFor === DEFAULT_ENGINE ? usage.read() : supervisor.codexUsage();
    const alpha = alphaFeatures(config, { onTeam: onTeamNow() });
    return snapshots.answer({
      products: store.listProducts(),
      // Each with the place she dragged it to, if she did (w-6e5b532a95).
      items: supervisor.withPlaces(items.filter((i) => !leftByAMove(i))),
      // THE TEAM: who is signed in, their team and its people, and the
      // title-free activity of their private work. Null on a build with no
      // team cloud, which is the single-person app.
      team: team ? teamForWindow(team.state(), alpha.multiplayer) : null,
      // Which alpha features are on (Settings, Alpha features).
      alpha,
      // TEAMMATES: who they are, what each is on, and the one team chat.
      teammates: alpha.teammates ? (() => { try { return store.teammatesView(items, now); } catch (err) { return { list: [], chat: [], runs: [], error: (err as Error).message }; } })() : null,
      agents: liveAgents(),
      // The open thread's own card first, which is the order the chord and the
      // Agents menu answer in too (shared/which-card-is-in-front.mts).
      approvals: sendingApprovals(),
      // A screen that says which thread it has open is sent only that thread's
      // live detail.
      supervisor: ask && 'open' in ask ? { ...running, running: lightRunning(running.running, ask.open) } : running,
      // WHETHER THERE ARE TWO CODING AGENTS TO CHOOSE BETWEEN, AND WHICH ONE
      // EACH ROW RUNS ON. Answered whole by the supervisor, because the two
      // rules underneath it -- the capability gate and "an August choice is not
      // a choice she is making now" -- are pinned to that one file, and a screen
      // that worked either of them out for itself could draw "Codex" over a row
      // about to run on Claude Code.
      //
      // It rides the snapshot rather than the settings model for the reason
      // `outsideAgents` does: the INBOX reads it, on every row, and the settings
      // model is only fetched while that screen is open. On a Mac with one
      // coding agent this is one entry and an empty map, and nothing anywhere
      // draws anything new.
      engines,
      // WHETHER THIS MAC WAS ALREADY SIGNED INTO SOMETHING (w-e217e577e5,
      // 2026-10-07), so the walk can say so once. A new user ran an agent and
      // could not tell where the tokens were coming from, because the app finds
      // whichever sign-in is already on the Mac and spends it in silence.
      //
      // It rides the snapshot rather than the settings model because the WALK
      // reads it, and the settings model is only fetched while the settings
      // screen is open. It costs no file read per tick: `main/runs-on.mts`
      // caches on the login files' own modification times, so this re-parses
      // only after a sign-in or a profile refetch.
      runsOn: supervisor.runsOnAccount(engines.workspace),
      // Whether this process is still the app on disk. It rides the snapshot
      // rather than boot-info because the staleness DEVELOPS while the app
      // runs: the case that cost her three times was a process left up for days
      // while fixes landed underneath it, and a boot-time check cannot see
      // that. See main/staleness.mts.
      restartNeeded: restartNeeded(supervisor.appDir),
      // WHERE THREADS RUN, for the cloud button beside the filters
      // (renderer/src/cloud-menu.ts). `setUp` false draws no button at all.
      cloud: supervisor.cloudStatus(items),
      // HER RATE LIMIT, WHICH IS WHAT ACTUALLY CAPS THE FLEET. Null until the
      // first reading lands, and the corner draws nothing at all until then
      // rather than a pill full of dashes.
      //
      // AND IT IS ONE AGENT'S LIMIT, NAMED (2026-09-05). One corner and one
      // dropdown, as before; what is new is that the reading says whose
      // subscription it is about, so the screen can say so too. The name is
      // still only DRAWN where this Mac has two agents to tell apart -- that
      // rule is `engineWordFor`'s, in renderer/src/byline.ts.
      usage: reading && { engine: usageFor, ...reading },
      usageByEngine: engines.choices.map(({ id }) => {
        const value = id === usageFor ? reading : id === DEFAULT_ENGINE ? usage.peek() : supervisor.codexUsage();
        return value ? { engine: id, ...value } : null;
      }).filter(Boolean),
      // WHETHER A NEWER AGENTBOX IS ALREADY DOWNLOADED AND WAITING. It rides the
      // snapshot for the same reason `restartNeeded` above does: it becomes
      // true WHILE the app is open, hours after boot, and the screens that
      // offer the restart are ones she may already be looking at. Settings
      // reads the whole of it; ⌘K reads `ready` alone.
      update: updater.state(),
      config: {
        // How many of her own Claude Code sessions the inbox takes. It rides
        // the snapshot rather than the settings model because the INBOX reads
        // it, and the settings model is only fetched while that screen is
        // open.
        outsideAgents: outsideAgentsMode(config),
        // WHAT AGENTS ARE ALLOWED TO DO, ON THE SNAPSHOT, so the reply box can
        // print it without opening the settings screen.
        //
        // It genuinely was not there: the only way in was a character you had
        // to already know to type. Claude Code's own answer to the same problem
        // is that the mode is printed in the status bar the entire time it is
        // on, so ours is printed on the reply footer the entire time, and this
        // is the value it prints when the message carries no opinion of its
        // own. Per PROJECT, because the mode a reply will run in depends on
        // which project the row belongs to: a project override wins over the
        // workspace, and a personal project runs its own list entirely. The
        // workspace answer is under the empty-string key, for a surface that
        // has no project in hand.
        permission: Object.fromEntries([
          ['', permissionMode(supervisor.defaultSessionArgs())],
          ...store.listProducts().map((p) => [p.slug, supervisor.effectivePermission(p.slug)]),
        ]),
      },
    }, ask?.since);
  });

  // THE USER'S WORDS, INTO ONE OF THEIR LIVE AGENTS. The only thing in the app that writes
  // anywhere outside its own store, and it writes into a socket rather than to
  // disk. The reader refuses a send to an agent frozen on a permission box, and
  // reports back whether the agent actually moved rather than assuming it did.
  ipcMain.handle('zero:agent-reply', async (_e, { pid, text }: { pid: unknown; text: string }) => {
    try {
      const out = await agents.reply(Number(pid), text);
      // AND THE ROW REMEMBERS THAT THE USER SPOKE. Only on a delivered message: a
      // mark written for a send that failed would move the row into In progress
      // over words that never arrived, which is the failure this codebase cares
      // about most. It does now, until the session stops. AND WHAT THE USER
      // TYPED, not only that they typed. Claude Code marks a message arriving over
      // its socket as machine chatter (`isMeta`), so the transcript reader drops
      // it and the user's own sentence never reached the card: the row went on
      // saying only what the session was started with days before. This is the
      // only process that knows the user said it, so this is where it is written.
      //
      // AND IT IS A REPLY, SO IT IS COUNTED (w-1116fbb68a, 2026-10-08). A reply
      // on a task has always sent `reply_sent`; one typed into a live session
      // sent nothing at all, and activation is read as three real replies to
      // agents in the first day, so the people who talk to their own sessions
      // rather than through a row were missing from it. `kind` says which of
      // the two this was. It waits on the same delivery the mark does, and for
      // the same reason: a count for words that never arrived would read as
      // activation nobody had.
      if (out?.ok) {
        if (out.key) agentSchedule.replied(out.key, out.at ?? Date.now(), Date.now(), String(text ?? ''));
        analytics.track('reply_sent', { kind: 'agent' });
      }
      push();
      return out;
    } catch {
      return { ok: false, reason: 'The message could not be handed over.' };
    }
  });

  // AND UNDOING ONE. Withdrawing a reply cannot un-send the message — it is in
  // somebody else's terminal — so this is honest about what it does: it takes
  // the row out of In progress and puts it back where it was. The session is
  // not touched, exactly as with deferring or closing one.
  ipcMain.handle('zero:unreply-agent', (_e, { key }: { key?: unknown }) => {
    const mark = agentSchedule.replied(String(key ?? ''), 0);
    push();
    return { ok: true, repliedAt: mark };
  });

  // For the agent a reply cannot reach: bring the app it is running inside to
  // the front. Named honestly, because it is the app and not the pane.
  ipcMain.handle('zero:agent-reveal', async (_e, { pid }: { pid: unknown }) => {
    try {
      return await agents.reveal(Number(pid));
    } catch {
      return { ok: false, reason: `${Name} cannot tell which window it is running in.` };
    }
  });

  // HER BUTTON: what the two of them actually said, read off the transcript she
  // already has, only when she presses it. No model, nothing sent, nothing
  // written. It is streamed inside the reader because the biggest transcript on
  // this machine is 160MB.
  ipcMain.handle('zero:agent-conversation', async (_e, payload?: ConversationInput & { startedAt?: number }) => {
    try {
      // Her replies from Agentbox ride in beside the transcript for the same
      // reason the card needs them: they are not IN the transcript as hers.
      // The key is DERIVED here rather than sent, because what identifies an
      // agent is a rule with one copy of it (shared/agents.mts) and the
      // renderer already hands over both halves it needs.
      const key = agentKey({ sessionId: payload?.sessionId as string | undefined, pid: Number(payload?.pid), startedAt: payload?.startedAt });
      return await agents.conversation({ ...(payload ?? {}), spoke: agentSchedule.spoke(key) });
    } catch {
      return { ok: false, reason: 'That conversation could not be read.' };
    }
  });

  ipcMain.handle('zero:dashboard', (_e, slug: string) => {
    try {
      return store.readDashboard(slug);
    } catch {
      return null;
    }
  });

  ipcMain.handle('zero:command-catalog', (_e, { product, id }: { product: string; id: string }) => supervisor.commandCatalog(product, id));
  ipcMain.handle('zero:remote-control', (_e, {product,id,action}: { product: string; id: string; action: Parameters<Supervisor['remoteControl']>[2] }) => supervisor.remoteControl(product,id,action));
  ipcMain.handle('zero:command', (_e, { product, id, text }: { product: string; id: string; text: Parameters<Supervisor['commandItem']>[2] }) => supervisor.commandItem(product, id, text));
  ipcMain.handle('zero:compact', (_e, { product, id }: { product: string; id: string }) => supervisor.compactItem(product, id));
  ipcMain.handle('zero:compaction-status', (_e, { product, id }: { product: string; id: string }) => supervisor.compactionStatus(product, id));

  // Send now: cut the running agent's current step so her waiting message is
  // answered at once (supervisor.sendNow).
  ipcMain.handle('zero:send-now', (_e, { product, id }: { product: string; id: string }) => supervisor.sendNow(product, id));

  ipcMain.handle('zero:answer', async (_e, { product, id, answer, status, priority, permissionMode, engine, model, effort, now, inReplyTo, fromPhone, closeUnshipped, runAt, putAway }: AnswerInput & { product: string; id: string; now?: unknown; inReplyTo?: unknown; closeUnshipped?: boolean; runAt?: number; putAway?: unknown }) => {
    if (isAgentRow(id)) return { ok: false };
    // Out of your own Needs you, on a task between people: no reply, no close, no run.
    if (typeof putAway === 'boolean' && !answer && !status) {
      const out = store.answerItem(product, id, { putAway });
      push();
      return out;
    }
    // WORK THAT NEVER REACHED MAIN IS NOT CLOSED UNASKED (shared/not-shipped.mts).
    // The window asks first and says so with `closeUnshipped`; the phone and
    // anything else are turned down with the reason.
    if (status === 'done' && product && id) {
      let row = null;
      try { row = store.readItem(product, id); } catch { row = null; }
      const refused = closeRefusal(row, { closeUnshipped });
      if (refused) return refused;
      const said = closeUnshipped ? closedAnywayNote(row) : null;
      if (said) store.noteItem(product, id, said);
    }
    // A level picked from ⌘K arrives here with no words, and gives way the
    // same as one picked on the summary (zero:thread-edit). A reply that
    // happens to carry its row's level does not.
    if (priority != null && !answer && id) supervisor.setThreadPlaces({ [id]: null });
    // CLOSING A THREAD IS THE END OF WHAT IT WAS PINNED FOR (w-20323283e6).
    if (id && status === 'done') supervisor.setThreadPins({ [id]: null });
    // A REPLY IN A THREAD (w-920461cbe6) only means something in a conversation
    // between people, which is the only place a thread is drawn and the only
    // record the mark crosses to a teammate in (shared/team-rules.mts). Anywhere
    // else it is dropped and the words go in as an ordinary reply.
    const thread = typeof inReplyTo === 'string' && inReplyTo && productOf(product)?.team?.direct ? inReplyTo : undefined;
    // A CODEX CONVERSATION'S YES OR NO NEVER REACHES A WORKER. The row asking
    // whether to import one is answered by the app itself: yes makes it a row
    // she can read, no parks it in Closed under Not imported, and Import on a
    // parked one is the same yes. Any other reply on such a row falls through
    // to the ordinary path, exactly as before.
    if (product && id) {
      let row = null;
      try { row = store.readItem(product, id); } catch { row = null; }
      if (row && (isCodexImportRow(row) || isNotImportedRow(row))) {
        const choice = importChoice(answer);
        if (choice) {
          let thread = null;
          if (choice === 'yes') {
            try {
              const { codexDirs } = appSessionFolders({ config, supervisor });
              thread = (await readCodexThreadsOffThread({ codexDirs })).threads.find((t) => t.id === codexIdOf(row)) ?? null;
            } catch { thread = null; }
          }
          const out = store.answerCodexImport(product, id, choice, { thread });
          push();
          return out;
        }
      }
    }
    // ARCHIVING ENDS THE WORK, not just the row. Her archive now outranks
    // anything a straggler writes (shared/work-items.mts, authorityOf), but a
    // worker left running on work she has ended is still burning her plan on
    // it, so it stops here rather than being merely overruled.
    if (status === 'done') supervisor.stopSession(id);
    // THE MODEL IS WRITTEN BEFORE THE REPLY IS SUBMITTED, deliberately. A reply
    // on an idle row starts a run, and that run reads the model off the item;
    // handing them over in one call and writing the model afterwards would be a
    // race the run usually wins, so she would pick a model and watch the old one
    // take the task. `answerItem` writes both, and it writes the model first.
    // A REPLY SET FOR LATER is these words with the row set for its time. The
    // time goes in after the words, so it is newer than them: a word said after
    // a thread's moment runs now (shared/answers.mts wordWaits), and this one
    // must wait. Both writes are one synchronous step, so no pass reads between.
    const later = Number(runAt) > Date.now() && status !== 'done';
    const withNotes = product && id && !later && status !== 'done'
      ? replyWithWaitingNotes({ store, product, id, answer, me: teamMe(), nameOf: noteBy, people: teamPeople() })
      : null;
    const out = await submitReply(supervisor,{product,id,answer:withNotes?.answer ?? answer,status,permissionMode,now:!!now,later},()=>{
      const said = withNotes
        ? store.answerItem(product, id, { answer: withNotes.answer, fromNotes: withNotes.fromNotes, typed: answer as string, status, priority, permissionMode, engine, model, effort, inReplyTo: thread, fromPhone })
        : store.answerItem(product, id, { answer, status, priority, permissionMode, engine, model, effort, inReplyTo: thread, fromPhone });
      if (withNotes) store.fileMark(product, id, { do: 'sent', on: withNotes.fromNotes });
      if (later) store.scheduleItem(product, id, Number(runAt));
      return said;
    });
    // A REPLY ON A ROW A TEAMMATE GAVE YOU HANDS IT BACK TO THEM, so the
    // conversation moves to their inbox instead of sitting in both
    // (shared/team-rules.mts handedOnByReply). Archiving hands nothing on.
    if (team && status !== 'done' && typeof answer === 'string' && answer.trim()) handOnByReply(product, id);
    // THAT the user replied and THAT something finished. Never a word of either:
    // in Agentbox the answer IS the prompt (privacy page, section 4).
    if (typeof answer === 'string' && answer.trim()) analytics.track('reply_sent', { practice: isPractice(product) });
    if (status === 'done') analytics.track('task_finished', { practice: isPractice(product) });
    // HER REPLY IS THE OTHER HALF OF THE SAME WAIT, and it is the one she pays
    // on every round trip rather than once: measured 2026-08-24, median 9.1
    // seconds between pressing the key and the continuation being spawned.
    // Archiving is the one answer that starts nothing, and its session was
    // just killed above, so there is nothing to wake for.
    if (status !== 'done') { supervisor.liftBrakeForHer?.(); supervisor.wake(); }
    return out;
  });

  // The product order: the founder's standing running order over her
  // companies, most important first. Persisted in the supervisor's state;
  // agents never set this. The renderer sends the WHOLE order rather than one
  // move, because a drag already knows the finished arrangement, and a move
  // would need both sides to agree about indices only one of them can see.
  ipcMain.handle('zero:set-product-order', (_e, { order }: { order: string[] }) => {
    supervisor.setProductOrder(order);
    return supervisor.status();
  });

  // A THREAD DRAGGED TO A PLACE OF ITS OWN in the list (w-6e5b532a95): the
  // places the drop worked out (`dropPlaces`, shared/rank.mts), id to number.
  ipcMain.handle('zero:set-thread-places', (_e, { places }: { places: Record<string, number | null> }) => {
    supervisor.setThreadPlaces(places);
    push();
    return { ok: true };
  });

  // THREADS KEPT ON THIS MAC whatever the cloud is set to: id to true, or null.
  ipcMain.handle('zero:set-thread-on-mac', (_e, { onMac }: { onMac: Record<string, boolean | null> }) => {
    supervisor.setThreadOnMac(onMac);
    push();
    return { ok: true };
  });

  // RUNS ON THIS MAC TO MOVE TO THE CLOUD, by id.
  ipcMain.handle('zero:move-to-cloud', (_e, { ids }: { ids: string[] }) => {
    const out = supervisor.moveToCloud(ids);
    push();
    return out;
  });

  // PINNED THREADS (w-20323283e6): id to true, or null to unpin.
  ipcMain.handle('zero:set-thread-pins', (_e, { pins }: { pins: Record<string, boolean | null> }) => {
    supervisor.setThreadPins(pins);
    push();
    return { ok: true };
  });

  // Hidden from the composer's picker and nothing else: a hidden product still
  // ranks, still spawns workers, and its work still reaches the inbox.
  ipcMain.handle('zero:set-product-hidden', (_e, { product, hidden }: { product: string; hidden: boolean }) => {
    supervisor.setProductHidden(product, hidden);
    return supervisor.status();
  });

  // WHO IS SIGNED IN, and the project a row is in, for the team's rules.
  const teamMe = () => team?.state()?.me?.id ?? null;
  const noteBy = (by: string | null) => team?.firstNameOf?.(by) || 'the person writing to you';
  const teamPeople = () => team?.state?.()?.people ?? [];
  const productOf = (slug: string) => store.listProducts().find((p) => p.slug === slug) ?? null;

  function handOnByReply(product: string, id: string) {
    try {
      const row = store.readItem(product, id);
      const next = row && handedOnByReply(row, productOf(product), teamMe());
      if (next) store.teamPatch(product, id, { assignee: next });
    } catch (err) {
      console.warn(`team: could not hand ${id} on: ${(err as Error).message}`);
    }
  }

  // FEEDBACK, from the card the sidebar's Feedback row opens (w-1b574413db).
  // main/feedback.mts decides where it goes and whether it may; the version
  // and the macOS release ride along so a report can be matched to a build.
  ipcMain.handle('zero:send-feedback', async (_e, { text, files }: { text?: string; files?: { name: string; type: string; data: string }[] } = {}) => sendFeedback({
    url: feedbackUrl(config),
    payload: feedbackPayload({ text, files, app: { version: app.getVersion(), os: `${process.platform} ${os.release()}`, install: analytics.installId } as { version?: string; os?: string } }),
  }));

  // THE TEAM'S DOORS. Each answers { ok, team } or { ok: false, error } with
  // the error in words, so the window can say what went wrong where it
  // happened instead of a row silently not appearing.
  const teamNow = () => teamForWindow(team!.state(), alphaFeatures(config).multiplayer);
  const teamCall = <A,>(fn: (arg: A) => unknown) => async (_e: IpcEvent, arg?: unknown) => {
    if (!team) return { ok: false, error: 'This build has no team cloud set up.' };
    try {
      const got = await fn((arg ?? {}) as A) as { id?: unknown; product?: unknown } | undefined;
      push();
      // A call that wrote a row (a message, into its conversation) says which,
      // so the toast after it can open it with O (w-5513afd09a).
      const wrote = typeof got?.id === 'string' && typeof got?.product === 'string';
      return { ok: true, team: teamNow(), ...(wrote ? { made: { product: got.product, id: got.id } } : {}) };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err), team: teamNow() };
    }
  };
  // Signing in finishes in the browser, so the app comes back to the front
  // when it lands rather than leaving the person to find it.
  ipcMain.handle('zero:team-sign-in', teamCall(async () => {
    await team!.signIn();
    try { if (window?.isMinimized?.()) window.restore?.(); window?.show?.(); app?.focus?.({ steal: true }); } catch { /* no window to raise */ }
  }));
  ipcMain.handle('zero:team-sign-in-cancel', teamCall(() => team!.cancelSignIn()));
  ipcMain.handle('zero:team-sign-in-reopen', teamCall(() => team!.reopenSignIn()));
  ipcMain.handle('zero:team-sign-out', teamCall(() => team!.signOut()));
  ipcMain.handle('zero:team-sign-in-email', teamCall(({ email, password }: { email: string; password: string }) => team!.signInWithEmail(email, password)));
  // Its own door, because it has one more thing to say: whether the account
  // waits on the link in its confirmation email.
  ipcMain.handle('zero:team-sign-up', async (_e, { email, password, name }: { email: string; password: string; name: string } = {} as { email: string; password: string; name: string }) => {
    if (!team) return { ok: false, error: 'This build has no team cloud set up.' };
    try {
      const out = await team.signUp(email, password, name);
      push();
      return { ok: true, team: teamNow(), confirm: !!out?.confirm };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err), team: teamNow() };
    }
  });
  ipcMain.handle('zero:team-create', teamCall(({ name }: { name: string }) => team!.createTeam(name)));
  // An invite answered yes. Nothing else joins a team.
  ipcMain.handle('zero:team-accept-invite', teamCall(({ teamId }: { teamId: string }) => team!.acceptInvite(teamId)));
  ipcMain.handle('zero:team-invite', teamCall(({ email }: { email: string }) => team!.invite(email)));
  ipcMain.handle('zero:team-rename', teamCall(({ name }: { name: string }) => team!.renameTeam(name)));
  ipcMain.handle('zero:team-remove-member', teamCall(({ personId, handTo, mates }: { personId: string; handTo?: unknown; mates?: unknown }) => team!.removeMember(personId, { handTo: typeof handTo === 'string' ? handTo : null, mates: Array.isArray(mates) ? mates : [] })));
  ipcMain.handle('zero:team-leave', teamCall(() => team!.leaveTeam()));
  ipcMain.handle('zero:team-cancel-invite', teamCall(({ email }: { email: string }) => team!.cancelInvite(email)));
  // A line you write about yourself, so a day in meetings is not read off
  // the Team page as idleness.
  ipcMain.handle('zero:team-status', teamCall(({ text, hold, until }: { text: string; hold?: string; until?: number }) => team!.setStatus({ text, hold, until })));
  ipcMain.handle('zero:team-share', teamCall(({ product, visibility, people }: { product: string; visibility?: string; people?: string[] }) => team!.share(product, { visibility, people })));
  ipcMain.handle('zero:team-sync', teamCall(() => team!.syncNow()));
  ipcMain.handle('zero:team-thread-work', (_e, { personId, threadId }: { personId: string; threadId: string } = {} as { personId: string; threadId: string }) => team?.threadWork(personId, threadId) ?? { shared: false, lines: [], earlier: 0, product: null, dir: null });
  ipcMain.handle('zero:team-comment', teamCall(({ personId, threadId, text }: { personId: string; threadId: string; text: string }) => team!.commentOnThread(personId, threadId, text)));
  // Seeds a thread of your own; it runs only once you send it, on this Mac.
  ipcMain.handle('zero:team-continue-brief', (_e, { personId, threadId }: { personId: string; threadId: string } = {} as { personId: string; threadId: string }) => {
    if (!team) throw new Error('This build has no team cloud set up.');
    return team.continueBrief(personId, threadId);
  });
  ipcMain.handle('zero:team-continued', teamCall(({ personId, threadId }: { personId: string; threadId: string }) => team!.continuedThread(personId, threadId)));
  // A MESSAGE TO A PERSON (approved 2026-10-01: people get messages, never
  // tasks). main/team/index.mts keeps it between the two of them.
  ipcMain.handle('zero:team-message', teamCall(({ to, body, priority, files, subject }: { to: string; body: string; priority?: number; files?: AttachmentFile[]; subject?: string }) => team!.message(to, body, priority, files, { subject })));
  // A mark only: nothing on screen changes, so the window is not pushed again.
  ipcMain.handle('zero:team-seen', async (_e, { product, id }: { product: string; id: string } = {} as { product: string; id: string }) => { try { return await team?.seen(product, id) ?? false; } catch { return false; } });
  ipcMain.handle('zero:team-move-to-thread', teamCall(({ product, id, on }: { product: string; id: string; on: unknown }) => team!.moveToThread({ product, id, on })));
  ipcMain.handle('zero:team-message-mate', teamCall(({ owner, mate, text }: { owner: string; mate: string; text: string }) => team!.messageMate({ owner, mate, text })));
  ipcMain.handle('zero:team-give-task', teamCall(({ to, title, body, priority, due, files, visibility, visibleTo, blockedBy }: { to: string; title?: string; body?: string; priority?: number; due?: unknown; files?: AttachmentFile[]; visibility?: string; visibleTo?: string[]; blockedBy?: unknown }) => team!.giveTask(to, { title, body, priority, due, files, visibility, visibleTo, blockedBy })));
  // Only a thread nothing is running on: closing one with an agent on it would
  // leave that agent writing into a thread its owner has given away.
  ipcMain.handle('zero:team-hand-on', teamCall(async ({ product, id, to }: { product: string; id: string; to: string }) => {
    if (supervisor.status().running?.some((r) => r.itemId === id)) throw new Error('An agent is still on this thread. Stop it, then give it.');
    const made = await team!.handOn({ product, id, to });
    supervisor.setThreadPins({ [id]: null });
    return made;
  }));
  ipcMain.handle('zero:team-task-brief', (_e, { product, id }: { product: string; id: string }) => {
    if (!team) throw new Error('This build has no team cloud set up.');
    return team.taskBrief(product, id);
  });
  // ROOMS (alpha): one door, and only these calls through it (main/team/rooms.mts).
  ipcMain.handle('zero:teammates', async (_e, { op, args = {} } = {}) => {
    const mates = store.teammates;
    if (!mates) return { ok: false, error: 'Teammates need a store.' };
    if (!TEAMMATE_OPS.has(op as string)) return { ok: false, error: `no teammates call named ${op}` };
    if (!alphaFeatures(config).teammates) return { ok: false, error: 'Teammates are an alpha feature. Turn them on in Settings, Alpha features.' };
    try {
      const a = (args && typeof args === 'object' ? args : {}) as TeammateArgs;
      const kill = (id: string) => supervisor.stopSession(id);
      let value: unknown;
      if (op === 'create') {
        value = mates.create({ ...a, engine: supervisor.engineOffered(a.engine) ?? null });
        if (a.start !== false) value = mates.start((value as { id: string }).id);
      } else if (op === 'describe') value = mates.describe({ ...a, engine: supervisor.engineOffered(a.engine) ?? null });
      else if (op === 'start') value = mates.start(a.id);
      else if (op === 'update') value = mates.update(a.id, { ...a.patch, ...(a.patch && 'engine' in a.patch ? { engine: supervisor.engineOffered(a.patch.engine) ?? null } : {}) });
      else if (op === 'stop') value = mates.stop(a.id, { kill });
      else if (op === 'remove') value = mates.remove(a.id, { kill });
      else if (op === 'post') value = mates.post({ text: a.text, to: a.to, fresh: a.fresh === true, answers: a.answers, filesIn: a.filesIn, priority: a.priority });
      else if (op === 'goAhead') value = mates.goAhead(a.id, a.ref);
      else if (op === 'remember') value = mates.remember(a.id, a.text, { from: 'you' });
      else if (op === 'forget') value = mates.forget(a.id, a.memory);
      else if (op === 'method') return { ok: true, value: mates.method(a.id) };
      else if (op === 'unsend') value = mates.unsend(String(a.id ?? ''));
      supervisor.wake?.();
      push();
      return { ok: true, value: value ?? null };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  });
  ipcMain.handle('zero:rooms', async (_e, { op, args = [] }: { op?: string; args?: unknown } = {}) => {
    const rooms = team?.rooms;
    if (!rooms) return { ok: false, error: 'This build has no team cloud set up.' };
    if (!ROOM_OPS.has(op as RoomOp)) return { ok: false, error: `no room call named ${op}` };
    try {
      const value = await (rooms as RoomCalls)[op as RoomOp](...(Array.isArray(args) ? args : [args]));
      push();
      return { ok: true, value: value ?? null, rooms: rooms.state() };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err), rooms: rooms.state() };
    }
  });
  // AN EDIT TO A THREAD, MADE IN PLACE from its summary: the summary's lines,
  // who sees it, its priority and what it is linked to. Works with or without a
  // team, since every thread has a summary.
  ipcMain.handle('zero:thread-edit', (_e, { product, id, patch }: { product: string; id: string; patch?: { priority?: number | null; [field: string]: unknown } }) => {
    try {
      store.threadEdit(product, id, patch);
      // PICKING A LEVEL IS THE NEWER WORD on where a thread goes, so a place
      // it was dragged to gives way and it sorts by its level again.
      if (patch?.priority != null) supervisor.setThreadPlaces({ [id]: null });
      push();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  });
  // MOVE A THREAD TO ANOTHER PROJECT (main/move-thread.mts).
  ipcMain.handle('zero:move-item', async (_e, { product, id, to }: { product: string; id: string; to: string }) => {
    try {
      const out = await moveThread({
        store,
        isRunning: (itemId) => supervisor.status().running.some((r) => r.itemId === itemId),
        stopSession: (itemId) => supervisor.stopSession(itemId),
        changedCode: (slug, itemId) => {
          const prod = store.listProducts().find((p) => p.slug === slug);
          let folder = null;
          try { folder = prod?.repoPath ? taskFolderPath(supervisor.productFolder(prod), itemId) : null; } catch { folder = null; }
          const stands = folder && fsWatch.existsSync(folder) ? whereTheWorkStands(folder) : null;
          return !!(stands?.committed || stands?.uncommitted);
        },
      }, { product, id, to });
      push();
      if (out.ok) supervisor.wake();
      return out;
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  });

  // A TASK A TEAMMATE GAVE YOU, ROUTED WITH ONE KEY. To an agent: it runs on
  // your Mac (you become its runner). Keep it: it stays yours and the routing
  // choices go away. Hand it back: it returns to whoever gave it to you.
  ipcMain.handle('zero:team-route', teamCall(({ product, id, route }: { product: string; id: string; route: string }) => {
    const me = teamMe();
    if (!me) throw new Error('sign in first');
    const row = store.readItem(product, id);
    if (!row) throw new Error('that task is gone');
    if (row.assignee !== me) throw new Error('this task is not yours to route');
    // It stays yours: an agent works it from a new thread of yours (TeamFocus.tsx).
    if (isGivenTask(row, productOf(product))) throw new Error('give this task to an agent from a new thread');
    if (route === 'agent') store.teamPatch(product, id, { assignee: 'agent', runner: me });
    else if (route === 'me') store.teamPatch(product, id, { assignee: me });
    else if (route === 'back') {
      const to = ((row.people ?? []) as string[]).find((p) => p !== me) || row.createdBy as string;
      if (!to || to === me) throw new Error('there is nobody to hand it back to');
      store.teamPatch(product, id, { assignee: to });
    } else throw new Error(`unknown route ${route}`);
    supervisor.wake();
  }));

  // PUT A REACTION ON ONE MESSAGE, OR TAKE YOURS BACK (w-560647d4db). Only in a
  // conversation between people, because a chip is only ever drawn in one: the
  // sync carries a reaction across in a message record and nowhere else
  // (shared/team-rules.mts), so one written anywhere else would sit on this Mac
  // alone and look to its author like it had reached somebody.
  ipcMain.handle('zero:team-react', teamCall(async ({ product, id, on, emoji, off }: { product: string; id: string; on: string; emoji: string; off?: boolean }) => {
    const me = teamMe();
    if (!me) throw new Error('sign in first');
    const row = store.readItem(product, id);
    if (!row) throw new Error('that conversation is gone');
    const here = store.listProducts().find((p) => p.slug === product);
    if (!here?.team?.direct) throw new Error('reactions are for a conversation with a teammate');
    store.react(product, id, { on, emoji, off });
    await team!.syncNow();
  }));

  // A note, resolve or approval on a file of your own thread or a conversation.
  // Works with nobody signed in: a comment for your own agent needs no team.
  ipcMain.handle('zero:file-mark', async (_e, { product, id, mark }: { product: string; id: string; mark?: unknown } = {} as { product: string; id: string; mark?: unknown }) => {
    try {
      if (!store.readItem(product, id)) return { ok: false, error: 'that thread is gone' };
      store.fileMark(product, id, mark);
      push();
      void team?.syncNow?.()?.catch?.(() => {});
      try { await noteToItsAgent({ store, supervisor, product, id, mark: mark as Mark, nameOf: noteBy, people: teamPeople() }); }
      catch (err) { return { ok: false, error: `The note is saved, but it did not reach the agent: ${(err as Error)?.message ?? err}` }; }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  });
  // An edited document, as the next version of itself. In a conversation it goes
  // as a message, which is what carries a file to the other person; elsewhere as
  // a mark, which starts nothing.
  ipcMain.handle('zero:file-new-version', async (_e, { product, id, path: basePath, text, since }: { product: string; id: string; path: string; text: string; since?: unknown } = {} as { product: string; id: string; path: string; text: string; since?: unknown }) => {
    try {
      const out = filesPlaceNow().editOnThread({ product, id, path: basePath, text, since });
      if (!out.ok) return out;
      push();
      void team?.syncNow?.()?.catch?.(() => {});
      return out;
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  });
  // The same on a teammate's thread: kept here, then sent to the cloud.
  ipcMain.handle('zero:team-mark-file', teamCall(({ personId, threadId, mark }: { personId: string; threadId: string; mark: unknown }) => team!.markSharedFile(personId, threadId, mark)));

  // 'granted', or 'settings' once macOS's Microphone page has been opened instead.
  ipcMain.handle('zero:mic-access', async () => {
    try { return host.micAccess ? await host.micAccess() : 'granted'; } catch { return 'settings'; }
  });

  // EDIT OR DELETE A MESSAGE YOU SENT TO A TEAMMATE, in a conversation only,
  // for the same reason as a reaction above.
  ipcMain.handle('zero:team-edit', teamCall(async ({ product, id, on, text, gone }: { product: string; id: string; on: string; text?: string; gone?: boolean }) => {
    if (!teamMe()) throw new Error('sign in first');
    if (!store.readItem(product, id)) throw new Error('that conversation is gone');
    const here = store.listProducts().find((p) => p.slug === product);
    if (!here?.team?.direct) throw new Error('only a message to a teammate can be edited');
    if (!gone && !String(text ?? '').trim()) throw new Error('a message needs words; delete it instead');
    store.editMessage(product, id, { on, text, gone: gone === true });
    await team!.syncNow();
  }));

  ipcMain.handle('zero:compose', (_e, { product, title, body, kind, priority, runAt, start, labels, engine, model, effort, assignee, due, visibility, visibleTo, fromPhone, onMac }: ComposeInput & { product: string; onMac?: unknown }) => {
    const out = store.composeItem(product, {
      // HOW HARD IT THINKS rides through unjudged: the store keeps any word
      // shaped like a level, and the spawn is the gate that knows each
      // engine's real list (`Supervisor#spawnPlan` for Claude Code,
      // `codexEffortRefusal` for Codex).
      title, body, kind, priority, runAt, start, labels, effort,
      // WHO DOES IT, when it is a person (the team version): the teammate it
      // goes to and the day it is due, and the two of you as the conversation,
      // so a reply can hand it back. An agent's row carries none of these.
      assignee, due, visibility: visibilityWhenMade(visibility, alphaFeatures(config).multiplayer),
      // AND WHO MAY SEE IT, when she chose people rather than the team
      // (w-41ff964775). The store keeps the list only beside 'people'.
      visibleTo,
      // The phone command that asked for it (main/phone-inbox.mts).
      fromPhone,
      people: assignee && teamMe() ? [teamMe(), assignee] : undefined,
      // WHICH CODING AGENT SHE CHOSE, AND ONLY IF SHE COULD HAVE. `engineOffered`
      // is the supervisor's own test and the door makes no judgement of its own:
      // it answers null on any Mac where the picker is not drawn, so a renderer
      // left open across a config change cannot write a choice she was never
      // shown. This argument used to be forwarded straight through and
      // `composeItem` dropped it in silence.
      engine: supervisor.engineOffered(engine),
      // AND THE MODEL GOES WITH IT, which it did not: `model` was forwarded raw
      // beside a refused engine, so the row was filed carrying the other
      // harness's slug and no engine to explain it -- a row the cross-harness
      // guard downstream cannot even see. `modelOffered` says why the two
      // fields cannot be corrected separately.
      model: supervisor.modelOffered(engine, model),
    });
    // Before the wake below, so its first run cannot start in the cloud.
    if (onMac === true && out?.id) supervisor.setThreadOnMac({ [out.id]: true });
    // A real thread ends the walk's hold on agents (`Supervisor#sentByThem`).
    supervisor.sentByThem(labels);
    // THAT a task was written, and whether in practice. Never its words.
    analytics.track('task_written', { practice: isPractice(product) });
    // AND LOOK AT IT NOW. Composing used to write the line and stop, so the
    // task sat in the store until the next fifteen second tick: measured
    // 2026-08-24, median 7.0 seconds and up to 15.0 before the spawn was even
    // attempted. A row scheduled for later is not woken for, because it is not
    // due; the timer is what serves those.
    // Nothing to wake for a thread added to Later: it starts when she says.
    if (start !== 'later' && (!runAt || runAt <= Date.now())) supervisor.wake();
    return out;
  });

  // HER PICK OF WHO TAKES A THREAD: the answer when Auto asked, or giving one
  // to someone else after (shared/auto-route.mts). `to` is 'agent' or one of
  // her teammates as 'mate:<id>'; anyone else is refused rather than written.
  ipcMain.handle('zero:route-thread', (_e, { product, id, to }: { product: string; id: string; to: string }) => {
    const item = store.readItem(product, id);
    if (!item) throw new Error('that thread is gone');
    const mate = typeof to === 'string' && to.startsWith('mate:') ? to.slice('mate:'.length) : null;
    if (to !== 'agent' && !(mate && store.teammates?.get?.(mate))) throw new Error('there is no such teammate');
    store.routeItem(product, id, routedPatch(item, { to, why: PICKED_WHY }, { items: store.listItems(), by: 'you' }));
    supervisor.wake();
    return { ok: true };
  });

  /* ----------------------------- the first run ---------------------------- */
  // THE WALK'S EXAMPLE TASK, ANSWERED BY THE APP RATHER THAN BY A SESSION.
  //
  // The whole of the work is reading the readme in the folder chosen two
  // screens earlier, so this returns in milliseconds. The two second pause
  // before it is called is in the renderer, where the row is being watched.
  ipcMain.handle('zero:first-run-answer', (_e, { product, id, round = 0 }: { product: string; id: string; round?: number }) => {
    return store.finishFirstRunTask(product, id, round);
  });

  // THE PRACTICE PROJECT.Made when the hand-off screen is pressed, filled with
  // the three rows in the same call, and archived by the handler below it when
  // the walk ends. It is a real project and it is never a project anybody works
  // in: main/store.mts and main/supervisor.mts both say what that means.
  ipcMain.handle('zero:first-run-practice', (_e, opts: { bare?: boolean } = {}) => {
    const made = store.createPractice();
    // The walkthrough's: one thread of its own, no examples beside the person's real ones.
    if (opts?.bare) return { ...made, examples: [], backdrop: [] };
    let rows: { ids: string[] } = { ids: [] };
    // A store that will not take the three rows is not a reason to strand
    // somebody mid-walk. They land in an empty practice inbox and the beat that
    // clears them is skipped, exactly as beat thirteen already behaves.
    try { rows = store.stagePracticeRows(made.slug); } catch { rows = { ids: [] }; }
    // AND THE REST OF THE PRACTICE TEAM'S WORK, so the tour and the board have
    // something in every column (w-58c8f466e7). Its own try: a store that will
    // not take these still leaves the walk its four rows.
    let backdrop: { ids: string[] } = { ids: [] };
    try { backdrop = store.stagePracticeBackdrop(made.slug); } catch { backdrop = { ids: [] }; }
    return { ...made, examples: rows.ids, backdrop: backdrop.ids };
  });

  // AND TAKING IT BACK OFF THE SCREEN. `sweepPractice` rather than the one
  // slug, so a practice project left behind by a walk somebody quit halfway is
  // cleared by the next one that finishes.
  ipcMain.handle('zero:first-run-practice-end', () => store.sweepPractice());

  // BEAT EIGHT'S THREE EXAMPLE ROWS, written into the project she just
  // made. They are real rows, because the beat teaches clearing an inbox and
  // there is no way to teach that with a picture of one.
  ipcMain.handle('zero:first-run-examples', (_e, { product }: { product: string }) => {
    return store.stageFirstRunExamples(product);
  });

  // AND NOTHING ELSE STARTS WHILE SHE IS BEING SHOWN AROUND.The hold is in
  // memory and it expires; supervisor.firstRunWalking says why both of those
  // matter.
  ipcMain.handle('zero:first-run-walking', (_e, { walking }: { walking?: unknown }) => {
    supervisor.firstRunWalking(!!walking);
    return supervisor.status();
  });

  // BEING A BRAND NEW USER, ON THE APP SHE DOWNLOADED.The row above this one
  // is the "at LEAST" half. This is the whole of it: a SECOND Agentbox, with no
  // projects, no settings and no store, standing beside hers rather than
  // replacing it.
  //
  // NOTHING OF HERS IS DELETED HERE, and there is no version of this handler
  // that may delete anything. main/fresh-user.mts says how it works and why
  // her own window and every agent in it keep running.
  ipcMain.handle('zero:open-fresh-user', (_e, payload?: { withAgents?: boolean; withTools?: boolean }) => {
    return openFreshUser({
      withAgents: payload?.withAgents !== false,
      withTools: payload?.withTools !== false,
      packaged: app.isPackaged,
    });
  });

  // AN INBOX TO STAND IN FRONT OF A ROOM WITH.
  //
  // The same second Agentbox in a throwaway home as the row above, with three
  // invented products and a day of invented work seeded into it first, so it
  // opens on a populated inbox rather than on the welcome screen. It reads none
  // of her folders and it deletes nothing (main/demo.mts).
  ipcMain.handle('zero:open-demo', () => openDemo({ packaged: app.isPackaged }));

  // "Run this later", the durable half of what snooze used to pretend to be.
  // A worker already running on the item is stopped: deferring work that is
  // happening right now and leaving it running is not deferring it.
  ipcMain.handle('zero:schedule', (_e, { product, id, runAt }: { product: string; id: string; runAt: number }) => {
    if (isAgentRow(id)) return { ok: false };
    if (runAt > Date.now()) supervisor.stopSession(id);
    const before = runAt > 0 ? null : store.readItem(product, id);
    const out = store.scheduleItem(product, id, runAt);
    // Let it run now: the queue walks past the agent's answer, so clearing the
    // moment alone starts nothing.
    if (before && wakesItselfAt(before) > Date.now()) supervisor.runNow(product, id);
    return out;
  });

  // Snooze changes when a person sees the thread, never what an agent does.
  ipcMain.handle('zero:snooze', (_e, { product, id, snoozedUntil }: { product: string; id: string; snoozedUntil: number }) => {
    if (isAgentRow(id)) return { ok: false };
    const item = store.snoozeItem(product, id, snoozedUntil);
    push();
    return item;
  });

  // said about an agent instead of about a task. The row it moves stands for
  // somebody's terminal, so this writes to no ledger, sends no message and
  // stops no process: it records the moment her inbox should raise the agent
  // again, and the reader tests it on every measurement. 0 brings it straight
  // back.
  //
  // The KEY comes from the agent, never from the row id: `agent:<pid>` is what
  // the list draws with and a pid is not an identity (shared/agents.mts).
  ipcMain.handle('zero:schedule-agent', (_e, { key, runAt }: { key?: unknown; runAt: number }) => {
    const set = agentSchedule.set(String(key ?? ''), runAt);
    push();
    return { ok: true, runAt: set };
  });

  // `through` is the agent's own last activity when she closed it, so a session
  // that then does something newer is news again rather than the thing she
  // dismissed; 0 puts the row straight back.
  ipcMain.handle('zero:close-agent', (_e, { key, through }: { key?: unknown; through: number }) => {
    const mark = agentSchedule.close(String(key ?? ''), through);
    push();
    return { ok: true, doneThrough: mark };
  });

  /* ---------------------------- repeating tasks --------------------------- */
  // A repeating task is a RULE, so composing one writes no work item at all.
  // That ordering is the point: composeItem appends an open founder item before
  // it applies her content, and another copy of the app can spawn that intermediate state,
  // so a rule that turned out to be unkeepable would leave a one-shot running.
  // The first run arrives on the next tick instead.
  ipcMain.handle('zero:repeats', () => store.listRepeats());

  // THE SAME TWO GATES `zero:compose` USES, because a rule is a standing task
  // and every one of its runs is an ordinary row. `engineOffered` answers null
  // on any Mac where the picker is not drawn, so a rule cannot be marked for an
  // engine she was never shown, and `modelOffered` refuses the model of an
  // engine that was just refused. Both were absent here because neither field
  // reached this handler at all: the whole pair was dropped four times over on
  // the way from her card (main/repeats.mts says where).
  ipcMain.handle('zero:compose-repeat', (_e, { product, title, body, priority, rule, engine, model, startsNext }: { product: string; startsNext?: boolean; title: string; body?: string; priority?: number; rule: { every: string; at: string; on?: number }; engine?: unknown; model?: string }) => {
    const made = store.composeRepeat(product, {
      title,
      body,
      priority,
      ...rule,
      engine: supervisor.engineOffered(engine),
      model: supervisor.modelOffered(engine, model),
      startsNext: startsNext === true,
    });
    // A new rule is owed at once, so its first run starts now, not on the next tick.
    supervisor.wake();
    return made;
  });

  // THE ONE HANDLER THAT TAKES A FREE-FORM PATCH, so it is the one that has to
  // gate the two new fields by hand. `patchRule` appends whatever it is given
  // and the fold now carries `engine` and `model` (shared/repeats.mts), so
  // without this the renderer could mark a rule for Codex without ever passing
  // `engineOffered` -- the capability gate, bypassed by the edit screen. A patch
  // that names neither is forwarded exactly as it arrived.
  ipcMain.handle('zero:set-repeat', (_e, { product, id, rule }: { product: string; id: string; rule?: { engine?: unknown; model?: string; [field: string]: unknown } }) => {
    const { engine, model, ...rest } = rule ?? {};
    return store.setRepeat(product, id, {
      ...rest,
      ...(engine === undefined ? {} : { engine: supervisor.engineOffered(engine) }),
      ...(model === undefined ? {} : { model: supervisor.modelOffered(engine, model) }),
    });
  });

  // Ending one is how she stops it, and it is a small durable fact rather than
  // an archive, so it does not collide with what done means on a work item.
  ipcMain.handle('zero:end-repeat', (_e, { product, id }: { product: string; id: string }) => store.endRepeat(product, id));

  ipcMain.handle('zero:create-product', (_e, { name, repoPath, ofMany }: { name: string; repoPath?: string; ofMany?: unknown }) => {
    const out = store.createProduct({ name, repoPath });
    // (privacy page 5.1). The count is the whole payload; the path it was
    // connected to never leaves.
    //
    // AND A PRESS THAT CONNECTS NINE FOLDERS IS ONE THING SOMEBODY DID, NOT
    // NINE (w-1116fbb68a, 2026-10-08). The import makes a project per folder,
    // so this handler fired nine times for one press and nine events read as
    // nine separate connections to anybody looking at them as activity rather
    // than as a funnel step. `ofMany` is the caller saying it will count the
    // press itself, once, with how many folders it connected.
    if (!ofMany && typeof repoPath === 'string' && repoPath.trim()) analytics.track('repo_connected');
    return out;
  });

  // Returns a bare path or null. Cancelling is not an error and never clears
  // what the card already had.
  //
  // AND IT REFUSES THE FOLDERS THAT ARE NOT PROJECTS.The picker opens on the
  // home folder, so pressing Open without navigating anywhere makes the home
  // folder the project, and the worker that starts there lists it within its
  // first few tool calls. macOS then asks about Downloads, Music, Pictures and
  // Application Support one panel at a time, with our name on every one of
  // them.
  //
  // The refusal is HERE rather than on the screens, so the path never reaches
  // the renderer at all and no screen can take it by accident. What comes back
  // is the sentence, which the screens show as it stands.
  // AND IT OPENS WHERE THE PROJECTS ARE, NOT ON HOME (F-148). A first run with
  // nothing connected yet opened the window on the home folder, which is the
  // one folder the check above refuses: a tester saw a single folder listed and
  // had to press Ctrl+L to type a path. shared/project-folder-check.mts orders
  // the candidates; the first that exists on this disk is the one.
  ipcMain.handle('zero:choose-folder', async (_e, { startIn }: { startIn?: string } = {}) => {
    const connected = store.listProducts().map((p) => p.repoPath).filter(Boolean);
    const isDir = (p: string) => { try { return fsWatch.statSync(p).isDirectory(); } catch { return false; } };
    const openAt = chooserStartsIn(startIn, { known: connected, home: os.homedir() }).find(isDir) ?? null;
    const r = await dialog.showOpenDialog(window, {
      // The title is what the screen behind it asks. On Linux the chooser
      // draws one, and it was still asking "Where is its code?", the heading
      // that screen gave up in w-ec62ab6b38.
      title: 'Pick a project folder',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory'],
      ...(openAt ? { defaultPath: openAt } : {}),
    });
    // NO MAC DIALOG TO OPEN, WHICH IS THE BROWSER AND NOT AN ERROR. The screen
    // draws its own picker instead, on `zero:list-folders` below, and comes
    // back here with nothing further to ask. Saying so with a flag rather than
    // a sentence is what lets one screen serve both doors.
    if (r.noDialog) return { path: null, browse: true };
    if (r.canceled || !r.filePaths?.length) return { path: null };
    // A chooser hands back whatever its location bar held, dots and all. The
    // folder a path names is what gets stored and what gets checked (F-123).
    return folderFromChooser(path.resolve(r.filePaths[0]), { home: os.homedir(), isDir });
  });

  // THE PICKER THE APP DRAWS ITSELF, for a tab that has no Mac dialog.
  //
  // The tab cannot be given a path by the operating system. This process can
  // read the disk perfectly well, so the screen walks it a folder at a time
  // through here and sends back the one she stopped on. See main/folders.mts
  // for why that is the whole of the problem.
  //
  // The verdict rides along so the picker can say, on the folder she is
  // standing in, whether choosing it would be turned down. The Mac's dialog
  // cannot do that and this can, which makes the browser's picker the better
  // of the two on the one thing that actually costs somebody an afternoon.
  ipcMain.handle('zero:list-folders', (_e, { at = null, showHidden = false }: { at?: string | null; showHidden?: boolean } = {}) => {
    const home = os.homedir();
    const listed = listFolders({ at: at ?? startFolder(home), home, showHidden });
    const verdict = checkProjectFolder(listed.at, { home });
    return { ...listed, refused: verdict.ok ? null : verdict.say };
  });

  // Whether the card's sentence may say "a new folder". The card proposes
  // ~/Desktop/dev/<name> from the name typed, and that folder sometimes already
  // exists with somebody's code in it; calling that one new would be a lie in
  // the one sentence on the card.
  ipcMain.handle('zero:folder-exists', (_e, { path: p }: { path?: unknown } = {}) => {
    if (typeof p !== 'string' || !p.trim()) return { exists: false };
    const full = p.trim().startsWith('~')
      ? path.join(os.homedir(), p.trim().slice(1))
      : p.trim();
    try { return { exists: fsWatch.statSync(full).isDirectory() }; } catch { return { exists: false }; }
  });

  // HER CLAUDE CODE AGENTS, for the last screen of the first run. Both of
  // Claude Code's own scopes, because both of them are in her sentence: the
  // home folder set is every project on this Mac, and the one inside the
  // project folder is that project alone.
  //
  // `chosen` comes back with them so the screen can open on what she already
  // took rather than on nothing, which is what makes walking it a second time
  // show her the truth instead of an empty page.
  ipcMain.handle('zero:agent-files', (_e, { folder = null, product = null }: { folder?: unknown; product?: string | null } = {}) => {
    const found = readAgentFiles({ folder: typeof folder === 'string' && folder.trim() ? folder.trim() : null });
    const map = config.projectAgents ?? {};
    const chosen = product && Array.isArray(map[product]) ? map[product] : null;
    return { ...found, chosen };
  });

  // THE FOLDERS THE CARD CANNOT REACH.
  //
  // So a folder's agents may only ever land in the project that points at that
  // folder, which `zero:agent-files` above already guarantees by reading the
  // chosen project's own `repoPath` and nothing else. The gap her answer leaves
  // open is the folder no project points at: on her Mac that is
  // `~/Desktop/dev/astral-desktop`, four agents that no choice on the card could
  // reach. This says which folders those are so the card can offer to make the
  // project rather than quietly filing them somewhere they do not work.
  //
  // the parent of every project folder she has already connected. A folder a
  // project already owns is dropped, because the card reaches those by name in
  // its own project list.
  ipcMain.handle('zero:agent-folders', () => {
    const products = store.listProducts();
    const owned = new Set<string>();
    const roots = new Set<string>();
    for (const p of products) {
      const repo = typeof p.repoPath === 'string' && p.repoPath.trim() ? path.resolve(p.repoPath.trim()) : null;
      if (!repo) continue;
      owned.add(repo);
      roots.add(path.dirname(repo));
    }
    let folders: ReturnType<typeof findAgentFolders> = [];
    try { folders = findAgentFolders({ roots: [...roots] }); } catch { folders = []; }
    // AND THE AGENTS THEMSELVES, not only how many.A count can only be a clause
    // in a sentence; the card now draws each folder as a heading with its own
    // agents ticked underneath, which is the hierarchy, and that needs the
    // files. They are a handful of small markdown files per folder and the same
    // reader the project side already uses.
    const out = [];
    for (const f of folders) {
      if (owned.has(f.folder)) continue;
      let agents: ReturnType<typeof readFolderAgents> = [];
      try { agents = readFolderAgents(f.folder); } catch { agents = []; }
      out.push({ ...f, agents });
    }
    return { folders: out };
  });

  // AND THE THREADS, WHICH ARE THE AGENTS SHE MEANT.
  //
  // The card was reading `.md` agent definitions, four of them, last edited in
  // March; these are the conversations.
  //
  // The reading itself is main/agent-sessions.mts and every judgment lives
  // there. This is the window onto it, plus one thing: WHAT IT LAST HANDED OUT
  // IS KEPT. The import below needs the thread objects and it may not trust the
  // renderer's copy of them, and the alternative is walking her whole
  // ~/.claude/projects again per press. Measured on her Mac 2026-08-29: one
  // walk is 1.7 seconds over 2,445 transcripts, and one press can file into
  // several projects, so re-walking would cost seconds of a button that should
  // feel instant. The card read them a moment before pressing, so the last read
  // is the right answer and it is ours rather than the renderer's.
  let lastThreads: ImportableThreads = [];
  // THE USER'S CODEX CONVERSATIONS ARE ON THE SAME CARD. They carry `source:
  // 'codex'`, land under the project whose folder they ran in exactly as the
  // Claude Code ones do, and the ones the user said not now to are here too, so
  // there is a way back to them.
  // EVERY FOLDER EITHER TOOL KEEPS SESSIONS IN (main/agent-homes.mts), not only
  // ~/.claude and ~/.codex, which is where the import used to look and nothing
  // else (w-e46f2e9cea).
  const readAllThreads = () => readImportableThreads({ config, supervisor, readCodex: readCodexThreadsOffThread });
  ipcMain.handle('zero:agent-threads', async () => {
    const threads = await readAllThreads();
    lastThreads = threads;
    // Each one already in the inbox says so, and the card leaves it out
    // (w-db6f5e331e). The walk's folder suggestions still read all of them.
    let items: ReturnType<Store['listItems']> = [];
    try { items = store.listItems(); } catch { items = []; }
    return { threads: markImported(threads, items) };
  });

  /**
   * EVERY CHAT THE NAME FIELD CAN SEARCH, read once and kept (w-6418318cd5).
   *
   *  The card's own list is ten days. Typing a name has to reach past that, and
   *  a name lives inside a transcript, so finding one means opening files —
   *  29,703 of them on the Mac this was written on. It is taken ONCE, the first
   *  time somebody types, and held for the life of the window: every keystroke
   *  after the first is a filter in the renderer, not a disk walk. `Look again`
   *  on the card drops it, which is the one way back to the disk.
   *
   *  `reached` is the moment the read gave up at, zero when it read the whole
   *  year. The card prints it, because "no chat with that name" over a read
   *  that stopped in August would be a lie nobody could see.
   *
   *  What it searches is the card's latest ten-day list joined with that kept
   *  read, so a chat newer than the first search is found too, and the join is
   *  `lastThreads`, because importing resolves an id against it. A chat the
   *  list holds keeps the list's copy: the search reads no title, answer or
   *  ending, and its copy would bring the chat in without them.
   */
  let searchable: { threads: ImportableThreads; reached: number } | null = null;
  ipcMain.handle('zero:search-agent-threads', async (_e, { again = false }: { again?: boolean } = {}) => {
    if (again) searchable = null;
    if (!searchable) {
      let got: { threads: ImportableThreads; reached: number } = { threads: [], reached: 0 };
      try { got = await readSearchableThreads({ config, supervisor, readCodex: readCodexThreadsOffThread }); } catch { got = { threads: [], reached: 0 }; }
      searchable = got;
    }
    const byId = new Map(lastThreads.map((t) => [String(t?.id ?? ''), t]));
    for (const t of searchable.threads) if (!byId.has(String(t?.id ?? ''))) byId.set(String(t?.id ?? ''), t);
    lastThreads = [...byId.values()];
    let items: ReturnType<Store['listItems']> = [];
    try { items = store.listItems(); } catch { items = []; }
    return { threads: markImported(lastThreads, items), reached: searchable.reached };
  });

  // So this is `zero:import-agents` with the agent taken out of it. No ticks are
  // saved, because there is nothing for the card to remember: an imported thread
  // is a row, and a row is what stops it being imported twice
  // (`threadsNeedingRows`). The row's first reply resumes the conversation as a
  // copy (`Supervisor#importedThreadFor`, GitHub #44).
  ipcMain.handle('zero:import-threads', async (_e, { product, threads, land }: { product?: string; threads?: unknown; land?: string } = {}) => {
    if (!product) return { ok: false, added: 0, already: 0, ids: [] };
    const want = new Set(
      (Array.isArray(threads) ? threads : [])
        .filter((id) => typeof id === 'string' && id.trim())
        .map((id) => id.trim()),
    );
    if (!want.size) { return { ok: true, added: 0, already: 0, ids: [] }; }
    // The read is taken again only if nothing has been handed out yet, which is
    // the case a test or a fresh window can reach and a person cannot.
    if (!lastThreads.length) lastThreads = await readAllThreads();
    // Two kinds, two rows.
    const chosen = readChatEnds(lastThreads.filter((t) => want.has(String(t?.id ?? ''))));
    let out: { ids: string[]; added: number; already: number; done: number } = { ids: [], added: 0, already: 0, done: 0 };
    try {
      // Each store method takes its own kind off the list and leaves the other.
      // Setup's last screen sorts what it brings in: finished chats go to Done.
      const how = { land: land === 'sorted' ? 'sorted' : 'inbox' };
      const claude = store.importThreadRows(product, chosen, how);
      const codex = store.importCodexThreads(product, chosen, how);
      out = { ids: [...claude.ids, ...codex.ids], added: claude.added + codex.added, already: claude.already + codex.already, done: claude.done + codex.done };
    } catch (err) {
      push();
      return { ok: false, error: String((err as Error).message), added: 0, already: 0, ids: [] };
    }
    push();
    return { ok: true, ...out };
  });

  // TAKING THEM, which is the half that used to do nothing.
  //
  // Before this, the finish card's button wrote the ticked names into
  // `projectAgents` and stopped. Three occurrences of that key in the whole
  // shipped app, all of them this file and settings.mts, and none in the
  // renderer: the list was read back only so the card could remember its own
  // ticks the next time somebody walked the setup. Measured on the build a tester
  // used, the store was byte for byte identical before and after pressing it.
  //
  // The names are still saved, because the card still opens on what was taken
  // last time. What is new is the second line: one inbox row per agent, asking
  // for its first job.
  //
  // THE FILES ARE READ AGAIN HERE RATHER THAN SENT IN. The renderer has the
  // whole list already, so it could hand the paths over, but a row that names a
  // file on somebody's disk should name a file that was on the disk a moment
  // ago and not one a screen was holding from earlier in the walk.
  ipcMain.handle('zero:import-agents', (_e, { product, agents }: { product?: string; agents?: unknown } = {}) => {
    if (!product) return { ok: false, added: 0, ids: [] };
    const names = (Array.isArray(agents) ? agents : [])
      .filter((n) => typeof n === 'string' && n.trim())
      .map((n) => n.trim());
    try {
      setProjectSetting({ config, supervisor, store }, { product, key: 'agents', value: names });
    } catch { /* the ticks are a convenience; the rows are the point */ }
    if (!names.length) { push(); return { ok: true, added: 0, ids: [] }; }
    const keep = new Set(names);
    const repo = store.listProducts().find((p) => p.slug === product)?.repoPath ?? null;
    const found = readAgentFiles({ folder: repo });
    const chosen = [...found.user, ...found.project].filter((a) => keep.has(a.name));
    let out: { ids: string[]; added: number; already: number } = { ids: [], added: 0, already: 0 };
    try {
      out = store.importAgentRows(product, chosen);
    } catch (err) {
      push();
      return { ok: false, error: String((err as Error).message), added: 0, ids: [] };
    }
    push();
    return { ok: true, ...out };
  });

  ipcMain.handle('zero:supervisor-pause', (_e, paused) => {
    supervisor.paused = !!paused;
    // Taking the pause off is a thing she does expecting work to start, so it
    // starts, rather than after up to another fifteen seconds of a paused-
    // looking app.
    if (!supervisor.paused) supervisor.wake();
    return supervisor.status();
  });

  // Stop a running agent: kill its session and set the item blocked, so it
  // is not instantly re-pulled and sits in the inbox awaiting redirection.
  ipcMain.handle('zero:stop-session', (_e, { product, id }: { product: string; id: string }) => {
    if (isAgentRow(id)) return { ok: false };
    supervisor.stopSession(id);
    return store.answerItem(product, id, { status: 'blocked' });
  });

  // Run now, from the three-dot menu on a waiting task (supervisor.runNow).
  ipcMain.handle('zero:run-now', (_e, { product, id }: { product: string; id: string }) => {
    if (isAgentRow(id)) return { ok: false, reason: 'missing' };
    return supervisor.runNow(product, id);
  });

  // Send a stopped/blocked item back to the queue; the fresh worker's brief
  // carries whatever the founder wrote on the item meanwhile.
  ipcMain.handle('zero:reopen', async (_e, { product, id }: { product: string; id: string }) => {
    if (isAgentRow(id)) return { ok: false };
    // Sending it back hands over the comments still waiting, as Send would.
    const waiting = waitingNotes({ store, product, id, me: teamMe(), people: teamPeople() });
    if (waiting.length) {
      const mark = { do: 'toagent' as const, on: waiting };
      store.fileMark(product, id, mark);
      try { await noteToItsAgent({ store, supervisor, product, id, mark, nameOf: noteBy, people: teamPeople() }); }
      catch (err) { console.warn(`[notes] sending ${id} back did not hand over its comments: ${(err as Error)?.message ?? err}`); }
    }
    const out = store.answerItem(product, id, { status: 'open' });
    supervisor.liftBrakeForHer?.();
    supervisor.forgetDeadStarts?.({ product, id });
    supervisor.wake();
    return out;
  });

  /* -------------------------- standing instructions ------------------------ */
  // Rules the founder writes once that every session reads before its own
  // brief. The supervisor owns the file and the injection (standingFile,
  // standingInstructions, spawnPlan); this is only the window onto it.
  //
  // WHAT SHE TYPES LANDS IN userDir, NEVER IN THE CHECKOUT (w-3dc46f3a67).
  // These boxes wrote to `dataDir/briefs`, which running from source is the git
  // checkout the fleet works in, so a save could be undone by the next
  // worker's `git checkout` with nothing to show it had happened. The shipped
  // defaults still come from appDir; only her own copy moved.
  ipcMain.handle('zero:instruction-read', (_e, id: string) => {
    try {
      const read = readInstruction(supervisor.userDir, id, supervisor.appDir);
      // The page shows the brief as a worker reads it, which depends on this.
      return id === 'system' ? { ...read, storeTools: !!supervisor.storeMcpCommand?.() } : read;
    }
    catch (e) { return {text:'',defaultText:'',error:(e as Error).message}; }
  });
  ipcMain.handle('zero:instruction-write', (_e, {id,text}: { id: string; text: string }) => {
    try { return writeInstruction(supervisor.userDir, id, text); }
    catch (e) { return {ok:false,error:(e as Error).message}; }
  });
  // The restore points behind the Restore link: her own earlier versions of one
  // box. The list carries times and sizes only, because the whole of twenty
  // versions is most of a megabyte and the page needs one of them at a time.
  ipcMain.handle('zero:instruction-history', (_e, id: string) => {
    try { return {versions: listVersions(supervisor.userDir, id)}; }
    catch (e) { return {versions:[], error:(e as Error).message}; }
  });
  ipcMain.handle('zero:instruction-version', (_e, {id,at}: { id: string; at: number }) => {
    try { return readVersion(supervisor.userDir, id, at); }
    catch (e) { return {text:'', error:(e as Error).message}; }
  });
  ipcMain.handle('zero:standing-read', () => {
    try {
      return { text: supervisor.readStanding() };
    } catch (err) {
      return { text: '', error: (err as Error).message };
    }
  });

  ipcMain.handle('zero:standing-write', (_e, { text }: { text: unknown }) => {
    try {
      supervisor.writeStanding(text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  /* ---------------------------- the message rules -------------------------- */
  // How agents write to her: the titles and openings during a task and the last
  // message a run sends, in one document since w-3dc46f3a67. Shipped filled in,
  // hers to change or empty. The supervisor owns the file and the injection
  // (messageRulesFile, messageRules, spawnPlan); this is only the window. The
  // two channels it replaces were zero:writing-rules-* and zero:finishing-*.
  ipcMain.handle('zero:message-rules-read', () => {
    try {
      return { text: supervisor.readMessageRules() };
    } catch (err) {
      return { text: '', error: (err as Error).message };
    }
  });

  ipcMain.handle('zero:message-rules-write', (_e, { text }: { text: unknown }) => {
    try {
      supervisor.writeMessageRules(text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  /* -------------------------------- settings ------------------------------ */
  // The settings screen. Reads are derived on every open (nothing is cached on
  // either side of the bridge, same as the snapshot); writes land in whichever
  // system owns the value and push, so the inbox behind the screen updates with
  // it. Every handler answers `{ ok, error }` rather than throwing across the
  // bridge, because the one thing this screen must never do is leave her
  // believing a setting took when it did not.
  ipcMain.handle('zero:settings-read', (_e, how?: { search?: boolean }) => {
    try {
      return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }, { search: how?.search !== false }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // CHECK AGAIN, from the last card of the walk. The card will not open the
  // inbox on a Mac with no Claude Code on it, so the way through it is to
  // install Claude Code and press this. It waits for a fresh shell answer,
  // asked off the window's thread, because a button that says it looked again
  // and reads an old memory is the same broken promise as a key that does nothing.
  ipcMain.handle('zero:claude-recheck', async () => {
    try {
      return { ok: true, workspace: await lookAgainFor('claude', config) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // AND THE SAME BUTTON FOR THE SECOND CODING AGENT, from the Codex card on
  // Settings. It earns its place for a sharper reason than the walk's: what the
  // search finds lands on `config.codexBin`, which is the fact `engineChoices`
  // reads, so a press that finds Codex is also what makes the Coding agent row
  // appear -- without the restart a main-process fact usually costs.
  ipcMain.handle('zero:codex-recheck', async () => {
    try {
      return { ok: true, workspace: await lookAgainFor('codex', config) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  /*
   * AND WHEN NEITHER BUTTON CAN FIND IT: POINT AT THE FILE YOURSELF
   * (w-ce8c1a9275). The search asks the login shell first now, which covers
   * every installer a person's own PATH knows about -- but a wrapper script
   * somewhere nobody would guess, a tool on a volume, or a machine whose login
   * shell will not start at all still used to mean a path WE ship and a release
   * THEY wait for. This is the half that ends that.
   *
   * ONE ROUND TRIP, like `zero:project-icon` below and for the same reason: the
   * panel opens in this process and the choice is applied in the same call, so
   * the only path that ever reaches `pointAtEngineBin` is one the open panel
   * itself produced. The window says WHICH coding agent it is asking about and
   * nothing else, which is the whole of what it is trusted with -- `codexBin`
   * is a path that gets spawned, and every worker on this machine has a broad
   * Bash allow (tests/where-codex-runs-from-is-not-a-file-a-worker-can-write).
   *
   * THE REFUSAL IS A SENTENCE AND NOT AN ERROR. Picking a folder, or a file
   * that cannot be run, is an ordinary mistake at a file panel; it comes back
   * as words the row prints, the way `zero:choose-folder` already does.
   */
  ipcMain.handle('zero:engine-bin', async (_e, { engine, action }: { engine?: string; action?: string } = {}) => {
    if (engine !== 'claude' && engine !== 'codex') return { ok: false, error: 'Unknown coding agent.' };
    try {
      // Handing the choice back needs no panel: it is the row saying "look for
      // it again", and the search takes over from there.
      if (action === 'search') {
        const gave = searchForEngineBin(config, engine);
        if (!gave.ok) return { ok: false, refused: gave.say };
        return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
      }
      const { dialog } = await import('electron');
      const r = await dialog.showOpenDialog(window as IpcWindow as AppWindow, {
        title: engine === 'codex' ? 'Where is Codex?' : 'Where is Claude Code?',
        buttonLabel: 'Use this one',
        properties: ['openFile', 'showHiddenFiles', 'treatPackageAsDirectory'],
      });
      // Cancelling is not a failure and must not draw one. `ok` with nothing
      // changed is the honest answer: they opened the panel and closed it again.
      if (r.canceled || !r.filePaths?.length) return { ok: true, canceled: true };
      const took = pointAtEngineBin(config, engine, r.filePaths[0]);
      if (!took.ok) return { ok: false, refused: took.say };
      return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // SETTING UP THEIR PLAN FOR THEM (w-9f6975906c). The walk asks which plan
  // they pay for and this installs the tool and starts its own sign-in. The
  // finder is the recheck, so what gets installed lands on the config and the
  // rest of the app runs on it without a restart.
  const engineSetup = createEngineSetup({
    setUpHere: engineSetUpHere,
    find: (engine: string) => {
      const finders: Record<string, (() => Promise<{ found: boolean | undefined; path: string | null | undefined; certain: boolean | undefined }>) | undefined> = {
        // `certain` travels with the answer, so a search that established
        // nothing does not read as a computer with nothing on it.
        claude: async () => { const s = await lookAgainFor('claude', config) as Extract<LookedAgain, { claudeFound: unknown }>; return { found: s.claudeFound, path: s.claudeBin, certain: s.claudeCertain }; },
        codex: async () => { const s = await lookAgainFor('codex', config) as Extract<LookedAgain, { found: unknown }>; return { found: s.found, path: s.bin, certain: s.certain }; },
      };
      return finders[engine]?.() ?? { found: false, path: null };
    },
    // WHICH ONE IS SIGNED IN, kept on the config for the run that reads it
    // (`Supervisor#_enginesFound`) and never saved: it changes outside the app.
    onSignIn: (engine, signedIn) => {
      config[`${engine}SignedIn`] = signedIn;
    },
  });
  // ASKED ONCE AT LAUNCH, and only on a Mac with both, which is the only Mac
  // where the answer moves a task (w-d5d632e503): a tester who pays for
  // ChatGPT had the Claude app's copy of Claude Code, never signed in, so
  // every task went to Claude Code and Codex was never offered.
  if (config.claudeFound && config.codexBin) {
    void engineSetup.signedInNow('claude', config.claudeBin);
    void engineSetup.signedInNow('codex', config.codexBin);
  }
  // A sign-in left waiting on the browser is not left running after the app.
  app.on('will-quit', () => { engineSetup.cancel('claude'); engineSetup.cancel('codex'); });
  ipcMain.handle('zero:engine-setup', async (_e, { action, engine }: { action?: string; engine: string } = {} as { action?: string; engine: string }) => {
    if (!isEngine(engine)) return { ok: false, error: 'Unknown coding agent.' };
    try {
      if (action === 'ready') return { ok: true, ...(await engineSetup.readiness(engine)) };
      if (action === 'start') return { ok: true, ...engineSetup.start(engine) };
      if (action === 'again') return { ok: true, ...engineSetup.signInAgain(engine) };
      if (action === 'cancel') return { ok: true, ...engineSetup.cancel(engine) };
      return { ok: true, ...engineSetup.status(engine) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  /* * ADD A CODEX ACCOUNT: make the folder, register the login, hand back the one line the
     terminal has to run.
  */
  ipcMain.handle('zero:codex-add-account', () => {
    try {
      const made = addCodexAccount({ config, supervisor });
      pendingLogin = made.home;
      // The shell from a previous add is holding the previous folder, so it is
      // ended: a terminal that says one thing in its prompt and signs another
      // account in is the defect this whole row has been about.
      try { terminals.close(JSON.stringify(SETTINGS_TERMINAL)); } catch { /* none open */ }
      return { ok: true, ...made, workspace: readSettings({ config, supervisor, store, onTeam: onTeamNow }).workspace };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  /* * ADD A CLAUDE ACCOUNT, which is the same three steps as its Codex twin above:
     make the folder, register the login, hand back the one line the terminal has to
     run. It exists from 2026-09-22 (w-3498e0cad2), when she withdrew the rule that
     kept the Claude card from offering one.
  */
  ipcMain.handle('zero:claude-add-account', () => {
    try {
      const made = addClaudeAccount({ config, supervisor });
      pendingLogin = made.home;
      try { terminals.close(JSON.stringify(SETTINGS_TERMINAL)); } catch { /* none open */ }
      return { ok: true, ...made, workspace: readSettings({ config, supervisor, store, onTeam: onTeamNow }).workspace };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  ipcMain.handle('zero:settings-set-project', (_e, payload?: SetProjectPayload) => {
    try {
      setProjectSetting({ config, supervisor, store }, (payload ?? {}) as SetProjectPayload);
      push();
      return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // SIGNING IN TO AGENTBOX CLOUD ITSELF, on the app's own sign-in page
  // (main/cloud/account.mts): Google, or an email and a password, traded for
  // this Mac's cloud key. One session per page, made when the page first asks.
  let cloudAccount: CloudAccountHold | null = null;
  const cloudAccountSessionNow = async () => {
    const home = supervisor.config.home || os.homedir();
    const { cloudAccountConfig, cloudAccountSession } = await import('./cloud/account.mts');
    const config = cloudAccountConfig(supervisor.appDir, { home });
    if (!config) return null;
    if (!cloudAccount || cloudAccount.config !== JSON.stringify(config)) {
      const shell = await shellNow();
      cloudAccount = { config: JSON.stringify(config), value: config, session: cloudAccountSession({ config, openExternal: (u) => shell.openExternal(u), log: (l) => console.log(`cloud account: ${l}`) }) };
    }
    return cloudAccount;
  };
  // A new account's link comes back to this Mac's own listener while the page
  // says to check the inbox, and the sign-in finishes here, so the page moves
  // on by itself. Behind the handler, which it would hold for a quarter hour.
  let confirming: Promise<void> | null = null;
  // One sign-in for both: the phone side has its own session and would
  // otherwise stay signed out after a cloud sign-in.
  const connectThePhone = async (acct: CloudAccountHold) => {
    const s = acct.session.takeSession();
    if (!team || !s) return;
    try { await team.adoptSession(s); } catch (err) { console.warn(`cloud account: the phone did not sign in with it: ${(err as Error)?.message ?? err}`); }
  };
  const waitForTheLink = async (acct: CloudAccountHold) => {
    if (confirming) return;
    const { waitForEmailConfirmation } = await import('./cloud/account.mts');
    confirming = waitForEmailConfirmation({ config: acct.value, session: acct.session, home: supervisor.config.home || os.homedir() })
      .then(async (out) => {
        if (!out.ok) { console.log(`cloud account: the confirmation link did not finish: ${out.error}`); return; }
        await connectThePhone(acct);
        try { if (window?.isMinimized?.()) window.restore?.(); window?.show?.(); } catch { /* no window to raise */ }
        push();
      })
      .finally(() => { confirming = null; });
  };
  ipcMain.handle('zero:cloud-account-sign-in', async (_e, { method, email, password, name, acceptTerms }: { method: string; email: string; password: string; name: string; acceptTerms?: unknown } = {} as { method: string; email: string; password: string; name: string; acceptTerms?: unknown }) => {
    const acct = await cloudAccountSessionNow();
    if (!acct) return { ok: false, error: 'This copy of the app has no cloud to sign in to.' };
    const { cloudSignIn } = await import('./cloud/account.mts');
    const out = await cloudSignIn({ config: acct.value, session: acct.session, method, email, password, name, acceptTerms: acceptTerms === true, home: supervisor.config.home || os.homedir() });
    if (method === 'google') { try { if (window?.isMinimized?.()) window.restore?.(); window?.show?.(); } catch { /* no window to raise */ } }
    if (out.ok && out.confirm) void waitForTheLink(acct);
    else if (out.ok) await connectThePhone(acct);
    push();
    return out;
  });
  ipcMain.handle('zero:cloud-account-cancel', async () => { (await cloudAccountSessionNow())?.session.cancel(); return { ok: true }; });
  ipcMain.handle('zero:cloud-account-reopen', async () => { await (await cloudAccountSessionNow())?.session.reopen(); return { ok: true }; });
  ipcMain.handle('zero:cloud-account-sign-out', async () => {
    const { signOutOfCloud } = await import('./cloud/account.mts');
    const out = await signOutOfCloud({ home: supervisor.config.home || os.homedir() });
    push();
    return out;
  });
  // PAYING FOR A CLOUD PLAN: Stripe's own pages, in the browser, as other
  // desktop apps do. An app window drew them badly and never offers Apple Pay.
  const cloudCall = async (name: 'cloudPlan' | 'payForCloud' | 'openCloudBilling' | 'cloudTeamBilling', args: Record<string, unknown> = {}) => {
    try {
      const account = await import('./cloud/account.mts');
      const shell = await shellNow();
      return await (account[name] as (options: Record<string, unknown>) => Promise<unknown>)({ ...args, openExternal: (u: string) => shell.openExternal(u), home: supervisor.config.home || os.homedir() });
    } catch (err) {
      return { ok: false, error: 'unreachable', message: `The cloud did not answer: ${(err as Error)?.message || err}` };
    }
  };
  ipcMain.handle('zero:cloud-account-plan', async () => {
    const plan = await cloudCall('cloudPlan');
    supervisor.cloudPlanSeen?.(plan as Parameters<Supervisor['cloudPlanSeen']>[0]);
    return plan;
  });
  ipcMain.handle('zero:cloud-account-pay', (_e, { plan }: { plan?: string } = {}) => cloudCall('payForCloud', { plan }));
  ipcMain.handle('zero:cloud-account-billing', () => cloudCall('openCloudBilling'));
  ipcMain.handle('zero:cloud-account-team-billing', () => cloudCall('cloudTeamBilling'));

  // THE CLOUD SETUP'S SIGN-IN for one account, made in the cloud
  // (main/cloud/logins.mts). The Mac relays the link and the code only.
  ipcMain.handle('zero:cloud-signin', async (_e, { action, engine, key, code }: { action: string; engine: string; key?: string | null; code?: string } = {} as { action: string; engine: string; key?: string | null; code?: string }) => {
    try {
      const out = await supervisor.cloudSignIn(action, engine, key ?? null, code);
      push();
      return { ok: true, key: out?.key ?? null };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });
  // A saved key carries on every thread that was waiting on it, as if each had been replied to.
  // `reply` is the person's own words for the thread the key was pasted on, which go instead of the app's.
  ipcMain.handle('zero:cloud-key', async (_e, { action, name, value, label, reply } = {}) => {
    try {
      let { keys, freed } = await supervisor.cloudKey(action, name, value, { label: typeof label === 'string' ? label : null });
      if (reply?.id && typeof reply.answer === 'string' && reply.answer.trim()) {
        freed = [...freed.filter((t) => t.id !== reply.id || t.product !== reply.product), { product: reply.product, id: reply.id, answer: reply.answer }];
      }
      for (const t of freed) await submitReply(supervisor, { product: t.product, id: t.id, answer: t.answer, status: 'open' }, () => store.answerItem(t.product, t.id, { answer: t.answer, status: 'open' }));
      if (freed.length) supervisor.wake();
      push();
      return { ok: true, keys, freed: freed.map((t) => t.id), cloudOff: supervisor.config.cloudRuns === false };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });
  // What the person did with a sign-in link an agent is waiting on (shared/sign-in-ask.mjs).
  ipcMain.handle('zero:sign-in-answer', (_e, { product, id, ask, said, url, code } = {}) => {
    try {
      store.answerSignIn(product, id, { id: ask, said, url, code });
      push();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });
  // GitHub's own sign-in for this computer's git, started from the card on a ship that could not push.
  let ghLogin: GhLogin | null = null;
  ipcMain.handle('zero:github-browser-sign-in', async () => {
    try {
      ghLogin?.cancel();
      const login = ghLogin = await startGhLogin();
      void login.done.then(async (ok) => {
        if (ghLogin === login) ghLogin = null;
        if (!ok || !await setUpGit()) return;
        await supervisor.gitHubSignIn?.forget().catch(() => {});
        store.shipAgainAfterGitHubSignIn();
        supervisor.wake();
        push();
      });
      return { ok: true, code: login.code, url: login.url };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });
  ipcMain.handle('zero:github-sign-in', async (_e, { token } = {}) => {
    try {
      if (!supervisor.gitHubSignIn) return { ok: false, error: `Signing in to GitHub needs the ${Name} app on this computer.` };
      await supervisor.gitHubSignIn.save(token);
      const again = store.shipAgainAfterGitHubSignIn();
      supervisor.wake();
      push();
      return { ok: true, again };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });
  // A FILE A CLOUD RUN ASKED FOR, sent from this computer by the person's press,
  // or one they chose in the open panel instead. The thread carries on with it.
  // `hold` keeps the reply back: the file goes with the sign-in still open on the same ask, whose save sends both.
  ipcMain.handle('zero:cloud-file-info', (_e, { path: asked } = {}) => {
    try { return supervisor.cloudFileInfo(asked); } catch (err) { return { ok: false, error: String((err as Error).message) }; }
  });
  // `also` is what was held for this ask before it, which goes in the same reply.
  ipcMain.handle('zero:cloud-send-file', async (_e, { product, id, path: asked, choose = false, hold = false, also = '' } = {}) => {
    try {
      let file = asked;
      if (choose) {
        const r = await dialog.showOpenDialog(window, { title: 'Pick the file to send', buttonLabel: 'Send this file', properties: ['openFile'] });
        // The browser copy has no file panel (main/serve.mts).
        if (r.noDialog) return { ok: false, error: `Choosing a file needs the ${Name} app on this computer.` };
        if (r.canceled || !r.filePaths?.length) return { ok: true, canceled: true };
        file = r.filePaths[0];
      }
      const sent = supervisor.cloudSendFile(id, file);
      const home = supervisor.config?.home ?? os.homedir();
      const shown = sent.path.startsWith(`${home}/`) ? `~${sent.path.slice(home.length)}` : sent.path;
      const own = `I sent ${shown}. It is at that same path on your machine now.`;
      if (hold) return { ok: true, path: sent.path, held: true, words: own };
      const answer = typeof also === 'string' && also.trim() ? `${also.trim()} ${own} Carry on.` : own;
      await submitReply(supervisor, { product, id, answer, status: 'open' }, () => store.answerItem(product, id, { answer, status: 'open' }));
      supervisor.wake();
      push();
      return { ok: true, path: sent.path };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });
  // A ONE-TIME CODE A CLOUD RUN ASKED FOR, sent as the reply that carries it on.
  ipcMain.handle('zero:cloud-send-code', async (_e, { product, id, about, code, also = '' } = {}) => {
    const c = String(code ?? '').trim();
    if (!/^[A-Za-z0-9-]{4,12}$/.test(c)) return { ok: false, error: 'That does not look like a code.' };
    const own = `The ${String(about ?? '').trim() || 'one-time'} code is ${c}.`;
    const answer = typeof also === 'string' && also.trim() ? `${also.trim()} ${own} Carry on.` : own;
    supervisor.sendNextTurnToCloud?.(id);
    await submitReply(supervisor, { product, id, answer, status: 'open' }, () => store.answerItem(product, id, { answer, status: 'open' }));
    supervisor.wake();
    push();
    return { ok: true };
  });
  // CLAUDE'S CODE, FROM THE CLIPBOARD, WHEN SHE COMES BACK (2026-10-14: she
  // approved on Claude's page and waited, not seeing that the code it shows
  // has to come back). Answered only while a Claude sign-in is waiting for
  // its code, and only with text shaped like one: anything else she copied
  // stays where it is.
  ipcMain.handle('zero:cloud-clipboard-code', () => {
    try {
      const waiting = (supervisor.cloudStatus?.().signIns || []).some((s) => s.engine === 'claude' && s.state === 'needs-code');
      if (!waiting) return { code: null };
      const text = String(host?.readClipboardText?.() ?? '').trim();
      return { code: looksLikeClaudeCode(text) ? text : null };
    } catch {
      return { code: null };
    }
  });
  ipcMain.handle('zero:settings-set-workspace', (_e, payload: WorkspaceSet) => {
    try {
      // Before the save: once the switch is off, nothing leaves, not even this.
      if (countsTurnedOff(payload)) { analytics.track('counts_turned_off'); analytics.flush(); }
      setWorkspaceSetting({ config, supervisor, store }, payload ?? {});
      if (payload?.key === 'alphaRooms' || payload?.key === 'alphaMultiplayer') team?.rooms?.tick().catch(() => {});
      if (cornerTagTurnedOff(payload)) analytics.track('tag_turned_off');
      if (payload?.key === 'alphaGlass') glass(alphaFeatures(config).glass);
      push();
      return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  /* --------------------- what a project is called, and its mark ------------ */
  // Both of these write into the PROJECT'S OWN project.json rather than into her
  // config, and main/project-identity.mts says at length why. They are separate
  // handlers rather than two more keys on settings-set-project because that one
  // is handed `{ config, supervisor }`, and neither of these is a preference
  // about a folder: they need the folder itself, which only the store resolves.
  //
  // THE FOLDER IS LOOKED UP HERE AND NOWHERE ELSE. A slug naming no product is
  // refused before anything touches the disk, so a stale sidebar row cannot aim
  // a write at a folder that has been deleted underneath it.
  const productDirOf = (slug: string | undefined) => store.listProducts().find((p) => p.slug === slug)?.dir ?? null;

  ipcMain.handle('zero:project-rename', (_e, { product, name }: { product?: string; name?: string } = {}) => {
    try {
      const dir = productDirOf(product);
      if (!dir) return { ok: false, error: 'That project could not be found.' };
      const saved = setProjectName(dir, name);
      // PUSH, because the name is on far more than the screen it was typed on:
      // the rail, every row's byline, the composer's picker and ⌘K all print it,
      // and a rename that only redrew Settings would leave the rest of the app
      // calling it the old thing until something else happened to refresh.
      push();
      return { ok: true, name: saved, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // ARCHIVE A PROJECT, OR BRING ONE BACK (main/store.mts setProductArchived).
  // Its files stay on disk; it leaves every list the app draws. Pushed for the
  // same reason a rename is: the rail, the inbox and the picker all list it.
  ipcMain.handle('zero:project-archive', (_e, { product, archived }: { product: string; archived?: boolean } = {} as { product: string; archived?: boolean }) => {
    try {
      store.setProductArchived(product, archived === true);
      push();
      return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // WHO SEES A PROJECT'S THREADS (main/store.mts setProductSeenBy,
  // w-b989839656). Pushed, because the inbox's locks and the New thread
  // card's starting chip both read it off the snapshot's projects.
  ipcMain.handle('zero:project-seen-by', (_e, { product, who, people }: { product: string; who?: string; people?: string[] } = {} as { product: string; who?: string; people?: string[] }) => {
    try {
      store.setProductSeenBy(product, { who, people });
      push();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // Opens the picker AND does the copy, in one round trip. Two handlers would
  // mean the renderer briefly holds a path into her Downloads folder and hands
  // it back to be trusted; this way the only path that crosses the bridge is one
  // the open panel itself produced inside this same call.
  ipcMain.handle('zero:project-icon', async (_e, { product }: { product?: string } = {}) => {
    try {
      const dir = productDirOf(product);
      if (!dir) return { ok: false, error: 'That project could not be found.' };
      const { dialog } = await import('electron');
      const r = await dialog.showOpenDialog(window as IpcWindow as AppWindow, {
        title: 'Pick a picture for this project',
        buttonLabel: 'Use this picture',
        properties: ['openFile'],
        filters: [{ name: 'Pictures', extensions: ICON_KINDS.map((e) => e.slice(1)) }],
      });
      // Cancelling is not a failure and must not draw an error. `ok` with nothing
      // changed is the honest answer: she opened the panel and closed it again.
      if (r.canceled || !r.filePaths?.length) return { ok: true, canceled: true };
      setProjectIcon(dir, r.filePaths[0]);
      push();
      return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  ipcMain.handle('zero:project-icon-clear', (_e, { product }: { product?: string } = {}) => {
    try {
      const dir = productDirOf(product);
      if (!dir) return { ok: false, error: 'That project could not be found.' };
      clearProjectIcon(dir);
      push();
      return { ok: true, ...readSettings({ config, supervisor, store, onTeam: onTeamNow }) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // Her rules for ONE project, the layer that did not exist. The supervisor
  // owns the file and the injection (projectInstructionsFile, spawnPlan); this
  // is only the window onto it, exactly as standing-read/write is.
  ipcMain.handle('zero:project-instructions-read', (_e, { product }: { product: string }) => {
    try {
      return { ok: true, text: supervisor.readProjectInstructions(product) };
    } catch (err) {
      return { ok: false, text: '', error: String((err as Error).message) };
    }
  });

  ipcMain.handle('zero:project-instructions-write', (_e, { product, text }: { product: string; text: unknown }) => {
    try {
      supervisor.writeProjectInstructions(product, text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  });

  // Attachments: pasted images (base64) or dropped files (source paths) land
  // in the product's attachments/ dir and come back as relative paths the
  // caller embeds in the body as markdown. Relative paths keep them readable
  // by workers through the MCP and renderable in the message view.
  // The saving itself is main/save-attachments.mts, shared with a message to a
  // person, which saves its own once it knows which conversation it is in.
  ipcMain.handle('zero:save-attachments', async (_e, { product, files }: { product: string; files: AttachmentFile[] }) => saveAttachments(store.productDir(product), files));

  // A PASTED SCREENSHOT GOES TO DISK THE MOMENT IT IS PASTED.
  //
  // The constraint was ours. Pasted bytes used to ride in the draft as base64,
  // and a draft lives in localStorage, whose quota MEASURED on this machine is
  // 5,241,856 characters for the WHOLE app. Ordinary full-screen screenshots
  // are regularly over that; 6 MB is not unusual.
  //
  // Raising the number cannot reach that bar: even the whole quota is under 4 MB
  // of image, and Claude's own limit is 10 MB base64 per image (about 7.5 MB of
  // file) at up to 8000x8000. localStorage is simply the wrong place for image
  // bytes. So they go here instead, and the draft keeps a path — which the draft
  // format ALREADY stores for free, because `srcPath` attachments cost nothing
  // and are never the ones dropped. There is no image budget left to hit.
  //
  // Staged, not saved: this is not the product's attachments dir. A pasted image
  // only becomes an attachment when she sends, and `zero:save-attachments`
  // copies it there. What she pastes and abandons is swept below.
  //
  // A PICTURE SHE DRAGS IN IS STAGED TOO, AND THAT IS `srcPath`.
  //
  // with a shot of the reply box holding a broken thumbnail labelled
  // `fun-mode.png`. A paste was already fine; a DRAG was not, and the two take
  // different routes. A dropped file arrives with a real path from
  // `webUtils.getPathForFile`, so nothing was ever copied and the thumbnail
  // asked for `astral-img://file/Users/you/…` somewhere out on the disk.
  // `servable` in main/img-scheme.mts answers that with a 403, on purpose: the
  // window may only draw pictures inside the account root or a product's repo,
  // and widening that to the whole disk is the trade that scheme exists to
  // refuse. Measured against the real module, her account root as the only
  // root:
  //
  //   /…/00000000-/.staging/…-pasted-33035.png   servable true
  //   /Users/you/Desktop/fun-mode.png       servable false
  //
  // So the picture comes inside instead. A copy into the same `.staging` folder
  // a paste lands in makes the path servable, gets swept on the same week, and
  // costs nothing at send time because `zero:save-attachments` above already
  // copies from `srcPath`. Bytes are copied on disk rather than carried through
  // this bridge as base64, which a file picked off disk should never need.
  ipcMain.handle('zero:stage-attachment', async (_e, file?: AttachmentFile) => stageAttachment(path.join(config.accountRoot, '.staging'), file));
  ipcMain.handle('zero:stage-attachment-part', async (_e, piece?: StagedPart) => stageAttachmentPart(path.join(config.accountRoot, '.staging'), piece));

  // Unstick ONE stalled item: forget its answer's delivery mark and tick, so
  // a fresh worker picks the answer up now.
  ipcMain.handle('zero:redeliver', (_e, { product, id }: { product: string; id: string }) => {
    if (isAgentRow(id)) return { ok: false };
    const item = store.listItems().find((i) => i.product === product && i.id === id);
    if (!item?.answer || item.answer === '(withdrawn)') return { ok: false, error: 'no live answer to redeliver' };
    supervisor.liftBrakeForHer?.();
    supervisor.forgetDeadStarts?.(item);
    supervisor.redeliverAnswer(item, item.answer);
    supervisor.tick?.().catch(() => {});
    return { ok: true };
  });

  // Respawn what a mass die-off (usage limit, crash) left stranded. With `ids`,
  // only those: a selection in the list is her saying which of the stopped rows
  // are still worth her plan.
  ipcMain.handle('zero:resume-agents', (_e, arg?: { ids?: unknown }) => {
    const ids = Array.isArray(arg?.ids) ? arg.ids : null;
    const cleared = supervisor.resumeStopped(ids);
    return { ok: true, cleared, ...supervisor.status() };
  });

  // Put a worker back on named rows whatever state they are in, including the
  // finished ones no other path can reach. Ids only: this is her pointing.
  ipcMain.handle('zero:resume-items', (_e, arg?: { ids?: unknown }) => {
    const ids = Array.isArray(arg?.ids) ? arg.ids : [];
    return { ok: true, ...supervisor.resumeItems(ids), ...supervisor.status() };
  });

  // `zero:pause-product` stopped one project and is gone with it
  // (w-d19d6d387c, 2026-09-22). `zero:pause` still holds the whole fleet.

  // Open a worker-written artifact path. Workers write paths relative to
  // whichever root they were thinking about (docs dir, designs/, attachments/,
  // the repo), so a single-root file:// href fails silently on the rest.
  // Images already resolve across these roots to render; links open the same
  // way. Absolute and file:// paths open as-is if they exist.
  // mode 'resolve' returns the found path without opening it, so the renderer
  // can render hrefs that are true (Copy Link must hand out a URL that works).
  //
  // EVERY GUESS STAYS INSIDE THE CARD'S OWN PRODUCT (main/artifact-path.mts).
  // It used to fall through to every other product's folders, which is how nine
  // of eleven chips on one card opened two other products' files (her answer,
  // 2026-08-19). When it finds nothing it now hands back a sentence she can
  // read, and the renderer shows it.
  // A teammate's shared thread keeps its copied files in a folder of its own.
  // Reading goes through this list and writing does not, so they stay read-only.
  const readableProducts = () => [...store.listProducts(), ...(team?.sharedThreadProducts?.() ?? [])];
  // WHAT A QUERY FINDS INSIDE THREADS (main/everything-found.mts): made on the
  // first ask, read ahead when the search opens.
  let finder: ReturnType<typeof appFinder> | null = null;
  const finderNow = () => (finder ??= appFinder({ store, team, readableProducts, accountRoot: config.accountRoot, storeRoot: config.storeRoot }));
  ipcMain.handle('zero:find-in-threads', async (_e, { query, limit }: { query?: unknown; limit?: { lines?: number; files?: number; comments?: number } } = {}) => {
    try { return { ok: true, ...(await finderNow().search(String(query ?? '').slice(0, 200), limit)) }; }
    catch (err) { return { ok: false, error: String((err as Error)?.message ?? err), lines: [], files: [], comments: [], total: { lines: 0, files: 0, comments: 0 } }; }
  });
  ipcMain.handle('zero:warm-find-in-threads', () => { finderNow().warm().catch(() => {}); return true; });
  let filesPlace: FilesPlace | null = null;
  const filesPlaceNow = () => (filesPlace ??= filesPlaceFor({ store, team, accountRoot: config.accountRoot, storeRoot: config.storeRoot, notify: () => push() }));
  // An agent's team_read reads folders from the view the reach tick writes.
  if (store.teammates) store.teammates.foldersForAgents = () => filesPlaceNow().forAgents();
  ipcMain.handle('zero:files-place', async () => {
    try { return await filesPlaceNow().list(); } catch { return { files: [], projects: [], folders: [] }; }
  });
  ipcMain.handle('zero:files-place-folder', async (_e, { do: what, ...p }: { do?: string; project?: string; name?: string; parent?: string | null; id?: unknown; key?: unknown; folder?: string | null } = {}) => {
    try {
      const place = filesPlaceNow();
      const out = what === 'make' ? await place.makeFolder({ project: p.project, name: p.name, parent: p.parent ?? null })
        : what === 'rename' ? await place.renameFolder({ id: String(p.id ?? ''), name: p.name })
          : what === 'move' ? await place.moveFile({ key: String(p.key ?? ''), folder: p.folder ?? null })
            : null;
      if (!out) return { ok: false, error: 'that cannot be done here' };
      push();
      return { ok: true, folder: out.id ?? null };
    } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  });
  ipcMain.handle('zero:files-place-new', async (_e, { project, name, kind, folder }: { project?: unknown; name?: unknown; kind?: unknown; folder?: unknown } = {}) => {
    try {
      const out = await filesPlaceNow().newDocument({ project: String(project ?? ''), name: String(name ?? ''), kind: kind === 'table' ? 'table' : 'document', folder: typeof folder === 'string' ? folder : null });
      push();
      return { ok: true, key: out.key };
    } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  });
  ipcMain.handle('zero:files-place-upload', async (_e, { project, folder }: { project?: unknown; folder?: unknown } = {}) => {
    try {
      const r = await dialog.showOpenDialog(window, { title: `Add files to ${String(project ?? '')}`, buttonLabel: 'Add', properties: ['openFile', 'multiSelections'] });
      if (r.noDialog) return { ok: false, error: `Adding files needs the ${Name} app on this computer.` };
      if (r.canceled || !r.filePaths?.length) return { ok: true, added: 0, refused: [], keys: [] };
      const out = await filesPlaceNow().addFiles({ project: String(project ?? ''), folder: typeof folder === 'string' ? folder : null, paths: r.filePaths });
      if (out.added) push();
      return { ok: true, ...out };
    } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  });
  ipcMain.handle('zero:files-place-open', async (_e, { key }: { key?: unknown } = {}) => {
    try { return await filesPlaceNow().open(String(key ?? '')); } catch { return null; }
  });
  ipcMain.handle('zero:files-place-edit', async (_e, { key, text }: { key?: unknown; text?: string } = {}) => {
    const out = await filesPlaceNow().edit(String(key ?? ''), text);
    if (out.ok) { push(); void team?.syncNow?.()?.catch?.(() => {}); }
    return out;
  });
  ipcMain.handle('zero:file-elsewhere', async (_e, { product, id, room, copies }: { product?: unknown; id?: unknown; room?: unknown; copies?: unknown } = {}) => {
    const asked = Array.isArray(copies) ? copies : [];
    try { return await filesPlaceNow().sameFiles({ product: String(product ?? ''), id: String(id ?? ''), room: room ? String(room) : null, copies: asked }); } catch { return asked.map(() => ({ key: null, notes: [], approvals: [] })); }
  });
  ipcMain.handle('zero:file-line', async (_e, { product, id, room }: { product?: unknown; id?: unknown; room?: unknown } = {}) => {
    try { return await filesPlaceNow().lineFor({ product: String(product ?? ''), id: String(id ?? ''), room: room ? String(room) : null }); } catch { return []; }
  });
  ipcMain.handle('zero:files-place-mark', async (_e, { key, mark }: { key?: unknown; mark?: unknown } = {}) => {
    const { wrote, ...out } = await filesPlaceNow().mark(String(key ?? ''), mark);
    if (out.ok) { push(); void team?.syncNow?.()?.catch?.(() => {}); }
    if (out.ok && wrote) {
      try { await noteToItsAgent({ store, supervisor, ...wrote, mark: mark as Mark, nameOf: noteBy, people: teamPeople() }); }
      catch (err) { return { ok: false, error: `The note is saved, but it did not reach the agent: ${(err as Error)?.message ?? err}` }; }
    }
    return out;
  });
  // A failing check still answers with a tile: its state is the answer.
  const toolsChanged = () => { void team?.publishConnections?.(); push(); };
  team?.bindConnections?.(() => connections!.connectedIds());
  const noTools = { tiles: [], canEncrypt: false, projects: [], groups: [] };
  copies?.bindPlace(filesPlaceNow);
  const copyProjects = () => store.listProducts().filter((p) => !p.team?.direct).map((p) => {
    const seen = projectSeenBy(p);
    return { slug: p.slug, name: p.name, seenBy: seen.who };
  });
  ipcMain.handle('zero:connections', async () => {
    if (!connections) return noTools;
    void connections.checkStale().catch(() => {});
    const list = await connections.list();
    const kept: Record<string, unknown> = copies?.all() ?? {};
    return { ...list, tiles: list.tiles.map((t) => ({ ...t, copy: kept[t.id] ?? null })), projects: copyProjects(), groups: GROUPS };
  });
  ipcMain.handle('zero:connections-connect', async (_e, { id, clientId, clientSecret, key }: { id?: unknown; clientId?: string; clientSecret?: string; key?: string } = {}) => {
    if (!connections) return { ok: false, error: 'Connections are not available here.' };
    const out = await connections.connect(String(id ?? ''), { clientId, clientSecret, key });
    toolsChanged();
    if (out.ok) void copies?.kick(String(id ?? ''))?.catch?.(() => {});
    return out;
  });
  ipcMain.handle('zero:connections-add', async (_e, { address, key }: { address?: string; key?: string } = {}) => {
    if (!connections) return { ok: false, error: 'Connections are not available here.' };
    const out = await connections.addByAddress({ address, key });
    toolsChanged();
    return out;
  });
  ipcMain.handle('zero:connections-choose', async (_e, { id, names }: { id?: unknown; names?: unknown } = {}) => {
    const tile = await connections?.chooseReads(String(id ?? ''), Array.isArray(names) ? names : []);
    toolsChanged();
    return tile ?? null;
  });
  ipcMain.handle('zero:connections-copy', async (_e, { id, do: what, project, channels }: { id?: unknown; do?: string; project?: string; channels?: string[] } = {}) => {
    if (!copies) return { ok: false, error: 'Connections are not available here.' };
    const tool = String(id ?? '');
    try {
      if (what === 'start') return await copies.start(tool, { project, channels });
      if (what === 'stop') { await copies.stopKeeping(tool); return { ok: true }; }
      if (what === 'now') { await copies.run(tool); return { ok: true }; }
      return { ok: false, error: 'that cannot be done here' };
    } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; } finally { push(); }
  });
  ipcMain.handle('zero:connections-cancel', (_e, { id }: { id?: unknown } = {}) => { connections?.cancelConnect(String(id ?? '')); return true; });
  ipcMain.handle('zero:connections-check', async (_e, { id }: { id?: unknown } = {}) => {
    const tile = await connections?.check(String(id ?? ''));
    toolsChanged();
    return tile ?? null;
  });
  ipcMain.handle('zero:connections-disconnect', async (_e, { id }: { id?: unknown } = {}) => {
    await connections?.disconnect(String(id ?? ''));
    toolsChanged();
    return true;
  });
  ipcMain.handle('zero:connections-accept', async (_e, { id }: { id?: unknown } = {}) => { await connections?.acceptTools(String(id ?? '')); push(); return true; });
  ipcMain.handle('zero:open-artifact', async (_e, { product, src, mode, thread }: { product: string; src?: unknown; mode?: string; thread?: unknown }) => {
    const shell = await shellNow();
    if (typeof src !== 'string' || !src) return { ok: false, error: 'no path' };
    if (/^https?:/.test(src)) {
      if (mode === 'resolve') return { ok: true, opened: src };
      const opened = await openInBrowser(src, { shell });
      return opened.ok ? { ok: true, opened: src } : opened;
    }
    let found = await resolveArtifact({
      src,
      product,
      thread: typeof thread === 'string' ? thread : null,
      products: readableProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
      nameOf: team?.firstNameOf,
    });
    if (!found.ok) {
      // A document's picture can name a version that was sent under another name.
      const inFiles = await filesPlaceNow().pictureNamed(src).catch(() => null);
      if (!inFiles) return found;
      found = { ...found, ok: true, path: inFiles };
    }
    if (mode === 'resolve') {
      // RESOLVING FOR THE PANE IS WHAT OPENS THE DOOR. An html page is drawn
      // in a frame of its own and its pictures sit beside it on disk, so the
      // file's folder and this product's roots become readable under the
      // document scheme, and the url the frame should point at comes back with
      // the path. Nothing else on disk is reachable from that page. A markdown
      // file is read through zero:read-doc and never needs this.
      if (docGrants && /\.html?$/i.test(found.path)) {
        const prod = readableProducts().find((p) => p.slug === product) ?? null;
        docGrants.grant(found.path, artifactRoots(prod));
        return { ok: true, opened: found.path, url: docUrl(found.path), ...(found.carry ? { carry: found.carry } : {}) };
      }
      return { ok: true, opened: found.path, ...(found.carry ? { carry: found.carry } : {}) };
    }
    if (mode === 'source') {
      try { await openSourceFile(found.path); return { ok: true, opened: found.path }; }
      catch (error) { return { ok: false, error: (error as Error).message || 'The text editor could not be opened.' }; }
    }
    const err = await openForThePerson(shell, found.path);
    return err ? { ok: false, error: err } : { ok: true, opened: found.path };
  });

  // THE PICTURES IN A FOLDER A MESSAGE NAMES, so the folder line draws them
  // (FolderPreview in Focus.tsx). Only pictures, only inside this product.
  ipcMain.handle('zero:folder-pictures', (_e, { product, src }: { product?: string; src?: unknown } = {}) => folderPictures({
    src,
    product,
    products: store.listProducts(),
    accountRoot: config.accountRoot,
    storeRoot: config.storeRoot,
  }));

  // THE DOCUMENT PANE READS AND WRITES THE FILE ITSELF. A path goes through
  // the very same finder the links and the chips use, so the pane opens
  // exactly the file a click would have opened, and then main hands back the
  // text rather than the path. What may be written is decided in
  // main/doc-file.mts: markdown only, inside this product's own folders only.
  ipcMain.handle('zero:read-doc', async (_e, { product, src, thread }: { product: string; src?: unknown; thread?: unknown }) => {
    const found = await resolveArtifact({
      src,
      product,
      thread: typeof thread === 'string' ? thread : null,
      products: readableProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
      nameOf: team?.firstNameOf,
    });
    if (!found.ok) return found;
    return { ...readDoc({ file: found.path }), ...(found.carry ? { carry: found.carry } : {}) };
  });

  // A LINK ANYONE CAN OPEN, to one of this person's files (main/file-link.mts).
  // One link per file of a thread, whichever of its versions is on screen.
  type LinkArg = { product?: string; thread?: unknown; src?: unknown; token?: unknown; text?: unknown; place?: unknown };
  const linkOf = ({ product, thread, src }: LinkArg = {}) => linkSource(product, thread, familyKeyOf(String(src ?? '')));
  const linkCall = (fn: (arg: LinkArg, team: IpcTeam) => Promise<object>) => async (_e: unknown, arg: LinkArg = {}) => {
    if (!team?.fileLink) return { ok: false, error: 'This copy has no cloud to share files on.' };
    try { return { ok: true, ...(await fn(arg, team)) }; } catch (err) { return { ok: false, error: String((err as Error | undefined)?.message ?? err) }; }
  };
  // Remembered by the link's source, so an edit made on its page comes home beside this file.
  const fileOnScreen = async (arg: LinkArg, team: IpcTeam) => {
    const { product, src, thread } = arg;
    const found = await resolveArtifact({
      src, product, thread: typeof thread === 'string' ? thread : null,
      products: readableProducts(), accountRoot: config.accountRoot, storeRoot: config.storeRoot, nameOf: team?.firstNameOf,
    });
    if (!found.ok) throw new Error(found.error || 'This file is not on this computer.');
    const copy = linkCopyOf(found.path);
    if (copy.error !== undefined) throw new Error(copy.error);
    team.rememberLinkPlace(linkOf(arg), found.path);
    return copy;
  };
  // Only a document or a table can be edited on its page (edit_file_link).
  const withEditable = <T extends { link?: object | null }>(arg: LinkArg, out: T): T => (out.link
    ? { ...out, link: { ...out.link, editable: linkKindOf(String(arg.src ?? '').split(/[?#]/)[0])?.kind === 'markdown' } }
    : out);
  ipcMain.handle('zero:file-link', linkCall(async (arg, team) => {
    const now = await fileOnScreen(arg, team).catch(() => null);
    return withEditable(arg, await team.fileLink(linkOf(arg), now?.hash ?? null, now?.version ?? null));
  }));
  ipcMain.handle('zero:file-link-share', linkCall(async (arg, team) => withEditable(arg, await team.shareFile({ source: linkOf(arg), ...(await fileOnScreen(arg, team)) }))));
  type AccessArg = LinkArg & { access?: unknown; can?: unknown; email?: unknown };
  ipcMain.handle('zero:file-link-access', linkCall(async ({ token, access, can }: AccessArg, team) => {
    await team.setFileLinkAccess(String(token ?? ''), String(access ?? ''), String(can ?? ''));
    return {};
  }));
  ipcMain.handle('zero:file-link-people', linkCall(async ({ token }, team) => ({ people: await team.fileLinkPeople(String(token ?? '')) })));
  ipcMain.handle('zero:file-link-person', linkCall(async ({ token, email, can }: AccessArg, team) => (
    { people: await team.setFileLinkPerson(String(token ?? ''), String(email ?? ''), can == null ? null : String(can)) })));
  ipcMain.handle('zero:file-links', linkCall(async (_arg, team) => team.fileLinks()));
  ipcMain.handle('zero:file-link-stop', linkCall(async ({ token }, team) => { await team.stopFileLink(String(token ?? '')); return {}; }));
  ipcMain.handle('zero:file-link-comments', linkCall(async ({ token }, team) => ({ comments: await team.fileLinkComments(String(token ?? '')) })));
  ipcMain.handle('zero:file-link-comment', linkCall(async ({ token, text, place }, team) => ({ comments: await team.commentOnFileLink(String(token ?? ''), text, place ?? null) })));

  // A FILE SOMEONE SHARED WITH THIS PERSON, brought into one of their projects
  // as their own copy on a thread that runs nothing until they write to it.
  ipcMain.handle('zero:bring-shared-file', async (_e, { link, product }: { link?: unknown; product?: unknown } = {}) => {
    const token = fileLinkToken(link);
    if (!token) return { ok: false, error: 'That is not a link to a shared file.' };
    if (!team?.readFileLink) return { ok: false, error: 'This copy has no cloud to read shared files from.' };
    const slug = projectToBringInto(store.listProducts(), product);
    if (!slug) return { ok: false, error: 'Make a project first, then open the link again.' };
    try {
      const out = await bringSharedFile({
        token, product: slug, read: (t) => team.readFileLink(t), productDir: store.productDir(slug),
        // Their own copy: a teammate on a shared project sees it only if they share it.
        compose: (fields) => store.composeItem(slug, { ...fields, visibility: 'private' }),
      });
      push();
      return { ok: true, ...out };
    } catch (err) {
      return { ok: false, error: String((err as Error | undefined)?.message ?? err) };
    }
  });

  // "Try again" on a file in a conversation that was not delivered.
  ipcMain.handle('zero:retry-file', async (_e, { product, src } = {}) => (team?.retryFile ? team.retryFile({ product, src }) : false));

  // THE CHANGE A RUN MADE. Same finder as every other artifact, so a click on
  // the chip and a click on a path in her message open the same file.
  ipcMain.handle('zero:code-change', async (_e, { product, src, summary }: { product: string; src?: unknown; summary?: boolean }) => {
    const found = await resolveArtifact({
      src,
      product,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return found;
    try {
      return { ok: true, change: summary ? readChangeSummary(found.path) : readChange(found.path) };
    } catch (e) {
      return { ok: false, error: `that change could not be read (${(e as Error).message})` };
    }
  });

  // ONE FILE INSIDE A CHANGE, READ AND WRITTEN.
  //
  // `src` is the change artifact and `path` is one file inside it, which is the
  // same pair the pane already has on screen. The change is re-read here rather
  // than trusted from the renderer, because it is what says which folders a
  // write may land in and that decision may not come from the window.
  const openChange = async (product: string, src: unknown) => {
    const found = await resolveArtifact({
      src,
      product,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return found;
    try {
      return { ok: true, change: readChange(found.path), prod: store.listProducts().find((p) => p.slug === product) ?? null };
    } catch (e) {
      return { ok: false, error: `that change could not be read (${(e as Error).message})` };
    }
  };

  ipcMain.handle('zero:code-file', async (_e, { product, src, path: filePath }: { product: string; src?: unknown; path?: string }) => {
    const opened = await openChange(product, src);
    if (!opened.ok) return opened;
    const found = findFile({ change: opened.change, product: opened.prod, filePath });
    if (!found.ok) return found;
    return readCodeFile({ file: found.path });
  });

  ipcMain.handle('zero:save-code-file', async (_e, { product, src, path: filePath, text, mtime }: { product: string; src?: unknown; path?: string; text: unknown; mtime?: number }) => {
    const opened = await openChange(product, src);
    if (!opened.ok) return opened;
    const found = findFile({ change: opened.change, product: opened.prod, filePath });
    if (!found.ok) return found;
    return writeCodeFile({ file: found.path, change: opened.change, product: opened.prod, text, mtime });
  });

  // The live room a document or table opens in, when teammates can open it too.
  ipcMain.handle('zero:live-room', async (_e, { product, project, name }: { product?: unknown; project?: unknown; name?: unknown }) => {
    if (!team || typeof name !== 'string') return null;
    const state = team.state() as { signedIn?: boolean; me?: { id: string; name?: string }; team?: { id: string }; cards?: { project?: string | null; people?: string[] | null }[] };
    const own = store.listProducts().find((p) => p.slug === product && !p.team?.direct);
    const key = (s: unknown) => String(s ?? '').trim().toLowerCase();
    const named = typeof project === 'string' && project ? project : own?.name;
    const mine = store.listProducts().find((p) => !p.team?.direct && key(p.name) === key(named));
    const shared = liveForTheWholeTeam({ mine, cards: state.cards, named });
    const room = liveRoomFor({ address: liveAt, state, multiplayer: alphaFeatures(config).multiplayer, project: named, name: name.split('/').pop(), shared, owner: !!own && own === mine });
    if (!room) return null;
    const token = await team.liveToken?.();
    return token ? { ...room, url: `${room.url}?t=${encodeURIComponent(token)}` } : room;
  });

  ipcMain.handle('zero:write-doc', async (_e, { product, src, text, mtime, thread }: { product: string; src?: unknown; text: unknown; mtime?: number; thread?: unknown }) => {
    const prod = store.listProducts().find((p) => p.slug === product) ?? null;
    const found = await resolveArtifact({
      src,
      product,
      thread: typeof thread === 'string' ? thread : null,
      products: store.listProducts(),
      accountRoot: config.accountRoot,
      storeRoot: config.storeRoot,
    });
    if (!found.ok) return found;
    return writeDoc({ file: found.path, product: prod, text, mtime });
  });

  // The work behind a review, viewable: commits and diff of a branch against
  // main in the product's repo. Read-only, size-capped. THE SIDEBAR NOTE. It
  // is a file in the product's own folder and nothing else, so unlike the
  // document pane there is no path to resolve and no path to check: the slug
  // picks the product, the product owns the path. See main/rail-note.mts for
  // why it is a file at all.
  ipcMain.handle('zero:rail-note', (_e, { product }: { product: string }) => {
    const prod = store.listProducts().find((p) => p.slug === product) ?? null;
    if (!prod) return { ok: false, error: 'That project could not be found.' };
    return readNote({ product: prod });
  });

  ipcMain.handle('zero:save-rail-note', (_e, { product, text }: { product: string; text: unknown }) => {
    const prod = store.listProducts().find((p) => p.slug === product) ?? null;
    if (!prod) return { ok: false, error: 'That project could not be found.' };
    return writeNote({ product: prod, text });
  });

  // The trace: what each session on this item actually did, from the logs the
  // supervisor persists under <product>/sessions/<item-id>/. Read-only.
  // `whole` is a thread's middle being asked for: every log, whole, once
  // (main/run-traces.mts). Otherwise the newest, and `have` holds the stamps
  // of the logs the screen already has (shared/trace-delta.mts).
  ipcMain.handle('zero:session-trace', async (_e, { product, id, have, whole }: { product: string; id: string; have?: Record<string, string>; whole?: boolean } = {} as { product: string; id: string }) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = store.listProducts().find((p) => p.slug === product)?.dir;
    if (!dir || !/^[\w-]+$/.test(String(id ?? ''))) return { ok: false, sessions: [] };
    const traceDir = machineryPath(dir, path.join('sessions', id));
    if (whole) return { ok: true, sessions: readRunTraces(traceDir, { whole: true }) };
    let files: string[] = [];
    try {
      files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.log')).sort();
    } catch { return { ok: true, sessions: [] }; }
    const sessions = files.slice(-20).map((f) => {
      const startedAt = Number(f.replace('.log', '')) || 0;
      return traceAnswer({ fs, file: path.join(traceDir, f), startedAt, had: have?.[startedAt] });
    });
    return { ok: true, sessions };
  });

  // The thread history behind the time under a task's title. Raw ledger lines,
  // read fresh: the renderer owns what they mean, this owns getting them across.
  ipcMain.handle('zero:item-history', async (_e, { product, id, before }: { product: string; id: string; before?: number }) => {
    try {
      return { ok: true, lines: store.readHistory(product, id, { before, max: Number.MAX_SAFE_INTEGER }) };
    } catch (err) {
      return { ok: false, error: (err as Error).message, lines: [] };
    }
  });

  // UPDATES (main/updater.mts). Two doors and no more: look now, and install
  // what has been downloaded. There is deliberately no "download" door, because
  // the download already happened on its own; the only thing left for a person
  // to decide is when the app is allowed to disappear and come back.
  ipcMain.handle('zero:update-check', async () => updater.check({ manual: true }));
  ipcMain.handle('zero:update-install', () => ({ started: updater.install() }));
  // AND A THIRD, for the copy that cannot update itself from where it is: move
  // the app into Applications (shared/where-it-runs-from.mts). It is a door of
  // its own rather than part of the install, because it is the opposite
  // decision — nothing has been downloaded and nothing will be until the app
  // is somewhere macOS lets it write.
  // A copy run from source answers no to it rather than throwing: there is no
  // bundle to move (main/source-updater.mts).
  ipcMain.handle('zero:update-move', () => updater.move?.() ?? { moved: false, error: null });

  // Handed back so the Cmd+Y/Cmd+N chord answers through the same door the
  // buttons do, rather than reaching past it into approvals.answer.
  // `push` goes with it so the updater can make the window refetch when a
  // download finishes, without holding the window itself.
  return { answerApproval, pendingApprovals, cardSentAt, push, usageForPhone };
}
