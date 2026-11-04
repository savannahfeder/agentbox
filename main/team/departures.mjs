// WHAT THIS COPY HOLDS OF SOMEONE WHO LEFT, MOVED TO WHO TAKES IT. The cloud
// carries only the owner's choice (shared/team-departures.mjs); each copy moves
// its own rows, because a task or a conversation lives in a record only its two
// people hold. Every step that makes something is kept by key, so a pass that
// fails half way is safe to run again.
import { isMateCard } from '../../shared/mate-cards.mjs';
import { iSpokeLast, isTaskRow } from '../../shared/team-rules.mjs';
import { handedFromLabel, handedWords, standingDepartures } from '../../shared/team-departures.mjs';

const peopleOn = (product) => new Set([...(product.team?.people ?? []), ...(product.team?.sharedBy ? [product.team.sharedBy] : [])]);

export async function handOverDepartures({ departures, me, people, cards, products, read, write, give, compose, makeMate, isDone, markDone, now, log = () => {} }) {
  let moved = 0;
  const nameOf = (id) => (id === me ? 'You' : people.find((p) => p.id === id)?.name ?? 'Someone');
  for (const d of standingDepartures(departures, people)) {
    const key = `${d.personId}:${d.at}`;
    if (isDone(key)) continue;
    const left = d.name || 'Someone';
    const mine = d.handTo === me;
    const to = nameOf(d.handTo);
    const home = products.find((p) => !p.team?.direct && !p.practice && !p.personal);
    // Held by you, so no agent starts on it; the line is what puts it in Needs
    // you, and it has to come after the words you are taken to have written.
    const needsYou = (row, said) => {
      if (!row?.id) return;
      const at = Math.max(now, Date.now()) + 1;
      write(home.dir, row.id, { waitEnded: { said, at }, handedOver: { said, at } }, 'system', at);
    };
    const once = async (step, fn) => {
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
      log(`team: handing over ${left}'s work: ${err?.message ?? err}`);
    }
  }
  return moved;
}
