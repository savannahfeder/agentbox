// THE NEW-THREAD PAGE'S CHOICES, by the phone site's card's rules
// (renderer/src/threads/ThreadComposer.tsx): which project it opens on and
// falls back to, the agent, model and level it remembers, and what a send names.
import { LAST_PRODUCT_KEY } from '../../../renderer/src/compose-project';
import { DEFAULT_MODEL, defaultModelFor, readLastModel, writeLastModel, type ModelChoice } from '../../../renderer/src/models';
import { EFFORTS, defaultEffortFor, effortChoicesFor, effortPicked, effortShown, readLastEffort, writeLastEffort } from '../../../renderer/src/effort';
import { readLastEngine, startingEngine, writeLastEngine } from '../../../renderer/src/engines';
import { priorityValueOf, type PriorityId } from '../../../renderer/src/priority';
import { harnessFields, projectsOffered, startingProject, type Harness } from '../../../renderer/src/threads/composer-rules';
import { readLastRecipient, writeLastRecipient } from '../../../renderer/src/threads/recipient';
import type { Engine } from '../../../shared/engines.mjs';
import type { Choices } from './actions';

export interface KeptStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
interface ProjectLike { slug: string; practice?: boolean; team?: object | null }
/** Codex's models as the computer sent them, and the one its own config runs. */
export interface CodexOpts { codexModels?: ModelChoice[]; codexDefault?: string | null }
// The site's readers take the browser's Storage; they only ever call these three.
const asStorage = (store: KeptStore) => store as unknown as Storage;
const remembered = (store: KeptStore) => { try { return store.getItem(LAST_PRODUCT_KEY); } catch { return null; } };

/** The project the page is on: her pick while it is there, else the one she last sent to, else the first. */
export type Recipient = { to: string; mate: string | null; auto: boolean };
/** Who a new thread went to last, Auto, an agent or one of your teammates, kept as the desktop keeps it (renderer/src/threads/recipient.ts). */
export const openingRecipient = (mates: readonly { id: string }[], reach: boolean, store: KeptStore): Recipient => readLastRecipient([], mates, reach, asStorage(store));
export const pickRecipient = (store: KeptStore, r: Recipient) => writeLastRecipient(r, asStorage(store));

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

/** The model and level a new thread opens on for one agent: the ones last picked for it, each agent's kept apart. */
export function openingFor(store: KeptStore, engine: Harness, codexDefault: string | null) {
  return {
    model: readLastModel(asStorage(store), engine, codexDefault) ?? defaultModelFor(engine, codexDefault),
    effort: readLastEffort(asStorage(store), engine),
  };
}

/** The agent a new thread opens on: the one last picked, where the computer offers it (engines.ts `startingEngine`). */
export const openingEngine = (store: KeptStore, engines: Engine[]): Harness => startingEngine(readLastEngine(asStorage(store)), engines);
export function pickEngine(store: KeptStore, engine: Harness) { writeLastEngine(engine, asStorage(store)); }

export function pickProject(store: KeptStore, slug: string) {
  try { store.setItem(LAST_PRODUCT_KEY, slug); } catch { /* still picked for this page */ }
}
export function pickModel(store: KeptStore, id: string, engine: Harness = 'claude', codexDefault: string | null = null) {
  writeLastModel(id, asStorage(store), engine, codexDefault);
}
/** Pressing her own pick again clears it; the level she has now is returned. */
export function pickEffort(store: KeptStore, current: string | null, pressed: string, engine: Harness = 'claude'): string | null {
  const next = pressed === current ? null : pressed;
  writeLastEffort(next, asStorage(store), engine);
  return next;
}
/** The level the strip lights: hers, or the one this model thinks at on its own. */
export const litEffort = (effort: string | null, model: string, engine: Harness = 'claude', opts: CodexOpts = {}) =>
  effortShown(effort, effortChoicesFor(engine, model, opts), defaultEffortFor(engine, model, opts));

/**
 * What a new thread's send names, by the site's card's rules (`harnessFields`):
 * the agent only where the computer offers two, the Claude model always, a
 * Codex model only off its default, and a level only when picked and taken by
 * that model. The agent and model were always Claude Code's here, whatever the
 * computer had (w-24119e8784).
 */
export function newThreadChoices({ priority, engine = 'claude', model, effort, engineCount = 1, codexModels = [], codexDefault = null }: {
  priority: PriorityId | null; engine?: Harness; model: string; effort: string | null; engineCount?: number;
} & CodexOpts): Choices {
  const levels = engine === 'claude' ? EFFORTS : effortChoicesFor(engine, model, { codexModels, codexDefault });
  return {
    ...(priority ? { priority: priorityValueOf(priority) } : {}),
    ...harnessFields({ engine, model, effort: effortPicked(effort, levels) ? effort : null, engineCount, codexDefault }),
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
