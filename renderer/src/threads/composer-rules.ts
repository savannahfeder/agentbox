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
import { parseWhen } from '../format';
import { firstName } from '../team/company';
import type { Person } from '../types';
import { projectSeenBy } from '../../../shared/thread-cards.mjs';

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

/** How far back "the ones you use" looks: the last forty threads that named a
 *  model. A count with no window lets a model you have finished with hold a row
 *  for ever on the strength of a month nobody remembers. */
const WINDOW = 40;

/**
 * THE RECENT ROWS: the models you are using now, read off the work items you
 * already have. The one you picked LAST is first, because that is what Recent
 * promises; after it, the ones you reach for most often in the window above,
 * ties going to whichever was used more recently.
 *
 * It was the three most recent DISTINCT models and nothing else, and three
 * one-off picks on replies pushed out the model behind six of that morning's
 * threads: "I have to go to All models (13 more) to get Opus" (power-test-2,
 * issue 42).
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
  { codexModels = [], codexDefault = null, codexOffered, claudeOffered = true, limit = 3 }:
    { codexModels?: readonly CodexRow[]; codexDefault?: string | null; codexOffered: boolean; claudeOffered?: boolean; limit?: number },
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
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, WINDOW)
    .map((i) => {
      const model = i.model as string;
      const engine: Harness = i.engine === 'codex' || i.engine === 'claude' ? i.engine : harnessOf(model, codexModels);
      return { pick: { engine, model: engine === 'claude' ? claudeAliasOf(model) : model }, at: i.createdAt ?? 0 };
    })
    .filter(({ pick }) => (pick.engine === 'codex' ? codexOffered : claudeOffered));
  const tally = new Map<string, { pick: ModelPick; count: number; last: number }>();
  for (const { pick, at } of used) {
    const row = tally.get(keyOf(pick)) ?? { pick, count: 0, last: 0 };
    tally.set(keyOf(pick), { pick, count: row.count + 1, last: Math.max(row.last, at) });
  }
  if (used[0]) add(used[0].pick);
  for (const row of [...tally.values()].sort((a, b) => b.count - a.count || b.last - a.last)) add(row.pick);
  // A MAC WITHOUT CLAUDE CODE IS OFFERED NO CLAUDE MODEL (w-db6f5e331e): it
  // has nothing to run one in, and the menu is a list of what it can run.
  if (!claudeOffered) {
    if (codexOffered) add({ engine: 'codex', model: codexDefault ?? codexModels[0]?.id ?? CODEX_OWN });
    for (const m of codexOffered ? codexModels : []) add({ engine: 'codex', model: m.id });
    return out;
  }
  add({ engine: 'claude', model: DEFAULT_MODEL });
  add({ engine: 'claude', model: 'sonnet' });
  if (codexOffered) add({ engine: 'codex', model: codexDefault ?? codexModels[0]?.id ?? CODEX_OWN });
  for (const m of claudeModelRows()) add({ engine: 'claude', model: m.id });
  return out;
}

/** Everything behind "All models": Claude Code's list and, when offered, Codex's. */
export function allModels({ codexModels = [], codexOffered, claudeOffered = true }: { codexModels?: readonly CodexRow[]; codexOffered: boolean; claudeOffered?: boolean }): {
  claude: ModelPick[]; codex: ModelPick[];
} {
  return {
    claude: claudeOffered ? claudeModelRows().map((m) => ({ engine: 'claude' as const, model: m.id })) : [],
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

// ONE AGENT IS NOT A CHOICE: there the card keeps the word and the single row
// it has always drawn (tests/one-coding-agent-draws-nothing-new).

type EngineRow = { id: string; label: string };

/** The agents To offers, or nothing where there is only one. */
export function agentChoices(engines?: readonly EngineRow[]): { id: Harness; label: string }[] {
  const rows = engines ?? [];
  if (rows.length < 2) return [];
  return rows
    .filter((e) => e.id === 'claude' || e.id === 'codex')
    .map((e) => ({ id: e.id as Harness, label: e.label }));
}

/** The word on the To field: the agent's name, or "Agent" where there is one. */
export function agentWordFor(engines: readonly EngineRow[] | undefined, engine: Harness): string {
  const rows = agentChoices(engines);
  return rows.find((e) => e.id === engine)?.label ?? 'Agent';
}

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

// The same question on a REPLY is ../reply-pick.ts, `pickToSend`: there the
// row already has answers to it, so every field is explicit and null clears.

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

/**
 * What a time typed into Send later means, or null. It reads the same words the
 * Schedule box on a thread reads ("3h", "fri 6pm", "tomorrow 3pm"), because a
 * browser date field was the harder of the two to use
 * (tests/send-later-takes-a-time-in-words.test.mjs). A moment already past is
 * refused rather than sent: the store would run it at once, and a card that
 * says "later" and starts now is a small lie about when an agent has it.
 */
export function momentFromWords(text: string, now = Date.now()): { ts: number; hint: string } | null {
  const when = parseWhen(text ?? '', now);
  if (!when || when.ts <= now) return null;
  return { ts: when.ts, hint: laterHint(when.ts) };
}

/* -------------------------------- message --------------------------------- */

/**
 * The title and body, derived exactly as the old card derived them: the split
 * in ../message-split.ts, which never drops a word she typed. Files with no
 * words are titled by the first file. Null when there is nothing to send.
 */
export function threadMessage(
  text: string,
  attachments: ReadonlyArray<{ name: string }>,
  named?: { encode: (words: string) => string; plain: (words: string) => string },
): { title: string; body: string } | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed && !attachments.length) return null;
  const sent = named ? named.encode(trimmed) : trimmed;
  if (sent === trimmed) return splitMessage(trimmed || `Attached: ${attachments[0]?.name}`);
  // A thread named in the first line would leave the body with the title
  // lifted out, and the title is plain words, so the body keeps every line.
  return { title: splitMessage(named!.plain(trimmed)).title, body: sent };
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

/** "Maya","Maya and Jun", "Maya, Jun and Priya". The card, the reply box and
 *  the line above all say a group of people the same way. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ------------------------------- visibility ------------------------------- */

export type Visibility = 'team' | 'people' | 'private';

export const VISIBILITY_KEY = 'threads.composer.visibility';

// THREE CHOICES SINCE w-41ff964775: a person may want a thread seen by a few
// people rather than by everyone or nobody. Chosen people sits between the
// two it already had, because
// that is where it sits in how much it shares.
export const VISIBILITY_ROWS: ReadonlyArray<{ id: Visibility; label: string; line: string }> = [
  { id: 'team', label: 'Team', line: 'Teammates see its summary on the Team board.' },
  { id: 'people', label: 'Chosen people', line: 'Only the people you pick see its summary.' },
  { id: 'private', label: 'Private', line: 'Only you see it. It is not on the Team board.' },
];

/**
 * WHAT A SEND SAYS ABOUT WHO SEES IT. Chosen people with nobody picked reaches
 * nobody, which is Private: one stored word per thing that is true, so the
 * panel can never say "Chosen people" over a thread no person can see.
 */
export function sharingFields(visibility: Visibility, chosen: readonly string[]): { visibility: Visibility; visibleTo?: string[] } {
  if (visibility !== 'people') return { visibility };
  const people = [...new Set(chosen.filter(Boolean))];
  return people.length ? { visibility: 'people', visibleTo: people } : { visibility: 'private' };
}

/**
 * WHERE THE CHIP STARTS: wherever the project is (w-b989839656). A Just you
 * project, My Workspace among them, starts Private; a project shared with
 * chosen people starts on those people; anything else starts on Team. The
 * chip stays the card's own control, so one thread can still say otherwise.
 */
type ProjectSeen = { personal?: boolean; seenBy?: string; seenByPeople?: string[] } | null | undefined;
export function startingVisibility(product: ProjectSeen): Visibility {
  const { who } = projectSeenBy(product);
  return who === 'private' ? 'private' : who === 'people' ? 'people' : 'team';
}

/** The people ticked when the card starts on a chosen-people project. */
export function startingChosen(product: ProjectSeen): string[] {
  return projectSeenBy(product).people;
}

/** The names on the Visibility chip: "Theo", "Theo and Ana", "3 people". */
export function chosenWords(chosen: readonly string[], people: readonly Person[]): string {
  const named = chosen.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => !!p);
  if (!named.length) return 'Chosen people';
  if (named.length > 2) return `${named.length} people`;
  return named.map((p) => firstName(p)).join(' and ');
}

interface KeyStore { getItem(key: string): string | null; setItem?(key: string, value: string): void }

const storeOf = (store?: KeyStore): KeyStore | null =>
  store ?? (globalThis as unknown as { localStorage?: KeyStore }).localStorage ?? null;

/** Team unless she chose Private. Anything else, or a refused read, is Team. */
// REMEMBERED PER PROJECT (2026-10-01). A Private pick used to follow her to
// every next thread, so teammates quietly stopped seeing work in projects she
// never meant to hide (a persona test caught it). People who keep some work
// quiet tend to keep it quiet by whole project, so the choice sticks to the
// project it was made in, and every
// other project still starts at Team.
const visibilityKey = (project?: string | null) => (project ? `${VISIBILITY_KEY}.${project}` : VISIBILITY_KEY);

export function readVisibility(store?: KeyStore, project?: string | null): Visibility {
  try { return storeOf(store)?.getItem(visibilityKey(project)) === 'private' ? 'private' : 'team'; } catch { return 'team'; }
}

export function writeVisibility(v: Visibility, store?: KeyStore, project?: string | null): void {
  try { storeOf(store)?.setItem?.(visibilityKey(project), v); } catch { /* the card still sends */ }
}

/* ---------------------- send as a task, or as a message ------------------- */
// A TO-DO IS A TASK YOU GIVE YOURSELF (w-c34591721f, approved 2026-10-17), and
// the same gesture gives one to a teammate. The store already knew how to hold
// that — `assignee` means the person who has to act next, a row held by a
// person never starts an agent, and it sits in that one person's inbox until
// it is done (shared/team-rules.mjs). The card simply had no way to say it.
//
// So a card addressed to a person asks one more question, SEND AS, and a task
// gets one more row, DUE ON. Everything general stays on the bar: the project,
// the urgency and who can see it are the same whatever this is.

export type SendAs = 'message' | 'task';

/** What DUE ON reads when nobody has set a day. Her words, her capitals. */
export const NO_DEADLINE = 'No Deadline';

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The days the picker offers: today, tomorrow, and the rest of the week by
 * name. A calendar day, never a time — a task is due ON a day, and an hour is
 * a promise neither Mac can keep across two time zones.
 */
export function dueChoices(now = new Date()): { key: string | null; label: string }[] {
  const out: { key: string | null; label: string }[] = [{ key: null, label: NO_DEADLINE }];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    out.push({
      key: dayKey(d),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' }),
    });
  }
  return out;
}

/**
 * THE RESTING WORD IS AN ANSWER, NOT A BLANK. Most tasks will never carry a
 * day, so "No Deadline" is what the row says at rest: it completes the card
 * instead of asking for something. "Not set" and "None" were drawn too and
 * both read as a field somebody failed to fill in.
 *
 * A day the picker never offered still reads as a day rather than as nothing,
 * because the card can be reopened on a thread dated from somewhere else.
 */
export function dueWords(due: string | null, now = new Date()): string {
  if (!due) return NO_DEADLINE;
  return dueChoices(now).find((c) => c.key === due)?.label ?? due;
}

/**
 * What a task given to a person is composed with. A day nobody set is not sent
 * at all: a field set to nothing and a field nobody touched are different
 * things on disk, and the store keeps what it is given.
 */
export function taskFields({ personId, due }: { personId: string; due: string | null }):
  { assignee: string; due?: string } {
  return { assignee: personId, ...(due ? { due } : {}) };
}

/* ------------------------------ the keyboard ------------------------------ */

/** What has the keyboard while the card is open. */
export type Keyboard = 'a field' | 'the card' | 'nothing' | 'away';

/**
 * TYPING ON THIS CARD IS TYPING, NEVER A PRESS (w-abed8ae491).
 *
 * The card sent tasks half-written. Measured on the real card: four Tabs out of
 * the message box land on Send, and Space there sends whatever is in the box —
 * one thread's entire brief was the word "Make". A click on the card's own
 * padding puts the keyboard on BODY, where every character typed afterwards is
 * dropped in silence. Escape out of a menu puts it on the chip that opened the
 * menu, where a space opens the menu again and a letter can land on a row.
 *
 * So a character with no chord on it goes to the message wherever the keyboard
 * happens to be sitting, and the control under it never hears it. Two
 * exceptions, both of them somebody typing on purpose: a caret already in a
 * field, and an open menu, whose rows are picked with Enter and whose find box
 * takes letters.
 *
 * The cost is Enter and Space opening a menu from a focused trigger. The arrow
 * keys do that (`triggerKeys` in ./ThreadComposer.tsx) and ⌘↵ is printed on
 * Send, so nothing on the card is out of the keyboard's reach.
 */
export function keyOnTheNewThreadCard(
  { key, meta, ctrl, alt, menuOpen, on }: {
    key: string; meta?: boolean; ctrl?: boolean; alt?: boolean; menuOpen: boolean; on: Keyboard;
  },
): 'the message' | 'leave it' {
  if (meta || ctrl || alt) return 'leave it';
  if (key.length !== 1 && key !== 'Enter') return 'leave it';
  if (menuOpen || on === 'a field' || on === 'away') return 'leave it';
  return 'the message';
}

/**
 * Which rows the head draws. To an agent it is still To and Model, untouched.
 * To a person it is To and Send As, and the day appears only once it is a
 * task, because a message has nothing to be due.
 */
export function headRows({ person, kind }: { person: boolean; kind: SendAs }):
  ('to' | 'model' | 'sendAs' | 'dueOn')[] {
  if (!person) return ['to', 'model'];
  return kind === 'task' ? ['to', 'sendAs', 'dueOn'] : ['to', 'sendAs'];
}
