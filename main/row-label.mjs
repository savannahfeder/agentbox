// THE NAME ON THE ROW, WRITTEN RATHER THAN TAKEN FROM THE FIRST SENTENCE.
//
// A dictated message keeps its first line as its title, verbatim and forever
// (renderer/src/message-split.ts). Such titles run long, are often cut off mid
// sentence with an ellipsis, and many open with "I", "I've been", "Can you" or
// "We". Eleven of those down a column is eleven rows that look like one row.
//
// THERE IS NOTHING TO EXTRACT FROM CLAUDE CODE, which is the first thing this
// had to find out. Claude Code does generate a short name for a session and it
// writes it to the terminal tab; it never puts it on disk: none of thousands of
// transcript files measured carried a `summary` row, and main/agent-sessions.mjs
// found the same. So the name is not read from anywhere. It is written, here, by
// the same kind of call Claude Code makes: one small fast model, one message,
// one line back.
//
// AND IT IS WRITTEN FROM WHERE THE THREAD STANDS, NOT FROM ITS FIRST MESSAGE.
// A thread's opening line describes where it started, and after days of work
// the thread can be about something else entirely; given the last thing written
// on the row as well, the name follows what the row is about now. A name fixed
// at the first message goes stale, and this is that same failure arriving from
// the other side.
//
// WHY THE APP DOES THIS AND NOT THE WORKER. It was written into briefs/worker.md
// first and taken straight back out: the brief is pasted into every session and
// tests/the-brief-only-says-what-applies.mjs holds it under 6,000 characters,
// which it was 33 characters short of. A rule every worker must remember is also
// a rule most of them will not, and the row the user is looking at right now may have
// no worker on it at all. Doing it here names every row on every product with
// nothing for anyone to remember.
//
// The write goes to `label`, never to `title`. The title belongs to the user,
// the fold makes the user outrank us on it, and the user still reads their own
// words the moment they open the row (shared/work-items.mjs).

import { spawn } from 'node:child_process';

/**
 * The model this runs on. Small and fast on purpose: this is a naming call, it
 *  happens on a timer, and it must never be worth thinking about. Measured
 *  through the CLI over ten real rows: 14.1s median a call,
 *  nearly all of it the CLI starting a session rather than the model working. */
export const NAME_MODEL = 'claude-haiku-4-5-20251001';

/**
 * How long one naming call may take before it is abandoned. Generous against
 *  the 14.1s median because a slow one costs nothing: the row keeps the name it
 *  already had, or her title, and the next tick tries again. */
export const NAME_TIMEOUT_MS = 90_000;

/**
 * What a name may be. Long enough for a seven-word name, short
 *  enough that it can never be the thing that makes a row clip: the row draws
 *  one line and the summary budget beside it is 112. */
export const NAME_MAX = 64;

/**
 * A row nobody is going to look at again does not get named. `done` is the
 *  archive; everything else is a row that can still appear in a list. */
const LIVE = new Set(['open', 'claimed', 'blocked']);

/**
 * The newest moment anything about this row's CONTENT changed. Deliberately not
 *  `updatedAt`: a heartbeat, a claim and a release all move that, and renaming a
 *  row every time a worker touches it would spend a call a minute on a busy row
 *  and change the words under her while she reads them. */
export function contentTouchedAt(item) {
  const w = item?.wrote ?? {};
  let last = 0;
  for (const field of ['title', 'body', 'result', 'answer']) {
    const ts = w[field]?.ts ?? 0;
    if (ts > last) last = ts;
  }
  return last;
}

/**
 * PURE. Does this row want naming?
 *
 * Three ways to say no, and the third is the one that keeps this cheap:
 *   - it is done, so nobody is scanning for it,
 *   - it has nothing to name from, which is a row with no words on it yet,
 *   - its label is already at least as new as the newest thing said on the row.
 *
 * A row whose label we wrote and whose content has not moved since is finished
 * business forever, so a store that has settled costs nothing per tick.
 */
export function wantsName(item) {
  if (!item || !LIVE.has(item.status)) return false;
  if (!String(item.title ?? '').trim() && !String(item.body ?? '').trim()) return false;
  const wroteAt = item.wrote?.label?.ts ?? 0;
  if (!String(item.label ?? '').trim()) return true;
  return wroteAt < contentTouchedAt(item);
}

/**
 * PURE. The one message the naming call gets. The user's words first, then the last
 *  thing written on the row, which is what makes the name describe the thread
 *  rather than its opening line. Truncated hard: a name does not get better for
 *  having read six thousand words, and this is spawned on a timer. */
export function namePrompt(item) {
  const cut = (s, n) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);
  const latest = cut(item?.result || item?.note, 700);
  return [
    'Here is a work thread: the message that opened it, and the latest thing',
    'written on it. Write a short name for the thread AS IT STANDS NOW: 3 to 7',
    'words, sentence case, no quotes, no trailing punctuation, naming the thing',
    'being worked on rather than restating the sentence. Reply with the name and',
    'nothing else.',
    '',
    '--- opened with ---',
    cut(item?.title, 300),
    cut(item?.body, 1200),
    '--- latest ---',
    latest || '(nothing written yet)',
    '---',
  ].join('\n');
}

/**
 * PURE. What comes back from a model is not a name until this has had it.
 *
 * A one-line reply is the contract and most of the time it is what arrives. The
 * rest of this is what happens when it does not: a preamble, a quoted name, a
 * trailing full stop, or a paragraph explaining the choice. Anything that fails
 * every rule returns '' and the row keeps the name it had, which is always safe
 * because the fallback is her own title.
 */
export function cleanName(text) {
  const first = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)[0] ?? '';
  const bare = first
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .replace(/^(?:title|name)\s*[:\-–]\s*/i, '')
    .replace(/[.。]+$/, '')
    .trim();
  if (!bare || bare.length > NAME_MAX) return '';
  // A reply that runs on is a model that answered a different question, and a
  // chatty one clears the character cap easily. The prompt asks for three to
  // seven words, so eight is one word of slack and anything past it is not the
  // thing that was asked for.
  if (bare.split(/\s+/).length > 8) return '';
  return bare;
}

/**
 * Name one row. Resolves to a clean name, or to '' for every failure there is:
 * the binary missing, a non-zero exit, a timeout, an empty reply, a reply that
 * is not a name. Never throws and never rejects, because this is called from a
 * timer whose only correct behaviour on failure is to leave the row alone.
 */
export function nameRow(item, { claudeBin, model = NAME_MODEL, timeoutMs = NAME_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    if (!claudeBin) return resolve('');
    let child;
    try {
      child = spawn(claudeBin, ['-p', namePrompt(item), '--model', model], {
        // Somewhere that is nobody's project. A naming call must not pick up a
        // CLAUDE.md, a settings file or a hook from whatever folder it lands in.
        cwd: '/tmp',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      return resolve('');
    }
    let out = '';
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString(); if (out.length > 4000) finish(cleanName(out)); });
    child.on('error', () => finish(''));
    child.on('close', (code) => finish(code === 0 ? cleanName(out) : ''));
  });
}
