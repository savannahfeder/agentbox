// A SECOND AGENTBOX WITH SOMEBODY ELSE'S WORK IN IT, FOR DEMOS.
//
// WHY THIS IS THE NEW-USER ROW AND NOT A NEW MECHANISM. Being a new user
// already opens a second Agentbox inside a throwaway home
// (shared/fresh-user-home.mjs, main/fresh-user.mjs), and everything that makes
// that safe is exactly what a demo needs: her own copy keeps running with every
// agent in it, nothing of hers is read, and nothing anywhere is deleted. The
// single-instance lock is keyed on userData and a throwaway home is a different
// userData, so the two stand side by side. That property is the whole thing,
// and inventing a second way to get it would be inventing a second way to get
// it wrong.
//
// WHAT IS DIFFERENT IS WHAT IS IN THE STORE. A new user opens on an empty one,
// which is correct for testing a first run and useless for a demo: an inbox
// with nothing in it demonstrates nothing. So this seeds three invented
// products and a day of invented work first (shared/demo-world.mjs), and
// because the store then has projects in it, the welcome walk does not run
// (`firstRunNeeded` counts projects) and the copy opens straight on the inbox.
//
// AND HER ~/.claude IS NOT LINKED THROUGH, which is the one place this is
// deliberately stricter than the new-user row. That folder holds the Claude
// Code sessions already running on this Mac, and the app puts them in the
// inbox as rows with her real folder names on them. In a demo those names are
// on a projector. Claude Code itself and its login ARE linked, so answering a
// row in the demo starts a real agent on an invented product, which is the
// most convincing thing the demo can do.
//
// NOTHING IS DELETED HERE, EVER, and there is no version of this file that may
// delete anything outside `HOMES` below.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DEMO_DOCS, DEMO_ENV, DEMO_PRODUCTS, demoLedgerLines } from '../shared/demo-world.mjs';
import { prepareHome } from '../shared/fresh-user-home.mjs';
import { Name } from '../shared/product-name.mjs';
import { relaunchCommand } from './fresh-user.mjs';
import { encodeProjectPath, storeRootEnv } from './store/home.mjs';
import { NAME, nameSlug } from '../shared/product-name.mjs';

/**
 * Where every demo home lives. Its own folder, NOT the first-run one: the two
 *  are cleared separately, and a demo home under the first-run folder would
 *  read as a fresh-user install to `runningAsAFreshUser` and send its counts
 *  under the wrong fixed id. */
export const HOMES = path.join(os.tmpdir(), `${nameSlug}-demo`);

/**
 * The account the demo store is laid out under. It matches the id
 *  `main/config.mjs` defaults to, because the demo copy has no config file and
 *  will therefore look for its products at exactly this path. */
export const DEMO_ACCOUNT = '00000000-0000-4000-8000-000000000000';

/**
 * Named by the clock, like a fresh-user home, so the newest sorts last and two
 *  demos opened a minute apart are told apart on disk. */
export function makeDemoHome(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const home = path.join(HOMES, stamp);
  fs.mkdirSync(home, { recursive: true });
  return home;
}

/** The demo homes on disk, oldest first. */
export function demoHomes() {
  if (!fs.existsSync(HOMES)) return [];
  return fs
    .readdirSync(HOMES)
    .map((name) => path.join(HOMES, name))
    .filter((dir) => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } })
    .sort();
}

/**
 * Delete every demo home. Only ever this /tmp folder: `HOMES` is not
 *  configurable, and that is on purpose. */
export function clearDemoHomes() {
  try {
    fs.rmSync(HOMES, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Where the demo copy will keep its store, and where it will keep its own
 *  records. Both are derived from the throwaway home rather than configured,
 *  because the copy derives them the same way from the same home: `storeRoot`
 *  defaults to `<home>/<Name>` (main/config.mjs) and the app's home defaults
 *  to `<home>/.agentbox` (main/store/home.mjs).
 *
 *  THE FOLDER IS READ FROM THE SAME CONSTANT AS THAT DEFAULT, not spelled out
 *  again. It was the literal 'the app' mirroring what config.mjs then said,
 *  and when that default was renamed on 2026-09-22 this line went on pointing
 *  at the old folder: the demo copy would have written its store to one place
 *  and looked for it in another. Two literals that have to agree is the defect;
 *  one import is the fix. */
export function demoPaths(home) {
  const storeRoot = path.join(home, Name);
  return {
    storeRoot,
    accountRoot: path.join(storeRoot, 'accounts', DEMO_ACCOUNT),
    appHome: path.join(home, `.${nameSlug}`),
  };
}

/**
 * The invented studio, written out as a real store.
 *
 * THE LEDGER DOES NOT GO IN THE PRODUCT FOLDER, and this is the one thing in
 * here that is easy to get wrong: since 2026-08-27 the app keeps its own
 * records under its own home, `<appHome>/projects/<encoded product dir>/`
 * (main/store/home.mjs). Writing `work-items.jsonl` beside `project.json`
 * instead would produce a demo whose inbox is empty, and the file would then be
 * silently folded away the first time anything touched the store. The encoding
 * is imported rather than repeated for exactly that reason.
 *
 * `.origin` is written alongside, because that is what the app writes on first
 * use and what `removeMachinery` refuses to act without.
 */
export function seedDemoStore(home, { now = Date.now() } = {}) {
  const { accountRoot, appHome } = demoPaths(home);
  const ledgers = demoLedgerLines(now);
  const written = [];

  for (const product of DEMO_PRODUCTS) {
    const dir = path.join(accountRoot, product.slug);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'project.json'), `${JSON.stringify({
      schemaVersion: 2,
      id: product.slug,
      name: product.name,
      createdAt: new Date(now - 21 * 86_400_000).toISOString(),
      oneLiner: product.oneLiner,
    }, null, 2)}\n`);

    // The documents, and the catalog that makes them visible. A file on disk
    // with no entry in index.json is a file the pane does not know about
    // (main/store/project.mjs), so both halves or neither.
    const docs = DEMO_DOCS[product.slug] ?? [];
    for (const doc of docs) {
      const file = path.join(dir, doc.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${doc.text}\n`);
    }
    fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({
      schemaVersion: 2,
      creations: docs.map((doc, i) => ({
        id: `${product.slug}-doc-${i + 1}`,
        kind: 'markdown',
        title: doc.title,
        path: doc.path,
        ts: now - (i + 1) * 3_600_000,
        schemaVersion: 2,
      })),
      runs: [],
      reports: [],
      updatedAt: now,
    }, null, 2)}\n`);

    // And the work, where the app will actually look for it.
    const machinery = path.join(appHome, 'projects', encodeProjectPath(dir));
    fs.mkdirSync(machinery, { recursive: true });
    fs.writeFileSync(path.join(machinery, '.origin'), `${dir}\n`);
    const jsonl = (ledgers[product.slug] ?? []).map((line) => JSON.stringify(line)).join('\n');
    fs.writeFileSync(path.join(machinery, 'work-items.jsonl'), jsonl ? `${jsonl}\n` : '');

    // ROWS, NOT LINES, because this number is read out loud in the toast. One
    // row is two or three appended lines (filed, then said, then finished), so
    // counting the file's lines said twenty where she can see nine.
    const ids = new Set((ledgers[product.slug] ?? []).map((line) => line.id));
    written.push({ slug: product.slug, dir, machinery, rows: ids.size });
  }

  return { accountRoot, appHome, products: written };
}

/**
 * The environment a demo copy is launched with.
 *
 *  BOTH HOME VARIABLES, ALWAYS, for the reason `freshEnv` gives: HOME alone
 *  does not move `app.getPath('appData')` on macOS, so the copy would share her
 *  userData, lose the single-instance lock race and quit in half a second.
 *
 *  ASTRAL_HOME IS SET EXPLICITLY AND THAT IS NOT BELT AND BRACES. The app's home
 *  reads that variable first and only falls back to `~/.astral`, so a parent
 *  process that happens to have it set (every session Agentbox spawns does) would
 *  hand it straight through and the demo copy would read HER ledger while
 *  standing in an invented store. */
export function demoEnv(home, env = process.env) {
  const { appHome } = demoPaths(home);
  return { ...env, HOME: home, CFFIXED_USER_HOME: home, ...storeRootEnv(appHome), [DEMO_ENV]: '1' };
}

/**
 * Open one. Returns what happened in the words the app will show her, rather
 * than throwing: a row in ⌘K that fails silently is worse than one that says
 * why.
 *
 * `withAgents` is FALSE and has no parameter, unlike the new-user row. See the
 * head of this file: linking her ~/.claude through would put her real folder
 * names in the demo inbox, and the demo exists so that does not happen.
 */
export function openDemo({
  execPath = process.execPath,
  argv = process.argv,
  packaged = true,
  spawnFn = spawn,
  now,
} = {}) {
  let home;
  let prepared;
  let seeded;
  try {
    home = makeDemoHome(now ? new Date(now) : undefined);
    prepared = prepareHome(home, { withAgents: false });
    seeded = seedDemoStore(home, { now: now ?? Date.now() });
  } catch (err) {
    return { ok: false, error: `Could not lay out a demo under ${HOMES}: ${err?.message ?? err}` };
  }

  const { bin, args } = relaunchCommand({ execPath, argv, packaged });
  if (!bin || !fs.existsSync(bin)) {
    return { ok: false, error: `Cannot find this app's own program at ${bin}.`, home };
  }

  let child;
  try {
    child = spawnFn(bin, args, { detached: true, stdio: 'ignore', env: demoEnv(home) });
    child.unref?.();
  } catch (err) {
    return { ok: false, error: `Could not start a second ${NAME}: ${err?.message ?? err}`, home };
  }

  // THE NOTES ARE THE HONEST PART, the same as the new-user row's. Both of
  // these are things the demo copy can be missing while still looking fine, and
  // both of them mean the same thing: answering a row in front of a room will
  // not start an agent. Better said now than found out on the projector.
  const notes = [];
  if (!prepared.claudeBin) notes.push('Claude Code is not at ~/.local/bin/claude, so agents will not run in the demo.');
  if (!prepared.keychain) notes.push('There is no ~/Library/Keychains here, so Claude Code will say it is not logged in.');

  return {
    ok: true,
    home,
    products: seeded.products.map((p) => p.slug),
    rows: seeded.products.reduce((n, p) => n + p.rows, 0),
    notes,
    pid: child?.pid ?? null,
  };
}
