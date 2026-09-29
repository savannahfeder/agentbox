// The rule store: the only writer of <product>/repeats.jsonl.
//
// A repeating task is a RULE, never a work item, so it never runs, is never
// claimed, and cannot be finished by a worker. Its runs are ordinary work items
// and go through the store's modules like everything else.
//
// The file is append-only and folded newest-wins, the same shape as
// dashboard.jsonl, and it is read WHOLE. That is the point rather than a
// detail: the work-item ledger is read from a trailing 8 MiB window, and the
// fold applies only the fields present in surviving lines, so a long-lived
// template kept there would eventually lose the rule itself and stop repeating
// with no symptom at all.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DAY_NAMES, foldRepeats, isOwed, isRepeatRule, occurrenceId, periodKey, repeatLabel,
} from '../shared/repeats.mjs';
import { machineryPath } from './store/home.mjs';
import { NAME } from '../shared/product-name.mjs';

const FILE = 'repeats.jsonl';

// What a refused rule is called when we say we cannot keep it. A weekly rule
// whose day is missing used to print "every week at 08:00", which names the one
// part that was fine and hides the part that was not.
function describeRule({ every, at, on }) {
  if (every === 'week') {
    const day = DAY_NAMES[on] ?? 'no day';
    return `every week on ${day} at ${at}`;
  }
  return `every ${every} at ${at}`;
}

// How many periods in a row may be superseded before the founder is told.
const MISSES_BEFORE_ALERT = 3;

// The protocol goes FIRST in an occurrence's body, ahead of the user's instruction. An
// over-long body keeps its prefix and cuts its suffix, so a protocol written
// last can be truncated away entirely, and a worker that never saw it cannot
// know that a quiet finish has to be marked.
export const OCCURRENCE_PROTOCOL = [
  'THIS IS ONE RUN OF A REPEATING TASK. It runs again tomorrow whatever happens',
  'here, so this run does not have to carry the future.',
  '',
  'FINISH ONE OF TWO WAYS.',
  '',
  'Nothing she needs to know: update this item with status done AND labels',
  '["founder", "<REPEAT_LABEL>", "clean"] IN THE SAME CALL. Labels REPLACE the',
  'array rather than merging, so send all three. The clean label is what keeps a',
  'quiet run out of her inbox, and no result is needed: that is what clean means.',
  '',
  'Anything she needs to know: finish normally, with a result saying what you',
  'found, and do NOT set the clean label. It reaches her inbox, which is the',
  'point of running this every day. Anything that deserves its own life gets',
  'filed as its own item.',
  '',
  'If you are unsure which of the two this is, it is the second one. This is the',
  `only place in ${NAME} where finishing quietly hides something, so the marker is`,
  'required to hide, never to show.',
  '',
  'HER INSTRUCTION FOLLOWS.',
].join('\n');

export class Repeats {
  constructor(storeModules) {
    this.modules = storeModules;
  }

  // In the app's home, not the product folder: a repeat rule is our record of
  // what to run, not one of her documents (main/store/home.mjs).
  filePath(productDir) {
    return machineryPath(productDir, FILE);
  }

  _read(productDir) {
    let raw = '';
    try {
      raw = fs.readFileSync(this.filePath(productDir), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    return raw.split('\n').filter(Boolean).map((line) => {
      // A torn line is skipped rather than thrown on, the way every other fold
      // in this store treats one.
      try { return JSON.parse(line); } catch { return null; }
    });
  }

  _append(productDir, id, patch, now = Date.now()) {
    fs.appendFileSync(this.filePath(productDir), `${JSON.stringify({ id, ts: now, patch })}\n`);
  }

  list(productDir, now = Date.now()) {
    return [...foldRepeats(this._read(productDir), now).values()];
  }

  get(productDir, id, now = Date.now()) {
    return foldRepeats(this._read(productDir), now).get(id) ?? null;
  }

  // `engine` AND `model` ARE HER PICK ON THE RULE, and the runs carry them
  // (`serve` below). They are optional and absent by default, which is every
  // rule on her disk: a rule that names neither behaves exactly as it did, and
  // its runs go to the workspace default like any unmarked row. Whether either
  // word may be written at all is decided at the door, by
  // `Supervisor#engineOffered` and `#modelOffered`, so a rule cannot be marked
  // for an engine this Mac never offered her.
  setRule(productDir, {
    title, body, priority = 5, every = 'day', at, on, engine, model,
  }, now = Date.now()) {
    // Refused here rather than stored and ignored later: a rule that cannot be
    // kept has to fail while the user is still looking at what they typed.
    //
    // `on` is validated AND stored. It was in neither, so a weekly rule was
    // checked without the day that makes it weekly, and no weekly rule ever
    // survived this line. The refusal says which day is missing now,
    // because "every week at 08:00" reads like a bug in the clock.
    if (!title || !String(title).trim()) throw new Error('a repeating task needs a title');
    if (!isRepeatRule({ every, at, on })) throw new Error(`not a schedule ${NAME} can keep: ${describeRule({ every, at, on })}`);
    const id = `r-${crypto.randomBytes(5).toString('hex')}`;
    this._append(productDir, id, {
      title: String(title).trim(), body, priority, every, at,
      ...(every === 'week' ? { on } : {}),
      ...(engine ? { engine: String(engine) } : {}),
      ...(model ? { model: String(model) } : {}),
      createdAt: now, served: '', misses: 0, alerted: 0,
    }, now);
    return this.get(productDir, id, now);
  }

  patchRule(productDir, id, patch, now = Date.now()) {
    // `on` joins the other two: changing a daily rule to a Thursday one sends
    // every, at AND on, and checking the first two alone refused the change for
    // the same reason a new weekly rule was refused.
    if (('at' in patch || 'every' in patch || 'on' in patch)) {
      const current = this.get(productDir, id, now);
      if (!current) throw new Error(`no such repeating task: ${id}`);
      const next = {
        every: patch.every ?? current.every,
        at: patch.at ?? current.at,
        on: patch.on ?? current.on,
      };
      if (!isRepeatRule(next)) throw new Error(`not a schedule ${NAME} can keep: ${describeRule(next)}`);
    }
    this._append(productDir, id, patch, now);
    return this.get(productDir, id, now);
  }

  // Ending one is a small durable fact rather than an archive, so it does not
  // collide with what `done` means on a work item.
  endRule(productDir, id, now = Date.now()) {
    return this.patchRule(productDir, id, { endedAt: now }, now);
  }

  // The rules whose current period has not been served. Never more than one
  // period per rule: there is no queue of missed firings, only a condition that
  // is currently false, which is why three days away costs one run.
  due(productDir, now = Date.now()) {
    return this.list(productDir, now)
      .filter((rule) => isOwed(rule, now))
      .map((rule) => ({ rule, key: periodKey(rule, now) }));
  }

  /**
   * Serve one period. ONE short locked step of local reads and appends: create
   * the occurrence if its id is absent, supersede an unfinished predecessor,
   * then move the watermark.
   *
   * Nothing slow happens inside the lock. The session is spawned by the caller
   * afterwards, and claimWorkItem is never called here because it takes the
   * same lock and this one is not reentrant.
   *
   * The order is create-then-mark, so a crash between them retries into a
   * create that finds the id present and does nothing, rather than running the
   * work twice.
   */
  async serve(productDir, ruleId, key, now = Date.now()) {
    const { workItemsDisk, lock } = this.modules;
    return lock.withProjectLock(productDir, async () => {
      const rule = this.get(productDir, ruleId, now);
      const nothing = { occurrenceId: null, created: false, superseded: null, misses: rule?.misses ?? 0, alert: null };
      if (!rule || rule.endedAt || !isRepeatRule(rule)) return nothing;

      const id = occurrenceId(ruleId, key);
      let superseded = null;
      let misses = rule.misses ?? 0;

      // The predecessor's state is re-read HERE, inside the lock. A worker
      // finishing between the tick's read and this write is the ordinary case,
      // and superseding a run that has just succeeded reports a failure that
      // never happened.
      //
      // Never the item we are about to create: a rule whose watermark was
      // refused could otherwise be asked to serve the same period twice and
      // supersede its own live run.
      if (rule.lastOccurrence && rule.lastOccurrence !== id) {
        const prev = workItemsDisk.readWorkItem(productDir, rule.lastOccurrence, now);
        if (prev && (prev.status === 'open' || prev.status === 'claimed')) {
          workItemsDisk.updateWorkItem(productDir, prev.id, {
            status: 'done',
            result: 'This run did not finish before the next one was due, so it was superseded.',
          }, { source: 'system', now });
          superseded = prev.id;
          misses += 1;
        } else if (prev && prev.status === 'done') {
          misses = 0;
        }
      }

      const { created } = workItemsDisk.createWorkItemIfAbsent(productDir, id, {
        title: `${rule.title} · ${dayStamp(key)}`,
        body: `${OCCURRENCE_PROTOCOL.replace('<REPEAT_LABEL>', repeatLabel(ruleId))}\n\n${rule.body ?? rule.title}`,
        kind: 'directive',
        priority: rule.priority ?? 5,
        labels: ['founder', repeatLabel(ruleId)],
        // WHICH CODING AGENT AND WHICH MODEL, off the rule, at the moment the
        // run is made. A run is an ordinary work item, so this is the same pair
        // `composeItem` writes for a task she types by hand and it is read by
        // the same `engineFor` -- the occurrence needs no rule-shaped special
        // case anywhere downstream. Absent on a rule that names neither, which
        // is every rule on her disk today.
        ...(rule.engine ? { engine: rule.engine } : {}),
        ...(rule.model ? { model: rule.model } : {}),
      }, { source: 'system', now });

      // Told once per streak, and that is a durable fact rather than an
      // intention: a crash after filing cannot file it twice, and one before it
      // cannot lose it.
      const alertNeeded = misses >= MISSES_BEFORE_ALERT && misses > (rule.alerted ?? 0);
      this._append(productDir, ruleId, {
        served: key,
        lastOccurrence: id,
        misses,
        ...(alertNeeded ? { alerted: misses } : {}),
      }, now);

      return { occurrenceId: id, created, superseded, misses, alert: alertNeeded ? missedKeys(key, misses) : null };
    }, { label: `repeat ${ruleId}` });
  }
}

function dayStamp(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// The period keys the misses covered, oldest first, for the alert's wording.
function missedKeys(currentKey, misses) {
  const [y, m, d] = currentKey.split('-').map(Number);
  const keys = [];
  for (let back = misses; back >= 1; back--) {
    const day = new Date(y, m - 1, d - back);
    const mm = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    keys.push(`${day.getFullYear()}-${mm}-${dd}`);
  }
  return keys;
}
