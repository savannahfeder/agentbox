// A teammate's thread you asked about: commenting on it follows it, or the button
// on it does. When its card says it is done or shipped, that is a row in Needs
// you. Kept on this computer, because only you are told.
import { createContext } from 'react';
import type { ThreadCard } from '../types';

export interface Follow {
  owner: string; thread: string; title: string | null;
  /** Only what happens after this is news. */
  since: number;
  told: { done?: boolean; shipped?: boolean };
}

export interface FollowNews { key: string; kind: 'done' | 'shipped'; owner: string; thread: string; title: string; at: number; card: ThreadCard }

type Card = Pick<ThreadCard, 'personId' | 'threadId'> & Partial<Pick<ThreadCard, 'title'>>;
const same = (f: Follow, c: Card) => f.owner === c.personId && f.thread === c.threadId;

export const isFollowing = (list: readonly Follow[], card: Card) => list.some((f) => same(f, card));
export const follow = (list: readonly Follow[], card: Card, now: number): Follow[] => (isFollowing(list, card) ? [...list]
  : [...list, { owner: card.personId, thread: card.threadId, title: card.title ?? null, since: now, told: {} }]);
export const unfollow = (list: readonly Follow[], card: Card): Follow[] => list.filter((f) => !same(f, card));

export function followNews(list: readonly Follow[], cards: readonly ThreadCard[]): FollowNews[] {
  const out: FollowNews[] = [];
  for (const f of list) {
    const card = cards.find((c) => same(f, c));
    if (!card?.visible) continue;
    const title = card.title ?? f.title ?? 'A thread';
    const base = { owner: f.owner, thread: f.thread, title, card };
    if (!f.told.shipped && (card.shippedAt ?? 0) > f.since) out.push({ ...base, key: `${f.owner}/${f.thread}/shipped`, kind: 'shipped', at: card.shippedAt! });
    else if (!f.told.done && !f.told.shipped && card.state === 'done' && card.updatedAt > f.since) out.push({ ...base, key: `${f.owner}/${f.thread}/done`, kind: 'done', at: card.updatedAt });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Heard. Shipped says all there is to say; after done, shipped is still to come. */
export const markTold = (list: readonly Follow[], news: Pick<FollowNews, 'owner' | 'thread' | 'kind'>): Follow[] => list.map((f) => (
  f.owner === news.owner && f.thread === news.thread ? { ...f, told: { ...f.told, [news.kind]: true } } : f));

export const followWords = (news: Pick<FollowNews, 'kind' | 'title'>, name: string) => `${name} ${news.kind === 'shipped' ? 'shipped' : 'finished'} ${news.title}`;

const KEY = 'agentbox.team.following';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function readFollows(store: Store = local()): Follow[] {
  try {
    const got = JSON.parse(store?.getItem(KEY) ?? '[]');
    return Array.isArray(got) ? got.filter((f) => f && typeof f.owner === 'string' && typeof f.thread === 'string') : [];
  } catch { return []; }
}

export function writeFollows(list: readonly Follow[], store: Store = local()) {
  try { store?.setItem(KEY, JSON.stringify(list)); } catch { /* kept for this window only */ }
}

export const FollowContext = createContext<{ is: (card: Card) => boolean; follow: (card: Card) => void; unfollow: (card: Card) => void } | null>(null);
