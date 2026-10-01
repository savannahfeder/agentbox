// Work items: the neutral substrate under a self-driving product.
//
// This module is the PURE core, zero-dep ESM, so every writer shares one set of
// rules: the MCP server (many processes at once), the app's main process, and a
// renderer that folds the same lines to draw the same list. No filesystem, no
// network, no Date.now except as an injected default.
//
// What lives here is MECHANISM ONLY: identity, lifecycle, claiming, leases,
// fencing. What a work item MEANS (a milestone, a question, a bug, a next move,
// whether a category has earned the right to act without asking) is deliberately
// NOT here. That judgment belongs to the surface above this one, which is going
// to iterate hard, and a substrate that encoded this week's theory of work would
// have to be rewritten every time the theory moved.
//
// The storage shape is the ledger the dashboard already uses: append-only jsonl,
// folded newest-wins per field. There is no read-modify-write, so a dozen server
// processes cannot lose each other's writes. Two rules make that safe rather
// than merely likely:
//
//   FENCING    Every claim takes a monotonically increasing epoch. Every later
//              agent line carries the epoch it was written under, and the fold
//              DISCARDS any agent line whose epoch is below the current one.
//              Without it, lease expiry is a zombie-writer bug: worker A's lease
//              expires mid-task, B claims, then A (alive, just slow) appends
//              "done" and newest-wins believes A. With it, breaking a lease is
//              safe rather than mostly safe.
//
// AUTHORITY The founder is not a worker, so a founder line carries NO epoch, is
// never discarded as stale, and outranks any agent line for the fields it sets.
// This is what lets the app write an answer while a worker still holds the
// claim: the answer lands, the worker's own status keeps flowing under its
// epoch, and neither erases the other. Same rule as beats in
// shared/dashboard.mjs.

/* ------------------------------- lifecycle ------------------------------- */
// The only states the claim machinery reasons about. Everything else about what
// a work item is (kind, labels) is free-form text the layer above interprets.
//
// blocked is not a synonym for "hard": it means this item cannot proceed until
// something outside it changes, which is the one distinction a puller has to
// make, since claiming a blocked item wastes a whole session.
export const WORK_ITEM_STATUSES = ['open', 'claimed', 'done', 'blocked'];

// Claimable states. done is terminal; claimed belongs to someone until its lease
// lapses; blocked is skipped by a filter-based pull but can still be claimed by
// id, because a worker sent specifically to unblock something should not be told
// no by its own queue.
const PULLABLE = ['open'];

export const WORK_ITEM_SOURCES = ['agent', 'founder', 'system'];

// CLAUDE CODE'S OWN SIX PERMISSION MODES, by its own values. Read off
// `claude --help` on 2.1.241 and off code.claude.com/docs/en/permission-modes,
// 2026-08-23, and every one of them handed to the real CLI to check it starts.
// The renderer, main/settings.mjs and main/answer-modes.mjs each have their own
// reason to know this list. IT IS NOT A LEDGER FIELD ANY MORE: what one reply is
// allowed to do moved out of this file entirely; the note further down says
// why. This list stays here because it is a plain browser-safe constant and
// everything that needs it already imports this module.
export const CLAUDE_PERMISSION_MODES = [
  'default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions',
];

// THE ONE FIELD THAT WAS A GRANT RATHER THAN AN OPINION HAS LEFT THIS FILE.
//
// `answerMode` used to live on the ledger: what one reply is allowed to do on
// the founder's Mac, turned straight into `--permission-mode` on a real process
// by spawnPlan. A guard here stripped it off any line that did not claim to be
// the founder's, which closed the STRUCTURED path, the MCP and the app.
//
// IT COULD NOT CLOSE THE FILE, AND NOTHING WRITTEN HERE EVER COULD. `source` is
// a plain string in a line and nothing checks it. A worker with Bash could
// append one line saying `"source":"founder"` and grant its own next run
// bypassPermissions; the rule and the forgery lived in the same file. Proved on
// a scratch ledger, 2026-08-24.
//
// So the grant left rather than being guarded harder. It is kept in the app's
// own storage now, written by main and by nothing else (main/answer-modes.mjs),
// which is the convention Claude Code uses for its standing policy. Everything
// on the ledger today is a claim about the WORK, and a forged line can still
// fake the founder's archive or answer, which is true of any append-only log
// nobody signs, and is filed as a known issue rather than papered over here. What it can no longer do is hand
// anything a permission.
//
// If a future field is a grant rather than an opinion, the answer is the same
// one: it does not go on the ledger.

// Fields a patch may set. An unrecognized key is DROPPED rather than stored: the
// ledger is a contract, not a bag, and a typo'd field that silently becomes
// state is worse than one that visibly does nothing.
// `label` IS THE NAME ON THE ROW, AND IT EXISTS BECAUSE `title` CANNOT BE ONE.
//
// A dictated message becomes an item whose title is its first line, verbatim
// (message-split.ts). Such titles run long, are often cut off mid sentence with
// an ellipsis, and many open with "I", "I've been", "Can you" or "We". Eleven
// of those in a column is eleven rows that look like one row.
//
// The obvious fix, having a session write a better title, does not work and
// never did: `beats` below makes the founder outrank an agent per field, so
// nearly every such title is the founder's and an agent's rewrite of one is
// accepted here and then dropped on the floor, silently. That is the whole
// reason this is a second field rather than a better-behaved writer.
//
// So `title` stays exactly what the user typed and nothing about who owns it
// changes. `label` is the short written name a session puts beside it, and the
// LIST prefers it (`rowTitle`, list-rules.ts). Everything else still reads the
// title, so the user's own words are what they find when they open the row, and
// search matches either name.
export const WORK_ITEM_FIELDS = [
  'title', 'label', 'body', 'kind', 'labels', 'priority', 'parent',
  'status', 'result', 'note', 'answer', 'product', 'runAt', 'answeredThrough',
  'engine', 'model', 'effort',
  // THE TEAM FIELDS. All four are about PEOPLE on a shared project, and a
  // private project never sets them, so a row without them reads as before.
  //   assignee  the person who has to act next, or 'agent' once a person has
  //             handed it back to the agents
  //   runner    the person whose Mac runs agents on this row; without one it
  //             is whoever started it (`createdBy`)
  //   due       a calendar day, YYYY-MM-DD, or 'none' to clear one
  //   people    who is on the conversation
  'assignee', 'runner', 'due', 'people',
  // THE THREAD'S OWN FIELDS (the team version, approved 2026-10-01).
  //   visibility  'team' (the default), 'people' or 'private': whether every
  //               teammate sees this thread's summary on the Team board, only
  //               the people named in `visibleTo`, or nobody but you
  //   visibleTo   the people a 'people' thread reaches, by id. Ignored on the
  //               other two, and a 'people' thread naming nobody reaches
  //               nobody (shared/thread-cards.mjs says why it fails closed)
  //   problem, progress, solution
  //               the SUMMARY, a sentence or two each. The agent keeps it
  //               current and the person can edit it in place, so these are
  //               the fields where the later write wins whoever wrote it
  //               (SHARED_FIELDS below)
  //   blockedBy, blocks
  //               other threads' ids, the summary's Linked part
  'visibility', 'visibleTo', 'problem', 'progress', 'solution', 'blockedBy', 'blocks',
];

// THE SUMMARY IS SHARED BETWEEN THE PERSON AND THE AGENT. Everywhere else the
// founder's word outranks an agent's forever, which here would mean one edit
// of hers freezes the summary the agent is meant to keep up to date. So on
// these fields the later write wins, whoever made it, and the source is still
// recorded so the panel can say who touched it last.
const SHARED_FIELDS = new Set(['problem', 'progress', 'solution', 'blockedBy', 'blocks']);
const MAX_SUMMARY = 1200;

// A person id or a line id: short, plain, never an object a writer slipped in.
const MAX_PERSON_CHARS = 64;
function shortId(value) {
  return typeof value === 'string' && value && value.length <= MAX_PERSON_CHARS ? value : null;
}
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function calendarDay(value) {
  if (value === 'none') return 'none';
  const m = typeof value === 'string' ? DAY_RE.exec(value) : null;
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? value : undefined;
}

// How long a claim survives without a heartbeat. The MCP server heartbeats on a
// timer while it holds any claim, so this is a liveness signal about the PROCESS
// (session dies, child dies, heartbeats stop) rather than anything the model has
// to remember to do. Generous on purpose: a worker wrongly losing a claim
// mid-task is a worse failure than an abandoned item sitting idle a few minutes.
export const LEASE_MS = 5 * 60 * 1000;

/* --------------------------------- limits -------------------------------- */
// Every budget here is in BYTES, because the only ceiling that actually breaks
// is a byte one: the disk writer refuses a line over MAX_LINE_BYTES outright,
// and a refused write loses a whole report rather than its tail.
const MAX_TITLE = 200;
const MAX_SHORT = 200;
// ONE budget for every long text, because a result is the answer to a body and
// there is no reason an answer may be shorter than the question. It used to be
// a quarter of it, and on 2026-08-11 three of the founder's finished research
// answers reached her reading pane cut mid-sentence for no reason she could
// see. Four fields at this size still leave a line at half the append ceiling.
export const MAX_TEXT_BYTES = 32 * 1024;
const MAX_LABELS = 20;
const MAX_ID_CHARS = 64;
// A single line longer than this is treated as torn or hostile and skipped
// rather than parsed. Matches the ceiling records.mjs already uses.
export const MAX_LINE_BYTES = 256 * 1024;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function isWorkItemId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/* --------------------------------- lines --------------------------------- */
// One appended line. Kept as a builder rather than an object literal at each
// call site so the MCP and the app cannot drift on shape, and so validation runs
// once, here, before anything reaches disk.
export function buildLine({ id, patch, source = 'agent', epoch = null, now = Date.now() }) {
  if (!isWorkItemId(id)) throw new Error(`invalid work item id: ${id}`);
  const src = WORK_ITEM_SOURCES.includes(source) ? source : 'agent';
  const clean = pickFields(patch);
  if (!clean || !Object.keys(clean).length) throw new Error('patch had no recognized work item fields');
  const line = { id, ts: Number.isFinite(now) ? now : Date.now(), source: src, patch: clean };
  // Only an agent is fenced. A founder line carrying an epoch would be claiming
  // to be a worker, so the epoch is dropped rather than honored.
  if (src === 'agent' && Number.isFinite(epoch)) line.epoch = epoch;
  return line;
}

// A claim line is its own shape: it is the thing that MINTS an epoch rather than
// being fenced by one, so it never goes through buildLine.
export function buildClaimLine({ id, epoch, holder, now = Date.now(), leaseMs = LEASE_MS }) {
  if (!isWorkItemId(id)) throw new Error(`invalid work item id: ${id}`);
  if (!Number.isFinite(epoch) || epoch < 1) throw new Error(`invalid epoch: ${epoch}`);
  const ts = Number.isFinite(now) ? now : Date.now();
  return {
    id, ts, source: 'agent', epoch, claim: {
      holder: String(holder ?? 'unknown').slice(0, MAX_ID_CHARS),
      leaseUntil: ts + (Number.isFinite(leaseMs) ? leaseMs : LEASE_MS),
    },
    patch: { status: 'claimed' },
  };
}

// A heartbeat extends the lease and nothing else. Written by the server on a
// timer, never by a model.
//
// It carries NO patch, and that is the whole point: built from buildClaimLine it
// inherited `status: 'claimed'`, so every tick restated a status the worker may
// have moved on from, and one landed three seconds after the founder archived an
// item and pulled it back out of her archive. The fold ignores a heartbeat's
// patch too, for the lines already written.
export function buildHeartbeatLine({ id, epoch, holder, now = Date.now(), leaseMs = LEASE_MS }) {
  const line = buildClaimLine({ id, epoch, holder, now, leaseMs });
  line.heartbeat = true;
  line.patch = {};
  return line;
}

// Release: hand the item back without completing it. Fenced like any agent line,
// so a zombie cannot release its successor's claim.
//
// A RELEASE GIVES UP A CLAIM AND SAYS NOTHING ABOUT STATUS. It used to carry
// patch:{status:'open'}, which made a clean shutdown erase a status the worker
// had deliberately set: mark an item blocked, exit tidily, and the goodbye
// handler released the still-held claim and reopened it, so the queue spawned
// another worker onto work that could not proceed (four times on one item). The
// tidier the exit, the worse the outcome, since a worker killed outright kept
// its blocked status. Handing back an UNFINISHED claim still reads open,
// because the fold derives that from the claim being gone rather than from
// anyone writing it down.
export function buildReleaseLine({ id, epoch, now = Date.now() }) {
  if (!isWorkItemId(id)) throw new Error(`invalid work item id: ${id}`);
  return { id, ts: Number.isFinite(now) ? now : Date.now(), source: 'agent', epoch, release: true };
}

/* -------------------------------- reading -------------------------------- */
// One line, defensively read. Anything unparseable returns null so a corrupt
// ledger degrades to an older picture rather than a broken list.
export function normalizeLine(line) {
  let raw = line;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    try { raw = JSON.parse(text); } catch { return null; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!isWorkItemId(raw.id)) return null;
  const patch = raw.patch;
  if (patch != null && (typeof patch !== 'object' || Array.isArray(patch))) return null;
  const source = WORK_ITEM_SOURCES.includes(raw.source) ? raw.source : 'agent';
  // Validate on READ, not only on write. buildLine cleans what WE append, but
  // the file is the contract and anything can be in it: a line from an older
  // build, a hand edit, a future writer that learned a field we do not know.
  // A garbled field must leave the older value standing rather than become
  // state, so coercion happens here, where every reader passes.
  // Stripped on READ as well as on write, because the file is the contract and
  // anything can be in it: an older build, a hand edit, or a writer that is not
  // us. A grant a non-founder line carries never becomes state.
  const cleanPatch = pickFields(patch) ?? {};
  return {
    id: raw.id,
    ts: Number.isFinite(raw.ts) ? raw.ts : 0,
    source,
    // WHO WROTE IT and the line's own id. Stamped where a line reaches the
    // disk on a signed-in Mac (main/store/work-items.mjs), absent everywhere
    // else, and a line without them reads exactly as it always did.
    by: shortId(raw.by),
    uid: shortId(raw.uid),
    // A founder line is never fenced, so its epoch is ignored even if present.
    epoch: source === 'agent' && Number.isFinite(raw.epoch) ? raw.epoch : null,
    claim: raw.claim && typeof raw.claim === 'object' ? raw.claim : null,
    heartbeat: raw.heartbeat === true,
    release: raw.release === true,
    patch: cleanPatch,
  };
}

// Keep only recognized fields, coerced. Returns null when nothing survives, so a
// caller can refuse the write instead of appending a line that means nothing.
export function pickFields(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const out = {};
  for (const [field, value] of Object.entries(patch)) {
    if (!WORK_ITEM_FIELDS.includes(field)) continue;
    const clean = coerceField(field, value);
    if (clean !== undefined) out[field] = clean;
  }
  return Object.keys(out).length ? out : null;
}

// Over-long text is CUT WITH A MARK, never silently. Five digest rows sit in
// the founder's ledger because workers appending to a nearly-full note could
// not tell whether the store would keep what they wrote, and correctly refused
// to risk dropping news she had not read; each opened a fresh row instead
// (2026-08-06). A writer that can see it lost 400 characters can summarise and
// try again. One that cannot has to guess, and guessing is what flooded her.
const encoder = new TextEncoder();
const byteLength = (text) => encoder.encode(text).length;

function str(value, max) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (byteLength(trimmed) <= max) return trimmed;
  const mark = (n) => `\n\n[truncated: ${n} characters dropped by the store]`;
  const fits = (keep) => byteLength(trimmed.slice(0, keep) + mark(trimmed.length - keep)) <= max;
  // The longest prefix that still leaves room for the mark describing the cut,
  // since the mark must not itself overflow the field it is describing. Cost
  // rises with every character kept and the count it removes from the mark
  // never adds a byte, so the edge is a clean one and a search finds it exactly.
  let lo = 0;
  let hi = trimmed.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid; else hi = mid - 1;
  }
  // Never end on half of a surrogate pair: the budget is bytes, but the cut is
  // made in code units, and an emoji split down the middle is a broken glyph in
  // her reading pane on top of the loss the mark is already reporting.
  const high = lo > 0 && lo < trimmed.length ? trimmed.charCodeAt(lo - 1) : 0;
  if (high >= 0xd800 && high <= 0xdbff) lo -= 1;
  return trimmed.slice(0, lo) + mark(trimmed.length - lo);
}

function coerceField(field, value) {
  switch (field) {
    case 'title': return str(value, MAX_TITLE);
    // The written name the list draws. Bounded the same way the title is and no
    // tighter: what a NAME may be (three to seven words, 64 characters) is a
    // rule about how the app writes, and it lives with the writer in
    // main/row-label.mjs. This module holds no taxonomy, only storage.
    case 'label': return str(value, MAX_TITLE);
    case 'body': case 'result': case 'note': case 'answer': return str(value, MAX_TEXT_BYTES);
    // kind and product are free strings on purpose: the taxonomy of work is the
    // caller's to invent and change without a migration here.
    //
    // `engine` (WHICH CODING AGENT PICKS THIS UP) and `model` join them for the
    // same stated reason: the list of engines is the layer above's to grow, and
    // this module holds no taxonomy. Nothing here has to validate them because
    // nothing here reads them — `engineFor` in shared/engines.mjs falls back to
    // Claude Code for any name it does not know, so an unrecognised value is a
    // working session rather than a row that silently never runs. `effort` (HOW
    // HARD IT THINKS) is the same kind of word: the five the CLI takes live in
    // shared/effort-levels.mjs, and the spawn gates on them, so a value this
    // module does not recognise is a run at Claude Code's own choice rather
    // than a row that never runs.
    case 'kind': case 'product': case 'parent': case 'engine': case 'model': case 'effort': return str(value, MAX_SHORT);
    case 'status': return WORK_ITEM_STATUSES.includes(value) ? value : undefined;
    case 'priority': return Number.isFinite(value) ? Math.trunc(value) : undefined;
    // When this item may next be acted on, in epoch ms. 0 means unscheduled,
    // and it is a REAL value rather than a missing one on purpose: a field
    // that coerces to undefined is dropped by the fold, so without a falsy
    // sentinel a schedule could be set and never cleared.
    case 'runAt': return Number.isFinite(value) ? Math.trunc(value) : undefined;
    // WHICH ANSWER A SESSION HAS ALREADY ACTED ON, as that answer's own ts.
    //
    // An answer had two states and the ledger recorded one. A worker finishes
    // acting on the founder's words and leaves the row where it found it, open
    // and still carrying them, because the thread is alive and closing it is
    // the wrong move. Nothing on disk said the words had been DEALT WITH, so a
    // finished thread and a worker that died mid-sentence were the same item,
    // and every reader guessed: the app kept them out of her inbox, printed them
    // red as "stopped", and respawned workers on them forever (one row took 23
    // sessions on the same two-day-old word, every one a successful no-op).
    //
    // A ts rather than a flag, so her NEXT answer outdates it by carrying a
    // later one, with nothing to clear and nobody who has to remember to.
    case 'answeredThrough': return Number.isFinite(value) ? Math.trunc(value) : undefined;
    case 'labels': {
      if (!Array.isArray(value)) return undefined;
      const labels = value.map((l) => str(l, MAX_SHORT)).filter(Boolean).slice(0, MAX_LABELS);
      return labels.length ? labels : undefined;
    }
    case 'assignee': case 'runner': return shortId(value) ?? undefined;
    case 'due': return calendarDay(value);
    case 'people': {
      if (!Array.isArray(value)) return undefined;
      const people = [...new Set(value.map(shortId).filter(Boolean))].slice(0, MAX_LABELS);
      return people.length ? people : undefined;
    }
    case 'visibility': return value === 'private' || value === 'team' || value === 'people' ? value : undefined;
    // An empty list is a real value: it is how the last chosen person comes
    // off a thread, and the thread then reaches nobody until she names one.
    case 'visibleTo': {
      if (!Array.isArray(value)) return undefined;
      return [...new Set(value.map(shortId).filter(Boolean))].slice(0, MAX_LABELS);
    }
    // An empty string is a real value here: it is how a person clears a line
    // of the summary, and a field that coerces to undefined cannot be cleared.
    case 'problem': case 'progress': case 'solution':
      return typeof value === 'string' ? value.trim().slice(0, MAX_SUMMARY) : undefined;
    case 'blockedBy': case 'blocks': {
      if (!Array.isArray(value)) return undefined;
      return [...new Set(value.map(shortId).filter(Boolean))].slice(0, MAX_LABELS);
    }
    default: return undefined;
  }
}

/* --------------------------------- folding ------------------------------- */
// Fold every line into the current picture: a Map of id to work item.
//
// Each item carries `wrote`: per field, WHO set the value that survived and
// WHEN. It is the fold's own bookkeeping (it is how founder-outranks-agent is
// enforced) and it used to be deleted on the way out, on the grounds that no
// reader needed it. Two readers did, and both failures were silent:
//
//   WHO   An agent's `done` and the founder's archive are the same word for
//         opposite events. Her own ask, ended by an agent, is an answer she has
//         not received; ended by her, it is filed. the app's inbox could not tell
//         them apart, so every answer to a question the founder asked went
//         straight to the archive, and it reasonably looked as though the work
//         never happened, so the same question got asked again and again.
//   WHEN  Two identical nudges are two asks. A delivery keyed on the words
//         alone treats the second as already handled and swallows it.
//
// Order of business per line, and the order matters:
//   1. skip anything unparseable
//   2. skip an agent line fenced out by a newer epoch (the zombie writer)
//   3. apply the claim, if this line carries one
//   4. apply the patch field by field, founder outranking agent
export function foldWorkItems(lines, now = Date.now()) {
  const items = new Map();

  for (const raw of Array.isArray(lines) ? lines : []) {
    const line = normalizeLine(raw);
    if (!line) continue;

    let item = items.get(line.id);
    if (!item) {
      item = {
        id: line.id, status: 'open', title: '', kind: '', labels: [],
        priority: 0, epoch: 0, claim: null, createdAt: line.ts, updatedAt: line.ts,
        createdBy: line.by, wrote: {},
      };
      items.set(line.id, item);
    }
    // Who started the row is whoever wrote its EARLIEST line, not the first
    // line this Mac happened to receive: a teammate's lines arrive late.
    if (line.ts < item.createdAt || (line.ts === item.createdAt && !item.createdBy)) {
      if (line.by) item.createdBy = line.by;
    }

    // Fencing. An agent line written under a superseded epoch is the whole
    // reason this field exists: it is a live worker whose lease lapsed, and
    // everything it has to say about this item is now someone else's business.
    if (line.source === 'agent' && line.epoch != null && line.epoch < item.epoch) continue;

    if (line.claim) {
      // A claim at or above the current epoch takes the item. A heartbeat only
      // extends a lease it still legitimately holds.
      const renewsHeldClaim = !line.heartbeat || (item.claim
        && line.epoch === item.epoch && line.claim.holder === item.claim.holder);
      if (line.epoch >= item.epoch && renewsHeldClaim) {
        item.epoch = line.epoch;
        item.claim = {
          holder: String(line.claim.holder ?? ''),
          leaseUntil: Number.isFinite(line.claim.leaseUntil) ? line.claim.leaseUntil : line.ts,
        };
      }
    }

    if (line.release && line.epoch != null && line.epoch >= item.epoch) item.claim = null;

    // A HEARTBEAT EXTENDS A LEASE AND NOTHING ELSE, which is what its own
    // comment always said. It is built from buildClaimLine, so it carried that
    // line's `patch: { status: 'claimed' }`, and a timer tick has therefore
    // been quietly rewriting status: over an item a live worker had just set to
    // 'blocked', and, three seconds after the founder archived one, over that.
    // Enforced on READ as well as at the write, because the lines that did it
    // are already in her ledger and will be there forever.
    const patch = line.heartbeat ? {} : line.patch;

    for (const [field, value] of Object.entries(patch)) {
      const held = item.wrote[field];
      // There used to be an exception here, for machinery spending a one-off
      // permission mode over the founder's own grant. That field is not on the
      // ledger any more (see the note beside WORK_ITEM_FIELDS), so
      // the plain rule is the only rule: a weaker writer never overwrites a
      // stronger one's value.
      if (held && !beats(line, held, field)) continue;
      item[field] = value;
      item.wrote[field] = { ts: line.ts, source: authorityOf(line, field, value) };
      if (line.by) item.wrote[field].by = line.by;
    }

    item.updatedAt = Math.max(item.updatedAt, line.ts);
    if (line.ts < item.createdAt) item.createdAt = line.ts;
  }

  // Lease expiry is computed at READ time, never written. A held claim whose
  // lease has lapsed reads as open again, which is what makes an abandoned item
  // recoverable without anyone having to notice it was abandoned.
  //
  // The same derivation covers a released claim, and that is the point: only an
  // item still sitting at `claimed` with nobody holding it goes back to open.
  // Any status a worker or the founder actually chose (done, blocked, or one we
  // have not invented yet) is theirs, and nothing about giving a claim back
  // overwrites it.
  for (const item of items.values()) {
    item.claimExpired = !!(item.claim && item.claim.leaseUntil < now);
    if (item.status === 'claimed' && (!item.claim || item.claimExpired)) item.status = 'open';
  }

  return items;
}

/* -------------------------------- the thread ----------------------------- */
// EVERY TURN OF ONE ROW, OLDEST FIRST. The fold answers "what does this item
// say now"; this answers "what has been said here", which is a different
// question and nothing could ask it before.
//
// There was a real hole here. Every reply the user wrote spawned a fresh session
// holding one field, `answer`, with no sight of their earlier answers on the same
// row and no sight of the work it was replying about. One session built
// thirty-nine images off a bare line asking for more options, because cold that
// is what the line says. The whole exchange was on disk the entire time: the
// ledger is append-only, so every superseded answer, result, note and rewritten
// body is still a line in it. Only the fold was throwing them away.
//
// FOUR FIELDS ARE THE CONVERSATION and the rest are bookkeeping. Her answers,
// the results sessions wrote back, the checkpoints they left her, and the body
// each round rewrote to ask the next question. status, labels, priority and
// claims are how the row moves, not anything anyone said.
const THREAD_FIELDS = ['body', 'note', 'result', 'answer'];

export function threadOf(lines, id) {
  const turns = [];
  for (const raw of Array.isArray(lines) ? lines : []) {
    const line = normalizeLine(raw);
    if (!line || line.id !== id) continue;
    // A heartbeat carries a patch it never meant (see the fold), so it would
    // otherwise put a stale body into the transcript every five minutes.
    if (line.heartbeat) continue;
    for (const field of THREAD_FIELDS) {
      const text = line.patch?.[field];
      if (typeof text !== 'string' || !text.trim()) continue;
      turns.push({ ts: line.ts, source: authorityOf(line, field, text), field, text });
    }
  }
  // Stable by time. Within one millisecond THREAD_FIELDS order decides, so an
  // append that sets a body and a result reads body-then-result rather than in
  // whatever order Object.entries happened to hand them over.
  turns.sort((a, b) => a.ts - b.ts);
  // THE SAME TEXT TWICE IS ONE THING SAID ONCE. A patch that rewrites a title
  // and re-sends an unchanged body is the ordinary case, and the second copy is
  // not a turn: it is the store's shape leaking into what reads as a transcript.
  const out = [];
  const seen = new Set();
  for (const turn of turns) {
    const key = `${turn.field}:${turn.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(turn);
  }
  return out;
}

// How much authority a write actually claims over the field it sets.
//
// The founder's word wins per field, and for a status that has to mean her
// terminal word: an item she archived is archived, whatever a worker still
// running on it writes next. But 'open' from her is not a verdict, it is a
// HANDBACK, and holding the field with it would freeze the very machinery
// she just handed it to: the claim, the blocked, the done that follow could
// never land. So a handback claims no authority, and the item moves again
// as it should.
function authorityOf(line, field, value) {
  if (line.source === 'founder' && field === 'status' && value === 'open') return 'system';
  return line.source;
}

// Does the incoming line outrank the one already holding this field? The founder
// wins over any agent regardless of time; between equals, later wins.
function beats(incoming, held, field) {
  if (SHARED_FIELDS.has(field)) return incoming.ts >= held.ts;
  if (held.source === 'founder' && incoming.source !== 'founder') return false;
  if (incoming.source === 'founder' && held.source !== 'founder') return true;
  return incoming.ts >= held.ts;
}

/* --------------------------------- queries ------------------------------- */
// Can this item be pulled right now by a worker that holds nothing?
// Whether an item's scheduled moment has arrived. A `runAt` in the future means
// nothing happens with this item yet: it is not claimable, it does not spawn,
// and it is not in the founder's inbox.
//
// A MISSED MOMENT NEEDS NO CATCH-UP. Nothing fires, so nothing can be missed:
// once the moment passes this is true forever, and the first read after the
// machine wakes is as good as the one that would have happened at 6am. That is
// the whole reason this is a predicate over the clock rather than a timer, and
// it is what makes a schedule survive an app restart, a reboot, and a store
// restored onto another machine (the founder's requirement, 2026-08-06).
export function isDue(item, now = Date.now()) {
  return !item?.runAt || item.runAt <= now;
}

export function isClaimable(item, now = Date.now()) {
  if (!item) return false;
  if (!PULLABLE.includes(item.status)) return false;
  if (!isDue(item, now)) return false;
  return !item.claim || item.claim.leaseUntil < now;
}

// The list, in the order a puller should consider it: highest priority first,
// then oldest, so nothing starves behind a stream of new arrivals.
export function sortForPull(items) {
  return [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt);
}

export function matchesFilter(item, filter = {}) {
  if (!item) return false;
  if (filter.status && item.status !== filter.status) return false;
  if (filter.kind && item.kind !== filter.kind) return false;
  if (filter.product && item.product !== filter.product) return false;
  if (filter.parent && item.parent !== filter.parent) return false;
  if (Array.isArray(filter.labels) && filter.labels.length) {
    const has = new Set(item.labels ?? []);
    if (!filter.labels.every((l) => has.has(l))) return false;
  }
  return true;
}
