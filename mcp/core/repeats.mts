// The standing instruction behind a repeating task, for the agent on one of its
// runs, and a new repeating task, for an agent the person asked for one.
//
// WHICH RUN THE SESSION IS ON COMES FROM THE APP, NOT FROM THE MODEL.
// `ZERO_ITEM` and `ZERO_PRODUCT` are written into a worker's environment when
// the app spawns it (main/supervisor.mts), which is why no argument below names
// the task: a session reaches the rule it is standing on or no rule at all.
//
// AND ONLY THE WORDS, THOUGH `patchRule` TAKES ANYTHING. The app gates `engine`
// and `model` at the door (`engineOffered`, `modelOffered` in main/ipc.mts) so a
// rule cannot be marked for a coding agent the machine never offered; this
// server cannot ask that question, so it does not accept the answer. The hour
// and the day stay on the person's own screen.

import { Repeats } from '../../main/repeats.mts';
import { readWorkItem } from '../../main/store/work-items.mts';
import { listProjects, type ProjectSummary } from '../../main/store/project.mts';
import { DAY_NAMES, nextRunAt, ruleIdOf, ruleLabel, sameRule, standingInstruction, type RepeatRule, type RepeatShape } from '../../shared/repeats.mts';
import type { WorkItem } from '../../shared/work-items.mts';
import { resolveProduct } from './account.mts';
import { herRow, saidToClose } from './work.mts';
import { filedByThePerson } from '../../shared/answers.mts';

interface RunOptions { env?: NodeJS.ProcessEnv | Record<string, string | undefined>; now?: number }
interface RuleOfRun { project: ProjectSummary; item: WorkItem; ruleId: string; rule: RepeatRule }
export interface StandingInstruction {
  repeat: string;
  product: string;
  run: string;
  label: string;
  instruction: string | undefined;
  schedule: string;
  nextRun: number | null;
  ended: boolean;
}

const NO_THREAD = 'this session is not on a thread, so there is no repeating task behind it';

// No store modules: `serve` is the app's, so nothing below creates a work item
// or takes the project lock. A new rule's first run comes from the app's tick.
const rules = new Repeats(null);

function projectOf(itemId: string, product: string | null): ProjectSummary {
  if (product) return resolveProduct(product);
  for (const p of listProjects()) {
    try { if (readWorkItem(p.dir, itemId)) return p; } catch { /* a product with no ledger */ }
  }
  throw new Error(`no thread ${itemId} in any product`);
}

/** The rule this session's run belongs to, or a sentence saying why there is none. */
function ruleBehindThisRun({ env = process.env, now = Date.now() }: RunOptions = {}): RuleOfRun {
  const itemId = String(env.ZERO_ITEM ?? '').trim();
  if (!itemId) throw new Error(NO_THREAD);

  const project = projectOf(itemId, String(env.ZERO_PRODUCT ?? '').trim() || null);
  const item = readWorkItem(project.dir, itemId, now);
  if (!item) throw new Error(`no thread ${itemId} in ${project.name}`);

  const ruleId = ruleIdOf(item);
  if (!ruleId) {
    throw new Error(`${itemId} is not a run of a repeating task, so it has no standing instruction to change`);
  }
  const rule = rules.get(project.dir, ruleId, now);
  if (!rule) throw new Error(`${itemId} names the repeating task ${ruleId}, which is no longer on file`);
  return { project, item, ruleId, rule };
}

function asAnswer({ project, item, ruleId, rule }: RuleOfRun, now: number): StandingInstruction {
  return {
    repeat: ruleId,
    product: project.id,
    run: item.id,
    label: rule.title,
    instruction: standingInstruction(rule),
    schedule: ruleLabel(rule),
    nextRun: nextRunAt(rule, now),
    ended: !!rule.endedAt,
  };
}

/** What every run after this one is told, as it stands. */
export function readStandingInstruction({ env = process.env, now = Date.now() }: RunOptions = {}): StandingInstruction {
  return asAnswer(ruleBehindThisRun({ env, now }), now);
}

/**
 * Change it. The whole instruction, replaced, because that is the operation the
 * person's own screen performs and the only one that can also take a sentence
 * back out.
 */
export function setStandingInstruction({ instruction }: { instruction: unknown }, { env = process.env, now = Date.now() }: RunOptions = {}): StandingInstruction {
  const words = typeof instruction === 'string' ? instruction.trim() : '';
  if (!words) throw new Error('a repeating task needs an instruction; send the whole of it, not an empty one');

  const found = ruleBehindThisRun({ env, now });
  if (found.rule.endedAt) throw new Error(`the repeating task ${found.ruleId} was ended, so it has no next run to change`);

  // Only the body. The title is a label the app derived from what the person
  // typed, and a line added to a standing instruction is not a new name for the
  // task.
  // The rule was read just above, so the patched one is on file.
  const rule = rules.patchRule(found.project.dir, found.ruleId, { body: words }, now)!;
  return asAnswer({ ...found, rule }, now);
}

export interface NewRepeatingTask {
  product?: string;
  title?: unknown;
  instruction?: unknown;
  every?: string;
  at?: string;
  on?: string;
  startNow?: boolean;
  askedBecause?: unknown;
}

// Every run of a rule is written as the person's own request and starts by
// itself, so a worker makes one only on the person's word: their own thread,
// and their words there asking for something regular.
const REGULAR = /\b(every|each|daily|nightly|weekly|weekdays?|hourly|regular(ly)?|recurring|repeat(ing|ed)?|schedule[ds]?|mornings?|evenings?|nights?|(sun|mon|tues|wednes|thurs|fri|satur)days?|\d{1,2}(:\d\d)?\s?(am|pm)|\d{1,2}:\d\d)\b/i;
const NOT_ASKED = 'No repeating task was made: every run would start on its own as the person\'s request, so it needs their own words on this thread asking for something regular, quoted exactly in askedBecause. If they asked for it, send it again with askedBecause set to their words; if not, ask them.';

function personAskedForIt(thread: WorkItem | null, words: unknown): boolean {
  return !!thread && herRow(thread) && filedByThePerson(thread) && REGULAR.test(String(words ?? '')) && saidToClose(thread, words);
}

export interface StopRepeatingTask {
  which?: unknown;
  product?: string;
  askedBecause?: unknown;
}

export interface StoppedRepeatingTask {
  repeat: string;
  product: string;
  label: string;
  schedule: string;
  ended: true;
  endedAt: number;
}

const STOP = /\b(stop|stopped|end|cancel|switch(ed)?\s+(it\s+|that\s+|this\s+)?off|turn(ed)?\s+(it\s+|that\s+|this\s+)?off|pause|kill|remove|delete|no longer|(do not|don'?t) need)\b/i;
const NOT_ASKED_TO_STOP = 'Nothing was stopped: it needs the person\'s own words on this thread asking for it to stop, quoted exactly in askedBecause. If they asked, send it again with their words; if not, ask them.';

// Only what the person wrote themselves: a teammate's or the app's words on
// the row are not their say-so.
function theirWords(thread: WorkItem): string[] {
  return (['body', 'title', 'answer'] as const)
    .filter((f) => thread.wrote?.[f]?.source === 'founder')
    .map((f) => String(thread[f] ?? ''));
}

function personAskedToStop(thread: WorkItem | null, words: unknown): boolean {
  if (!thread || !(thread.labels ?? []).includes('founder') || !filedByThePerson(thread)) return false;
  if (!STOP.test(String(words ?? ''))) return false;
  const own = theirWords(thread);
  return own.length > 0 && saidToClose({ title: '', body: '', answer: own.join('\n') }, words);
}

/**
 * End a repeating task the person asked to stop, found by its id or its name.
 * The person rarely knows which product a task lives in, so a name not found
 * in this thread's product is looked for in every one.
 */
export function stopRepeatingTask(ask: StopRepeatingTask, { env = process.env, now = Date.now() }: RunOptions = {}): StoppedRepeatingTask {
  const which = typeof ask.which === 'string' ? ask.which.trim() : '';
  if (!which) throw new Error('which repeating task? pass its name as it is listed, or its id');

  const itemId = String(env.ZERO_ITEM ?? '').trim();
  const threadHome = itemId ? projectOf(itemId, String(env.ZERO_PRODUCT ?? '').trim() || null) : null;
  const thread = threadHome ? readWorkItem(threadHome.dir, itemId, now) : null;
  if (itemId && !personAskedToStop(thread, ask.askedBecause)) throw new Error(NOT_ASKED_TO_STOP);

  const named = (r: RepeatRule) => r.id === which || r.title.trim().toLowerCase() === which.toLowerCase();
  const inProject = (p: ProjectSummary) => rules.list(p.dir, now).filter(named).map((rule) => ({ project: p, rule }));
  const first = ask.product?.trim() ? resolveProduct(ask.product) : threadHome;
  let found = first ? inProject(first) : [];
  if (!ask.product?.trim() && !found.some((f) => !f.rule.endedAt)) {
    found = listProjects().flatMap(inProject);
  }

  const live = found.filter((f) => !f.rule.endedAt);
  if (live.length > 1) {
    throw new Error(`more than one repeating task is called "${which}": ${live.map((f) => `${f.rule.id} in ${f.project.name}`).join(', ')}. Pass the id of the one to stop.`);
  }
  const hit = live[0] ?? found[0];
  if (!hit) {
    const names = (first ? [first] : listProjects()).flatMap((p) => rules.list(p.dir, now).filter((r) => !r.endedAt).map((r) => `"${r.title}" (${r.id})`));
    throw new Error(`no repeating task is called "${which}". Running now: ${names.join(', ') || 'none'}.`);
  }

  const rule = hit.rule.endedAt ? hit.rule : rules.endRule(hit.project.dir, hit.rule.id, now)!;
  return { repeat: rule.id, product: hit.project.id, label: rule.title, schedule: ruleLabel(rule), ended: true, endedAt: rule.endedAt! };
}

export interface MadeRepeatingTask {
  repeat: string;
  product: string;
  label: string;
  instruction: string | undefined;
  schedule: string;
  nextRun: number | null;
  startsNow: boolean;
  engine: string | null;
  model: string | null;
}

/**
 * A new repeating task, as the person's own When menu makes one. It runs on
 * the coding agent and model of the thread that asked for it: those were
 * checked against what this machine offers when the thread was written, and
 * this server cannot ask that question itself.
 */
export function createRepeatingTask(ask: NewRepeatingTask, { env = process.env, now = Date.now() }: RunOptions = {}): MadeRepeatingTask {
  const title = typeof ask.title === 'string' ? ask.title.trim() : '';
  const words = typeof ask.instruction === 'string' ? ask.instruction.trim() : '';
  if (!words) throw new Error('a repeating task needs an instruction: the words every run is briefed with');
  if (!title) throw new Error('a repeating task needs a short title, the name it is listed under');

  const itemId = String(env.ZERO_ITEM ?? '').trim();
  const threadHome = itemId ? projectOf(itemId, String(env.ZERO_PRODUCT ?? '').trim() || null) : null;
  const thread = threadHome ? readWorkItem(threadHome.dir, itemId, now) : null;
  if (itemId && !personAskedForIt(thread, ask.askedBecause)) throw new Error(NOT_ASKED);
  const project = ask.product?.trim() ? resolveProduct(ask.product) : threadHome;
  if (!project) throw new Error('which product? pass product, since this session is not on a thread');

  const on =ask.on === undefined ? undefined : DAY_NAMES.findIndex((d) => d.toLowerCase() === String(ask.on).trim().toLowerCase());
  const schedule = { every: ask.every, at: ask.at, ...(ask.every === 'week' ? { on: on === -1 ? undefined : on } : {}) };
  const startsNow = ask.startNow !== false;

  // A retried call must not make a second task that runs alongside the first.
  const same = rules.list(project.dir, now).find((r) => !r.endedAt && r.title === title
    && standingInstruction(r) === words && sameRule(r, schedule as RepeatShape));
  const rule = same ?? rules.setRule(project.dir, {
    title, body: words, ...schedule,
    engine: thread?.engine ?? null, model: thread?.model ?? null,
    startsNext: !startsNow,
  }, now)!;

  return {
    repeat: rule.id,
    product: project.id,
    label: rule.title,
    instruction: standingInstruction(rule),
    schedule: ruleLabel(rule),
    nextRun: nextRunAt(rule, now),
    startsNow: !same && startsNow,
    engine: rule.engine ?? null,
    model: rule.model ?? null,
  };
}
