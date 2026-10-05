// A THREAD'S STATE, ITS SUMMARY, AND THE CARD A TEAMMATE SEES OF IT.
//
// Approved 2026-10-01 (w-e731ca9376). Three pure rules, shared by the Mac that
// publishes cards (main/team) and the window that draws them (renderer), so
// the owner and a teammate are always shown the same words.
//
//   threadState  one of four states and only four: waiting, running,
//                scheduled, done. A status is always one of those
//                predefined states, never "needs your pick".
//   summaryOf    problem, progress and solution. The agent keeps them
//                current (update_work_item); until it has written one, the
//                ask and the latest word on the thread stand in, so a new
//                thread is never a blank summary.
//   cardsFor     every thread worth showing the team, as a card: the summary
//                and nothing more; a card never adds information. A
//                private thread publishes no card at all (decided 2026-10-01
//                from user research): not a wordless one, not a count.

export const THREAD_STATES = ['waiting', 'running', 'scheduled', 'done'];

/** Which of the four states a thread is in. */
export function threadState(item, now = Date.now()) {
  if (item.status === 'done') return 'done';
  // A thread in Later is not running and nobody has to act on it, which is the
  // scheduled family. It has no moment, so what it SAYS is "Not started"
  // (threadStateWords in the window); the four card states are unchanged.
  if (item.start === 'later') return 'scheduled';
  if (Number.isFinite(item.runAt) && item.runAt > now) return 'scheduled';
  if (item.status === 'claimed' && item.claim && !item.claimExpired) return 'running';
  // Sent to an agent and not yet picked up: it is about to run, nobody has to
  // act on it, so it is not waiting on anyone.
  const sentToAnAgent = (item.labels ?? []).includes('founder') && !item.result && !item.note
    && item.kind !== 'question' && item.kind !== 'review' && !personHolds(item);
  return sentToAnAgent ? 'running' : 'waiting';
}

const personHolds = (item) => typeof item.assignee === 'string' && item.assignee !== 'agent';

// ONLY EMPHASIS IS STRIPPED, AND ONLY WHERE IT IS A PAIR (w-a33b339772).
//
// This used to be `.replace(/[*_`>]/g, '')`: every star, underscore, backtick
// and angle bracket in the text, gone. A pasted search command
// (`--include=*.md --include=*.json`) lost all three of its stars on the
// summary line, and `user_id_v2` came back as `useridv2`.
//
// A pair is a mark, then a WORD character, then the closing mark: that is what
// `*bold*` looks like and what a glob never does, because a glob's star is
// followed by a dot or a slash. Underscores have to clear the word on either
// side too, or `user_id_v2` reads as emphasis around `id`. A mark with no
// partner is left exactly where the person put it.
const EMPHASIS = [
  [/\*\*(\w[^*\n]*?)\*\*/g, '$1'],
  [/(?<!\w)__(\w[^_\n]*?)__(?!\w)/g, '$1'],
  [/\*(\w[^*\n]*?)\*/g, '$1'],
  [/(?<!\w)_(\w[^_\n]*?)_(?!\w)/g, '$1'],
  [/`([^`\n]+)`/g, '$1'],
];

// WHERE A SENTENCE REALLY ENDS. The old cut was "any of .!? then a space", so
// the lone ` . ` that means "this directory" ended the sentence and the
// summary showed `grep -r foo .` and nothing else. A full stop ends a sentence
// when it closes a word AND what follows is a new sentence: whitespace then a
// capital (through an opening quote or bracket), or the end of the text.
const SENTENCE = /^(.+?\w[.!?]["'”’)\]]?)(?=\s+["“'(\[]?[A-Z]|\s*$)/;

// The first sentence of some prose, without markdown, short enough for a line.
export function firstSentence(text, max = 240) {
  if (typeof text !== 'string') return '';
  let plain = text
    .replace(/^#+\s.*$/gm, '')
    .replace(/^##\s*Options[\s\S]*$/m, '')
    // A blockquote's mark is the one at the start of its line. Elsewhere `>`
    // is a redirect or an arrow and belongs to whoever typed it.
    .replace(/^\s*>\s?/gm, '');
  for (const [re, to] of EMPHASIS) plain = plain.replace(re, to);
  plain = plain.replace(/\s+/g, ' ').trim();
  const m = plain.match(SENTENCE);
  const one = (m ? m[1] : plain).trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

// HOW LONG A SUMMARY LINE AN AGENT WRITES MAY BE (w-b51b2e1c86): about four
// lines of the panel, so the name, the three lines and the properties fit one
// window without scrolling. Asked for on 2026-10-04 off a summary of 50, 63 and
// 95 words that ran the properties off the bottom; agents' lines then ran a
// median of 30 to 36 words. The store tool refuses a longer one
// (mcp/core/work.mjs); a person's own edits are not limited.
export const SUMMARY_WORDS = 25;

// THE SUMMARY IS CONTEXT, THEN DONE (w-54e9c7243f, 2026-10-05). `problem` is
// drawn as Context, a few sentences that bring the thread back to mind, and
// `progress` as Done, the steps taken so far, one per line, newest last.
// `solution` is no longer asked for or drawn. Measured on the approved
// pictures: about 35 words of context filled five lines and was enough to
// answer from; steps ran 4 to 15 words, and six left the properties on screen.
// The old field names stay so the team cloud needs no migration.
export const CONTEXT_WORDS = 45;
export const DONE_STEPS = 6;
export const DONE_STEP_WORDS = 15;

export function wordsIn(text) {
  return typeof text === 'string' ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** The Done steps in `progress`: one per line, the marks a writer puts in front of a step taken off. */
export function doneSteps(progress) {
  if (typeof progress !== 'string') return [];
  return progress.split('\n').map((l) => l.trim().replace(/^(?:[-*•✓✔]\s*)+/, '').trim()).filter(Boolean);
}

/** The thread's summary: what the agent or the person wrote, else stand-ins. */
export function summaryOf(item) {
  const has = (f) => typeof item[f] === 'string';
  // A finished turn's result is what was done, so it stands in for the
  // Solution, and a checkpoint for the Progress. Read the other way round, a
  // persona saw "Progress: Done: ..." over "Solution: Not written yet" and
  // could not tell whether the thread was finished or stuck.
  // A result that asks something is still progress: the thread waits on its
  // owner's answer, and nothing is solved yet.
  const said = firstSentence(item.result || '');
  const asks = said.endsWith('?');
  return {
    problem: has('problem') ? item.problem : firstSentence(item.body || item.title),
    progress: has('progress') ? item.progress : (asks ? said : firstSentence(item.result ? '' : item.note || '')),
    solution: has('solution') ? item.solution : (asks ? '' : said),
    written: has('problem') || has('progress') || has('solution'),
  };
}

const startOfDay = (now) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * One card per thread worth showing the team: every open thread, and the ones
 * finished today. Message threads between two people are never carded; they
 * are nobody else's business and they are not work. Nor is a private thread.
 */
/**
 * NOTHING FROM BEFORE YOU JOINED IS SHARED UNLESS YOU SHARE IT (2026-10-01).
 * Her own store holds hundreds of threads written for nobody but her, and the
 * first sign-in would have put a summary of every one of them on the team's
 * board. So a thread is shown when it was marked Team, or when it is not
 * private and was started after `since`, the moment this person began sharing
 * on this Mac. No `since` is the old rule: everything not private.
 */
/**
 * AND A THREAD MAY BE SHARED WITH CHOSEN PEOPLE RATHER THAN THE TEAM
 * (w-41ff964775: a thread may be seen by a few people, not only by everyone
 * or nobody). That is still sharing, so this stays the one rule for
 * whether a card is published at all, and `shownToPeople` says who it reaches.
 *
 * Chosen people naming NOBODY reaches nobody, so nothing is published: a card
 * carrying an empty list would otherwise read as the whole team's, and that is
 * the one mistake nobody can take back.
 */
export function shownToTeam(item, since = null, product = null) {
  const visibility = visibilityOf(item, product);
  if (visibility === 'team') return true;
  if (visibility === 'people') return shownToPeople(item).length > 0;
  if (visibility === 'private') return false;
  return !since || (item?.createdAt ?? 0) >= since;
}

/**
 * THE WORD A THREAD'S VISIBILITY READS AS, once its project has had its say.
 *
 * YOUR PERSONAL PROJECT IS PRIVATE UNLESS YOU SAY OTHERWISE (w-b989839656).
 * Everywhere else a thread with no word of its own is the team's, and in
 * My Workspace it is yours alone, whoever wrote it: the composer, an agent filing a
 * proposal, a repeat. Failing closed here, rather than writing 'private' on
 * each new thread, is what covers every one of those paths at once.
 */
export function visibilityOf(item, product = null) {
  const v = item?.visibility;
  if (v === 'team' || v === 'people' || v === 'private') return v;
  return product?.personal === true ? 'private' : undefined;
}

/** Whom a shared thread reaches, by id, or [] for the whole team. */
export function shownToPeople(item) {
  if (item?.visibility !== 'people') return [];
  const ids = Array.isArray(item.visibleTo) ? item.visibleTo : [];
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
}

export function cardsFor({ products, readItems, now = Date.now(), since = null }) {
  const cards = [];
  const titleOf = new Map();
  const all = [];
  for (const product of products) {
    if (product.team?.direct) continue;
    for (const item of readItems(product)) {
      if (item.agent) continue;
      // A LINK NAMES A THREAD ONLY IF THAT THREAD IS ITSELF VISIBLE. A public
      // card that is blocked by a private thread said the private thread's
      // title out loud (review, 2026-10-01); now it says only that one exists.
      //
      // A thread shared with chosen people is named by nothing either
      // (w-41ff964775): every card is read by its own set of people, and a
      // blocker shared with two of them would have told a third its title.
      // Only a thread the whole team may read is safe in anybody's links.
      const open = shownToTeam(item, since, product) && !shownToPeople(item).length;
      titleOf.set(item.id, open ? item.label || item.title : null);
      all.push({ item, product });
    }
  }
  const linked = (ids) => (Array.isArray(ids) ? ids : []).map((id) => ({ id, title: titleOf.get(id) ?? null }));
  const today = startOfDay(now);
  for (const { item, product } of all) {
    if (!shownToTeam(item, since, product)) continue;
    const state = threadState(item, now);
    if (state === 'done' && !(item.updatedAt >= today)) continue;
    const s = summaryOf(item);
    cards.push({
      threadId: item.id, visible: true, title: item.label || item.title, project: product.name,
      // WHO IT REACHES: the chosen people, or NO LIST AT ALL for the whole
      // team. Never an empty list, which would have to mean both. Both clouds
      // carry it and refuse to show the card to anybody else.
      people: shownToPeople(item).length ? shownToPeople(item) : null,
      state, priority: Number.isFinite(item.priority) ? item.priority : null,
      problem: s.problem || null, progress: s.progress || null, solution: s.solution || null,
      blockedBy: linked(item.blockedBy), blocks: linked(item.blocks), updatedAt: item.updatedAt ?? now,
    });
  }
  return cards;
}
