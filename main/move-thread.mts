// MOVE A THREAD TO ANOTHER PROJECT, from ⌘K or the thread's More actions menu.
// shared/move-thread.mts says what moves and what stays; this is the part only
// the main process knows: whether an agent is in the thread right now, and
// whether its task folder holds code.
//
// A thread filed in the wrong project is usually noticed while its agent is
// still on it, so a running thread is stopped and then moved, rather than
// refused. Its run in the new project starts from your words there.

import { CHANGED_HERE, ranHere } from '../shared/move-thread.mts';
import type { StoreItem } from './store.mts';

export interface MoveDeps {
  store: {
    readItem(product: string, id: string): StoreItem | null;
    answerItem(product: string, id: string, patch: { status: string }): unknown;
    moveItem(from: string, id: string, to: string): { item: StoreItem & { product: string }; from: string; to: string; note: string };
  };
  isRunning(id: string): boolean;
  stopSession(id: string): unknown;
  /** Whether the thread's task folder holds committed or uncommitted work. */
  changedCode(product: string, id: string): boolean;
  waitMs?: number;
  pollMs?: number;
}

export const DID_NOT_STOP = 'Its agent did not stop in time. Try the move again.';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function moveThread(deps: MoveDeps, { product, id, to }: { product: string; id: string; to: string }) {
  const { store, isRunning, stopSession, changedCode, waitMs = 15_000, pollMs = 100 } = deps;
  const wasRunning = isRunning(id);
  // Code it changed stays on its branch in this project, so it does not move.
  if ((wasRunning || ranHere(store.readItem(product, id))) && changedCode(product, id)) {
    return { ok: false as const, error: CHANGED_HERE };
  }
  if (wasRunning) {
    stopSession(id);
    // Blocked as Stop leaves it, so nothing picks the old row up again while
    // the agent winds down.
    store.answerItem(product, id, { status: 'blocked' });
    // Its exit writes the run's last words on the old row; they move with it.
    const until = Date.now() + waitMs;
    while (isRunning(id)) {
      if (Date.now() > until) return { ok: false as const, error: DID_NOT_STOP };
      await sleep(pollMs);
    }
    // It may have written files in the moments before it stopped.
    if (changedCode(product, id)) return { ok: false as const, error: CHANGED_HERE };
  }
  const out = store.moveItem(product, id, to);
  // It was working when you moved it, so its work is still owed: it runs in
  // the new project rather than waiting there as stopped.
  if (wasRunning) store.answerItem(out.item.product, out.item.id, { status: 'open' });
  return { ok: true as const, ...out, item: store.readItem(out.item.product, out.item.id) ?? out.item, stopped: wasRunning };
}
