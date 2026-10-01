// PURE. The rules under the New thread card (./ThreadComposer.tsx), kept apart
// from it so they can be tested without a window. The card was redrawn as an
// email (w-e731ca9376, approved 2026-10-01): To and Model at the top, the
// message, then the project, the priority and who can see it. Every decision in
// here is one the card makes on her behalf, which is why none of it lives inside
// a click handler.
//
// THE MODEL IS THE HARNESS. The card has no Engine field any more. Anthropic
// models run in Claude Code and GPT models run in Codex, so picking a model is
// picking where it runs, and the two can never disagree the way two pickers did
// (a Claude alias sent to Codex is a run the supervisor refuses outright).

import { claudeModelRows, CODEX_OWN, DEFAULT_MODEL, engineModelPicked, type ModelChoice } from '../models';
import { splitMessage } from '../message-split';
import { firstName } from '../team/company';
import type { Person } from '../types';

export type Harness = 'claude' | 'codex';

/** One model as the card holds it: where it runs, and the word that runs it. */
export interface ModelPick {
  engine: Harness;
  /** A Claude Code alias (`opus`), or a Codex slug (`gpt-6-astra`). */
  model: string;
}

type CodexRow = Pick<ModelChoice, 'id'> & Partial<ModelChoice>;

/* -------------------------------- harness --------------------------------- */

/**
 * Where a model runs. Claude Code's own rows are asked first, by alias and by
 * full id, then the Codex list read off this Mac. A slug neither list knows is
 * read by its shape: a GPT name is Codex, anything else is Claude Code, which is
 * the default everywhere else in the app too (shared/engines.mjs says why).
 */
export function harnessOf(model: string, codexModels: readonly CodexRow[] = []): Harness {
  if (claudeModelRows().some((m) => m.id === model || m.model === model)) return 'claude';
  if (codexModels.some((m) => m.id === model)) return 'codex';
  if (/^(gpt|o\d|codex)/i.test(model)) return 'codex';
  return 'claude';
}

/** A full Claude id (`claude-opus-5-5`) named by the alias the picker sends. */
function claudeAliasOf(model: string): string {
  return claudeModelRows().find((m) => m.model === model)?.id ?? model;
}

const keyOf = (p: ModelPick) => `${p.engine}:${p.model}`;

/**
 * THE RECENT ROWS: the three most recently used distinct models, newest first,
 * read off the work items she already has.
 *
 * An item that named no model ran on a default nobody chose, so it says nothing
 * about what she uses and is skipped. An item that wrote no engine (it is only
 * written when this Mac offered a choice) is placed by its model. A Codex item
 * on a Mac that no longer offers Codex is left out, because a row she cannot run
 * is worse than one fewer row.
 *
 * Fewer than three is topped up with Opus, Sonnet and the Codex default, in
 * that order, and then with the rest of Claude Code's own list, so the heading
 * always has three rows under it.
 */
export function recentModels(
  items: ReadonlyArray<{ createdAt?: number; model?: string; engine?: string }>,
  { codexModels = [], codexDefault = null, codexOffered, limit = 3 }:
    { codexModels?: readonly CodexRow[]; codexDefault?: string | null; codexOffered: boolean; limit?: number },
): ModelPick[] {
  const out: ModelPick[] = [];
  const seen = new Set<string>();
  const add = (p: ModelPick) => {
    if (out.length >= limit || seen.has(keyOf(p))) return;
    seen.add(keyOf(p));
    out.push(p);
  };
  const used = items
    .filter((i) => typeof i.model === 'string' && i.model)
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  for (const i of used) {
    const model = i.model as string;
    const engine: Harness = i.engine === 'codex' || i.engine === 'claude' ? i.engine : harnessOf(model, codexModels);
    if (engine === 'codex' && !codexOffered) continue;
    add({ engine, model: engine === 'claude' ? claudeAliasOf(model) : model });
  }
  add({ engine: 'claude', model: DEFAULT_MODEL });
  add({ engine: 'claude', model: 'sonnet' });
  if (codexOffered) add({ engine: 'codex', model: codexDefault ?? codexModels[0]?.id ?? CODEX_OWN });
  for (const m of claudeModelRows()) add({ engine: 'claude', model: m.id });
  return out;
}

/** Everything behind "All models": Claude Code's list and, when offered, Codex's. */
export function allModels({ codexModels = [], codexOffered }: { codexModels?: readonly CodexRow[]; codexOffered: boolean }): {
  claude: ModelPick[]; codex: ModelPick[];
} {
  return {
    claude: claudeModelRows().map((m) => ({ engine: 'claude' as const, model: m.id })),
    codex: codexOffered ? codexModels.map((m) => ({ engine: 'codex' as const, model: m.id })) : [],
  };
}

/** The "N more" on the All models row: what is in the columns and not in Recent. */
export function moreCount(recent: readonly ModelPick[], all: { claude: readonly ModelPick[]; codex: readonly ModelPick[] }): number {
  const listed = new Set([...all.claude, ...all.codex].map(keyOf));
  return listed.size - recent.filter((r) => listed.has(keyOf(r))).length;
}

export const sameModel = (a: ModelPick | null | undefined, b: ModelPick | null | undefined) =>
  !!a && !!b && a.engine === b.engine && a.model === b.model;

/**
 * WHAT A SEND SAYS ABOUT THE HARNESS, by the rules the old card followed and
 * explained at length (components/Compose.tsx, `send`):
 *
 *  - The Claude model is ALWAYS named, the default included, because this card
 *    is the only place the question is asked and a flag left in zero.config.json
 *    must not answer it instead.
 *  - The Codex default is NOT named, because there the absence of the word is
 *    real: her own ~/.codex/config.toml decides.
 *  - The engine is named only when this Mac offered a choice, which is when
 *    the supervisor will read it.
 *  - The level only when she picked one this model takes; the caller checks that.
 */
export function harnessFields({ engine, model, effort, engineCount, codexDefault }: {
  engine: Harness; model: string; effort: string | null; engineCount: number; codexDefault: string | null;
}): { engine?: string; model?: string; effort?: string } {
  const named = engine === 'codex'
    ? (engineModelPicked('codex', model, codexDefault) ? { model } : {})
    : { model: model || DEFAULT_MODEL };
  return {
    ...(engineCount > 1 ? { engine } : {}),
    ...named,
    ...(effort ? { effort } : {}),
  };
}

/* ------------------------------- send later ------------------------------- */

// LOCAL CALENDAR TIME, never arithmetic on milliseconds: "8:00" is a wall-clock
// promise, and adding 24 hours across a clock change would land at 7 or 9.

/** The next calendar day at 8:00. */
export function tomorrowMorning(now = Date.now()): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

/**
 * The coming Monday at 8:00. Pressed ON a Monday it is the next one, a week
 * on: "Monday morning" said on a Monday afternoon means next week, and said
 * before eight it would otherwise be an hour away, which is not what the row
 * reads as.
 */
export function mondayMorning(now = Date.now()): number {
  const d = new Date(now);
  const ahead = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + ahead);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "Fri 8:00": the clock a Send later row keeps on its right. */
export function laterHint(ts: number): string {
  const d = new Date(ts);
  return `${DAYS[d.getDay()]} ${d.getHours()}:${pad(d.getMinutes())}`;
}

/** A moment as an `<input type="datetime-local">` value, in local time. */
export function inputValueOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * What "Pick a date and time" means, or null. A moment already past is refused
 * rather than sent: the store would run it at once, and a card that says
 * "later" and starts now is a small lie about when an agent has it.
 */
export function momentFromInput(value: string, now = Date.now()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const ts = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  if (!Number.isFinite(ts) || ts <= now) return null;
  return ts;
}

/* -------------------------------- message --------------------------------- */

/**
 * The title and body, derived exactly as the old card derived them: the split
 * in ../message-split.ts, which never drops a word she typed. Files with no
 * words are titled by the first file. Null when there is nothing to send.
 */
export function threadMessage(text: string, attachments: ReadonlyArray<{ name: string }>): { title: string; body: string } | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed && !attachments.length) return null;
  return splitMessage(trimmed || `Attached: ${attachments[0]?.name}`);
}

/* -------------------------------- projects -------------------------------- */

// `team` is read loosely on purpose: main writes `direct` on a Direct project's
// team record (main/team/projects.mjs), and the renderer's Product type has not
// grown the field yet, so the rule asks for it rather than assuming it.
interface ProjectLike { slug: string; practice?: boolean; team?: object | null }
const isDirect = (p: ProjectLike) => (p.team as { direct?: unknown } | null | undefined)?.direct === true;

/**
 * Every project a thread can be filed into. The Direct projects that carry
 * messages between two people are products on disk like any other, but a task
 * filed into one would land inside somebody's private conversation.
 */
export function projectsOffered<T extends ProjectLike>(products: readonly T[]): T[] {
  return products.filter((p) => !isDirect(p));
}

/**
 * Which project the card opens on: the one on screen, else the one she last
 * sent to, else the first real one. The practice project is only ever chosen
 * on purpose (components/Compose.tsx says why it can never run anything).
 */
export function startingProject<T extends ProjectLike>(
  offered: readonly T[],
  { defaultProduct, remembered }: { defaultProduct?: string | null; remembered?: string | null },
): T | null {
  return offered.find((p) => p.slug === defaultProduct)
    ?? offered.find((p) => p.slug === remembered)
    ?? offered.find((p) => !p.practice)
    ?? offered[0]
    ?? null;
}

// Projects carry no colour of their own yet, so the swatch is read off the slug:
// the same project is the same colour on every open and on every machine. No
// red among them: a red square reads as an alarm, and nothing here is one.
const SWATCHES = ['#ee6018', '#5b9bd5', '#9a8f86', '#6aa37a', '#b48ead', '#d0a65a', '#4fa3a5'];
export function projectSwatch(slug: string): string {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length];
}

/* --------------------------------- people --------------------------------- */

/** Everyone To can reach: the team, without yourself. */
export function teammates(people: readonly Person[], me: string | null): Person[] {
  return people.filter((p) => p.id !== me);
}

/**
 * "Find a person": any part of a name, or the start of an email, in any case.
 * An email is matched from its start because the end of it is the domain the
 * whole team shares, so "th" used to keep everyone at northwind.test.
 */
export function findPeople(people: readonly Person[], query: string): Person[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return people.slice();
  return people.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().startsWith(q));
}

export function placeholderFor(person: Person | null | undefined): string {
  return person ? `Message ${firstName(person)}` : 'What do you need done?';
}

export function onlyYouAnd(person: Person): string {
  return `Only you and ${firstName(person)} see this.`;
}

/* ------------------------------- visibility ------------------------------- */

export type Visibility = 'team' | 'private';

export const VISIBILITY_KEY = 'threads.composer.visibility';

export const VISIBILITY_ROWS: ReadonlyArray<{ id: Visibility; label: string; line: string }> = [
  { id: 'team', label: 'Team', line: 'Teammates see its summary on the Team board.' },
  { id: 'private', label: 'Private', line: 'Teammates see only that you have a thread.' },
];

interface KeyStore { getItem(key: string): string | null; setItem?(key: string, value: string): void }

const storeOf = (store?: KeyStore): KeyStore | null =>
  store ?? (globalThis as unknown as { localStorage?: KeyStore }).localStorage ?? null;

/** Team unless she chose Private. Anything else, or a refused read, is Team. */
export function readVisibility(store?: KeyStore): Visibility {
  try { return storeOf(store)?.getItem(VISIBILITY_KEY) === 'private' ? 'private' : 'team'; } catch { return 'team'; }
}

export function writeVisibility(v: Visibility, store?: KeyStore): void {
  try { storeOf(store)?.setItem?.(VISIBILITY_KEY, v); } catch { /* the card still sends */ }
}
