// A THREAD WHOSE WORK SHIPPED CLOSES ITSELF (w-bb45118b10), unless the agent's
// last word still offers a real choice, the person has spoken since, or they
// reopened it. The close is written with the ship note in one patch, which is
// how the inbox tells it from an agent's close (`closedByItsShip`).
import { closesTheTask } from './closes-the-task.mts';
import { isShippedNote } from './shipped-note.mts';
import { shippedAs, type NotedItem } from './not-shipped.mts';

type Wrote = { ts: number; source?: string } | undefined;
export interface ShipItem extends NotedItem {
  result?: string;
  answer?: string;
}

const at = (w: Wrote) => w?.ts ?? 0;
const ITEM = /^\s{0,3}(\d+)[.)]\s+(.*)$/;
const HEADING = /^#{1,4}\s/;

/** True when the text offers no choice but closing. Any numbered line in its options, or a bare list that ends it, that is not a close keeps it open. */
export function offersOnlyClose(text: string | null | undefined): boolean {
  const lines = String(text ?? '').split('\n');
  const heading = lines.findLastIndex((l) => HEADING.test(l) && /option/i.test(l));
  let offered: string[];
  if (heading >= 0) {
    const rest = lines.slice(heading + 1);
    const next = rest.findIndex((l) => HEADING.test(l));
    offered = (next < 0 ? rest : rest.slice(0, next)).map((l) => ITEM.exec(l)?.[2] ?? '').filter(Boolean);
  } else {
    const tail = lines.filter((l) => l.trim()).slice(-6);
    offered = tail.map((l) => ITEM.exec(l)?.[2] ?? '').filter(Boolean);
  }
  return offered.every((o) => closesTheTask(o.trim()));
}

export function shipClosesIt(item: ShipItem | null | undefined): boolean {
  if (!item || item.status === 'done' || item.status === 'claimed') return false;
  if (!item.result) return false;
  if (at(item.wrote?.answer) > at(item.wrote?.result)) return false;
  return offersOnlyClose(item.result);
}

/** A thread already shipped that the same rule would have closed. A status written after the ship is a reopen, which the store records as the app's. */
export function shippedButOpen(item: ShipItem | null | undefined): boolean {
  if (!item || !shippedAs(item) || at(item.wrote?.status) > at(item.wrote?.note)) return false;
  return shipClosesIt(item);
}

export function closedByItsShip(item: ShipItem | null | undefined): boolean {
  if (item?.status !== 'done' || item.wrote?.status?.source !== 'system') return false;
  if (!isShippedNote(item.note) || item.wrote?.note?.source !== 'system') return false;
  return at(item.wrote?.status) === at(item.wrote?.note);
}
