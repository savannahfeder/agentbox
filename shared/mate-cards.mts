// AN AI TEAMMATE ON THE TEAM'S BOARD. It lives on its owner's computer, so what
// the team sees of it goes up as a card beside the owner's thread cards: the same
// read rule and no new table in the cloud. Its job and what it is on, and nothing
// from its memory, its method or what needs its owner's yes.
const PREFIX = 'mate-';
const PROJECT = 'AI teammate';
const OPEN = 'open';

export const isMateCard = (card) => typeof card?.threadId === 'string' && card.threadId.startsWith(PREFIX);

export function mateCard(t, { now = null, at = Date.now(), running = false } = {}) {
  return {
    threadId: `${PREFIX}${t.id}`, visible: true, people: null,
    title: t.name, project: PROJECT, state: running ? 'running' : 'waiting', priority: null,
    problem: t.job ?? null, progress: now ?? null, solution: t.openToTeam ? OPEN : null,
    blockedBy: [], blocks: [], updatedAt: at,
  };
}

export function mateFromCard(c) {
  return {
    id: c.threadId.slice(PREFIX.length), owner: c.personId, name: c.title, job: c.problem ?? null,
    now: c.progress ?? null, open: c.solution === OPEN, running: c.state === 'running', updatedAt: c.updatedAt,
  };
}

/** The cards that are threads, and the others' AI teammates. */
export function splitCards(all, me = null) {
  const cards = [];
  const mates = [];
  for (const c of all ?? []) {
    if (!isMateCard(c)) cards.push(c);
    else if (c.personId !== me) mates.push(mateFromCard(c));
  }
  return { cards, mates };
}
