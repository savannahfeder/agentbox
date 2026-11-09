// The standing instruction behind a repeating task, for the agent on one of its
// runs.
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
import { nextRunAt, ruleIdOf, ruleLabel, standingInstruction, type RepeatRule } from '../../shared/repeats.mts';
import type { WorkItem } from '../../shared/work-items.mts';
import { resolveProduct } from './account.mts';

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

// Read and patch only, so the store modules `serve` needs are never built here:
// nothing below creates a work item or takes the project lock.
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
