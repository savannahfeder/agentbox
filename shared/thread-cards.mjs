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
  if (Number.isFinite(item.runAt) && item.runAt > now) return 'scheduled';
  if (item.status === 'claimed' && item.claim && !item.claimExpired) return 'running';
  // Sent to an agent and not yet picked up: it is about to run, nobody has to
  // act on it, so it is not waiting on anyone.
  const sentToAnAgent = (item.labels ?? []).includes('founder') && !item.result && !item.note
    && item.kind !== 'question' && item.kind !== 'review' && !personHolds(item);
  return sentToAnAgent ? 'running' : 'waiting';
}

const personHolds = (item) => typeof item.assignee === 'string' && item.assignee !== 'agent';

// The first sentence of some prose, without markdown, short enough for a line.
export function firstSentence(text, max = 240) {
  if (typeof text !== 'string') return '';
  const plain = text
    .replace(/^#+\s.*$/gm, '')
    .replace(/^##\s*Options[\s\S]*$/m, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = plain.match(/^(.+?[.!?])(\s|$)/);
  const one = (m ? m[1] : plain).trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
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
export function shownToTeam(item, since = null) {
  if (item?.visibility === 'team') return true;
  if (item?.visibility === 'people') return shownToPeople(item).length > 0;
  if (item?.visibility === 'private') return false;
  return !since || (item?.createdAt ?? 0) >= since;
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
      const open = shownToTeam(item, since) && !shownToPeople(item).length;
      titleOf.set(item.id, open ? item.label || item.title : null);
      all.push({ item, product });
    }
  }
  const linked = (ids) => (Array.isArray(ids) ? ids : []).map((id) => ({ id, title: titleOf.get(id) ?? null }));
  const today = startOfDay(now);
  for (const { item, product } of all) {
    if (!shownToTeam(item, since)) continue;
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
