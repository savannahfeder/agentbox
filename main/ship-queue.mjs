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

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Name } from '../shared/product-name.mjs';

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
 * The next task to ship, oldest ask first, or null.
 *
 * Only a row of a project that ships, marked `ship`, with no session on it
 * (an agent still working may yet commit), and with a task folder to ship from.
 */
export function nextToShip(items, products, settings, { isLive = () => false, folderFor, handled = {} }) {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const ready = items
    .filter((i) => wantsShipping(i) && i.status !== 'done' && !isLive(i) && !(markedAt(i) <= (handled[keyOf(i)] ?? -1)))
    .map((item) => {
      const product = bySlug.get(item.product);
      const script = product ? shipScriptFor(product, settings) : null;
      const cwd = script ? folderFor(item, product) : null;
      return script && cwd && fs.existsSync(cwd) ? { item, product, script, cwd } : null;
    })
    .filter(Boolean);
  ready.sort((a, b) => markedAt(a.item) - markedAt(b.item));
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

const DIED = 'the test run died without naming a failing test';

/**
 * Why the branch did not ship, out of the script's own output.
 *
 * A run that went RED says so somewhere. A run that DIED — killed on a busy
 * Mac, or cut off — leaves output with no failure in it at all, and the two
 * have to be told apart: offering the nearest line instead sends whoever
 * reads it after a fault that is not there.
 *
 * @returns {{ died: boolean, why: string|null, last: string|null }}
 */
export function whyItDidNotShip(output) {
  const lines = String(output ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const said = lines.filter((l) => !TICKED_GREEN.test(l));
  const named = said.filter((l) => NAMES_A_FAILURE.test(l));
  const why = named.find((l) => !ONLY_A_COUNT.test(l)) ?? named[0] ?? null;
  return { died: !why, why, last: said.at(-1) ?? null };
}

/** What the agent is told when its branch did not ship. */
export function failureReply(output) {
  const tail = String(output ?? '').trim().slice(-KEEP);
  const { died } = whyItDidNotShip(output);
  return [
    `${Name} tried to ship your branch and it did not go out. Nothing was pushed.`,
    ...(died ? [
      '',
      'Its test run DIED rather than going red: nothing it printed names a failing',
      'test. Look for what killed the run — this Mac runs a dozen agents at once, so',
      'a worker that was starved or timed out is likelier than a bug in your change.',
      'Run the tests for your change again before you go looking for one.',
    ] : []),
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
  const { died, why, last } = whyItDidNotShip(output);
  const said = died ? `${DIED}. It last said: ${last ?? 'nothing at all'}` : why;
  return `It did not ship, and it went back to its agent: ${said.slice(0, 300)}`;
}

export function runScript(script, cwd, { timeout = SHIP_MS, env = process.env } = {}) {
  const node = env.npm_node_execpath && fs.existsSync(env.npm_node_execpath) ? env.npm_node_execpath : 'node';
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(node, [script], { cwd, env: { ...env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  constructor({ store, userDir, folderFor, isLive, handBack = () => {}, run = runScript, afterShip = () => {}, log = console }) {
    Object.assign(this, { store, userDir, folderFor, isLive, handBack, run, afterShip, log });
    this.busy = null;
  }

  tick(items, products) {
    if (this.busy) return null;
    const settings = readShipSettings(this.userDir);
    if (!Object.keys(settings).length) return null;
    const next = nextToShip(items, products, settings, { isLive: this.isLive, folderFor: this.folderFor, handled: readHandled(this.userDir) });
    if (!next) return null;
    // Marked handled only once the run has ENDED, pass or fail. Marked before
    // it, a run cut off by an app restart was never tried again
    // (w-f37a34def6, 2026-10-04). Within one app, `busy` already stops a
    // second start; across a restart, trying again is the point.
    const done = () => writeHandled(this.userDir, { ...readHandled(this.userDir), [keyOf(next.item)]: markedAt(next.item) });
    this.busy = this.ship(next).then(done, done).finally(() => { this.busy = null; });
    return this.busy;
  }

  async ship({ item, product, script, cwd }) {
    this.log.info?.(`zero: shipping ${item.id} from ${cwd}`);
    const { code, out } = await this.run(script, cwd);
    try {
      // Already on main: there is nothing to fix, so nobody is woken.
      const already = /There is nothing to ship/.test(out);
      if (code === 0 || already) {
        this.store.shipped(product.slug, item.id, { sha: shippedSha(out), labels: withoutShipLabel(item) });
        this.afterShip();
      } else {
        this.store.shipFailed(product.slug, item.id, { note: failureNote(out), labels: withoutShipLabel(item) });
        // Straight back to the session that wrote the change. Not through the
        // reply on the row: that field is hers, and the app's words written
        // there would be drawn as hers and could not replace hers anyway.
        this.handBack(item, failureReply(out));
      }
    } catch (e) {
      this.log.warn?.(`zero: could not record the ship of ${item.id}:`, e.message);
    }
    return { code };
  }
}
