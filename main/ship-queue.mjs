// THE APP SHIPS A TASK; THE AGENT ONLY SAYS IT IS READY (2026-10-02).
//
// Agents used to finish by pushing to main and updating the folder the app
// runs from. Over thirty hours on one Mac, 17 tasks stalled because Claude
// Code's auto-mode safety check refused one of those steps (a push to a public
// repo, a fast-forward of another checkout, a rebase), 16 because a folder was
// left mid-merge or committed into, 6 racing each other's pushes. A refusal is
// final and asks nobody, so nothing reached the approvals corner; the task
// just said "the permission check refused it" and waited.
//
// So for a project that turns this on, the agent stops at a branch: it commits
// in its task folder, adds the label `ship` to its row, and ends its turn.
// This queue then runs the project's own ship script, one task at a time
// across the whole Mac, so two tasks never race. A failure goes back to the
// agent that wrote the change, as a reply, with the script's own words.
//
// OFF UNLESS A PERSON TURNS IT ON. The setting lives in the app's own data
// folder (`ship.json`), never in the store or the repo: agents can write
// project files, and a ship command they could rewrite would be a command the
// app runs for them outside every check. The script it names is run FROM THE
// BASE CHECKOUT, which only ever fast-forwards to the remote, so a branch
// cannot change the code that ships it. With no `ship.json`, nothing here does
// anything at all.

import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Name } from '../shared/product-name.mjs';
import { SHIP_FAILED } from '../shared/not-shipped.mjs';
import { conflictBrief, earlyConflictNote } from './ship-conflict-brief.mjs';
import { redOnMain } from './main-went-red.mjs';

export const SHIP_LABEL = 'ship';
const SHIP_MS = 20 * 60 * 1000;
const KEEP = 4000;

export const shipSettingsFile = (userDir) => path.join(userDir, 'ship.json');

// WHICH "READY" EACH TASK HAS ALREADY BEEN SHIPPED FOR, by the moment its
// label was written. Taking the label off is not enough: a label the person
// put on outranks the app on the ledger, so the app's removal is ignored, and
// on the first real run that shipped a task and then ran it twice more
// (2026-10-02). A new label carries a new moment and ships again.
const handledFile = (userDir) => path.join(userDir, 'ship-handled.json');
const keyOf = (item) => `${item.product}/${item.id}`;
const markedAt = (item) => item.wrote?.labels?.ts ?? item.updatedAt ?? 0;
function readHandled(userDir) {
  try { const raw = JSON.parse(fs.readFileSync(handledFile(userDir), 'utf8')); return raw && typeof raw === 'object' ? raw : {}; } catch { return {}; }
}
function writeHandled(userDir, all) {
  try {
    const tmp = `${handledFile(userDir)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(all)}\n`);
    fs.renameSync(tmp, handledFile(userDir));
  } catch { /* the label removal still covers the ordinary case */ }
}

/** `{ [projectSlug]: { script: 'scripts/ship.mjs' } }`, or `{}`. */
export function readShipSettings(userDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(shipSettingsFile(userDir), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** The script that ships this project, inside its base checkout, or null. */
export function shipScriptFor(product, settings) {
  const rel = settings?.[product?.slug]?.script;
  if (!product?.repoPath || typeof rel !== 'string' || !rel || path.isAbsolute(rel)) return null;
  const base = path.resolve(product.repoPath);
  const script = path.resolve(base, rel);
  if (!script.startsWith(base + path.sep)) return null;
  return fs.existsSync(script) ? script : null;
}

const labelsOf = (item) => (Array.isArray(item?.labels) ? item.labels : []);
export const wantsShipping = (item) => labelsOf(item).includes(SHIP_LABEL);
export const withoutShipLabel = (item) => labelsOf(item).filter((l) => l !== SHIP_LABEL);

/**
 * Every task this queue still owes a ship, whether or not a session is on it.
 *
 * A row of a project that ships, marked `ship`, not yet handled for that
 * marking, and with a task folder to ship from. THE WINDOW READS THIS TOO
 * (w-0c1ba766eb): a row on this list is waiting on the app, not on a person,
 * so it is In progress and not Needs you until the queue has dealt with it.
 *
 * A CLOSED ROW STILL SHIPS, because a close is not a cancel. The window
 * leaves closed rows out (`waitingIds`), so one stays in Done while it ships.
 */
export const owedAShip = (item, handled = {}) => wantsShipping(item) && !(markedAt(item) <= (handled[keyOf(item)] ?? -1));

export function waitingToShip(items, products, settings, { folderFor, handled = {} }) {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return items
    .filter((i) => owedAShip(i, handled))
    .map((item) => {
      const product = bySlug.get(item.product);
      const script = product ? shipScriptFor(product, settings) : null;
      const cwd = script ? folderFor(item, product) : null;
      return script && cwd && fs.existsSync(cwd) ? { item, product, script, cwd } : null;
    })
    .filter(Boolean);
}

/**
 * The next task to ship, the most important first, or null.
 *
 * A session the row's own agent is still finishing holds its ship: its commits
 * may not all be in. A session that started AFTER the label does not, because
 * that is a reply, and a reply to a thread already waiting used to hold it for
 * as long as the new session ran (2026-10-19). `liveSince` answering null
 * means nobody can say when the live work started — a cloud run whose folder
 * has not come home — and that waits, as it always did.
 *
 * Priority before age, the way `shared/work-items.mjs` orders the queue a
 * puller sees: a thread the person is waiting on queued behind every older one.
 */
export function nextToShip(items, products, settings, {
  isLive = () => false, liveSince = () => null, folderFor, handled = {},
}) {
  const ready = waitingToShip(items, products, settings, { folderFor, handled })
    .filter(({ item }) => !isLive(item) || liveSince(item) > markedAt(item));
  ready.sort((a, b) => (b.item.priority ?? 0) - (a.item.priority ?? 0) || markedAt(a.item) - markedAt(b.item));
  return ready[0] ?? null;
}

/** The commit the script reports, from its own `ship: shipped <sha>.` line. */
export function shippedSha(output) {
  return String(output ?? '').match(/ship: shipped ([0-9a-f]{7,40})\./)?.[1] ?? null;
}

// A LINE VITEST TICKED GREEN IS NEVER WHY A SHIP FAILED (w-c121bd85e6).
//
// Test files here are named after the behaviour they cover, so plenty of them
// carry "failed", "error" or "refused" inside the name, with a hyphen either
// side. A hyphen is a word boundary, so even the whole-word guard below
// matches inside "a-failed-hook-is-visible-while-the-agent-continues". On
// 2026-10-04 a ship that DIED was reported as that file, which had passed in
// 51 milliseconds. Vitest ticks every file it ran green, so the tick is the
// one reliable way to rule a line out.
const TICKED_GREEN = /^[✓✔]/;
// WHOLE WORDS (w-7ec8553e23): without \b, "red" matched inside "configured"
// and a harmless warning the tests print was shown as why a ship failed.
const NAMES_A_FAILURE = /\b(CONFLICT|error|red|refused|failed|FAIL)\b/i;
// Vitest's heading over the list of failures, "⎯⎯⎯ Failed Tests 3 ⎯⎯⎯". It
// carries the count and names nothing, and the FAIL lines that DO name
// something are printed directly under it, so taking the first match showed
// the heading and sent whoever read it to the GitHub run to find out which
// three (w-c121bd85e6, this branch's own first ship). Passed over while there
// is anything better, and still offered when it is all there is.
const ONLY_A_COUNT = /^⎯+ .* ⎯+$/;
// A LINE VITEST QUOTED IS NOT THE SCRIPT SPEAKING (w-560647d4db, five
// bounces). A failing text assertion prints the file's own text as a diff, so
// any source line carrying one of those words becomes a candidate — and the
// diff is printed long before the runner's list of failures. Twice the note
// read "+               than deleted: a bare corner here reads as a control
// that failed", which is a pre-existing code comment in a file the branch
// touched. It names no fault, and the real cause was three failing tests the
// note never mentioned. Both shapes of quotation are skipped: a diff line
// (`+`/`-`) and a code frame (`34|   expect(...)`).
const QUOTED_SOURCE = /^([+-]|\d+\|)/;
// THE RUNNER'S OWN FAILURES OUTRANK A LOOSE WORD MATCH. These two name a
// file: `FAIL  tests/x.test.mjs > ...` and `❯ tests/x.test.mjs (3 tests | 3
// failed)`. Anything else matching the words above — the script's closing
// line, a merge message, a warning — says less, wherever it sits in the
// output.
const NAMES_A_RED_TEST = /^(FAIL\b|❯ .*\|\s*\d+ failed)/;
// Vitest's totals, "Tests  3 failed | 1920 passed (1923)", and its heading
// "⎯⎯⎯ Failed Tests 3 ⎯⎯⎯". Not "Test Files  1 failed", which counts files.
const HOW_MANY = [/^Tests\s+(\d+) failed/, /Failed Tests\s+(\d+)/];

const DIED = 'the test run died without naming a failing test';

/**
 * Why the branch did not ship, out of the script's own output.
 *
 * A run that went RED says so somewhere. A run that DIED — killed on a busy
 * Mac, or cut off — leaves output with no failure in it at all, and the two
 * have to be told apart: offering the nearest line instead sends whoever
 * reads it after a fault that is not there.
 *
 * @returns {{ died: boolean, why: string|null, last: string|null, failed: number|null }}
 */
export function whyItDidNotShip(output) {
  const lines = String(output ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const said = lines.filter((l) => !TICKED_GREEN.test(l) && !QUOTED_SOURCE.test(l));
  const named = said.filter((l) => NAMES_A_FAILURE.test(l));
  const red = named.find((l) => NAMES_A_RED_TEST.test(l));
  const why = red ?? named.find((l) => !ONLY_A_COUNT.test(l)) ?? named[0] ?? null;
  // The count goes with a line that names ONE test, so that it reads as the
  // first of several rather than as the whole story. On a line that is not a
  // test — a conflict, a refused push — a number beside it would read as that
  // line's own count, so it is left off.
  const counted = red ? Number(said.map((l) => HOW_MANY.map((re) => re.exec(l)?.[1]).find(Boolean)).find(Boolean)) : NaN;
  return { died: !why, why, last: said.at(-1) ?? null, failed: Number.isFinite(counted) ? counted : null };
}

/** "3 tests failed, the first is FAIL tests/…", or just the line. */
function diagnosis({ why, failed }) {
  if (!why || !failed) return why;
  return `${failed} test${failed === 1 ? '' : 's'} failed, the first is ${why}`;
}

/** What the agent is told when its branch did not ship. */
export function failureReply(output, { brief = null } = {}) {
  const tail = String(output ?? '').trim().slice(-KEEP);
  const { died, ...rest } = whyItDidNotShip(output);
  return [
    `${Name} tried to ship your branch and it did not go out. Nothing was pushed.`,
    // THE SAME DIAGNOSIS THE THREAD SHOWS, above the tail (w-560647d4db). The
    // tail holds everything, which is why two sessions read a quoted code
    // comment in it as the fault. One line naming how many tests failed and
    // which file is where to start.
    ...(died ? [] : ['', `It went red: ${diagnosis(rest)}`]),
    ...(died ? [
      '',
      'Its test run DIED rather than going red: nothing it printed names a failing',
      'test. Look for what killed the run. This computer runs a dozen agents at once, so',
      'a worker that was starved or timed out is likelier than a bug in your change.',
      'Run the tests for your change again before you go looking for one.',
    ] : []),
    ...(brief ? ['', brief] : []),
    '',
    'Fix what the script says below in your task folder, commit, then add the label',
    `\`${SHIP_LABEL}\` to this row again and end your turn. Do not push or touch any`,
    'other folder yourself; the app ships it.',
    '',
    '```',
    tail,
    '```',
  ].join('\n');
}

/** The line the thread shows: the app's own, short, and the first error in it. */
export function failureNote(output) {
  const { died, last, ...rest } = whyItDidNotShip(output);
  const said = died ? `${DIED}. It last said: ${last ?? 'nothing at all'}` : diagnosis(rest);
  return `${SHIP_FAILED}${said.slice(0, 300)}`;
}

/**
 * The base checkout's hooks, read off the task folder's shared git dir. The
 * ship runs with cwd = the task folder, whose core.hooksPath may be the
 * relative 'scripts/hooks' resolving to the branch's own, worker-edited copy.
 * Pinning the base copy here is what keeps the gate the branch cannot change.
 */
function baseHooksPath(cwd) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', timeout: 10_000 }, (err, stdout) => {
      const common = err ? '' : String(stdout).trim();
      resolve(common ? path.resolve(common, '..', 'scripts', 'hooks') : null);
    });
  });
}

export async function runScript(script, cwd, { timeout = SHIP_MS, env = process.env } = {}) {
  const node = env.npm_node_execpath && fs.existsSync(env.npm_node_execpath) ? env.npm_node_execpath : 'node';
  const hooks = await baseHooksPath(cwd);
  const baseGate = hooks
    ? { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooks }
    : {};
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(node, [script], { cwd, env: { ...env, GIT_TERMINAL_PROMPT: '0', ...baseGate }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: 1, out: String(e?.message ?? e) });
      return;
    }
    const keep = (b) => { out = (out + b).slice(-64 * 1024); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { keep('\nship: stopped after 20 minutes.'); child.kill('SIGTERM'); }, timeout);
    child.on('error', (e) => keep(`\n${e.message}`));
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out }); });
  });
}

/**
 * One task at a time, for the whole Mac. `tick` is called from the
 * supervisor's own tick and returns at once; the run happens beside it.
 */
export class ShipQueue {
  constructor({ store, userDir, folderFor, isLive, liveSince = () => null, handBack = () => {}, run = runScript, afterShip = () => {}, log = console }) {
    Object.assign(this, { store, userDir, folderFor, isLive, liveSince, handBack, run, afterShip, log });
    this.busy = null;
    this.earlyConflicts = new Map();
  }

  tick(items, products) {
    if (this.busy) return null;
    const settings = readShipSettings(this.userDir);
    if (!Object.keys(settings).length) return null;
    const next = nextToShip(items, products, settings, {
      isLive: this.isLive, liveSince: this.liveSince, folderFor: this.folderFor, handled: readHandled(this.userDir),
    });
    if (!next) return null;
    // Marked handled only once the run has ENDED, pass or fail. Marked before
    // it, a run cut off by an app restart was never tried again
    // (w-f37a34def6, 2026-10-04). Within one app, `busy` already stops a
    // second start; across a restart, trying again is the point.
    const done = () => writeHandled(this.userDir, { ...readHandled(this.userDir), [keyOf(next.item)]: markedAt(next.item) });
    this.busy = this.ship(next, products, items).then(done, done).finally(() => { this.busy = null; });
    return this.busy;
  }

  /** The ids of the rows still waiting on this queue, for the window. */
  waitingIds(items, products) {
    const settings = readShipSettings(this.userDir);
    if (!Object.keys(settings).length) return [];
    return waitingToShip(items, products, settings, { folderFor: this.folderFor, handled: readHandled(this.userDir) })
      .filter(({ item }) => item.status !== 'done')
      .map(({ item }) => item.id);
  }

  /** Whether this row's folder must stay for a ship still to come. */
  owes(item, products) {
    const settings = readShipSettings(this.userDir);
    if (!Object.keys(settings).length) return false;
    return waitingToShip([item], products, settings, { folderFor: this.folderFor, handled: readHandled(this.userDir) }).length > 0;
  }

  // A thread id from a merge on main, read from this project or another one on
  // the same checkout.
  _readThread(id, product, products) {
    const slugs = [product.slug, ...(products ?? []).filter((p) => p.slug !== product.slug && p.repoPath && p.repoPath === product.repoPath).map((p) => p.slug)];
    for (const slug of slugs) {
      const found = this.store.readItem?.(slug, id);
      if (found) return found;
    }
    return null;
  }

  // After a ship lands, every other open branch of a project that ships is
  // checked against the new main with `git merge-tree`, which reads commits and
  // touches no task folder. A conflict waits here for that thread's next run.
  async _findNewConflicts(shipped, items, products) {
    const settings = readShipSettings(this.userDir);
    const bySlug = new Map((products ?? []).map((p) => [p.slug, p]));
    for (const other of items ?? []) {
      const product = bySlug.get(other.product);
      if (other.id === shipped.id || other.status === 'done' || !product || !settings[product.slug]) continue;
      const cwd = this.folderFor(other, product);
      if (!cwd || !fs.existsSync(cwd)) continue;
      try {
        const note = await earlyConflictNote({ cwd, readThread: (id) => this._readThread(id, product, products) });
        if (note) this.earlyConflicts.set(keyOf(other), note); else this.earlyConflicts.delete(keyOf(other));
      } catch (e) { this.log.warn?.(`zero: could not check ${other.id} against main:`, e.message); }
    }
  }

  /** What main's last ship means for this thread's branch, once, or null. */
  takeEarlyConflict(item) {
    const note = this.earlyConflicts.get(keyOf(item)) ?? null;
    this.earlyConflicts.delete(keyOf(item));
    return note;
  }

  async ship({ item, product, script, cwd }, products = [], items = []) {
    this.log.info?.(`zero: shipping ${item.id} from ${cwd}`);
    // The push hook leaves tests already red on main out of its refusal.
    const red = redOnMain(this.userDir);
    const { code, out } = await this.run(script, cwd, red.length ? { env: { ...process.env, AGENTBOX_RED_ON_MAIN: red.join('\n') } } : undefined);
    try {
      // Already on main: there is nothing to fix, so nobody is woken.
      const already = /There is nothing to ship/.test(out);
      if (code === 0 || already) {
        const sha = shippedSha(out);
        this.store.shipped(product.slug, item.id, { sha, labels: withoutShipLabel(item) });
        // THE COMMIT TRAVELS WITH THE NEWS. What follows a ship wants to know
        // which commit went out: main/main-went-red.mjs waits for that
        // commit's test run on GitHub, because nothing else is still running
        // five minutes after the agent ended.
        this.afterShip({ item, product, sha });
        await this._findNewConflicts(item, items, products);
      } else {
        this.store.shipFailed(product.slug, item.id, { note: failureNote(out), labels: withoutShipLabel(item) });
        let brief = null;
        try {
          brief = await conflictBrief({ cwd, output: out, readThread: (id) => this._readThread(id, product, products) });
        } catch (e) { this.log.warn?.(`zero: could not brief the conflict on ${item.id}:`, e.message); }
        // Straight back to the session that wrote the change. Not through the
        // reply on the row: that field is hers, and the app's words written
        // there would be drawn as hers and could not replace hers anyway.
        this.handBack(item, failureReply(out, { brief }));
      }
    } catch (e) {
      this.log.warn?.(`zero: could not record the ship of ${item.id}:`, e.message);
    }
    return { code };
  }
}
