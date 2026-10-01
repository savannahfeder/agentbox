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
// AND IT IS WRITTEN ONCE, FROM WHERE THE THREAD STOOD WHEN IT WAS NAMED.
// A thread's opening line describes where it started, so the prompt is given
// the last thing written on the row as well and the name describes the work
// rather than the first sentence of the ask. It used to be REWRITTEN every time
// the row's content moved, on the same reasoning, and that is what this file no
// longer does: a tester lost their threads because the names kept changing
// under them while agents worked (w-c141733b61, `wantsName` below). A name that
// follows the work is worth less than a name a person can find again.
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
 * PURE. Is this title already a name somebody wrote?
 *
 * The one question that decides whether this module speaks at all, and it is
 * answered off the words alone because that is all there is: nothing on a row
 * records whether its title was typed or derived.
 *
 * Three marks, and together they separate the two shapes `splitMessage` makes
 * (renderer/src/message-split.ts). A first line of 120 characters or less is
 * kept VERBATIM and is the name its person wrote. A longer one is clipped into
 * a title by the app, and every clip it can produce is either a whole sentence
 * of at least 25 characters or a hard cut ending in an ellipsis.
 *
 *   as short as a name we would write   NAME_MAX, so a title already that tight
 *                                       has nothing for us to improve,
 *   as few words as a name has          the same eight `cleanName` allows,
 *   not ending as a sentence does       '.', '!', '?' and '…' are how a clipped
 *                                       title ends and not how a name does.
 *
 * It errs towards leaving the words alone, which is the right way to be wrong:
 * the cost is a short typed sentence keeping its own first line, and the cost
 * the other way is somebody losing the thread they named.
 */
export function isWrittenName(title) {
  const t = String(title ?? '').trim();
  if (!t) return false;
  if (t.length > NAME_MAX) return false;
  if (t.split(/\s+/).length > 8) return false;
  return !/[.!?…]$/.test(t);
}

/**
 * PURE. Does this row want naming?
 *
 * Four ways to say no, and the last two are the fix for a tester losing their
 * own threads on 2026-10-01: "Add comment to cart.js" became "Improve cart.js
 * header comment" and then "Update cart file comment" inside two minutes.
 *
 *   - it is done, so nobody is scanning for it,
 *   - it has nothing to name from, which is a row with no words on it yet,
 *   - ITS PERSON ALREADY NAMED IT. A short clear title is the name they will
 *     look for, and on a team it is the name they will point someone else at.
 *     Improving it is not an improvement.
 *   - IT HAS BEEN NAMED. Once, when the thread was made, and then never again.
 *
 * That last line used to read `wroteAt < contentTouchedAt(item)`, so the name
 * followed where the thread stood: an agent writes a note and a result on every
 * run, so every run earned a new name. Following the thread was the intended
 * behaviour and there was a test for it; what it cost in practice is that no
 * thread stayed findable, so the brief for this change overrides both. The idea
 * it was serving survives in the prompt, which still reads the latest thing on
 * the row, so the one name a thread gets describes the work and not just its
 * opening line.
 *
 * The exception is a name the person writes themselves later: a title newer
 * than our label is a rename, so `rowTitle` draws theirs (list-rules.ts) and
 * this stays quiet rather than answering it with another name of ours.
 */
export function wantsName(item) {
  if (!item || !LIVE.has(item.status)) return false;
  if (!String(item.title ?? '').trim() && !String(item.body ?? '').trim()) return false;
  if (isWrittenName(item.title)) return false;
  return !String(item.label ?? '').trim();
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
