// THE OWNER'S SIDE OF AN ASK (shared/thread-asks.mts), run by the team service.
//
//   relay      a comment on your thread from someone you asked to help is
//              passed to the thread's agent as their words, through your own
//              supervisor, so it is your computer that decides to run it
//   carryBack  an ask handed back puts what they said on the thread, held for
//              you, and puts the task row itself away so it is not news twice
//
// Both remember what they did in a file beside the team state, so a restart
// neither says it twice nor drops it.
import fs from 'node:fs';
import { askIGave, handedBackAsks, handedBackWords, helpAskCovering } from '../../shared/thread-asks.mts';
import { handedOn } from '../../shared/thread-cards.mts';
import type { Verdict } from '../../shared/work-items.mts';
import type { PhoneItem } from '../phone-inbox.mts';
import type { ThreadComment } from './thread-share.mts';

export type TellThread = (slug: string, id: string, o: { text: string; from: { teammate: string; name: string }; hold?: boolean }) => unknown;

interface AskProduct { slug: string; dir: string; team?: { direct?: unknown } | null }

export interface AsksOptions {
  file: string;
  me: () => string | null;
  products: () => AskProduct[];
  readRows: (dir: string) => PhoneItem[];
  nameOf: (id: string) => string;
  tell: TellThread | null;
  putAway: (slug: string, id: string) => void;
  log?: (line: string) => void;
}

interface Kept { relayed: string[]; back: string[] }

export function createAsks({ file, me, products, readRows, nameOf, tell, putAway, log = () => {} }: AsksOptions) {
  let kept: Kept | null = null;
  const read = (): Kept => {
    if (kept) return kept;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      kept = { relayed: Array.isArray(raw?.relayed) ? raw.relayed : [], back: Array.isArray(raw?.back) ? raw.back : [] };
    } catch { kept = { relayed: [], back: [] }; }
    return kept;
  };
  const save = () => {
    const k = read();
    // Enough to cover any comment the cloud still lists.
    k.relayed = k.relayed.slice(-2000);
    k.back = k.back.slice(-2000);
    try { fs.writeFileSync(file, JSON.stringify(k)); } catch (err) { log(`asks: could not save: ${(err as Error).message}`); }
  };
  const taskRows = () => products().filter((p) => !!p.team?.direct).flatMap((p) => readRows(p.dir).map((r) => ({ row: r, slug: p.slug })));

  return {
    relay(c: ThreadComment, thread: { item: PhoneItem; product: AskProduct }): boolean {
      const k = read();
      if (k.relayed.includes(c.id)) return true;
      // A thread you handed on is not yours to run on anyone's words.
      if (!tell || handedOn(thread.item)) return false;
      const rows = taskRows().map((t) => t.row);
      if (!helpAskCovering(rows as never[], me(), c.threadId, c.by, c.at)) return false;
      k.relayed.push(c.id);
      save();
      void Promise.resolve(tell(thread.product.slug, c.threadId, { text: c.text, from: { teammate: c.by, name: nameOf(c.by) } }))
        .catch((err) => log(`asks: ${nameOf(c.by)}'s words did not reach the agent: ${err?.message ?? err}`));
      return true;
    },

    carryBack(): number {
      if (!tell) return 0;
      const k = read();
      const done = new Set(k.back);
      const all = taskRows();
      let carried = 0;
      let changed = false;
      for (const r of handedBackAsks(all.map((t) => t.row) as never[], me(), done)) {
        const a = askIGave(r as never, me())!;
        const where = products().find((p) => p.slug === a.product);
        changed = true;
        // Gone, or handed on since: the hand-back belongs to nobody here, and would reopen a thread you gave away.
        const thread = where ? readRows(where.dir).find((t) => t.id === a.thread) : null;
        if (!where || (thread && handedOn(thread))) {
          k.back.push(r.id);
          const slug = all.find((t) => t.row.id === r.id)?.slug;
          if (slug) putAway(slug, r.id);
          continue;
        }
        const helper = String((r as { assignee?: string }).assignee);
        const name = nameOf(helper);
        const mine = me();
        const asker = mine ? nameOf(mine).split(/\s+/)[0] : 'You';
        const text = handedBackWords({ kind: a.kind, name: name.split(/\s+/)[0] || name, verdict: ((r as { verdict?: Verdict }).verdict ?? null), words: String((r as { answer?: string }).answer ?? ''), asked: a.note ? { by: asker, note: a.note } : null });
        k.back.push(r.id);
        void Promise.resolve(tell(a.product, a.thread, { text, from: { teammate: helper, name }, hold: true }))
          .catch((err) => log(`asks: ${name}'s hand-back did not reach the thread: ${err?.message ?? err}`));
        const slug = all.find((t) => t.row.id === r.id)?.slug;
        if (slug) putAway(slug, r.id);
        carried += 1;
      }
      if (changed) save();
      return carried;
    },
  };
}
