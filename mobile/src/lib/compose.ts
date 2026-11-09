// THE NEW-THREAD PAGE'S CHOICES, by the phone site's card's rules
// (renderer/src/threads/ThreadComposer.tsx): which project it opens on and
// falls back to, the agent, model and level it remembers, and what a send names.
import { DEFAULT_MODEL, defaultModelFor, engineModelLabel, readLastModel, writeLastModel, type ModelChoice } from '../../../renderer/src/models';
import { EFFORTS, defaultEffortFor, effortChoicesFor, effortPicked, effortShown, readLastEffort, writeLastEffort } from '../../../renderer/src/effort';
import { readLastEngine, startingEngine } from '../../../renderer/src/engines';
import { priorityValueOf, type PriorityId } from '../../../renderer/src/priority';
import { harnessFields, harnessOf, projectsOffered, startingProject, type Harness } from '../../../renderer/src/threads/composer-rules';
import { readLastRecipient } from '../../../renderer/src/threads/recipient';
import { pickToSend } from '../../../renderer/src/reply-pick';
import type { Engine } from '../../../shared/engines.mts';
import type { Choices } from './actions';

export interface KeptStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
interface ProjectLike { slug: string; practice?: boolean; team?: object | null }
/** Codex's models as the computer sent them, and the one its own config runs. */
export interface CodexOpts { codexModels?: ModelChoice[]; codexDefault?: string | null }
// The site's readers take the browser's Storage; they only ever call these three.
const asStorage = (store: KeptStore) => store as unknown as Storage;

// WHO A NEW THREAD GOES TO AND WHICH PROJECT are picked for that one thread and
// forgotten after it, so the next task never goes to the last one's agent or
// project unnoticed. The model and level stay remembered.
const NOTHING_KEPT = asStorage({ getItem: () => null, setItem: () => {}, removeItem: () => {} });

export type Recipient = { to: string; mate: string | null; auto: boolean };
/** Who a new thread opens addressed to: Auto, or the computer's agent (renderer/src/threads/recipient.ts). */
export const openingRecipient = (mates: readonly { id: string }[], reach: boolean): Recipient => readLastRecipient([], mates, reach, NOTHING_KEPT);

/** The project the page is on: your pick while it is there, else the first in your running order. */
export function projectNow(products: readonly ProjectLike[], picked: string | null): string | null {
  const offered = projectsOffered(products);
  return offered.find((p) => p.slug === picked)?.slug ?? startingProject(offered, {})?.slug ?? null;
}

export function openingChoices(products: readonly ProjectLike[], store: KeptStore) {
  return {
    product: projectNow(products, null),
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

/** The agent a new thread opens on: the computer's own, where the computer offers it (engines.ts `startingEngine`). */
export const openingEngine = (engines: Engine[], workspace: string | null = null): Harness =>
  startingEngine(readLastEngine(NOTHING_KEPT, workspace), engines);

/** The computer's agents as the phone last read them, so a slow or failed read does not drop it to Claude Code alone. */
export interface Agents { engines: Engine[]; workspace: string; codexModels: ModelChoice[]; codexDefault: string | null }
const AGENTS_KEY = 'agentbox.computerAgents';
export function keptAgents(store: KeptStore): Agents | null {
  try {
    const a = JSON.parse(store.getItem(AGENTS_KEY) ?? 'null');
    if (!a || !Array.isArray(a.engines) || !a.engines.length || typeof a.workspace !== 'string') return null;
    return { engines: a.engines, workspace: a.workspace, codexModels: Array.isArray(a.codexModels) ? a.codexModels : [], codexDefault: a.codexDefault ?? null };
  } catch { return null; }
}
export function keepAgents(store: KeptStore, agents: Agents) {
  try { store.setItem(AGENTS_KEY, JSON.stringify(agents)); } catch { /* read again next time */ }
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

/**
 * The agent a thread runs on, by the computer's rule (shared/engines.mts
 * `engineFor`): Codex on a computer with only Codex, else the row's own, else
 * its model's, else the computer's chosen agent where it still has it. A row
 * names its agent only when the computer offers two.
 */
function threadEngine(item: { engine?: string; model?: string }, agents: Partial<Agents>): Harness {
  const has = (id: string) => (agents.engines ?? []).some((e) => e.id === id);
  if (has('codex') && !has('claude')) return 'codex';
  if (item.engine === 'codex' || item.engine === 'claude') return item.engine;
  if (item.model) return harnessOf(item.model, agents.codexModels);
  return agents.workspace === 'codex' && has('codex') ? 'codex' : 'claude';
}

/** The model a thread's reply box shows and lists: the agent picked in the box, else the thread's own. */
export function replyModel(item: { engine?: string; model?: string }, picked: Pick<Choices, 'model' | 'engine'>, codex: CodexOpts & Partial<Agents> = {}) {
  const own = threadEngine(item, codex);
  const engine: Harness = picked.engine === 'claude' || picked.engine === 'codex' ? picked.engine : own;
  const model = picked.model ?? (engine === own ? item.model : undefined) ?? defaultModelFor(engine, codex.codexDefault ?? null);
  return { engine, model, label: engineModelLabel(engine, model, codex) };
}

/**
 * What a reply names, by the desktop's reply rule (reply-pick.ts `pickToSend`):
 * the agent only when the pick moves the thread to the other one on a computer
 * that has both, and then the model and level too, so the old agent's are not
 * left on the row. Codex's model is null for its own default.
 */
export function replyChoices(item: { engine?: string; model?: string }, picked: Choices, agents: CodexOpts & Partial<Agents> = {}): Choices {
  const { engine: _picked, ...rest } = picked;
  const was = threadEngine(item, agents);
  const { engine } = replyModel(item, picked, agents);
  if (engine === was || (agents.engines?.length ?? 0) < 2) return rest;
  const sent = pickToSend({ model: picked.model ?? null, effort: picked.effort ?? null }, { engine, was, engineCount: agents.engines!.length });
  return { ...rest, engine, model: sent.model, effort: sent.effort };
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
