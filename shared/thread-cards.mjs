// A THREAD'S STATE, ITS SUMMARY, AND THE CARD A TEAMMATE SEES OF IT.
//
// Approved 2026-10-01 (w-e731ca9376). Three pure rules, shared by the Mac that
// publishes cards (main/team) and the window that draws them (renderer), so
// the owner and a teammate are always shown the same words.
//
//   threadState  one of four states and only four: waiting, running,
//                scheduled, done. Her words: "status should be one of the
//                predefined states", never "needs your pick".
//   summaryOf    problem, progress and solution. The agent keeps them
//                current (update_work_item); until it has written one, the
//                ask and the latest word on the thread stand in, so a new
//                thread is never a blank summary.
//   cardsFor     every thread worth showing the team, as a card: the summary
//                and nothing more ("it shouldn't have new information"), or,
//                for a private thread, no words at all.

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
  const latest = item.result || item.note || '';
  return {
    problem: has('problem') ? item.problem : firstSentence(item.body || item.title),
    progress: has('progress') ? item.progress : firstSentence(latest),
    solution: has('solution') ? item.solution : '',
    written: has('problem') || has('progress') || has('solution'),
  };
}

const startOfDay = (now) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * One card per thread worth showing the team: every open thread, and the ones
 * finished today. Message threads between two people are never carded; they
 * are nobody else's business and they are not work.
 */
export function cardsFor({ products, readItems, now = Date.now() }) {
  const cards = [];
  const titleOf = new Map();
  const all = [];
  for (const product of products) {
    if (product.team?.direct) continue;
    for (const item of readItems(product)) {
      if (item.agent) continue;
      titleOf.set(item.id, item.label || item.title);
      all.push({ item, product });
    }
  }
  const linked = (ids) => (Array.isArray(ids) ? ids : []).map((id) => ({ id, title: titleOf.get(id) ?? null }));
  const today = startOfDay(now);
  for (const { item, product } of all) {
    const state = threadState(item, now);
    if (state === 'done' && !(item.updatedAt >= today)) continue;
    const visible = item.visibility !== 'private';
    const s = summaryOf(item);
    cards.push(visible ? {
      threadId: item.id, visible: true, title: item.label || item.title, project: product.name,
      state, priority: Number.isFinite(item.priority) ? item.priority : null,
      problem: s.problem || null, progress: s.progress || null, solution: s.solution || null,
      blockedBy: linked(item.blockedBy), blocks: linked(item.blocks), updatedAt: item.updatedAt ?? now,
    } : {
      threadId: item.id, visible: false, title: null, project: null, state,
      priority: Number.isFinite(item.priority) ? item.priority : null,
      problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: item.updatedAt ?? now,
    });
  }
  return cards;
}
