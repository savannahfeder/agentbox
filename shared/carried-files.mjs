// PURE. Which words in a message name a file that should open for everyone on it.
//
// One list of kinds, because this is also the outer limit of what a message can
// take off the sender's computer: no key file, no script, no config.
const PICTURE_EXT = 'png|jpe?g|gif|webp|svg|avif';
const PLAYED_EXT = 'mp4|mov|m4v|webm|mp3|wav|m4a|aac|ogg';
const EXT = `${PICTURE_EXT}|${PLAYED_EXT}|md|markdown|html?|pdf`;

const KIND = new RegExp(String.raw`\.(?:${EXT})$`, 'i');
const DRAWN_IN_A_DOCUMENT = new RegExp(String.raw`\.(?:${PICTURE_EXT}|${PLAYED_EXT})$`, 'i');

const LINK = /!?\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?\s*(?:\s+"[^"]*")?\)/g;
const CODE = new RegExp(String.raw`\`([^\`\n]+\.(?:${EXT}))\``, 'gi');
const QUOTED = new RegExp(String.raw`["“]([^"”\r\n]+\.(?:${EXT}))["”]|['‘]([^'’\r\n]+\.(?:${EXT}))['’]`, 'gi');
const PATH = new RegExp(String.raw`(?<![\w./:@~-])(?:\.\/)?[\w-][\w./-]*\.(?:${EXT})\b`, 'gi');
const FULL = new RegExp(String.raw`(?<![\w./:@~-])(?:~\/|\/)[\w./-]*\.(?:${EXT})\b`, 'gi');

export const isCarriedKind = (file) => KIND.test(String(file ?? '').split(/[?#]/)[0]);
export const isDrawnInADocument = (file) => DRAWN_IN_A_DOCUMENT.test(String(file ?? '').split(/[?#]/)[0]);

/** A name as a message wrote it, in the one spelling both sides compare. */
export function plainRef(raw) {
  let ref = String(raw ?? '').trim().replace(/^file:\/\//, '').replace(/^\.\//, '').split(/[?#]/)[0];
  try { ref = decodeURIComponent(ref); } catch { /* a stray % is part of the name */ }
  return ref;
}

/**
 * Every file some words name, each once, in the order they name them, with
 * whether the sender MEANT it: a markdown link, a code span or a path is
 * somebody pointing at a file, where a bare word that happens to end in `.pdf`
 * may only be a word.
 */
export function namedFiles(text) {
  const source = String(text ?? '');
  const hits = [];
  const taken = [];
  const add = (at, end, name, meant) => { hits.push({ at, name, meant }); taken.push([at, end]); };
  for (const m of source.matchAll(LINK)) add(m.index, m.index + m[0].length, m[1], true);
  for (const m of source.matchAll(CODE)) add(m.index, m.index + m[0].length, m[1], true);
  for (const m of source.matchAll(QUOTED)) add(m.index, m.index + m[0].length, m[1] ?? m[2], null);
  const free = (at) => !taken.some(([a, b]) => at >= a && at < b);
  for (const re of [PATH, FULL]) {
    for (const m of source.matchAll(re)) if (free(m.index)) hits.push({ at: m.index, name: m[0], meant: null });
  }
  hits.sort((a, b) => a.at - b.at);
  const found = new Map();
  for (const { name, meant } of hits) {
    if (/^(?:[a-z][a-z0-9+.-]*:(?!\/\/\/)|#)/i.test(name) && !name.startsWith('file:')) continue;
    if (!isCarriedKind(name)) continue;
    const ref = plainRef(name);
    if (!ref) continue;
    const sure = meant === true || ref.includes('/');
    found.set(ref, (found.get(ref) ?? false) || sure);
  }
  return [...found].map(([ref, meant]) => ({ ref, meant }));
}

/** Every file some words name, each once, in the order they name them. */
export const filesNamedInWords = (text) => namedFiles(text).map((f) => f.ref);

const WORDS = ['body', 'answer', 'note', 'result'];

/** What a ledger line says out loud. */
export function wordsOfLine(line) {
  const patch = line?.patch;
  if (!patch || typeof patch !== 'object') return [];
  const said = WORDS.map((f) => patch[f]);
  if (patch.edit && typeof patch.edit === 'object') said.push(patch.edit.text);
  return said.filter((s) => typeof s === 'string' && s);
}

/** The pictures and films a document draws, as it wrote them. */
export function filesADocumentDraws(text) {
  const source = String(text ?? '');
  const found = new Set();
  for (const m of source.matchAll(/!\[[^\]\n]*\]\(\s*<?([^)\s>]+)/g)) found.add(m[1]);
  for (const m of source.matchAll(/\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi)) found.add(m[1]);
  return [...found].filter((f) => !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(f)).map(plainRef).filter(isDrawnInADocument);
}

const MB = 1024 * 1024;
const GB = 1024 * MB;
// What one call to the cloud takes (the database refuses a row over 14 MB of
// base64), and the most one message sends: bigger files go in parts.
export const MAX_CARRIED_MB = 10;
export const MAX_CARRIED_BYTES = MAX_CARRIED_MB * MB;
export const PART_BYTES = 8 * MB;
export const MAX_SENT_BYTES = GB;
export const MAX_SENT_WORDS = '1 GB';
// Group chats and shared threads still keep their parts as rows, which a
// 1 GB film would swamp.
export const MAX_SHARED_SENT_BYTES = 200 * MB;

const nameOf = (ref) => String(ref).split('/').pop() || String(ref);
export const sizeWords = (bytes) => {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(1))} GB`;
  return `${(bytes / MB).toFixed(bytes >= 100 * MB ? 0 : 1)} MB`;
};

/** Said in the composer, before anything is sent. */
export const tooBigToSend = (bytes) => Number(bytes) > MAX_SENT_BYTES;
export const overTheLimit = (bytes) => `${sizeWords(bytes)} is over the ${MAX_SENT_WORDS} a message can send. Send a smaller copy, or share a link.`;

// Plain reasons a file did not go. `mine` says it to the sender.
export function whyWords(why, mine = false) {
  switch (why) {
    case 'missing': return mine ? 'the file was not found on this computer' : 'the file was not found on the sender\'s computer';
    case 'secret': return 'it looks like a key or a password file, and those are never sent';
    case 'outside': return mine ? 'it is not inside one of your projects' : 'it was not inside one of the sender\'s projects';
    case 'hidden': return 'it sits in a hidden folder, and those are never sent';
    case 'upload': return mine ? 'the cloud could not be reached' : 'the sender\'s computer could not reach the cloud';
    case 'name': return 'its name has a character a message cannot carry';
    case 'damaged': return 'it arrived damaged';
    case 'tooBig': return `it is over ${MAX_SENT_WORDS}`;
    default: return mine ? 'it did not go' : 'it did not arrive';
  }
}

// Pressing Try again cannot change these: the file is what it is.
const NO_POINT_IN_TRYING = new Set(['secret', 'outside', 'hidden', 'name', 'tooBig']);

/**
 * What a file's tile says about how it got to the people on the thread.
 * `carry` is `{ state: 'sent' | 'coming' | 'offline' | 'failed', mine, why, done, total, by }`.
 */
export function carryLine(carry) {
  if (!carry?.state) return null;
  const parts = carry.total > 1 ? { done: Math.min(carry.done ?? 0, carry.total), total: carry.total } : null;
  const percent = parts ? Math.floor((100 * parts.done) / parts.total) : null;
  switch (carry.state) {
    case 'sent': return { state: 'sent', label: 'Sent', percent: null, retry: false };
    case 'coming': return { state: 'coming', label: percent == null ? 'On its way' : `On its way, ${percent}%`, percent, retry: false };
    case 'offline': return { state: 'offline', label: carry.by ? `Waiting for ${carry.by}'s computer` : 'Waiting for the sender\'s computer', percent: null, retry: false };
    case 'failed': return { state: 'failed', label: `Not delivered: ${whyWords(carry.why, !!carry.mine)}`, percent: null, retry: !!carry.mine && !NO_POINT_IN_TRYING.has(carry.why) };
    default: return null;
  }
}

// Plain sentences for a click that cannot open the file yet.
export const carriedWords = {
  coming: (ref) => `${nameOf(ref)} is on its way.`,
  tooBig: (ref, bytes) => `${nameOf(ref)} is ${sizeWords(bytes)}, over the ${MAX_SENT_WORDS} a message can send.`,
  cannot: (ref, why, mine) => `${nameOf(ref)} was not delivered: ${whyWords(why, mine)}.`,
};
