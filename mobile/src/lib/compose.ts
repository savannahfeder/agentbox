// THE NEW-THREAD PAGE'S CHOICES, by the phone site's card's rules
// (renderer/src/threads/ThreadComposer.tsx): which project it opens on and
// falls back to, the model and level it remembers, and what a send names.
import { LAST_PRODUCT_KEY } from '../../../renderer/src/compose-project';
import { DEFAULT_MODEL, readLastModel, writeLastModel } from '../../../renderer/src/models';
import { EFFORTS, defaultEffortFor, effortPicked, effortShown, readLastEffort, writeLastEffort } from '../../../renderer/src/effort';
import { priorityValueOf, type PriorityId } from '../../../renderer/src/priority';
import { harnessFields, projectsOffered, startingProject } from '../../../renderer/src/threads/composer-rules';
import type { Choices } from './actions';

export interface KeptStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
interface ProjectLike { slug: string; practice?: boolean; team?: object | null }
// The site's readers take the browser's Storage; they only ever call these three.
const asStorage = (store: KeptStore) => store as unknown as Storage;
const remembered = (store: KeptStore) => { try { return store.getItem(LAST_PRODUCT_KEY); } catch { return null; } };

/** The project the page is on: her pick while it is there, else the one she last sent to, else the first. */
export function projectNow(products: readonly ProjectLike[], picked: string | null, store: KeptStore): string | null {
  const offered = projectsOffered(products);
  return offered.find((p) => p.slug === picked)?.slug ?? startingProject(offered, { remembered: remembered(store) })?.slug ?? null;
}

export function openingChoices(products: readonly ProjectLike[], store: KeptStore) {
  return {
    product: projectNow(products, null, store),
    model: readLastModel(asStorage(store)) ?? DEFAULT_MODEL,
    effort: readLastEffort(asStorage(store)),
  };
}

export function pickProject(store: KeptStore, slug: string) {
  try { store.setItem(LAST_PRODUCT_KEY, slug); } catch { /* still picked for this page */ }
}
export function pickModel(store: KeptStore, id: string) { writeLastModel(id, asStorage(store)); }
/** Pressing her own pick again clears it; the level she has now is returned. */
export function pickEffort(store: KeptStore, current: string | null, pressed: string): string | null {
  const next = pressed === current ? null : pressed;
  writeLastEffort(next, asStorage(store));
  return next;
}
/** The level the strip lights: hers, or the one this model thinks at on its own. */
export const litEffort = (effort: string | null, model: string) => effortShown(effort, EFFORTS, defaultEffortFor('claude', model));

/** What a new thread's send names: always the model, a level only when picked. */
export function newThreadChoices({ priority, model, effort }: { priority: PriorityId | null; model: string; effort: string | null }): Choices {
  return {
    ...(priority ? { priority: priorityValueOf(priority) } : {}),
    ...harnessFields({ engine: 'claude', model, effort: effortPicked(effort, EFFORTS) ? effort : null, engineCount: 1, codexDefault: null }),
  };
}

/** `fn`, ignoring a call while the last one is still going. */
export function onceAtATime<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  let going = false;
  return async (...args: A) => {
    if (going) return;
    going = true;
    try { await fn(...args); } finally { going = false; }
  };
}
