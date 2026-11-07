// Shared contracts: the schemas everything meets at.
// Plain ESM, one import. Imported by main (Node) and renderer (Vite).
// Validation is deliberately light: enough to make lying structurally hard
// (EXECUTED without evidence, dangling refs, stale ask responses), no more.

import { nameSlug } from './product-name.mjs';

export const SCHEMA_VERSION = 2;

/* ---------------------------------- IPC ---------------------------------- */
// Channel names, one place. Renderer subscribes/invokes only through these.
export const IPC = {
  // renderer -> main
  sendMessage: 'chat:send',            // { projectId, text }
  answerAsk: 'ask:answer',             // AskResponse
  openProject: 'project:open',         // { projectId } -> ProjectSnapshot
  listProjects: 'project:list',        // -> [{ id, name, updatedAt }]
  createProject: 'project:create',     // { name } -> { id }
  renameProject: 'project:rename',     // { projectId, name } -> { ok }
  deleteProject: 'project:delete',     // { projectId } -> { ok } | { error } (refuses the open product; erases the folder from disk)
  interruptRun: 'run:interrupt',       // { projectId, chatId }
  recoveryResume: 'recovery:resume',   // { projectId, chatIds: string[] } -> { ok, resumed: string[] } resume interrupted (cut) chats: for each, ensureSession then kickoff the app-written resume brief (non-persisted, non-echoed). Chats sitting on a pending ask card are skipped (their card is the recovery). Kicking a turn off clears cutAt in the ledger, so the row leaves the Welcome Back sheet as it actually goes working.
  queueAction: 'chat:queue-action',    // { projectId, chatId, action: 'cancel'|'sendNow'|'bringBack', id } -> { ok, text?, attachments? } act on an up-next (held) message
  closeCreation: 'creation:close',     // { projectId, creationId }
  deleteCreation: 'creation:delete',   // { projectId, creationId } -> { ok } (removes the file + catalog entry, not just the tab)
  saveCreationContent: 'creation:save', // { projectId, creationId, content } -> { ok } (founder edits a doc)
  creationContent: 'creation:content', // { projectId, creationId } -> { content } lazy body fetch: project:open ships content only for open tabs and small docs (big closed-tab bodies made boot crawl); the renderer hydrates the rest through here on tab open
  creationPageInlined: 'creation:page-inlined', // { projectId, creationId, page } -> { html } | { error } a folder-design page rendered fully self-contained (relative assets inlined as data URIs) for a token-free srcdoc preview
  createCreation: 'creation:create',   // { projectId, title } -> { ok, id } founder makes a markdown doc by hand (the Library's New document)
  addTemplate: 'creation:add-template', // { projectId, template } -> { ok, id, existing? } instantiate a stock template (e.g. 'agents-tray') as a folder-backed creation; opens the existing one if the project already has it
  libraryImport: 'library:import',     // { projectId, folder, files: [{ name, mediaType, data }] } -> { ok, imported, refused } founder drops files into the Library; each lands as a kind 'file' creation
  creationFiles: 'creation:files',     // { projectId, creationId } -> { tree } | { error } nested file tree (shared/file-tree.mjs buildFileTree) for a folder-backed creation
  creationReadFile: 'creation:read-file', // { projectId, creationId, file } -> { content } | { binary: true } | { error } read one file from a folder-backed creation; binary assets are served instead via creation-file://
  creationSearch: 'creation:search',   // { projectId, creationId, query } -> { results: [{ file, line, text }] } | { error } case-insensitive content grep over a folder-backed creation (skips binaries/.env), caps 100 total / 5 per file / 200 chars
  creationSaveFile: 'creation:save-file', // { projectId, creationId, file, content } -> { ok } | { ok: false, error } write + commit one file in a folder-backed creation
  creationSaveImage: 'creation:save-image', // { projectId, creationId, name, mediaType, data(base64) } -> { ok, url, path } | { ok: false, error } save a pasted/dropped image into a doc's assets/ folder, served back over creation-file://
  creationRun: 'creation:run',         // { projectId, creationId } -> { ok } start the local runtime for a folder-backed creation
  creationStop: 'creation:stop',       // { projectId, creationId } -> { ok } stop the running local runtime
  creationRestore: 'creation:restore', // { projectId, creationId, ref? } -> { ok, restoredTo?, snapshotTag?, warning? } restore a folder-backed creation's files to `ref` (default the "original" tag); dirty work is snapshotted AND tagged first
  setCreationStatus: 'creation:setStatus', // { projectId, creationId, status: 'history'|'exploration'|'current', replacedBy? } -> { ok, creation } | { error } what a creation IS to the company: 'history' = superseded (kept, hidden from default reading), 'exploration' = made and never adopted (kept and SHOWN, but never the live answer to anything), 'current' = the live answer (the absence of a status key). Metadata only, no files move
  saveView: 'view:save',               // { projectId, openTabs, activeTab, pinnedTabs, browsers } -> { ok } (which tabs are up; view.json)
  // chats (multiple conversations per product)
  listChats: 'chat:list',              // { projectId } -> [{ id, title, updatedAt }]
  createChat: 'chat:create',           // { projectId } -> { id, title }
  scrubEmpty: 'chat:scrub-empty',      // { projectId, keepIds?, activeId? } -> { removed: string[] } trash abandoned zero-message chats (never the active one or a keepIds chat with unsent draft text); recoverable, never rm
  quickCapture: 'chat:quick-capture',  // { projectId?, text, attachments?, model? } -> { id, title, projectId } | { error } create a chat in the current project and send its first message WITHOUT changing the active chat (Cmd+J quick capture); model pins the new chat's brain at birth ('auto'/omitted = the workspace default), so it applies to the first message; emits chat.created + chat.status like a normal send

  openChat: 'chat:open',               // { projectId, chatId } -> { chatId, chat: ChatMessage[] }
  renameChat: 'chat:rename',           // { projectId, chatId, title } -> { ok }
  deleteChat: 'chat:delete',           // { projectId, chatId } -> { ok } (session closed first, log trashed)
  chatModel: 'chat:model',             // { projectId, chatId, model? } -> { model } get/set THIS chat's model; setting also stamps project.lastModel for future chats
  setChatUnread: 'chat:set-unread',    // { projectId, chatId, unread } -> { ok } flip a chat's read state WITHOUT opening it: true resurfaces it under Your turn / For you (sidebar "Mark as unread", tray drag), false puts it away (tray drag to Quiet). Goes through the status ledger so it persists and the next feed sync agrees.
  // settings + app
  getSettings: 'settings:get',         // -> settings + { dataDir, imapPasswordSet }
  setSettings: 'settings:set',         // patch (imapPassword goes to the Keychain, never the file)
  revealData: 'app:reveal-data',       // open the configured store root in Finder
  openExternal: 'app:open-external',   // { url } -> { ok } open a link in the real browser (doc-editor "Visit"); http/https/mailto only
  // GitHub connector (device flow lives in main; renderer only relays)
  githubConnectStart: 'github:connect-start', // -> { userCode, verificationUri } (opens browser, starts polling)
  githubConnectWait: 'github:connect-wait',   // -> { ok, login } | { error } resolves when the poll finishes
  githubStatus: 'github:status',              // -> { connected, login? }
  githubDisconnect: 'github:disconnect',      // -> { ok } removes the Keychain token
  // Personal Telegram bot connector. Token validation and long polling stay
  // in main; the renderer only drives setup and reads connection state.
  telegramStatus: 'telegram:status',          // -> configured/link/listener state
  telegramConnect: 'telegram:connect',        // { token } validates, Keychain-saves, and starts linking
  telegramBeginLink: 'telegram:begin-link',   // -> a fresh one-tap t.me link
  telegramDisconnect: 'telegram:disconnect',  // -> removes token, link, and local routing state
  // Per-product secrets (the founder's OWN product API keys), stored in the
  // macOS Keychain per project, injected into a runnable creation's env at
  // spawn. NO channel ever returns a secret VALUE: list is names-only, set/
  // delete return only { ok }. Values ride set one-way and are never read back.
  secretsList: 'secrets:list',         // { projectId } -> { names: string[] }
  secretsSet: 'secrets:set',           // { projectId, name, value } -> { ok } | { error }
  secretsDelete: 'secrets:delete',     // { projectId, name } -> { ok }
  usageGet: 'usage:get',               // -> { projects: { id: { name, models } }, updatedAt } token/cost ledger (best effort, never a gate)
  // Plan and credits surface. Both NEVER throw and NEVER gate; they mirror the
  // billing client's { ok, reason } philosophy so the renderer can render
  // signed-out / unreachable states honestly.
  billingSummary: 'billing:summary',   // -> { ok:true, balance, plan, status, menu } | { ok:false, reason, menu } balance (GET /balance) + menu (GET /menu) together
  billingCheckout: 'billing:checkout', // { kind: 'subscription'|'topup' } -> { ok:true } (opens Stripe Checkout in the system browser) | { ok:false, reason }
  billingPortal: 'billing:portal',     // -> { ok:true, url } Stripe billing portal (past invoices, card, cancel) | { ok:false, reason }; reason:'no-customer' when they never checked out
  // Cloud (Supabase; auth + sync live in main, tokens in the Keychain)
  authStatus: 'auth:status',           // -> { signedIn, email?, isAdmin, gateRequired, sync? }
  // `authSignInGoogle` was here. It opened the system browser and waited for a
  // deep link on the other product's URL scheme to come back.
  authSignInPassword: 'auth:signin-password', // { email, password } -> { ok, error?, code? } signInWithPassword; on ok fans out auth.changed
  authSignUpPassword: 'auth:signup-password', // { email, password } -> { ok, error?, code? } signUp (no email confirmation); on ok fans out auth.changed
  // NOTE: there is deliberately no emailed-code door.
  // `auth:start`/`auth:verify` were removed on 2026-08-06; the product now
  // sends no email.
  authSignOut: 'auth:signout',         // -> { ok }
  // Consent-based, move-only migration of PRE-account projects at the legacy
  // root into the signed-in account's space (main/store/account.mjs).
  migrationStatus: 'migration:status', // -> { pending, count, names } does this Mac have legacy projects this account hasn't answered about?
  migrationDecide: 'migration:decide', // { choice: 'bring'|'leave' } -> { ok, moved?, count?, manifestPath?, error? } bring moves each dir (manifest-first, verified, never overwrites/deletes); leave records the dismissal
  // Managed database (Neon) viewer. Every channel takes { projectId, creationId }
  // where creationId is the APP creation that owns the database (the viewer
  // creation's meta.databaseFor). All handlers return { error } on failure.
  dbOverview: 'db:overview',           // -> { record, tables, usage, userCount }
  dbRows: 'db:rows',                   // + { schema, table, limit, offset, orderBy?, orderDir? } -> { columns, rows, total }
  dbMutate: 'db:mutate',               // + { action: 'insert'|'update'|'delete', schema, table, values?, where? } -> { ok, rowCount }
  dbQuery: 'db:query',                 // + { sql } -> { columns, rows, rowCount, truncated, command, durationMs }
  dbUsers: 'db:users',                 // + { limit?, offset? } -> { enabled, users, total }
  dbUserDelete: 'db:user-delete',      // + { userId } -> { ok }
  dbExport: 'db:export',               // -> { ok, file, tables, totalRows, bytes } (save dialog, full SQL dump)
  dbConnection: 'db:connection',       // -> { pooled, direct, authBaseUrl } (deliberate reveal)
  dbTransfer: 'db:transfer',           // -> { ok, url?, expiresAt?, reason? } claim link to the founder's own Neon account
  dbDelete: 'db:delete',               // -> { ok } deletes the Neon project (recoverable 7 days server-side) + local record
  // Feedback-pipeline review records (the Agents Tray's founder review surface).
  // Reviews live in per-creation `reviews` records collections; list AGGREGATES
  // every one in the project (the ledger creation differs per project).
  reviewsList: 'reviews:list',         // { projectId } -> { reviews: [{ creationId, id, key, ts, data }] } | { error }
  reviewUpdate: 'reviews:update',      // { projectId, creationId, key, status: 'pending'|'validated'|'flagged', flagNote? } -> { ok, review } | { error } upserts the SAME record; flag requires a note
  // The dashboard: the company's real state, folded from the append-only
  // ledger at `<projectDir>/dashboard.jsonl` (main/store/dashboard.mjs) with
  // PostHog-sourced metrics resolved against the founder's own analytics.
  dashboardGet: 'dashboard:get',       // { projectId } -> { dashboard } | { error } folded picture, metrics resolved; never throws on an analytics failure (the metric stays honestly absent)
  // Asked when the founder clicks a number, never on page load. `sources: null`
  // means this product is not on managed analytics, which is the renderer's
  // signal that the number cannot be clicked into at all.
  dashboardSources: 'dashboard:sources', // { projectId, event, days } -> { sources: { event, days, rows: [{ source, campaign, people, hits }], absent } | null } | { error }
  dashboardPatch: 'dashboard:patch',   // { projectId, patch, source: 'founder'|'agent' } -> { ok, dashboard } | { error } append one partial patch; a founder patch is not overruled by a later agent patch to the same field
  // main -> renderer (single event channel, payload = StreamEvent)
  //
  // The channel's own name, not the other product's. Both ends read it from
  // this constant and nothing else in the repo spells it out, so the string was
  // free to change; it was verified unreferenced before it did.
  stream: `${nameSlug}:stream`,
};

// StreamEvent.type values (main -> renderer). One channel, discriminated union.
export const STREAM = {
  appNotify: 'app.notify',             // { title, body } cloud brain ping -> the web client shows a browser Notification when permitted (desktop uses native notifications main-side and never emits this)
  chatDelta: 'chat.delta',             // { messageId, text } incremental agent text
  chatMessage: 'chat.message',         // ChatMessage completed (agent or user echo)
  runStatus: 'run.status',             // { label, state: 'working'|'idle'|'error'|'needs-cleanup', detail?, stalled? } stalled: the turn is alive but the transport is failing and retrying (the founder must never read a retry loop as progress)
  creationOpened: 'creation.opened',   // Creation envelope
  creationUpdated: 'creation.updated', // Creation envelope (same id, new content)
  creationDeleted: 'creation.deleted', // { creationId } (founder deleted it; drop from catalog + any open tab)
  creationRuntime: 'creation.runtime', // { projectId, creationId, status: 'idle'|'starting'|'running'|'stopping'|'error', port?, previewUrl?, logTail? } dev-server runtime status for a folder-backed app creation (project-wide, not chat-scoped); previewUrl only in cloud, where the port rides a public subdomain
  askRequest: 'ask.request',           // AskRequest
  askResolved: 'ask.resolved',         // { requestId }
  runFrame: 'run.frame',               // { runId, seq, file } screenshot FILE REF, never blobs
  runFrameLive: 'run.frame.live',      // { runId, seq, src, w, h } screencast frame DESCRIPTOR; src is a
                                       //   a live:// URL into main's in-memory cache (display-only,
                                       //   latest wins, never evidence). run.frame stays the evidence still.
  runCursor: 'run.cursor',             // { runId, seq, x, y, click } where the persona's hands are, in the
                                       //   frame's CSS pixels; the live view glides a pointer there
  runEvent: 'run.event',               // RunEvent (for live narration / transcript)
  sessionError: 'session.error',       // { message, kind: 'rate-limit'|'crash'|'auth'|'other' }
  receipts: 'chat.receipts',           // { messageId, receipts: string[] }
  chatRenamed: 'chat.renamed',         // { chatId, title } (auto-title from the first message)
  projectRenamed: 'project.renamed',   // { projectId, name } the agent named an idea-stage project (rename_project); the sidebar/top bar update live
  chatCreated: 'chat.created',         // { chat: { id, title, updatedAt } } the agent made a new chat; the sidebar adds it live. NOT chat-scoped, so it folds whatever chat is active.
  chatMessageRemoved: 'chat.message-removed', // { id } drop a message from the log/dock (an up-next message the founder cancelled or pulled back)
  chatModel: 'chat.model',             // { model } the agent switched THIS conversation's model; the chip reflects it live
  chatWorkers: 'chat.workers',         // { op: 'start'|'end', worker: { id, label, model } } a delegated worker session (e.g. a build session) started or finished on this conversation; the model picker's "Working now" roster reflects who is actually running, on which model
  compaction: 'chat.compaction',       // { state: 'running'|'done'|'failed' } dedicated, persistent compaction indicator (distinct from run.status so agent work never clobbers it)
  browserOpen: 'browser-open',         // { url } a renderer link escape (http/https) main routes into the in-app browser: open, or focus a tab already at that url. GLOBAL, not chat-scoped, so it folds regardless of the active project/chat.
  chatStatus: 'chat.status',           // { projectId, chatId, status: { working, workingSince, askPending, askSince, doneAt, doneDetail, readAt, cutAt, cutKind } } per-chat sidebar status ledger (main/status-ledger.mjs). cutAt (epoch ms) + cutKind ('sleep'|'restart') carry the INTERRUPTED state: cutAt set with no new turn since == Your turn, unread, like a pending question. DELIBERATELY NOT in CHAT_SCOPED_EVENTS: the sidebar must reflect BACKGROUND chats too, so it folds into a per-chat map regardless of the active chat (the project gate in foldStream still applies). Persisted in main (with a rolling backup); the project:open snapshot re-seeds the renderer map on startup.
  recoveryWake: 'recovery.wake',       // { projectId, wokeAt, chats: [{ id, title, cutAt, cutKind, ranForMs, lastFinished, askPending }] } ONE signal on system resume (powerMonitor) carrying the OPEN project's interrupted chats, so the renderer can raise the Welcome Back sheet. ranForMs = cutAt - workingSince (null if unknown); lastFinished = the last tool trail line before the cut (null if none); askPending marks a row cut mid-question (offer Open, not Resume). GLOBAL, not chat-scoped. Ordinary chat.status events also flow for each entry, so the sidebar is correct even if the sheet never shows.
  authChanged: 'auth.changed',         // { signedIn, email? } main finished a sign-in (Google deep link) or sign-out; the gate lifts without polling. GLOBAL, not chat-scoped.
  billingChanged: 'billing.changed',   // { summary } main refreshed the billing summary after a finished checkout; the Plan and usage room updates without a manual reload. GLOBAL, not chat-scoped. Nothing emits or listens for this today.
  dashboardUpdated: 'dashboard.updated', // { projectId } an agent (in ANY conversation) appended to the dashboard ledger; the page refetches. Carries no payload on purpose: the fold plus the analytics resolution happen in main, and several chats may write at once, so the renderer asks for the current truth rather than folding a patch it may have raced. NOT chat-scoped (the project gate in foldStream still applies).
};

// Stream events scoped to ONE conversation: the renderer folds these only when
// event.chatId matches the active chat. Everything else (creations, run frames)
// is project-wide.
export const CHAT_SCOPED_EVENTS = [
  'chat.delta', 'chat.message', 'chat.message-removed', 'chat.receipts', 'ask.request', 'ask.resolved',
  'run.status', 'session.error', 'chat.model', 'chat.workers', 'chat.compaction',
];

/* ------------------------------ chat + asks ------------------------------ */
// ChatMessage: { id, role: 'user'|'agent', text, ts, receipts?: string[] }

export function makeAskRegistry() {
  // Idempotent ask_user round-trips: one pending request at a time per session,
  // stable requestId, stale/duplicate answers rejected, timeout expires cleanly.
  const pending = new Map(); // requestId -> { resolve, timer }
  return {
    register(request, resolve, onTimeout) {
      if (!request?.requestId) throw new Error('ask request needs requestId');
      if (pending.has(request.requestId)) return false; // duplicate register = no-op
      const timer = request.timeoutMs
        ? setTimeout(() => { pending.delete(request.requestId); onTimeout?.(); }, request.timeoutMs)
        : null;
      pending.set(request.requestId, { resolve, timer });
      return true;
    },
    answer(response) {
      const entry = pending.get(response?.requestId);
      if (!entry) return { ok: false, reason: 'stale-or-unknown' };
      clearTimeout(entry.timer);
      pending.delete(response.requestId);
      entry.resolve(response);
      return { ok: true };
    },
    cancelAll(reason = 'cancelled') {
      for (const [id, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve({ requestId: id, cancelled: true, reason });
      }
      pending.clear();
    },
    has(requestId) { return pending.has(requestId); },
    get size() { return pending.size; },
  };
}

/* -------------------------------- creations ------------------------------- */
export const CREATION_KINDS = [
  'markdown',    // the workhorse: reports, ICP docs, plans (rendered as doc)
  'findings',    // findings report (evidence-first order, trust spine)
  'live-run',    // live browser view of a persona driving the product
  'persona',     // persona profile
  'transcript',  // interview / session transcript
  'design',      // rendered HTML in a sandboxed iframe
  'canvas',      // agent-authored HTML on an infinite pannable/zoomable canvas
                 //   (camera + ground only; everything on the board is the HTML)
  'app',         // folder-backed runnable app (dir + entry, has a local runtime;
                 //   the ONE creation for a product: code, database views, and
                 //   the DATABASE.md/DEPLOYMENT.md receipts all live here)
  'file',        // founder-imported asset (video, image, audio, anything):
                 //   bytes live at envelope.path, the viewer renders by
                 //   extension via creation-file://, content is never read
];

// The kinds the AGENT may mint via open_creation. The other two stay in
// CREATION_KINDS only because internal code paths build them: live-run by
// start_test_run, file by founder drag-drop.
export const AGENT_CREATION_KINDS = [
  // NOTE: 'findings' was retired 2026-07-23. A test run's report is now a
  // plain markdown doc (fewer primitives is the goal), so the agent never
  // mints a bespoke report type. 'findings' stays in CREATION_KINDS only so
  // legacy reports already on disk remain valid; nothing creates new ones and
  // there is no special renderer (a legacy findings creation renders as
  // markdown, converted on the fly).
  'markdown', 'persona', 'transcript', 'design', 'canvas', 'app',
];

// The kinds whose content IS text and must reach disk as a string. A doc saved
// as an editor's JSON tree instead renders as nothing at all: the viewer tests
// `typeof content === 'string'`, an object fails it, and the fallback renderer
// has no branch for that shape, so the founder is shown an empty panel beside a
// chat that says the document is open (reported twice, on two different
// documents, 2026-07-30 and 2026-07-31).
export const TEXT_CREATION_KINDS = ['markdown', 'persona', 'transcript', 'design', 'canvas'];

const BLOCK_NODES = new Set([
  'doc', 'paragraph', 'heading', 'blockquote', 'listItem', 'bulletList',
  'orderedList', 'codeBlock', 'horizontalRule', 'tableRow',
]);

function gatherText(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) gatherText(n, out); return; }
  if (typeof node.text === 'string') { out.push(node.text); return; }
  if (Array.isArray(node.content)) {
    for (const n of node.content) gatherText(n, out);
    if (BLOCK_NODES.has(node.type)) out.push('\n\n');
  }
}

/**
 * The text of a creation whose content should be a string, whatever shape it
 * actually arrived in. Used at BOTH ends on purpose: the save path so a
 * malformed write never lands, and the viewer so the documents already on disk
 * are readable without anyone rewriting them.
 *
 * It never returns empty for content that exists. Falling back to the raw JSON
 * is ugly, and it is the point: a founder can see what is there, copy it, and
 * ask the agent to rewrite it. A blank panel tells them their work is gone.
 */
export function creationText(content) {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  if (typeof content !== 'object') return String(content);
  for (const key of ['markdown', 'body', 'text']) {
    if (typeof content[key] === 'string') return content[key];
  }
  const parts = [];
  gatherText(content, parts);
  const text = parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  if (text) return text;
  return ['```json', JSON.stringify(content, null, 2), '```'].join('\n');
}

// Creation envelope: { id, kind, title, ts, schemaVersion, meta?, and exactly
//   one of: path (project-relative single file) or dir (project-relative
//   folder, requires entry: the file to run/open within that folder) }
// Content lives on disk, not the envelope.
export function validateCreation(c) {
  const errors = [];
  if (!c?.id) errors.push('creation.id required');
  if (!CREATION_KINDS.includes(c?.kind)) errors.push(`creation.kind must be one of ${CREATION_KINDS.join('|')}`);
  if (!c?.title) errors.push('creation.title required');
  const hasPath = typeof c?.path === 'string' && c.path.length > 0;
  const hasDir = typeof c?.dir === 'string' && c.dir.length > 0;
  if (hasPath === hasDir) errors.push('creation needs exactly one of path (single file) or dir (folder-backed)');
  if (hasDir && !c?.entry) errors.push('folder-backed creation requires entry');
  return errors;
}

/* -------------------------------- findings -------------------------------- */
export const PROVENANCE = ['EXECUTED', 'INFERRED'];
export const SEVERITIES = ['critical', 'major', 'minor', 'note'];

// Finding: { id, title, provenance, severity, category, trigger, expected,
//   actual, quote?, quoteCite?, repro: string[],
//   evidenceRefs: [{ type:'event', runId, seq } | { type:'screenshot', runId, file }] }
//
// The structural honesty rule (Codex round 2): EXECUTED requires evidence that
// RESOLVES. resolver = { eventSeqs(runId): Set<number>, screenshots(runId): Set<string> }
export function validateFinding(f, resolver) {
  const errors = [];
  if (!f?.id) errors.push('finding.id required');
  if (!f?.title) errors.push('finding.title required');
  if (!PROVENANCE.includes(f?.provenance)) errors.push('finding.provenance must be EXECUTED|INFERRED');
  if (!SEVERITIES.includes(f?.severity)) errors.push('finding.severity invalid');
  if (f?.provenance === 'EXECUTED') {
    if (!Array.isArray(f.evidenceRefs) || f.evidenceRefs.length === 0) {
      errors.push(`finding ${f.id}: EXECUTED requires non-empty evidenceRefs`);
    } else if (resolver) {
      for (const ref of f.evidenceRefs) {
        if (ref.type === 'event') {
          if (!resolver.eventSeqs?.(ref.runId)?.has(ref.seq)) {
            errors.push(`finding ${f.id}: dangling event ref ${ref.runId}#${ref.seq}`);
          }
        } else if (ref.type === 'screenshot') {
          if (!resolver.screenshots?.(ref.runId)?.has(ref.file)) {
            errors.push(`finding ${f.id}: dangling screenshot ref ${ref.runId}/${ref.file}`);
          }
        } else {
          errors.push(`finding ${f.id}: unknown evidenceRef type ${ref?.type}`);
        }
      }
    }
    if (!Array.isArray(f.repro) || f.repro.length === 0) {
      errors.push(`finding ${f.id}: EXECUTED requires repro steps`);
    }
  }
  return errors;
}

// Report: { schemaVersion, title, kicker, receipts: { sessions, minutes, findings },
//   intro, findings: Finding[], coverage?, wtp? (QUARANTINED, never a headline),
//   dissent?, theDo: { title, body } }  Reports END in a DO.
export function validateReport(r, resolver) {
  const errors = [];
  if (!r?.title) errors.push('report.title required');
  if (!r?.theDo?.title) errors.push('report must end in a DO (theDo.title required)');
  if (!Array.isArray(r?.findings) || r.findings.length === 0) errors.push('report.findings required');
  for (const f of r?.findings ?? []) errors.push(...validateFinding(f, resolver));
  return errors;
}

/* ---------------------------------- runs ---------------------------------- */
export const BROWSER_MODES = ['playwright', 'patchright'];

// RunConfig: { runId, productDir, entryUrl, personaIds: string[],
//   skillVersions: {}, browserMode, model, startedAt, schemaVersion }
export function validateRunConfig(c) {
  const errors = [];
  if (!c?.runId) errors.push('runConfig.runId required');
  if (!c?.entryUrl) errors.push('runConfig.entryUrl required');
  if (!BROWSER_MODES.includes(c?.browserMode)) errors.push('runConfig.browserMode invalid');
  if (!Array.isArray(c?.personaIds) || c.personaIds.length === 0) errors.push('runConfig.personaIds required');
  return errors;
}

// RunEvent (events.jsonl lines): { seq, ts, type, ...payload }
export const RUN_EVENT_TYPES = [
  'action',      // { tool, args, durationMs, result? } a browser/tool action
  'screenshot',  // { file } file ref relative to the run dir
  'heartbeat',   // { state } liveness for the quiet chip
  'hygiene',     // HygieneEntry created/updated
  'tool',        // { name, durationMs } non-browser tool timing
  'note',        // { text } agent narration
  'usage',       // { model, inputTokens?, outputTokens?, costUsd? } best effort,
                 //   partial under subscription auth; NEVER a dogfood gate
];

// HygieneEntry: { id, kind: 'account'|'row'|'webhook'|'email'|'other', identifier,
//   createdAt, cleanup: 'auto'|'manual', status: 'pending'|'cleaned'|'dismissed',
//   reason? }  A run with any status:'pending' entry is 'needs-cleanup', which is
// a COMPLETION GATE: the UI keeps the run open until each entry is cleaned or
// dismissed with a persisted reason.
export function runNeedsCleanup(hygieneEntries) {
  return (hygieneEntries ?? []).some((h) => h.status === 'pending');
}

// Payment rail rule (concrete, v1): never enter card/payment fields; any payment
// URL/form pauses the run and asks the user. Exported so the browser driver and
// the user-test skill reference ONE rule.
export const PAYMENT_RULE =
  'NEVER enter card or payment details. On any payment page, checkout form, or ' +
  'card field: stop, record a hygiene note, and ask the user how to proceed.';

/* ------------------------- diff-rerun noise honesty ------------------------ */
// v1 makes NO numeric delta claims by default. Count-level comparisons are
// UNCALIBRATED unless >= 2 prior same-config baseline runs exist.
export function noiseBand(baselineFindingCounts) {
  if (!Array.isArray(baselineFindingCounts) || baselineFindingCounts.length < 2) {
    return { calibrated: false, label: 'UNCALIBRATED' };
  }
  const min = Math.min(...baselineFindingCounts);
  const max = Math.max(...baselineFindingCounts);
  return { calibrated: true, min, max, label: `${min}-${max} across ${baselineFindingCounts.length} baseline runs` };
}
