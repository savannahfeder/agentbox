// WHAT ONE REPLY MAY DO, ALL THE WAY FROM THE BOX TO THE COMMAND LINE.
//
// THIS FILE EXISTS BECAUSE THE ROUND BEFORE IT SHIPPED A CONTROL THAT DID
// NOTHING. The reply box had a menu, the menu set a mode, the footer printed a
// clause saying that mode was in force, and the mode was never sent anywhere:
// `send` did not pass it, the ledger had no field for it, and the supervisor
// never looked. A control that says an agent may not run commands, over an
// agent that then runs commands, is worse than no control, so the whole path is
// pinned here end to end:
//
//   the reply box  ->  api.answer({ permissionMode })
//                  ->  store.answerItem writes it into the app's own storage
//                  ->  only one of Claude Code's six is ever kept
//                  ->  spawnPlan rewrites --permission-mode for that one run
//                  ->  every other grant she has survives untouched
//
// AND IT IS NOT ON THE LEDGER. It used to be a field on `work-items.jsonl`,
// guarded so that only a line claiming to be hers could carry one. `source` is
// a plain string nothing checks, so a worker with Bash could write that line.
// The field moved to main/answer-modes.mjs instead, and the forged-line test
// below is the one that could not be written before.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { buildLine, foldWorkItems, normalizeLine, pickFields, CLAUDE_PERMISSION_MODES } from '../shared/work-items.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { buildSessionArgs, parseSessionArgs, permissionMode } from '../main/settings.mjs';
import { nameSlug } from '../shared/product-name.mjs';

let appDir;
let storeRoot;
const productDir = (slug) => path.join(storeRoot, slug);

// Her real shape: a model, tool grants that took a day to get right, and a
// mode. The whole risk of this feature is that a one-off mode eats one of them.
const HERS = [
  '--model', 'claude-opus-5',
  '--allowedTools', `mcp__${nameSlug}`, 'Bash(git push:*)',
  '--permission-mode', 'bypassPermissions',
];

const supervisor = (over = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = appDir;
  s.dataDir = appDir;
  // Her own folder, which the app keeps outside the checkout (w-3dc46f3a67).
  s.userDir = appDir;
  s.config = { sessionArgs: [...HERS] };
  s.buildBrief = () => 'THE BRIEF';
  s.store = { listProducts: () => [{ slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null }] };
  return Object.assign(s, over);
};

const acme = () => ({ slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null });
const item = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'do the thing', ...over });

beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-onereply-'));
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-onereply-store-'));
  fs.mkdirSync(productDir('acme'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(storeRoot, { recursive: true, force: true });
});

describe('the ledger has no permission field at all', () => {
  // THE CHANGE THIS BLOCK REPLACED, AND WHY. It used to check that the ledger
  // accepted the six modes and dropped anything else. That check was fine and
  // the field was in the wrong file: `work-items.jsonl` is append-only, every
  // worker writes it through the MCP all day, and each line names its own
  // author as a plain string that nothing verifies. So the guard could only
  // ever close the structured path, and the file stayed open.
  it('drops a mode off a line whoever wrote it', () => {
    for (const source of ['agent', 'system', 'founder']) {
      expect(pickFields({ answerMode: 'bypassPermissions' }), source).toBe(null);
      expect(() => buildLine({ id: 'w-1', source, patch: { answerMode: 'bypassPermissions' } }))
        .toThrow(/no recognized work item fields/);
    }
  });

  it('keeps the rest of a line and drops only the mode', () => {
    const line = buildLine({ id: 'w-1', source: 'founder', patch: { note: 'working', answerMode: 'plan' } });
    expect(line.patch).toEqual({ note: 'working' });
  });

  // ON READ TOO, because her ledger already contains lines from the build where
  // this WAS a field, and a store must not be re-read into a live grant.
  it('ignores one already sitting in her ledger', () => {
    const raw = { id: 'w-1', ts: 1, source: 'founder', patch: { answerMode: 'bypassPermissions', note: 'hi' } };
    expect(normalizeLine(JSON.stringify(raw)).patch).toEqual({ note: 'hi' });
    const items = foldWorkItems([
      { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'a row', product: 'acme' } },
      { id: 'w-1', ts: 2, source: 'founder', patch: { answerMode: 'bypassPermissions' } },
    ].map((l) => JSON.stringify(l)));
    expect(items.get('w-1').answerMode).toBeUndefined();
  });
});

// THE TEST THAT COULD NOT BE WRITTEN BEFORE.
//
// The old guard stripped a mode off any line that did not claim to be hers, and
// closed the MCP and the app with it. It could not close the FILE. `source` is a
// string in a line; a worker with Bash could append `"source":"founder"` and
// hand its own next run bypassPermissions. Proved on a scratch ledger 2026-08-24
// and unfixable from inside the ledger, because the rule and the forgery lived
// in the same file.
//
// This drives the real Store over a real on-disk ledger, forges the line by hand
// exactly as a worker would, and reads the row back the way the supervisor does.
describe('a forged ledger line cannot grant a permission', () => {
  let tmp;
  let store;
  let slug;
  let dir;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-forge-'));
    const accountRoot = path.join(tmp, 'accounts', 'test-account');
    dir = path.join(accountRoot, 'forgeprod');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 2, id: 'forgeprod', name: 'Forge Product',
    }));
    const { Store } = await import('../main/store.mjs');
    store = await new Store({ storeRoot: tmp, accountId: 'test-account', accountRoot, products: [] }).init();
    slug = store.listProducts()[0].slug;
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const forge = (id, patch, source = 'founder') => fs.appendFileSync(
    machineryPath(dir, 'work-items.jsonl'),
    `${JSON.stringify({ id, ts: Date.now(), source, patch })}\n`,
  );

  it('gets no mode from a line that claims to be hers', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    forge(row.id, { answerMode: 'bypassPermissions' });

    expect(store.readItem(slug, row.id).answerMode).toBeUndefined();
    const { args } = supervisor({ store }).spawnPlan(store.readItem(slug, row.id), acme());
    expect(parseSessionArgs(args).permissionMode).toBe('bypassPermissions'); // the fleet's, not the forgery's
    // And the forged line did not become state on the row either.
    expect(store.readItem(slug, row.id).title).toBe('a row');
  });

  // The other direction, which is the one that is easy to wave away. Clearing
  // is not "less": it means back to the project's setting, and that can be the
  // wider one. A forged clear must not undo a Plan she picked over a bypass.
  it('cannot take away a mode she chose, either', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'careful now', permissionMode: 'plan' });
    forge(row.id, { answerMode: null });
    expect(store.readItem(slug, row.id).answerMode).toBe('plan');
  });

  // Where it does live, and what that is and is not. This is not a wall: a
  // worker that goes looking can write this file too, because anything that can
  // run commands can write any file this user owns. Claude Code has the
  // identical property. What changed is the cost, from one more line in a file
  // the worker appends to anyway, in its own working directory, to a deliberate
  // reach into the app's own storage.
  it('keeps it in the app storage instead, out of the folder a worker runs in', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go', permissionMode: 'plan' });

    const ledger = fs.readFileSync(machineryPath(dir, 'work-items.jsonl'), 'utf8');
    expect(ledger).not.toContain('answerMode');
    expect(ledger).not.toContain('plan');

    const kept = JSON.parse(fs.readFileSync(path.join(process.env.ASTRAL_HOME, 'answer-modes.json'), 'utf8'));
    expect(kept[`${slug}/${row.id}`].mode).toBe('plan');
    // Not in her product folder, which is what a worker's cwd is on a product
    // with no code repo registered.
    expect(fs.readdirSync(dir)).not.toContain('answer-modes.json');
  });

  it('takes the six and refuses anything else', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    for (const mode of CLAUDE_PERMISSION_MODES) {
      store.answerItem(slug, row.id, { permissionMode: mode });
      expect(store.readItem(slug, row.id).answerMode, mode).toBe(mode);
    }
    store.answerItem(slug, row.id, { permissionMode: 'plan' });
    for (const junk of ['full', 'yolo', '', 3, {}, ['auto']]) {
      store.answerItem(slug, row.id, { permissionMode: junk });
      expect(store.readItem(slug, row.id).answerMode, JSON.stringify(junk)).toBe('plan');
    }
  });

  // A THREAD SHE IS WORKING IN KEEPS ITS MODE. This is the other half of
  // w-34b7b861b6 and the half a sweep can silently undo: she picks Manual on a
  // thread, comes back tomorrow, and it has to still be Manual or the fix is
  // only a fix for one day.
  it('keeps one a day old, because a mode belongs to the thread now', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go', permissionMode: 'default' });
    const file = path.join(process.env.ASTRAL_HOME, 'answer-modes.json');
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    all[`${slug}/${row.id}`].at = Date.now() - (25 * 60 * 60 * 1000);
    fs.writeFileSync(file, JSON.stringify(all));
    expect(store.readItem(slug, row.id).answerMode).toBe('default');
  });

  // AND A THREAD NOBODY HAS TOUCHED IN A MONTH LOSES IT. The grant is still not
  // allowed to outlive the conversation it was made in: a bypassPermissions she
  // granted in another quarter must not govern a session now merely because the
  // row is still on disk.
  it('forgets one no run has touched for a month', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go', permissionMode: 'bypassPermissions' });
    const file = path.join(process.env.ASTRAL_HOME, 'answer-modes.json');
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    all[`${slug}/${row.id}`].at = Date.now() - (31 * 24 * 60 * 60 * 1000);
    fs.writeFileSync(file, JSON.stringify(all));
    expect(store.readItem(slug, row.id).answerMode).toBeUndefined();
  });

  // The restamp is what makes the month mean "since the last run on this
  // thread" rather than "since she picked it", so an old grant on a live thread
  // survives.
  it('a run on the thread puts the clock back to now', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go', permissionMode: 'acceptEdits' });
    const file = path.join(process.env.ASTRAL_HOME, 'answer-modes.json');
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    all[`${slug}/${row.id}`].at = Date.now() - (29 * 24 * 60 * 60 * 1000);
    fs.writeFileSync(file, JSON.stringify(all));

    store.touchAnswerMode(slug, row.id, 'acceptEdits');

    const after = JSON.parse(fs.readFileSync(file, 'utf8'))[`${slug}/${row.id}`];
    expect(after.mode).toBe('acceptEdits');
    expect(Date.now() - after.at).toBeLessThan(5000);
  });

  // Same race the clear has, and the same answer: a second answer landing
  // between the launch and the child's 'spawn' must not have its value moved by
  // the run before it.
  it('leaves a newer mode alone when the restamp is for the one before it', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'first', permissionMode: 'plan' });
    store.answerItem(slug, row.id, { answer: 'second', permissionMode: 'default' });

    store.touchAnswerMode(slug, row.id, 'plan');

    expect(store.readItem(slug, row.id).answerMode).toBe('default');
  });
});

describe('the run that answer starts', () => {
  it('runs in the mode she set on the reply, not the fleet default', () => {
    const { args } = supervisor().spawnPlan(item({ answerMode: 'plan' }), acme());
    expect(parseSessionArgs(args).permissionMode).toBe('plan');
    expect(args).not.toContain('bypassPermissions');
  });

  // The whole reason this is not simply a second flag appended: the CLI takes
  // the last one, so two flags is a session running something the screen is not
  // describing.
  it('leaves exactly one permission flag on the command line', () => {
    const { args } = supervisor().spawnPlan(item({ answerMode: 'auto' }), acme());
    expect(args.filter((a) => a === '--permission-mode')).toHaveLength(1);
  });

  it('keeps her model and every tool grant she has', () => {
    const { args } = supervisor().spawnPlan(item({ answerMode: 'default' }), acme());
    const parsed = parseSessionArgs(args);
    expect(parsed.model).toBe('claude-opus-5');
    // Her fixture still names the store server by the word it had before
    // 2026-09-22. Every other grant is hers and comes back untouched; the store
    // one is read as the name that server answers to now, which is the only way
    // a config written before the rename still gets its tools.
    expect(parsed.allowedTools).toEqual([`mcp__${nameSlug}`, 'Bash(git push:*)']);
  });

  it('changes nothing at all when she never touched it', () => {
    const plain = supervisor().spawnPlan(item(), acme());
    expect(parseSessionArgs(plain.args).permissionMode).toBe('bypassPermissions');
    expect(plain.args).toEqual(supervisor().spawnPlan(item({ answerMode: null }), acme()).args);
  });

  // Belt and braces over the ledger's own check, because this is the one place
  // a string becomes an argument to a process.
  it('ignores a value that is not a mode rather than passing it to the CLI', () => {
    const { args } = supervisor().spawnPlan(item({ answerMode: 'yolo' }), acme());
    expect(parseSessionArgs(args).permissionMode).toBe('bypassPermissions');
    expect(args).not.toContain('yolo');
  });

  // A PROJECT OVERRIDE IS STILL THE BASE IT REWRITES. One reply outranks the
  // project on the mode and on nothing else, so the project's own tools and
  // model still stand.
  it('outranks a project override on the mode and leaves its grants alone', () => {
    const s = supervisor({
      projectSessionArgs: () => ['--model', 'claude-sonnet-5', '--allowedTools', 'Read', '--permission-mode', 'acceptEdits'],
    });
    const parsed = parseSessionArgs(s.spawnPlan(item({ answerMode: 'dontAsk' }), acme()).args);
    expect(parsed.permissionMode).toBe('dontAsk');
    expect(parsed.model).toBe('claude-sonnet-5');
    expect(parsed.allowedTools).toEqual(['Read']);
  });
});

// CLEARING A MODE, THROUGH THE REAL STORE AND THE REAL LEDGER.
//
// This used to be two tests against a recorder stub, and the stub hid a bug the
// recorder could not have: the founder-only rule that round added made
// `clearAnswerMode` throw, spawnWorker swallowed the throw, and the mode
// survived to govern every later respawn. A stub that only records the call
// passes happily while the real write is refused, so this drives the real Store
// and reads the item back off disk. Caught in review, 2026-08-23.
//
// THE RUN NO LONGER CALLS ANY OF THIS (w-34b7b861b6, 2026-09-24). A mode holds
// for the whole thread now, so the only thing that clears one is she does,
// through the reply box's clear row. Every guard below still matters, because
// clearing is still the dangerous direction: it does not mean less, it means
// back to the project's setting, which can be wider than what she picked.
describe('clearing a mode puts the row back on the project setting', () => {
  let tmp;
  let store;
  let slug;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-spend-'));
    const accountRoot = path.join(tmp, 'accounts', 'test-account');
    const dir = path.join(accountRoot, 'spendprod');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'spendprod', name: 'Spend Product',
    }));
    const { Store } = await import('../main/store.mjs');
    store = await new Store({ storeRoot: tmp, accountId: 'test-account', accountRoot, products: [] }).init();
    slug = store.listProducts()[0].slug;
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const read = (id) => store.listItems(Date.now()).find((i) => i.id === id);

  it('really writes the clear, and the item really loses the mode', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go on then', permissionMode: 'plan' });
    expect(read(row.id).answerMode).toBe('plan');

    store.clearAnswerMode(slug, row.id, 'plan');
    expect(read(row.id).answerMode).toBeNull();
  });

  // THE RACE THE LAST REVIEW FOUND, 2026-08-23. The supervisor reads the mode
  // when it builds the launch and clears on the child's own 'spawn' event, so a
  // second answer landing in between used to be wiped by the clear meant for the
  // first. Nothing refused it, because a 'system' revocation beats her own write
  // by design. The direction is the dangerous one: clearing is not "less", it is
  // back to the project's setting, which can be wider than what she picked.
  it('leaves a newer answer alone when the clear is for the mode before it', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'first', permissionMode: 'plan' });
    // She answers again before the child of the first launch has spawned.
    store.answerItem(slug, row.id, { answer: 'second', permissionMode: 'acceptEdits' });

    // The first launch's clear arrives late, carrying the mode IT spent.
    store.clearAnswerMode(slug, row.id, 'plan');

    expect(read(row.id).answerMode).toBe('acceptEdits');
  });

  it('still clears when the mode on the row is the one that was spent', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'go', permissionMode: 'acceptEdits' });

    store.clearAnswerMode(slug, row.id, 'acceptEdits');

    expect(read(row.id).answerMode).toBeNull();
  });

  // The escalation guard must not eat the revocation, which is exactly what it
  // did the first time. Granting is hers, spending one is main's, and an agent
  // gets neither.
  it('lets the clear land over her own grant', () => {
    const row = store.composeItem(slug, { title: 'a row', body: 'text' });
    store.answerItem(slug, row.id, { answer: 'x', permissionMode: 'bypassPermissions' });
    store.clearAnswerMode(slug, row.id);
    const after = read(row.id);
    expect(after.answerMode).toBeNull();
    // And her answer itself is untouched by the clear.
    expect(after.answer).toBe('x');
  });

  // NOTHING TOUCHES THE STORED MODE UNTIL A PROCESS IS REALLY UP, and the
  // restamp inherits that placement from the clear it replaced. A launch that
  // dies while preparing itself must leave the grant exactly as it found it.
  it('does not touch the stored mode when the launch fails before the process starts', () => {
    const written = [];
    const s = supervisor({
      sessions: new Map(),
      _capacity: () => 4,
      // Since capacity became per subscription the door in `spawnWorker`
      // reads this one. A bare Supervisor has no `maxConcurrentSessions`, so
      // the real method answers NaN and the spawn is refused in silence --
      // which the end-to-end test below catches as a timeout and this one
      // would have swallowed as a pass.
      _capacityFor: () => 4,
      store: {
        listProducts: () => [{ slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null }],
        clearAnswerMode: (p, id) => written.push(['clear', p, id]),
        touchAnswerMode: (p, id) => written.push(['touch', p, id]),
      },
      writeMcpConfig: () => { throw new Error('could not write the mcp config'); },
    });
    try { s.spawnWorker(item({ answerMode: 'plan' })); } catch { /* expected */ }
    expect(written).toEqual([]);
  });

  // THE WHOLE PATH, THROUGH A REAL PROCESS AND A REAL STORE, ON DISK.
  //
  // Everything above this is a unit. Codex's objection to the first version of
  // these tests was fair and worth keeping: deleting the clear entirely would
  // have left them all green, because they stubbed the store. This one spawns a
  // real command, waits for its real 'spawn' event, and reads the item back off
  // the real ledger.
  //
  // IT ASSERTS THE OPPOSITE OF WHAT IT USED TO, and it is the test for the bug
  // she reported (w-34b7b861b6). It used to wait for `answerMode` to go null
  // and call that spending the one-off. That clear is exactly what made every
  // in-progress row's footer read "In Auto Mode" after she had put the thread
  // in Manual. So now it waits for the process to come and go and asserts the
  // mode is STILL on the row, which is the only thing that proves run two gets
  // what she picked.
  it('really keeps it, end to end, once a real process has started and gone', async () => {
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-e2e-'));
    try {
      const accountRoot = path.join(tmp2, 'accounts', 'test-account');
      const dir = path.join(accountRoot, 'e2eprod');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
        schemaVersion: 1, id: 'e2eprod', name: 'E2E Product',
      }));
      const { Store } = await import('../main/store.mjs');
      const realStore = await new Store({
        storeRoot: tmp2, accountId: 'test-account', accountRoot, products: [],
      }).init();
      const slug = realStore.listProducts()[0].slug;
      const row = realStore.composeItem(slug, { title: 'a row', body: 'text' });
      realStore.answerItem(slug, row.id, { answer: 'go', permissionMode: 'plan' });

      const s = supervisor({
        sessions: new Map(),
        _capacity: () => 4,
      // Since capacity became per subscription the door in `spawnWorker`
      // reads this one. A bare Supervisor has no `maxConcurrentSessions`, so
      // the real method answers NaN and the spawn is refused in silence --
      // which the end-to-end test below catches as a timeout and this one
      // would have swallowed as a pass.
      _capacityFor: () => 4,
        store: realStore,
        writeMcpConfig: () => null,
        readStanding: () => '',
        readProjectInstructions: () => '',
        projectSessionArgs: () => null,
        isPersonal: () => false,
        // The bookkeeping the exit path touches. Stubbed rather than left
        // undefined so the child exiting does not throw past the assertion.
        _fruitless: {},
        _profileCooldown: {},
        emit: () => {},
        tick: () => {},
        // `true` exits 0 at once and emits a real 'spawn' event before it does.
        config: {
          sessionArgs: [...HERS],
          claudeBin: '/usr/bin/true', accountId: 'test-account', storeRoot: tmp2,
        },
      });
      const live = realStore.listItems(Date.now()).find((i) => i.id === row.id);
      expect(live.answerMode).toBe('plan');

      // The stored clock is wound back first, so the restamp on 'spawn' is
      // something this test can WAIT FOR rather than something it hopes
      // happened. AWAITED, NOT SLEPT: a fixed sleep is a test that passes
      // because the machine was fast enough this time.
      const modeFile = path.join(process.env.ASTRAL_HOME, 'answer-modes.json');
      const key = `${slug}/${row.id}`;
      const stamped = () => {
        try { return JSON.parse(fs.readFileSync(modeFile, 'utf8'))[key]; } catch { return undefined; }
      };
      const wound = JSON.parse(fs.readFileSync(modeFile, 'utf8'));
      const long = Date.now() - (10 * 24 * 60 * 60 * 1000);
      wound[key].at = long;
      fs.writeFileSync(modeFile, JSON.stringify(wound));

      const ran = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('the run never reached the stored mode')), 5000);
        const poll = setInterval(() => {
          const now = stamped();
          if (now && now.at > long) { clearInterval(poll); clearTimeout(t); resolve(); }
        }, 20);
      });
      s.spawnWorker(live);
      await ran;

      // THE ASSERTION THIS FILE EXISTS FOR NOW. A real process started under
      // her mode, ran and exited, and the mode is still on the row, so the next
      // run on this thread gets it too.
      const after = realStore.listItems(Date.now()).find((i) => i.id === row.id);
      expect(after.answerMode).toBe('plan');
      expect(after.answer).toBe('go');
      expect(stamped().mode).toBe('plan');
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });
});

// THE CHIP HAS TO SAY WHAT THE RUN WILL ACTUALLY DO, and "actually" means the
// same three branches spawnPlan walks. Caught in review 2026-08-23: the footer
// was handed the workspace mode alone, which is wrong on a fresh install (no
// sessionArgs at all, so the workspace reads `custom` while workers really
// start in auto) and wrong on any project with an override.
describe('the mode the footer prints is the mode the run uses', () => {
  const resolved = (over = {}) => {
    const s = supervisor(over);
    return (slug) => s.effectivePermission(slug);
  };

  it('is the workspace mode when nothing overrides it', () => {
    expect(resolved({ projectSessionArgs: () => null })('acme'))
      .toBe('bypassPermissions');
  });

  it('is the project override when there is one', () => {
    expect(resolved({
      projectSessionArgs: () => ['--permission-mode', 'plan'],
    })('acme')).toBe('plan');
  });

  // A personal project ran its own arg list and was a third case here.
  // Personal projects are deleted (w-d19d6d387c, 2026-09-22).

  // THE ONE THAT WAS ACTUALLY WRONG ON EVERY FRESH INSTALL. With no sessionArgs
  // at all the workspace reads `custom`, but defaultSessionArgs states auto, so
  // the chip said one thing and the worker did another.
  it('is auto on a fresh install, not custom', () => {
    const s = supervisor({ projectSessionArgs: () => null, isPersonal: () => false, storeMcpCommand: () => null });
    s.config = { personalProducts: [] };
    expect(s.effectivePermission('acme')).toBe('auto');
  });
});

// HER CONFIG REACHES THE CLI AS SHE WROTE IT, and only a one-off rewrites it.
//
// This flipped twice. Running every spawn through buildSessionArgs guaranteed
// exactly one permission flag, and cost more than it bought: the parser cannot
// know the arity of flags it does not own, so a value that happens to look like
// a flag was read as one and its owner was left dangling. Rewriting a config she
// typed by hand, on every spawn, to fix a DISPLAY problem is the wrong trade.
// The display is fixed at the reading end instead.
describe('what actually reaches the command line', () => {
  const argsFor = (sessionArgs, over = {}) => {
    const s = supervisor(over);
    s.config = { ...s.config, sessionArgs };
    return s.spawnPlan(item(), acme()).args;
  };

  it('passes an ordinary spawn through untouched', () => {
    const args = argsFor(['--permission-mode=plan', '--dangerously-skip-permissions']);
    expect(args.join(' ')).toContain('--permission-mode=plan --dangerously-skip-permissions');
  });

  // AND THE SCREEN STILL NAMES IT CORRECTLY, which is what the round was
  // actually about: the CLI obeys the last flag, so that config really is
  // bypass, and permissionMode now says bypass rather than reading the first
  // flag and calling it Plan.
  it('names what those flags really add up to', () => {
    expect(permissionMode(['--permission-mode=plan', '--dangerously-skip-permissions']))
      .toBe('bypassPermissions');
  });

  // A ONE-OFF DOES REWRITE IT, and then exactly one permission flag survives.
  it('leaves one flag when a one-off rewrites it', () => {
    const s = supervisor();
    s.config = { ...s.config, sessionArgs: ['--permission-mode=plan', '--dangerously-skip-permissions'] };
    const args = s.spawnPlan(item({ answerMode: 'auto' }), acme()).args;
    expect(args.join(' ')).not.toContain('dangerously-skip');
    expect(args.filter((a) => a === '--permission-mode')).toHaveLength(1);
    expect(parseSessionArgs(args).permissionMode).toBe('auto');
  });

  // THE ARITY BUG. `--append-system-prompt --dangerously-skip-permissions` is a
  // legal pair: the prompt IS that literal string. A parser that guessed read
  // the value as a mode and left the flag dangling.
  // AND A FLAG WHOSE VALUE IS OPTIONAL DOES NOT SWALLOW THE NEXT FLAG.
  // `--resume` alone opens the session picker. Consuming blindly turned
  // `--resume --permission-mode bypassPermissions` into a run where the bypass
  // survived a deliberate Plan and won by being last.
  it('does not let an optional value eat the flag after it', () => {
    const base = ['--resume', '--permission-mode', 'bypassPermissions'];
    expect(parseSessionArgs(base).permissionMode).toBe('bypassPermissions');
    expect(parseSessionArgs(base).other).toEqual(['--resume']);
    expect(buildSessionArgs(base, 'plan').join(' ')).not.toContain('bypassPermissions');
    // And it still takes a real session id when one is there.
    expect(parseSessionArgs(['--resume', 'abc123']).other).toEqual(['--resume', 'abc123']);
  });

  it('never reads a value belonging to a flag it does not own', () => {
    const base = ['--append-system-prompt', 'be brief and do not guess', '--permission-mode', 'auto'];
    expect(parseSessionArgs(base).permissionMode).toBe('auto');
    expect(parseSessionArgs(base).other).toEqual(['--append-system-prompt', 'be brief and do not guess']);
    const s = supervisor();
    s.config = { ...s.config, sessionArgs: base };
    const args = s.spawnPlan(item({ answerMode: 'plan' }), acme()).args;
    expect(args.join(' ')).toContain('--append-system-prompt be brief and do not guess');
  });

  // THE ONE AMBIGUITY THAT CANNOT BE RESOLVED, WRITTEN DOWN RATHER THAN HIDDEN.
  // A value that is itself spelled like a flag is indistinguishable from a flag,
  // to us and to any other reader of an argv; that is why `--flag=value` exists.
  // Between the two ways of being wrong, this one picks the safe one: a
  // permission flag is always read as a permission flag, so nothing dangerous
  // can hide in a value position. The cost is a system prompt whose entire text
  // is the word `--dangerously-skip-permissions`, which is not a thing anybody
  // writes; the alternative cost was a bypass surviving a deliberate Plan.
  it('reads a permission flag as a permission flag even in a value position', () => {
    const base = ['--append-system-prompt', '--dangerously-skip-permissions'];
    expect(parseSessionArgs(base).permissionMode).toBe('bypassPermissions');
  });
});

// WHAT THESE ARE, SAID PLAINLY, BECAUSE A REVIEW READ THE OLD HEADING AS A
// PROMISE THEY DO NOT KEEP. They are GREPS OVER SOURCE TEXT. They would still
// pass if the handler they name were never reachable and never ran. They exist
// for one hop only, renderer -> IPC, which is the piece with no test harness in
// this repo: there is no renderer render in these tests, so a click cannot be
// driven. Everything from the bridge inward IS exercised for real, against a
// real on-disk ledger and a real spawned process, in the blocks above; do not
// read this one as covering that. If the renderer ever gets a render harness,
// these four should be the first things replaced.
describe('the wiring from the reply box is present in the source', () => {
  it('hands the mode to onSend, and onSend hands it to the answer', async () => {
    const focus = fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8');
    // The model drawer added a SIXTH argument on 2026-09-18, so these greps no
    // longer end at `mode` with a bracket. The mode is still the fifth and
    // still handed on; what follows it is the model pick.
    expect(focus).toContain('repeat, sent, mode,');
    const app = fs.readFileSync('renderer/src/App.tsx', 'utf8');
    expect(app).toContain('onReplySend={(text, priority, repeat, sent, mode, pick) =>');
    // THE ENGINE RIDES WITH IT SINCE 2026-09-05, and it is the last argument
    // rather than a sixth thing the box knows: `answerWith` needs it to decide
    // whether a slash command keeps her on the row, and the pane already holds
    // main's answer for the byline. The mode itself is unchanged and still the
    // fifth.
    expect(app).toContain('answerWith(focused, text, priority, sent, mode, runningEngine, pick)');
    expect(app).toContain('permissionMode: mode');
  });

  // AND IT IS NOT OFFERED WHERE IT WOULD BE THROWN AWAY. A message to one of
  // her own Claude Code sessions goes straight into that process, which has a
  // mode Agentbox did not choose and cannot change from here.
  /* 
  */
  /*
   * AND NOR ON A CODEX ROW SINCE 2026-09-05, which is the same sentence with
     one more clause in it. A mode there is thrown away by the RUN rather than
     by the send: `spawnPlan` writes it into a Claude Code argv that the Codex
     path never reads, `codexThreadParamsFor` has no field it could go in, and
     `spawnWorker` clears the one-off on `spawn` whatever the engine. Both ways
     in read the one const, so neither can be taught without the other. */
  it('shows no mode control on an external agent row', () => {
    const focus = fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8');
    // SINCE 2026-09-23 BOTH ENGINES MAY SET ONE, so the rule is about the
    // external agent row alone: that value really is thrown away by the send.
    expect(focus).toContain('const canSetMode = !item.agent;');
    expect(focus).toContain('const claudeCode = (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE;');
    // The slash menu: no query means no rows means no menu.
    expect(focus).toContain('const query = !item.agent ? slashQuery(text) : null;');
    // And Claude Code's own Shift+Tab.
    expect(focus).toContain("e.key === 'Tab' && e.shiftKey && canSetMode");
    // And there is no longer a chip to guard at all.
    expect(focus).not.toContain('mode-chip');
  });

  it('carries it through the bridge and into the store', () => {
    const ipc = fs.readFileSync('main/ipc.mjs', 'utf8');
    expect(ipc).toMatch(/zero:answer'[^)]*permissionMode/s);
    expect(ipc).toContain('store.answerItem(product, id, { answer, status, priority, permissionMode, model, effort })');
  });
});
