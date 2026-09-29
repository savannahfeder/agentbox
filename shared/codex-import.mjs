// THE ROW THAT ASKS WHETHER A CODEX CONVERSATION COMES IN, and what her yes and
// her no do to it.
//
//   THE TITLE IS CODEX'S OWN. The row is called what Codex called it, so she
//   finds it by the name she remembers from the other tab.
//
//   THE FIRST LINE OF THE BODY SAYS WHERE IT WOULD GO AND WHEN IT WAS. That is
//   the line the inbox row prints under the title, so it has to carry the
//   whole question on its own: "Import into the app? A Codex conversation
//   from 7:22 PM today."
//
// THE BODY ENDS IN THE APP'S OWN OPTIONS. Two options, Import into X and Not
// now, so opening the row draws the strip and a 1 or a 2 answers it exactly as
// Y and N do on the row.
//
//   NOTHING IS RESUMED. That is the rule for Claude Code threads and it
//   holds here: a yes makes a row the user can READ, with their prompt and
//   Codex's last message, and replies still happen in Codex.
//
// A NO NEVER LOSES ONE.So a no closes the row under its own label, Closed shows
// it under "Not imported" with an Import key, and the ⌘K import card lists it
// too.
//
// Pure on purpose, like shared/agent-import.mjs beside it: the words are tested
// rather than eyeballed, and main/store.mjs does the writing.

/** On the row while it is asking. */
import { Name } from '../shared/product-name.mjs';
export const CODEX_IMPORT_LABEL = 'codex-import';
/** On the row once it is hers to read. */
export const CODEX_MIRROR_LABEL = 'codex';
/** On a row the user said not now to. */
export const NOT_IMPORTED_LABEL = 'not-imported';
/** And which conversation, on all three. Codex's own thread id. */
export const codexLabel = (id) => `codex:${String(id ?? '').trim()}`;

/** The kind the asking row wears, so the list can draw it differently. */
export const IMPORT_KIND = 'import';

export function codexIdOf(item) {
  for (const label of item?.labels ?? []) {
    if (typeof label === 'string' && label.startsWith('codex:')) return label.slice(6);
  }
  return null;
}
export const isCodexImportRow = (item) => (item?.labels ?? []).includes(CODEX_IMPORT_LABEL) && item?.status !== 'done';
export const isNotImportedRow = (item) => (item?.labels ?? []).includes(NOT_IMPORTED_LABEL) && item?.status === 'done';
export const isCodexMirrorRow = (item) => (item?.labels ?? []).includes(CODEX_MIRROR_LABEL) && !!codexIdOf(item);

/** "7:22 PM today", "yesterday at 7:22 PM", "Friday at 7:22 PM", else the date. */
export function whenPhrase(when, now = Date.now()) {
  const then = new Date(Number(when) || 0);
  if (!when || !Number.isFinite(then.getTime())) return '';
  const time = then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(then)) / 86400000);
  if (days <= 0) return `${time} today`;
  if (days === 1) return `yesterday at ${time}`;
  if (days < 7) return `${then.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`;
  return then.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/**
 * WHAT CODEX WROTE, IN WORDS THAT WORK FROM A ROW (2026-09-16).
 *
 * Codex answers in markdown aimed at its own window: a picture at a path in a
 * temporary folder, a link to a preview server it started on this Mac, a link
 * to a notes file in its worktree.
 *
 *  So: pictures are left out. A link to the open web stays a link, because it
 *  works from anywhere. A link to this Mac, a
 *  file path or a localhost address, keeps its words and loses its target, and
 *  a line that was nothing but such a link goes entirely, since "Open the
 *  interactive preview." with nothing to open is the confusing part. */
const isWebLink = (target) => /^https?:\/\//i.test(target) && !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([:/]|$)/i.test(target);
export function plainQuote(text) {
  const lines = String(text ?? '').split('\n').map((raw) => {
    const line = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    const only = line.trim().match(/^\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)[.!]?$/);
    if (only && !isWebLink(only[2])) return null;
    return line.replace(/\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)/g, (whole, words, target) => (isWebLink(target) ? whole : words));
  });
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * One paragraph of a longer text. Headings lose their hashes and become
 *  sentences, so "### 1. Folio" reads as "1. Folio." inside the line. */
const clip = (text, max) => {
  const t = plainQuote(text)
    .replace(/^\s*#{1,6}\s*(.+?)\s*$/gm, (_m, h) => (/[.!?:]$/.test(h) ? h : `${h}.`))
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * THE LINE THAT SAYS WHAT THE CONVERSATION IS, IN FACTS. Where it ran, how
 * long it has gone on, what she attached, and whether Codex is still in
 * it.*/
export function threadFactsLine(thread, now = Date.now()) {
  const where = String(thread?.short || thread?.folder || '').trim();
  const startedAt = Number(thread?.startedAt) || 0;
  const when = Number(thread?.when) || 0;
  const lastActive = Number(thread?.lastActive) || 0;
  if (!where && !startedAt && !when) return '';
  // One sentence for when and where. A conversation that went on for a while
  // says when it started and when it was last touched; a short one says only
  // when it was.
  const longRun = startedAt && Math.abs(when - startedAt) > 60_000;
  const opening = longRun ? `started ${whenPhrase(startedAt, now)}` : (when || startedAt) ? `from ${whenPhrase(when || startedAt, now)}` : '';
  let tail = '.';
  if (thread?.live) tail = ', still going.';
  else if (lastActive && startedAt && lastActive - startedAt > 60_000) tail = `, last active ${whenPhrase(lastActive, now)}.`;
  const bits = [`A Codex conversation${opening ? ` ${opening}` : ''}${where ? ` in ${where}` : ''}${tail}`];
  const turns = Number(thread?.turns) || 0;
  const images = Number(thread?.images) || 0;
  if (turns || images) {
    bits.push(`${turns ? plural(turns, 'turn', 'turns') : ''}${turns && images ? ', ' : ''}${images ? plural(images, 'screenshot attached', 'screenshots attached') : ''}.`);
  }
  return bits.join(' ');
}

/**
 * THE FIRST LINE IS WHAT SHE ASKED CODEX, because that is what the inbox row
 * prints under the title and it is the detail she approves from. The whole
 * line stays inside the row's 112 character budget, so the quote is cut to
 * fit and the full prompt follows under it. */
export const FIRST_LINE_BUDGET = 110;
export function importFirstLine(thread, { projectName, now = Date.now() } = {}) {
  const name = String(projectName || '').trim() || 'this project';
  // One line of plain words: a web link keeps its words here and loses its
  // address, because the inbox line draws text and not markdown.
  const asked = plainQuote(thread?.prompt).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/, '');
  if (!asked) {
    const when = whenPhrase(thread?.when, now);
    return `Import into ${name}? A Codex conversation${when ? ` from ${when}` : ''}.`;
  }
  const lead = `Import into ${name}? You asked Codex: "`;
  const room = FIRST_LINE_BUDGET - lead.length - 2; // the closing quote and the full stop
  const quote = asked.length > room ? `${asked.slice(0, Math.max(1, room - 1)).trimEnd()}…` : asked;
  return `${lead}${quote}".`;
}

/**
 * THE ASKING ROW'S WORDS. The first line carries the question and is what the
 *  inbox row prints; the facts line, her prompt and Codex's last message are the
 *  detail she approves from. */
export function codexImportRow(thread, { projectName, now = Date.now() } = {}) {
  const title = String(thread?.title || '').trim();
  const name = String(projectName || '').trim() || 'this project';
  const first = importFirstLine(thread, { projectName: name, now });
  const facts = threadFactsLine(thread, now);
  const prompt = clip(thread?.prompt, 700);
  const last = clip(thread?.last, 700);
  const body = [
    `**${first}**`,
    ...(facts ? [facts] : []),
    ...(prompt ? [`You asked: ${prompt}`] : [`${Name} could not read what you asked; open it in Codex to see.`]),
    ...(last ? [`Codex last said: ${last}`] : ['Codex has not answered yet.']),
    'Yes makes it a row here you can read. No puts it in Closed under Not imported, where it can be brought in any time. Nothing is moved.',
    `## Options\n1. Import into ${name}\n2. Not now`,
  ].join('\n\n');
  return {
    title,
    body,
    kind: IMPORT_KIND,
    priority: 5,
    labels: [CODEX_IMPORT_LABEL, codexLabel(thread?.id)],
  };
}

/**
 * THE ROW ONCE THE USER SAID YES. Their prompt is the body and Codex's last message
 *  is the result, so the thread reads You, then Codex, the way it did over
 *  there. The result carries the one line that says where replies go. */
export function codexMirrorPatch(thread) {
  const prompt = plainQuote(thread?.prompt);
  const last = plainQuote(thread?.last);
  return {
    body: prompt || String(thread?.title ?? '').trim(),
    result: last ? `${last}\n\nRead from Codex. Replies happen there.` : 'Codex has not answered yet.\n\nRead from Codex. Replies happen there.',
    kind: 'directive',
    labels: [CODEX_MIRROR_LABEL, codexLabel(thread?.id)],
  };
}

/**
 * WHAT HER ANSWER MEANS. A key on the row sends the word; the strip sends
 *  "Option 1: Import into X"; a typed reply can be either. Null is not an
 *  answer to this row and falls through to the ordinary reply path. */
export function importChoice(answer) {
  const a = String(answer ?? '').trim().toLowerCase();
  if (!a) return null;
  if (/^option\s*1\b/.test(a) || /^(y|yes|import)\b/.test(a)) return 'yes';
  if (/^option\s*2\b/.test(a) || /^(n|no|not now|skip|decline)\b/.test(a)) return 'no';
  return null;
}

/**
 * WHICH PROJECT A CONVERSATION BELONGS TO: the one whose folder it ran in,
 * the same rule every import follows. Null when nobody points at that folder. */
export function productsForThread(thread, products = []) {
  const key = String(thread?.folder ?? '').replace(/\/+$/, '');
  if (!key) return [];
  return products.filter((p) => String(p?.repoPath ?? '').replace(/\/+$/, '') === key);
}
export function whereThreadLands(thread, products = []) {
  return productsForThread(thread, products)[0] ?? null;
}

/**
 * WHICH CONVERSATIONS HAVE NO ROW YET, anywhere. A row asking, a row she
 *  imported and a row she declined all carry `codex:<id>`, and any of the
 *  three is a reason to file nothing. */
export function threadsNeedingRows(threads, existingItems = []) {
  const already = new Set();
  for (const item of existingItems) {
    const id = codexIdOf(item);
    if (id) already.add(id);
  }
  const byId = new Map();
  for (const t of threads ?? []) {
    const id = String(t?.id ?? '').trim();
    if (!id || already.has(id) || byId.has(id)) continue;
    if (!String(t?.title ?? '').trim()) continue;
    byId.set(id, t);
  }
  return [...byId.values()];
}
