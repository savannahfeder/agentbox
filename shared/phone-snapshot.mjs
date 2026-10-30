// ONE THREAD, AS HER PHONE SEES IT WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md).
//
// Her Mac writes this for each thread of a project she put on her phone, and
// the phone reads it. It is what the phone's own screens already draw: the row
// as the Mac folded it (the phone never decides a thread's state from raw
// lines; Codex's review of the plan, finding 5), and the thread's history as
// the window reads it (store.readHistory), which the thread view turns into
// the conversation. Long text is cut, and only the latest lines go. Browser-
// safe: no node imports.

import { checkSetting } from './phone-settings.mjs';

// How much of one thread goes up. The latest of a thread is what she reads on
// a phone; the whole of it stays on the Mac. `bytes` is measured in UTF-8, as
// the database measures it (Codex's review of step 1, finding 9).
export const SNAPSHOT_LIMITS = { lines: 400, textChars: 12_000, items: 300, bytes: 900_000 };

// WHAT A COPY MAY CARRY, BY NAME (Codex's review of step 1, finding 2). A copy
// is built out of these and nothing else, never by copying a row and deleting
// the bad parts: a lease, an epoch, who may see a team thread, a field some
// later version adds, none of it leaves unless it is named here.
const ROW_FIELDS = [
  'id', 'title', 'label', 'body', 'kind', 'labels', 'priority', 'parent', 'status',
  'result', 'note', 'answer', 'runAt', 'snoozedUntil', 'answeredThrough',
  'engine', 'model', 'start', 'due', 'problem', 'progress', 'solution',
  'createdAt', 'updatedAt', 'pinned',
];
// The fields a line in a thread's history may carry in its patch: what the
// thread view draws as the conversation and its state changes.
const LINE_FIELDS = [
  'title', 'label', 'body', 'kind', 'labels', 'priority', 'status', 'result',
  'note', 'answer', 'runAt', 'snoozedUntil', 'start', 'due', 'problem',
  'progress', 'solution', 'inReplyTo',
];
const SOURCES = new Set(['founder', 'agent', 'system']);

// KEYS AND TOKENS IN WHAT AN AGENT OR SHE WROTE, hidden. A conversation can
// quote one ("here is the key it used"), and a copy online is no place for it.
const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}=*/gi,
  /\b(Basic\s+)[A-Za-z0-9+/]{12,}=*/gi,
];
// A VALUE GIVEN A SECRET'S NAME, whatever it looks like (Codex's second and
// third reviews): `AWS_SECRET_ACCESS_KEY=...`, `password: hunter22`,
// `PASSWORD=12345678`, `password="correct horse battery staple"`. The name
// stays, so the sentence still reads; a quoted value goes whole.
const STRONG = '[A-Za-z0-9_.-]*(?:passw(?:or)?d|passphrase|secret|api[_-]?key|access[_-]?key|private[_-]?key|credentials?|authorization|(?:auth|access|refresh|session|bearer|id)[_-]?token)[A-Za-z0-9_.-]*';
// "token" alone is a word people use ("token: unexpected identifier"), so it
// counts only as an ENV_STYLE name, or before a long run that looks like a key.
const WEAK = '(?:[A-Z0-9_]*TOKEN[A-Z0-9_]*|token)';
// A quoted value goes whole, however long, escaped quotes and all; a bare one
// is everything up to a space, brackets included (Codex's fourth review).
const VALUE = '(?:"((?:[^"\\\\\\n]|\\\\.)*)"|\'((?:[^\'\\\\\\n]|\\\\.)*)\'|([^\\s"\',;]+))';
const NAMED_STRONG = new RegExp(`\\b(${STRONG})(["']?\\s*[:=]\\s*)${VALUE}`, 'gi');
const NAMED_WEAK = new RegExp(`\\b(${WEAK})(["']?\\s*[:=]\\s*)${VALUE}`, 'g');
const hidden = (name, sep, dq, sq, bare) => `${name}${sep}${dq !== undefined ? '"[hidden]"' : sq !== undefined ? "'[hidden]'" : '[hidden]'}`;
function hideNamed(text) {
  let out = text.replace(NAMED_STRONG, (m, name, sep, dq, sq, bare) => (bare === '[hidden]' ? m : hidden(name, sep, dq, sq, bare)));
  out = out.replace(NAMED_WEAK, (m, name, sep, dq, sq, bare) => {
    const value = dq ?? sq ?? bare ?? '';
    // MAX_TOKENS=128000 and TOKEN_LIMIT=8192 are settings: a bare number is
    // never taken for a key under this weaker name.
    const envStyle = name !== 'token' && name === name.toUpperCase() && !/^[0-9]+$/.test(value);
    const keyLike = value.length >= 16 && /[0-9]/.test(value) && !/\s/.test(value);
    return value !== '[hidden]' && (envStyle || keyLike) ? hidden(name, sep, dq, sq, bare) : m;
  });
  return out;
}
// AND A LONG RUN OF LETTERS AND DIGITS THAT LOOKS LIKE NOTHING BUT A KEY: 32 or
// more, upper and lower case and digits all present. A commit id or a uuid is
// one case of hex and is left alone.
const KEYLIKE = /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{32,}\b/g;
// A file's path is not a key, however long its name: a saved picture is a
// random prefix joined to the file's own name, and hidden, its link leads nowhere.
// Bounded so a long run with no extension costs little.
const FILE_PATH = /[\w./~-]{0,300}\.(?:png|jpe?g|gif|webp|heic|svg|mp4|mov|webm|m4a|mp3|wav|pdf|txt|md|html?|csv|json|zip)(?![\w])/gi;
function hideKeyLike(text) {
  let out = '';
  let at = 0;
  for (const m of text.matchAll(FILE_PATH)) {
    out += text.slice(at, m.index).replace(KEYLIKE, '[hidden]') + m[0];
    at = m.index + m[0].length;
  }
  return out + text.slice(at).replace(KEYLIKE, '[hidden]');
}
export function hideSecrets(text, { home = null } = {}) {
  let out = String(text);
  for (const re of SECRETS) out = out.replace(re, (m, bearer) => (typeof bearer === 'string' && /^(Bearer|Basic)/i.test(bearer) ? `${bearer}[hidden]` : '[hidden]'));
  out = hideNamed(out);
  out = hideKeyLike(out);
  // Her home folder is ~ online, as it is in a crash report (shared/crash-scrub.mjs).
  if (home && home.length > 1) out = out.split(home).join('~');
  return out;
}

const clip = (s, n, ctx) => {
  const t = hideSecrets(s, ctx);
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
// A value of a named field: text cut and cleaned, numbers as they are, short
// lists of words, nothing nested.
function plain(v, n, ctx) {
  if (typeof v === 'string') return clip(v, n, ctx);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean' || v === null) return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').slice(0, 40).map((x) => clip(x, 200, ctx));
  return undefined;
}
function pick(obj, fields, n, ctx) {
  const out = {};
  for (const f of fields) {
    if (!obj || !(f in obj)) continue;
    const v = plain(obj[f], n, ctx);
    if (v !== undefined) out[f] = v;
  }
  return out;
}

export const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

// THE REPEATING TASKS OF THE PROJECTS ON HER PHONE, cleaned as a thread's
// words are, riding with the computer's settings copy.
const REPEAT_FIELDS = ['id', 'title', 'body', 'priority', 'every', 'on', 'at', 'engine', 'model', 'createdAt', 'updatedAt', 'served', 'lastOccurrence'];
export const REPEATS_MAX = 200;
export function phoneRepeatsOf(rules, slugs, { home = null } = {}) {
  const on = new Set(slugs);
  return (Array.isArray(rules) ? rules : [])
    .filter((r) => r && !r.endedAt && on.has(r.product) && typeof r.id === 'string')
    .slice(0, REPEATS_MAX)
    .map((r) => ({ product: r.product, ...pick(r, REPEAT_FIELDS, 4000, { home }) }));
}

// YOUR AI TEAMMATES, AND YOUR CHAT WITH THEM (main/teammates.mjs `view`),
// riding with the settings copy as the repeating tasks do. Named fields only;
// the method, memory and playbooks stay on the computer.
const MATE_FIELDS = ['id', 'name', 'letter', 'role', 'job', 'primary', 'paused', 'status', 'product', 'engine', 'model', 'now', 'queued', 'runsThisWeek', 'worksLabel', 'createdAt'];
const CHAT_FIELDS = ['id', 'kind', 'from', 'to', 'text', 'title', 'details', 'verb', 'ref', 'options', 'ts', 'via', 'setup', 'start', 'product'];
const RUN_FIELDS = ['id', 'kind', 'teammate', 'item', 'product', 'title', 'verb', 'by', 'byName', 'waiting', 'answered', 'text', 'ts', 'said'];
export const TEAMMATES_LIMITS = { mates: 40, lines: 300, textChars: 3000, bytes: 120_000 };
const ref = (r, ctx) => (r && typeof r.id === 'string' && typeof r.product === 'string' ? { id: r.id, product: r.product, title: clip(String(r.title ?? ''), 300, ctx) } : null);

export function phoneTeammatesOf(view, { home = null, limits = TEAMMATES_LIMITS } = {}) {
  if (!view || !Array.isArray(view.list)) return null;
  const ctx = { home };
  const n = limits.textChars;
  const list = view.list.filter((t) => t && typeof t.id === 'string' && !t.endedAt).slice(0, limits.mates).map((t) => ({
    ...pick(t, MATE_FIELDS, 600, ctx),
    running: ref(t.running ? { ...t.running, title: '' } : null, ctx),
    waiting: (Array.isArray(t.waiting) ? t.waiting : []).slice(0, 20).map((r) => ref(r, ctx)).filter(Boolean),
    duties: (Array.isArray(t.duties) ? t.duties : []).slice(0, 12).map((d) => pick(d, ['id', 'what', 'when'], 300, ctx)),
  }));
  const lines = (all, fields) => (Array.isArray(all) ? all : []).filter((l) => l && typeof l.id === 'string' && Number.isFinite(l.ts)).slice(-limits.lines).map((l) => {
    const out = pick(l, fields, n, ctx);
    if (l.answers && typeof l.answers === 'object' && !Array.isArray(l.answers)) {
      out.answers = Object.fromEntries(Object.entries(l.answers).filter(([, a]) => typeof a === 'string').slice(0, 20).map(([q, a]) => [String(q).slice(0, 80), clip(a, 2000, ctx)]));
    }
    return out;
  });
  const chat = lines(view.chat, CHAT_FIELDS);
  const runs = lines(view.runs, RUN_FIELDS);
  const out = { list, chat: [], runs: [], ...(typeof view.trouble === 'string' ? { trouble: clip(view.trouble, 300, ctx) } : {}) };
  // The newest lines first, until it would not fit beside the settings.
  let left = limits.bytes - bytesOf(out);
  const newestFirst = [...chat.map((l, i) => ({ l, i })), ...runs.map((l, i) => ({ l, i }))].sort((a, b) => b.l.ts - a.l.ts || b.i - a.i).map((x) => x.l);
  for (const l of newestFirst) {
    left -= bytesOf(l) + 1;
    if (left < 0) break;
    (l.kind === 'run' ? out.runs : out.chat).push(l);
  }
  out.chat.reverse();
  out.runs.reverse();
  return out;
}

// `item` is the folded row; `history` is store.readHistory for it. `home` is
// her home folder, written ~ in the copy.
export function threadSnapshot(item, history = [], limits = SNAPSHOT_LIMITS, { home = null } = {}) {
  const ctx = { home };
  const row = pick(item, ROW_FIELDS, limits.textChars, ctx);
  // Who wrote each field, which is how the screens tell her words from an
  // agent's: the source and the moment, nothing else of it.
  if (item?.wrote && typeof item.wrote === 'object') {
    const wrote = {};
    for (const f of ROW_FIELDS) {
      const w = item.wrote[f];
      if (w && SOURCES.has(w.source) && Number.isFinite(w.ts)) wrote[f] = { ts: w.ts, source: w.source };
    }
    row.wrote = wrote;
  }
  const lines = [];
  for (const l of Array.isArray(history) ? history : []) {
    if (!l || l.claim || l.release || l.heartbeat || !SOURCES.has(l.source) || !Number.isFinite(l.ts)) continue;
    const patch = pick(l.patch, LINE_FIELDS, limits.textChars, ctx);
    if (!Object.keys(patch).length) continue;
    lines.push({ id: row.id, ts: l.ts, source: l.source, patch });
  }
  // Under the database's megabyte, with room: fewer lines until it fits, and
  // then shorter text, so one long thread never stops the rest being sent.
  for (let keep = limits.lines, chars = limits.textChars; ;) {
    const kept = lines.slice(-keep);
    const snap = {
      v: 3,
      item: chars === limits.textChars ? row : pick(row, ROW_FIELDS, chars, ctx),
      history: chars === limits.textChars ? kept : kept.map((l) => ({ ...l, patch: pick(l.patch, LINE_FIELDS, chars, ctx) })),
      olderLines: lines.length - kept.length,
    };
    if (row.wrote && snap.item !== row) snap.item.wrote = row.wrote;
    if (bytesOf(snap) <= limits.bytes) return snap;
    if (keep > 1) keep = Math.floor(keep / 2);
    else if (chars > 200) chars = Math.floor(chars / 4);
    else return { v: 3, item: { id: row.id, title: clip(row.title ?? '', 200, ctx), status: row.status, updatedAt: row.updatedAt }, history: [], olderLines: lines.length };
  }
}

// WHICH PROJECTS ARE ON THE PHONE OF THE PERSON SIGNED IN.
//
// ALL OF THEM, UNLESS SHE SAYS OTHERWISE (2026-10-15: "95% of people just want
// all of their projects connected ... I just turn them all on"). One switch
// for the lot, on until she turns it off, and new projects go up with the
// rest; keeping a project on this computer only is the exception, named
// project by project (`except`).
//
// Her choice is kept with her id on it (`phoneProducts` in the config:
// { owner, all, except }), so somebody else signing in on this computer starts
// from the default rather than from her choices (Codex's review of step 1,
// finding 1). A choice saved in the first shape, a list of the projects she
// turned on ({ owner, slugs }), reads as all of them except the ones that list
// left out, so the projects she had on stay on.
// `every` is every project here, by slug.
// The projects that can go to a phone at all: not the walk's practice project.
export const phoneEligible = (products) => (Array.isArray(products) ? products : []).map((p) => p?.slug).filter((s) => typeof s === 'string' && s && s !== 'practice');
export function phoneChoiceOf(saved, personId, every = []) {
  const mine = personId && saved && typeof saved === 'object' && saved.owner === personId ? saved : null;
  if (!mine) return { all: true, except: [] };
  if (mine.all === undefined && Array.isArray(mine.slugs)) {
    const on = new Set(mine.slugs);
    return { all: true, except: every.filter((s) => !on.has(s)) };
  }
  return { all: mine.all !== false, except: Array.isArray(mine.except) ? mine.except.filter((s) => typeof s === 'string' && s) : [] };
}
export function phoneProjectsOf(saved, personId, every = []) {
  if (!personId) return [];
  const { all, except } = phoneChoiceOf(saved, personId, every);
  if (!all) return [];
  const kept = new Set(except);
  return every.filter((s) => typeof s === 'string' && s && !kept.has(s));
}
// One project on or off the phone; the rest as they were.
export function withPhoneProject(saved, personId, slug, on, every = []) {
  if (!personId) throw new Error('sign in first');
  const { all, except } = phoneChoiceOf(saved, personId, every);
  const kept = new Set(except);
  if (on) kept.delete(slug); else kept.add(slug);
  return { owner: personId, all, except: [...kept] };
}
// The whole phone on or off; which projects stay local is remembered.
export function withPhoneAll(saved, personId, on, every = []) {
  if (!personId) throw new Error('sign in first');
  const { except } = phoneChoiceOf(saved, personId, every);
  return { owner: personId, all: !!on, except };
}

// A NEW THREAD STARTED ON THE PHONE has a row there before the Mac makes it,
// under this id, and a reply to it before then is a reply to this id. The Mac
// remembers which real row it became (main/phone-inbox.mjs) (Codex's review of
// step 1, finding 8). Shaped like a row id, so every screen takes it.
export const madeHere = (commandId) => `w-${String(commandId).replace(/[^0-9a-f]/gi, '').slice(0, 10).toLowerCase()}`;

// The threads of a project worth carrying: everything not yet archived, and
// what was finished in the last fortnight, newest first, at most `items`.
export function threadsWorthCarrying(items, { now = Date.now(), limits = SNAPSHOT_LIMITS } = {}) {
  const fortnight = 14 * 24 * 3600_000;
  return (Array.isArray(items) ? items : [])
    .filter((i) => i && !i.agent && (i.status !== 'done' || now - (i.updatedAt ?? 0) < fortnight))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limits.items);
}

// WHY A THREAD NOTHING IS RUNNING ON IS WAITING, as the Mac's own status says
// it (Supervisor#status), for the copy it sends up (w-24119e8784). Without it
// the phone read every thread waiting its turn as "Nothing running". The order
// is the desktop's: a dead worker first, then a ship owed, then a tool that
// cannot start anything, then the queue. `paused` is the whole fleet's, and the
// publisher lays it on each open thread with no other reason.
export const WAIT_STATES = ['queued', 'next', 'signin', 'limit', 'paused', 'stalled', 'shipping'];
export function phoneWaitsOf(status) {
  const byId = {};
  if (!status) return { byId, paused: false };
  const set = (id, wait) => { if (typeof id === 'string' && id && !byId[id]) byId[id] = wait; };
  for (const id of status.stalled ?? []) set(id, { state: 'stalled' });
  for (const id of status.shipping ?? []) set(id, { state: 'shipping' });
  for (const [id, tool] of Object.entries(status.signInNeeded ?? {})) set(id, { state: 'signin', tool: String(tool) });
  for (const [id, l] of Object.entries(status.atLimit ?? {})) set(id, { state: 'limit', tool: String(l?.tool ?? ''), until: Number(l?.until) || 0 });
  const next = new Set(status.runNow ?? []);
  for (const id of status.queued ?? []) set(id, { state: next.has(id) ? 'next' : 'queued' });
  return { byId, paused: !!status.paused };
}

// A cheap, stable fingerprint, so a thread that did not change is not sent.
export function snapshotKey(snapshot) {
  const text = JSON.stringify(snapshot);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

// WHAT HER PHONE MAY ASK HER MAC TO DO, and nothing else. A command that is not
// one of these, or names a project she did not put on her phone, or a thread
// that is not in it, is refused and says why.
// A `setting` belongs to the computer, not a project (shared/phone-settings.mjs).
export const PHONE_COMMANDS = ['reply', 'new', 'snooze', 'close', 'stop', 'run-now', 'send-now', 'reopen', 'schedule', 'approve', 'setting', 'move-to-cloud'];

// A PERMISSION CARD AS HER PHONE DRAWS IT: what the agent asks to do, with the
// secrets in it hidden as a thread's words are, and the fingerprint of the card
// her Mac drew, which her answer must carry back.
export function phoneApproval(request, card, ctx = {}) {
  // Her Allow signs the whole request by its digest, so the phone may carry the
  // digest only when it drew the request whole; a card that hid, clipped or
  // dropped anything carries none and is answered on the computer. A home path
  // written ~ is for her eyes, not a value hidden from what she signs.
  let lossy = false;
  const text = (s, n) => {
    if (hideSecrets(s) !== s) lossy = true;
    const t = hideSecrets(s, ctx);
    if (t.length > n) { lossy = true; return `${t.slice(0, n)}…`; }
    return t;
  };
  const clean = (v, depth = 0) => {
    if (typeof v === 'string') return text(v, 4000);
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
    if (depth > 3) { lossy = true; return undefined; }
    if (Array.isArray(v)) { if (v.length > 40) lossy = true; return v.slice(0, 40).map((x) => clean(x, depth + 1)); }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v);
      if (entries.length > 40) lossy = true;
      return Object.fromEntries(entries.slice(0, 40).map(([k, x]) => [k, clean(x, depth + 1)]));
    }
    return undefined;
  };
  const shown = { id: String(request.id), at: Number(request.at) || 0, tool: text(String(request.tool ?? 'unknown'), 200), input: clean(request.input ?? {}) };
  return lossy ? { ...shown, card: null, answerOnComputer: true } : { ...shown, card };
}

// WHAT SHE PICKED WITH A REPLY OR A NEW THREAD, as the window's own handlers
// take it (main/ipc.mjs zero:answer, zero:compose): only these fields, each
// only in its right shape. Null on a reply clears a choice, as in the window.
const WORD = /^[A-Za-z][\w.:-]{0,79}$/;
const word = (v, n = 80) => typeof v === 'string' && v.length <= n && WORD.test(v);
const orNull = (ok) => (v) => v === null || ok(v);
const CHOICES = {
  reply: {
    permissionMode: orNull((v) => word(v, 40)), model: orNull(word), effort: orNull((v) => word(v, 20)),
    priority: (v) => Number.isInteger(v) && v >= 0 && v <= 10, now: (v) => v === true, unschedule: (v) => v === true,
  },
  new: {
    runAt: (v) => Number.isFinite(v) && v > 0, start: (v) => v === 'later' || v === 'now',
    engine: (v) => word(v, 40), model: word, effort: (v) => word(v, 20), priority: (v) => Number.isInteger(v) && v >= 0 && v <= 10,
    assignee: (v) => typeof v === 'string' && v.length >= 1 && v.length <= 80, due: (v) => typeof v === 'string' && v.length <= 40,
    visibility: (v) => ['team', 'people', 'private'].includes(v),
    visibleTo: (v) => Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === 'string' && x.length <= 80),
    // To Auto (shared/auto-route.mjs), and no other label.
    labels: (v) => Array.isArray(v) && v.length === 1 && v[0] === 'auto',
  },
};
export function phoneChoices(kind, p) {
  const out = {};
  for (const [k, ok] of Object.entries(CHOICES[kind] ?? {})) if (p && k in p && p[k] !== undefined && ok(p[k])) out[k] = p[k];
  return out;
}
export function checkCommand(cmd, { projects, hasItem }) {
  if (!cmd || !PHONE_COMMANDS.includes(cmd.kind)) return 'not something the phone may do';
  if (cmd.kind === 'setting') return cmd.project != null || cmd.item != null ? 'a setting names no project or thread' : checkSetting(cmd.payload);
  if (!projects.includes(cmd.project)) return 'that project is not on your phone';
  const p = cmd.payload || {};
  if (cmd.kind === 'new') {
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const body = typeof p.body === 'string' ? p.body.trim() : '';
    if (!title && !body) return 'a new thread needs some words';
    return null;
  }
  if (!cmd.item || !hasItem(cmd.project, cmd.item)) return 'that thread is not on your phone';
  if (cmd.kind === 'reply' && !(typeof p.text === 'string' && p.text.trim())) return 'an empty reply';
  if (cmd.kind === 'snooze' && !(Number.isFinite(p.until) && p.until >= 0)) return 'a snooze needs a time';
  if (cmd.kind === 'schedule' && !(Number.isFinite(p.runAt) && p.runAt >= 0)) return 'a schedule needs a time';
  if (cmd.kind === 'approve' && !(typeof p.approval === 'string' && /^[\w-]{1,80}$/.test(p.approval) && typeof p.allow === 'boolean'
    && typeof p.card === 'string' && /^[\w+/=-]{8,200}$/.test(p.card) && (p.note === undefined || (typeof p.note === 'string' && p.note.length <= 500)))) return 'an answer needs its card';
  return null;
}

// A TURN THE CLOUD TOOK WITH THE COMPUTER SHUT, written into the thread's copy
// by the cloud server (cloud/gateway/phone.mjs), as the computer would have
// written it: her reply, the agent's answer and the row waiting on her
// (main/store.mjs recordSessionResult). The computer's own copy replaces this
// one once it is back and has brought the run home.
export function withCloudTurn(snapshot, { reply, answer, repliedAt, answeredAt, status = 'blocked' }, limits = SNAPSHOT_LIMITS) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.item?.id) return null;
  const ctx = { home: null };
  const id = snapshot.item.id;
  // No reply for a new thread's first turn: her ask is already its first line.
  const replied = reply !== null && reply !== undefined;
  const said = clip(String(reply ?? ''), limits.textChars, ctx);
  const result = clip(String(answer ?? ''), limits.textChars, ctx);
  const lines = [
    ...(replied ? [{ id, ts: repliedAt, source: 'founder', patch: { answer: said, status: 'open' } }] : []),
    { id, ts: answeredAt, source: 'agent', patch: { result } },
    { id, ts: answeredAt, source: 'system', patch: { status } },
  ];
  const wrote = { ...(snapshot.item.wrote ?? {}), ...(replied ? { answer: { ts: repliedAt, source: 'founder' } } : {}), result: { ts: answeredAt, source: 'agent' }, status: { ts: answeredAt, source: 'system' } };
  const item = { ...snapshot.item, ...(replied ? { answer: said } : {}), result, status, updatedAt: answeredAt, wrote };
  let history = [...(Array.isArray(snapshot.history) ? snapshot.history : []), ...lines];
  let older = Number(snapshot.olderLines) || 0;
  while (history.length > limits.lines || (history.length > lines.length && bytesOf({ ...snapshot, item, history }) > limits.bytes)) {
    history = history.slice(1);
    older += 1;
  }
  return { ...snapshot, item, history, olderLines: older };
}

// THE PHONE'S COPY OF A THREAD THE CLOUD STARTED FROM THE PHONE, before its
// computer has one: the row her ask made, being worked on.
export function newThreadSnapshot({ itemId, title, body = '', at }, limits = SNAPSHOT_LIMITS) {
  const words = { title: String(title ?? ''), ...(body ? { body: String(body) } : {}) };
  const said = { ts: at, source: 'founder' };
  return threadSnapshot(
    { id: itemId, ...words, kind: 'directive', labels: ['founder'], priority: 0, status: 'claimed', createdAt: at, updatedAt: at, wrote: { title: said, ...(body ? { body: said } : {}) } },
    [{ ts: at, source: 'founder', patch: { ...words, status: 'open' } }],
    limits,
  );
}
