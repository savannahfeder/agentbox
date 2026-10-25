// THE PRE-DEPLOY CHECK RUNS WHAT A CHANGE NEEDS, AND THE MACHINES IT BUILDS ARE THE MACHINES IT SAYS.
//
// Why this exists (w-4401acca50, 2026-10-11): most bugs that reached people were
// about their Mac, not the code — where Claude Code or Codex was installed, which
// shell, what PATH an app opened from the Dock sees — and the unit tests run on
// the Mac the code was written on, so they stayed green while those shipped.
// .claude/skills/verify-agentbox/scripts/verify.mjs is the check that runs before
// a deploy: fake Macs unlike this one, this Mac for real, and a live copy of the
// app driven by keyboard.
//
// Two things here must not drift. Which layers a branch gets (`layersFor`): too
// narrow and a change to how Codex is found ships without the machine check,
// too wide and every docs fix waits on a browser. And the fake machines
// themselves: a shape whose stub is not where it claims, or a fake root that
// lets this Mac's own installs answer, proves nothing about anybody else's Mac.
// Measured when written: the full machine check took 35 s for 16 shapes on a
// loaded Mac, and the live layer about 40 s, so neither runs in this suite; the
// one shape run below takes about a second.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { layersFor, DRIVE_ORDER, REAL_ORDER, INSTALLED_ORDER } from '../.claude/skills/verify-agentbox/scripts/verify.mjs';
import { SHAPES, build } from '../.claude/skills/verify-agentbox/scripts/machines.mjs';

const runs = (files, opts) => Object.fromEntries(Object.entries(layersFor(files, opts)).map(([k, v]) => [k, v.run]));
// Since 2026-10-12 (the owner's answer on w-4401acca50): every deploy that
// changes what a person runs also runs real Claude Code and Codex, the
// installed app, and an agent trying to break it.
// Since 2026-10-15, also the real Claude Code on other people's setups
// (tests/a-real-claude-code-runs-on-other-peoples-setups-without-a-bill.test.mjs).
const APP_CHANGE = { live: true, setups: true, real: true, installed: true, breaker: true };
const NO_APP_CHANGE = { live: false, setups: false, real: false, installed: false, breaker: false };

describe('which layers a branch gets', () => {
  it('a change to how Codex is found runs the machine check and every app layer', () => {
    expect(runs(['main/codex-bin.mjs'])).toEqual({ 'this-machine': true, machines: true, ...APP_CHANGE });
  });

  it('every file that decides how a tool is found or started counts', () => {
    for (const f of ['main/shell-path.mjs', 'main/claude-bin.mjs', 'main/codex-launch-env.mjs', 'main/harnesses/common.mjs', 'main/harnesses.mjs', 'main/config.mjs', 'package.json']) {
      expect(runs([f]).machines, f).toBe(true);
    }
  });

  it('a screen change runs every app layer but not the machine check', () => {
    expect(runs(['renderer/src/threads/ThreadComposer.tsx'])).toEqual({ 'this-machine': true, machines: false, ...APP_CHANGE });
  });

  it('--quick keeps the stand-in drives and drops the slow, billed layers', () => {
    expect(runs(['main/supervisor.mjs'], { quick: true })).toEqual({ 'this-machine': true, machines: false, live: true, setups: false, real: false, installed: false, breaker: false });
  });

  it('each slow layer can be dropped on its own, and says why it was', () => {
    expect(runs(['main/supervisor.mjs'], { real: false })).toMatchObject({ live: true, real: false, installed: true, breaker: true });
    expect(runs(['main/supervisor.mjs'], { installed: false })).toMatchObject({ real: true, installed: false, breaker: true });
    expect(runs(['main/supervisor.mjs'], { breaker: false })).toMatchObject({ real: true, installed: true, breaker: false });
    expect(layersFor(['main/supervisor.mjs'], { real: false }).real.why).toBe('--no-real');
  });

  it('a change to the stand-in worker or the skill re-proves the drive', () => {
    expect(runs(['scripts/lib/stub-claude-worker.mjs']).live).toBe(true);
    // The stand-in imports it; a power test's world changes what every stand-in does.
    expect(runs(['scripts/lib/stand-in-world.mjs']).live).toBe(true);
    expect(runs(['.claude/skills/verify-agentbox/scripts/drives.mjs']).live).toBe(true);
    expect(runs(['.claude/skills/verify-agentbox/scripts/machines.mjs']).machines).toBe(true);
  });

  it('docs, tests and one-off scripts get only the two-second layer', () => {
    expect(runs(['docs/team/PLAN.md', 'tests/a-bare-week-means-one-week.test.mjs', 'scripts/scratch/x.mjs', 'README.md']))
      .toEqual({ 'this-machine': true, machines: false, ...NO_APP_CHANGE });
  });

  it('does not match a path that only starts with a product folder\'s name', () => {
    expect(runs(['docs/main/notes.md', 'mainline.md', 'renderer-notes.md', 'tests/main/claude-bin.test.mjs']))
      .toEqual({ 'this-machine': true, machines: false, ...NO_APP_CHANGE });
  });

  it('--all runs everything, whatever changed', () => {
    expect(runs([], { all: true })).toEqual({ 'this-machine': true, machines: true, ...APP_CHANGE });
  });

  it('every drive the check runs exists, on every copy it runs on', async () => {
    const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.claude/skills/verify-agentbox/scripts/drives.mjs'), 'utf8');
    for (const d of [...DRIVE_ORDER, ...REAL_ORDER, ...INSTALLED_ORDER]) expect(src, d).toContain(`'${d}': {`);
  });

  it('runs real Claude Code and Codex on the agent drives', () => {
    expect(REAL_ORDER).toEqual(expect.arrayContaining(['new-thread', 'reply', 'codex-thread', 'many-at-once']));
  });

  it('runs nothing after every login runs out, since every login is left resting', () => {
    for (const order of [DRIVE_ORDER, INSTALLED_ORDER]) {
      const i = order.indexOf('every-login-runs-out');
      if (i >= 0) expect(i, order.join(' ')).toBe(order.length - 1);
    }
  });
});

// Found 2026-10-12 on the first full run: `projects()` read the folder names
// one dash short ("-sandbox"), so every drive looking for a thread across
// projects found none and new-thread failed on a thread that was there.
describe('reading the copy\'s store', () => {
  it('finds each project by its own slug, and the threads in it', async () => {
    const { projects, rows } = await import('../.claude/skills/verify-agentbox/scripts/drives.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-store-'));
    try {
      const state = { storeRoot: path.join(root, 'store'), accountRoot: path.join(root, 'store', 'accounts', 'verify-account') };
      const folder = (slug) => path.join(state.storeRoot, 'projects', path.join(state.accountRoot, slug).replace(/[^A-Za-z0-9]/g, '-'));
      for (const slug of ['sandbox', 'second']) fs.mkdirSync(folder(slug), { recursive: true });
      fs.writeFileSync(path.join(folder('second'), 'work-items.jsonl'),
        `${JSON.stringify({ id: 'w-0a1b2c3d4e', ts: 1, source: 'system', patch: { title: 'In second', status: 'open' } })}\n`);
      // Another account's project beside them is not ours.
      fs.mkdirSync(path.join(state.storeRoot, 'projects', `${path.join(root, 'store', 'accounts', 'someone')}-x`.replace(/[^A-Za-z0-9]/g, '-')), { recursive: true });
      expect(projects(state).sort()).toEqual(['sandbox', 'second']);
      expect(rows(state).map((r) => [r.title, r.product])).toEqual([['In second', 'second']]);
      expect(rows(state, 'sandbox')).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the fake machines', () => {
  it('every shape has a unique name, a reason, and an expectation for both tools', () => {
    const names = SHAPES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SHAPES) {
      expect(String(s.why ?? '').split(/\s+/).length, s.name).toBeGreaterThan(5);
      expect(s.expect.claude, s.name).toBeTruthy();
      expect(s.expect.codex, s.name).toBeTruthy();
    }
  });

  it('lays a shape out where it says, and reads system folders from the fake root, not this Mac', () => {
    const shape = SHAPES.find((s) => s.name === 'homebrew-apple-silicon');
    const m = build(shape);
    try {
      expect(m.virtual.exists('/opt/homebrew/bin/claude')).toBe(true);
      expect(fs.realpathSync(m.toReal('/opt/homebrew/bin/claude'))).toContain(path.join('sys', 'opt', 'homebrew', 'Caskroom'));
      // A folder the shape did not create is absent, even if this Mac has it.
      expect(m.virtual.exists('/usr/local/bin/node')).toBe(false);
      expect(m.virtual.exists('/bin/sh')).toBe(true);
      expect(m.launchEnv.PATH).toBe('/usr/bin:/bin:/usr/sbin:/sbin');
      expect(m.launchEnv.HOME).toBe(m.home);
    } finally {
      fs.rmSync(m.root, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'darwin')('the installer-defaults Mac finds and starts both tools through the app\'s own modules', async () => {
    const { checkShape } = await import('../.claude/skills/verify-agentbox/scripts/check-machines.mjs');
    const r = await checkShape(SHAPES.find((s) => s.name === 'installer-defaults'));
    expect(r.wrong).toEqual([]);
    expect(r.claude).toMatchObject({ found: true, runs: true });
    expect(r.codex).toMatchObject({ found: true, runs: true });
  }, 30_000);
});
