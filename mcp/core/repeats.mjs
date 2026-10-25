// The standing instruction behind a repeating task, for the agent on one of its
// runs.
//
// WHICH RUN THE SESSION IS ON COMES FROM THE APP, NOT FROM THE MODEL.
// `ZERO_ITEM` and `ZERO_PRODUCT` are written into a worker's environment when
// the app spawns it (main/supervisor.mjs), which is why no argument below names
// the task: a session reaches the rule it is standing on or no rule at all.
//
// AND ONLY THE WORDS, THOUGH `patchRule` TAKES ANYTHING. The app gates `engine`
// and `model` at the door (`engineOffered`, `modelOffered` in main/ipc.mjs) so a
// rule cannot be marked for a coding agent the machine never offered; this
// server cannot ask that question, so it does not accept the answer. The hour
// and the day stay on the person's own screen.

import { Repeats } from '../../main/repeats.mjs';
import { readWorkItem } from '../../main/store/work-items.mjs';
import { listProjects } from '../../main/store/project.mjs';
import { nextRunAt, ruleIdOf, ruleLabel, standingInstruction } from '../../shared/repeats.mjs';
import { resolveProduct } from './account.mjs';

const NO_THREAD = 'this session is not on a thread, so there is no repeating task behind it';

// Read and patch only, so the store modules `serve` needs are never built here:
// nothing below creates a work item or takes the project lock.
const rules = new Repeats(null);

function projectOf(itemId, product) {
  if (product) return resolveProduct(product);
  for (const p of listProjects()) {
    try { if (readWorkItem(p.dir, itemId)) return p; } catch { /* a product with no ledger */ }
  }
  throw new Error(`no thread ${itemId} in any product`);
}

/** The rule this session's run belongs to, or a sentence saying why there is none. */
function ruleBehindThisRun({ env = process.env, now = Date.now() } = {}) {
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

function asAnswer({ project, item, ruleId, rule }, now) {
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
export function readStandingInstruction({ env = process.env, now = Date.now() } = {}) {
  return asAnswer(ruleBehindThisRun({ env, now }), now);
}

/**
 * Change it. The whole instruction, replaced, because that is the operation the
 * person's own screen performs and the only one that can also take a sentence
 * back out.
 */
export function setStandingInstruction({ instruction }, { env = process.env, now = Date.now() } = {}) {
  const words = typeof instruction === 'string' ? instruction.trim() : '';
  if (!words) throw new Error('a repeating task needs an instruction; send the whole of it, not an empty one');

  const found = ruleBehindThisRun({ env, now });
  if (found.rule.endedAt) throw new Error(`the repeating task ${found.ruleId} was ended, so it has no next run to change`);

  // Only the body. The title is a label the app derived from what the person
  // typed, and a line added to a standing instruction is not a new name for the
  // task.
  const rule = rules.patchRule(found.project.dir, found.ruleId, { body: words }, now);
  return asAnswer({ ...found, rule }, now);
}
