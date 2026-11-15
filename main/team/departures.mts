// WHAT THIS COPY HOLDS OF SOMEONE WHO LEFT, MOVED TO WHO TAKES IT. The cloud
// carries only the owner's choice (shared/team-departures.mts); each copy moves
// its own rows, because a task or a conversation lives in a record only its two
// people hold. Every step that makes something is kept by key, so a pass that
// fails half way is safe to run again.
import { isMateCard } from '../../shared/mate-cards.mts';
import type { BoardCardLike } from '../../shared/mate-cards.mts';
import { iSpokeLast, isTaskRow } from '../../shared/team-rules.mts';
import { handedFromLabel, handedWords, standingDepartures } from '../../shared/team-departures.mts';
import type { HandedMate } from '../../shared/team-departures.mts';
import type { TalkRow } from '../../shared/team-rules.mts';
import type { TeamProduct } from './index.mts';

export interface Departure { personId: string; name: string; handTo: string; mates: HandedMate[]; at: number; by: string }

export interface HandOverRow extends TalkRow { id: string; title?: string; body?: unknown; priority?: number; due?: string; agent?: unknown }

const peopleOn = (product: TeamProduct) => new Set([...(product.team?.people ?? []), ...(product.team?.sharedBy ? [product.team.sharedBy] : [])]);

export async function handOverDepartures({ departures, me, people, cards, products, read, write, give, compose, makeMate, isDone, markDone, now, log = () => {} }: {
  departures: readonly Departure[];
  me: string;
  people: readonly { id: string; name?: string }[];
  cards: readonly (BoardCardLike & { project?: unknown })[] | null | undefined;
  products: readonly TeamProduct[];
  read: (product: TeamProduct) => HandOverRow[];
  write: (dir: string, id: string, patch: Record<string, unknown>, source: string, at?: number) => unknown;
  give: (to: string, task: { title: string | undefined; body: string; priority: number | undefined; due: string | undefined }) => Promise<unknown>;
  compose: (slug: string, fields: Record<string, unknown>) => { id?: string } | null | undefined;
  makeMate: (mate: { name: string; job: string | null; memory: string }) => unknown;
  isDone: (key: string) => boolean;
  markDone: (key: string) => void;
  now: number;
  log?: (line: string) => void;
}): Promise<number> {
  let moved = 0;
  const nameOf = (id: string) => (id === me ? 'You' : people.find((p) => p.id === id)?.name ?? 'Someone');
  for (const d of standingDepartures(departures, people)) {
    const key = `${d.personId}:${d.at}`;
    if (isDone(key)) continue;
    const left = d.name || 'Someone';
    const mine = d.handTo === me;
    const to = nameOf(d.handTo);
    const home = products.find((p) => !p.team?.direct && !p.practice && !p.personal);
    // Held by you, so no agent starts on it; the line is what puts it in Needs
    // you, and it has to come after the words you are taken to have written.
    // Only ever called once `home` is known to be there.
    const needsYou = (row: { id?: string } | null | undefined, said: string) => {
      if (!row?.id) return;
      const at = Math.max(now, Date.now()) + 1;
      write(home!.dir, row.id, { waitEnded: { said, at }, handedOver: { said, at } }, 'system', at);
    };
    const once = async (step: string, fn: () => unknown) => {
      if (isDone(`${key}:${step}`)) return;
      await fn();
      markDone(`${key}:${step}`);
      moved += 1;
    };
    try {
      for (const product of products) {
        const items = read(product).filter((i) => i.status !== 'done' && !i.agent);
        for (const item of items) {
          if (product.team?.direct && isTaskRow(item) && item.assignee === d.personId) {
            if (mine && home) {
              // A task you gave is never in your own Needs you in its record, so it
              // comes home as a row of yours.
              await once(`task:${item.id}`, () => {
                needsYou(compose(home.slug, { title: item.label || item.title, body: handedWords.taskBody(left, String(item.body ?? '')), priority: item.priority, assignee: me }), handedWords.yours(left));
                write(product.dir, item.id, { status: 'done', handedOver: { said: handedWords.yours(left), at: now } }, 'founder');
              });
            } else if (mine) {
              await once(`task:${item.id}`, () => write(product.dir, item.id, { assignee: me, waitEnded: { said: handedWords.yours(left), at: now }, handedOver: { said: handedWords.yours(left), at: now } }, 'founder'));
            } else {
              await once(`task:${item.id}`, async () => {
                await give(d.handTo, { title: item.label || item.title, body: handedWords.taskBody(left, String(item.body ?? '')), priority: item.priority, due: item.due && item.due !== 'none' ? item.due : undefined });
                write(product.dir, item.id, { status: 'done', handedOver: { said: handedWords.wentTo(left, to), at: now } }, 'founder');
              });
            }
          } else if (product.team?.direct && !isTaskRow(item)) {
            const on = peopleOn(product);
            if (on.size === 2 && on.has(d.personId) && iSpokeLast(item, product, me)) {
              await once(`chat:${item.id}`, () => write(product.dir, item.id, { waitEnded: { said: handedWords.waited(left, to), at: now } }, 'system'));
            }
          } else if (!product.team?.direct && item.assignee === d.personId) {
            await once(`row:${item.id}`, () => {
              write(product.dir, item.id, { assignee: d.handTo }, 'founder');
              write(product.dir, item.id, { handedOver: { said: mine ? handedWords.yours(left) : handedWords.wentTo(left, to), at: now } }, 'system');
            });
          }
        }
      }
      if (mine) {
        const open = (cards ?? []).filter((c) => c.personId === d.personId && !isMateCard(c) && c.title && c.state !== 'done');
        if (open.length && home) {
          await once('threads', () => needsYou(compose(home.slug, {
            title: handedWords.listTitle(left),
            body: handedWords.listBody(left, open.map((c) => `- ${c.title}${c.project ? ` (${c.project})` : ''}${c.progress ? `: ${c.progress}` : ''}`)),
            assignee: me,
            labels: [handedFromLabel(d.personId)],
          }), handedWords.listSaid(left)));
        }
      }
      for (const m of d.mates ?? []) {
        if (m.to !== me) continue;
        await once(`mate:${m.id}`, () => makeMate({ name: m.name, job: m.job, memory: handedWords.mateMemory(left) }));
      }
      markDone(key);
    } catch (err) {
      log(`team: handing over ${left}'s work: ${(err as Error | null)?.message ?? err}`);
    }
  }
  return moved;
}
