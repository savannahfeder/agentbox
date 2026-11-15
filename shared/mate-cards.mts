// AN AI TEAMMATE ON THE TEAM'S BOARD. It lives on its owner's computer, so what
// the team sees of it goes up as a card beside the owner's thread cards: the same
// read rule and no new table in the cloud. Its job and what it is on, and nothing
// from its memory, its method or what needs its owner's yes.
const PREFIX = 'mate-';
const PROJECT = 'AI teammate';
const OPEN = 'open';

/** A card as the team's board holds it, thread or AI teammate. */
export interface BoardCardLike {
  threadId?: unknown;
  personId?: string | null;
  title?: unknown;
  problem?: unknown;
  progress?: unknown;
  solution?: unknown;
  state?: unknown;
  updatedAt?: unknown;
}

/** The card an AI teammate puts on the board. */
// A type, not an interface, so it goes up among the thread cards (main/team/sync.mts SyncCard).
export type MateCard = {
  threadId: string;
  visible: true;
  people: null;
  title: string | undefined;
  project: string;
  state: 'running' | 'waiting';
  priority: null;
  problem: string | null;
  progress: string | null;
  solution: string | null;
  blockedBy: string[];
  blocks: string[];
  updatedAt: number;
};

/** Somebody's AI teammate, read back off their card. */
export interface BoardMate {
  id: string;
  owner: string | null | undefined;
  name: unknown;
  job: unknown;
  now: unknown;
  open: boolean;
  running: boolean;
  updatedAt: unknown;
}

export const isMateCard = (card: BoardCardLike | null | undefined): card is BoardCardLike & { threadId: string } => typeof card?.threadId === 'string' && card.threadId.startsWith(PREFIX);

export function mateCard(
  t: { id: string; name?: string; job?: string | null; openToTeam?: boolean },
  { now = null, at = Date.now(), running = false }: { now?: string | null; at?: number; running?: boolean } = {},
): MateCard {
  return {
    threadId: `${PREFIX}${t.id}`, visible: true, people: null,
    title: t.name, project: PROJECT, state: running ? 'running' : 'waiting', priority: null,
    problem: t.job ?? null, progress: now ?? null, solution: t.openToTeam ? OPEN : null,
    blockedBy: [], blocks: [], updatedAt: at,
  };
}

export function mateFromCard(c: BoardCardLike & { threadId: string }): BoardMate {
  return {
    id: c.threadId.slice(PREFIX.length), owner: c.personId, name: c.title, job: c.problem ?? null,
    now: c.progress ?? null, open: c.solution === OPEN, running: c.state === 'running', updatedAt: c.updatedAt,
  };
}

/** The cards that are threads, and the others' AI teammates. */
export function splitCards<C extends BoardCardLike>(all: readonly C[] | null | undefined, me: string | null = null): { cards: C[]; mates: BoardMate[] } {
  const cards: C[] = [];
  const mates: BoardMate[] = [];
  for (const c of all ?? []) {
    if (!isMateCard(c)) cards.push(c);
    else if (c.personId !== me) mates.push(mateFromCard(c));
  }
  return { cards, mates };
}
