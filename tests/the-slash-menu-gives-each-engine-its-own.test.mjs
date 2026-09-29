import { providerCommands, CODEX_COMMANDS } from '../shared/provider-commands.mjs';
// THE MENU WENT ON OFFERING CLAUDE CODE'S COMMANDS AFTER CODEX CAME BACK.
//
// `slashRows` took a third argument, `commands`, from the day the eight landed,
// and `Focus.tsx` passed it the row's engine. It was removed the same evening,
// in 258d71d, and the commit says why in one line: "The eight Claude Code slash
// commands are no longer gated on the engine, since every row reaches Claude
// Code now." That sentence was true when it was written. It stopped being true
// on this branch, which brings the second engine back —
// `main/codex-app-server.mjs`, `main/codex-approvals.mjs`, a picker in the
// composer and a row in Settings — and nothing put the gate back.
//
// SO ON A CODEX ROW TODAY, "/" DRAWS FOURTEEN ROWS AND NOT ONE OF THEM WORKS.
// Measured off the source, 2026-09-04:
//
// THE EIGHT COMMANDS. `commandPrompt` is asked with no engine in the question
// (`main/supervisor.mjs`: `const command = continuation ?
// commandPrompt(item.answer): null`), so picking `/context` on a Codex row
// makes `/context` the whole prompt, and `_spawnCodexWorker` hands
// `plan.prompt` straight to `turnParams.input`. Codex has no `/context`,
// `/compact`, `/usage` or `/mcp`. The word goes to the CLI as her message.
//
//   THE SIX MODES. Worse, because they fail quietly. `spawnPlan` turns
//   `item.answerMode` into a `--permission-mode` flag inside `args`, and `args`
//   is a Claude Code command line that the Codex path never reads:
//   `_spawnCodexWorker` takes `plan.prompt`, `plan.system`, `plan.model` and
//   `plan.resumeId` and nothing else. `spawnWorker` then CLEARS the one-off on
//   `spawn`, on either engine. So a mode she picks on a Codex row is spent and
//   gone, and the run happens under the posture it would have had anyway.
//
// WHAT THE SIX SHOULD DO ON A CODEX ROW, WHICH IS THE QUESTION THIS FILE
// ANSWERS: they should not be there. They are Claude Code's six by value, each
// a word `claude --permission-mode` takes, and mapping "Plan" or "Accept edits"
// onto a Codex setting would be inventing an equivalence. CLAUDE.md's own rule
// about two vocabularies is the shape of that mistake: "Two lists of the same
// four words is how 'Medium' and 'medium' ended up on adjacent screens."
//
// CODEX HAS ITS OWN THREE SINCE 2026-09-23, AND THAT IS NOT THE SAME THING.
// The paragraph that used to stand here said no equivalent should be invented
// because a Codex worker ran ONE posture and the other approval policies
// "NEITHER cards a command", so there was nothing to choose between. That rests
// on a measurement error, corrected the same day: not carding and not stopping
// are different things, and under `workspace-write` the sandbox refuses on its
// own. So there really are three postures worth choosing between, they live in
// shared/codex-modes.mjs, and each is a sandbox and an approval policy that
// reach `thread/start`.
//
// SO A CODEX ROW NOW OFFERS CODEX'S THREE AND CODEX'S COMMANDS, and never a
// word of Claude Code's. That is what this file holds: each engine's menu is
// its own, the lists never cross, and a mode picked on either row reaches the
// run rather than being spent in silence.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { CLAUDE_COMMANDS } from '../shared/claude-commands.mjs';
import { DEFAULT_ENGINE } from '../shared/engines.mjs';
import { slashRows } from '../renderer/src/slash-menu.ts';
import { MODE_ORDER } from '../renderer/src/modes.ts';
import { WORKER_APPROVAL_POLICY, WORKER_SANDBOX } from '../main/codex-session.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('what "/" offers, on each of the two engines', () => {
  // THE ROW IT HAS ALWAYS HAD, unchanged. Six modes then eight commands, with
  // the six modes kept at the top.
  it('offers the six modes and the eight commands on a Claude Code row', () => {
    const rows = slashRows('', false, true);
    expect(rows.filter((r) => r.kind === 'mode')).toHaveLength(MODE_ORDER.length);
    expect(rows.filter((r) => r.kind === 'command').map((r) => r.cmd.name))
      .toEqual(providerCommands('claude-code').map((c) => c.name));
  });

  it('offers Codex\'s own three and Codex\'s commands on a Codex row', () => {
    const cmds = (rows) => rows.filter((r) => r.kind === 'command').map((r) => r.cmd.name);
    const modes = (rows) => rows.filter((r) => r.kind === 'codexMode').map((r) => r.mode);
    expect(cmds(slashRows('', false, false))).toEqual(CODEX_COMMANDS.map((c) => c.name));
    expect(modes(slashRows('', false, false))).toEqual(['read-only', 'auto', 'full-access']);
    expect(cmds(slashRows('c', false, false))).toEqual(['compact', 'copy']);
    // And the way back is offered once something has been set, same as the
    // other engine.
    expect(modes(slashRows('', true, false))).toEqual(['read-only', 'auto', 'full-access', null]);
  });

  // THE LISTS NEVER CROSS, which is the whole of the original complaint. No
  // Claude Code mode reaches a Codex row and no Codex mode reaches a Claude one.
  it('never puts one engine\'s modes on the other engine\'s row', () => {
    const codex = slashRows('', false, false);
    expect(codex.some((r) => r.kind === 'mode')).toBe(false);
    expect(slashRows('plan', false, false)).toEqual([]);
    const claude = slashRows('', false, true);
    expect(claude.some((r) => r.kind === 'codexMode')).toBe(false);
    expect(slashRows('full-access', false, true)).toEqual([]);
  });

  // THE BOUNDARY EITHER SIDE, on the one query where the two halves both match.
  // `/c` is three commands and no modes; `/a` is two modes and no commands.
  // Neither survives on a Codex row and both survive whole on a Claude one.
  it('answers the same query with each engine\'s own words', () => {
    expect(slashRows('c', false, true).length).toBeGreaterThan(0);
    expect(slashRows('a', false, true).length).toBeGreaterThan(0);
    expect(slashRows('c', false, false).filter((r) => r.kind === 'command').map((r) => r.cmd.name))
      .toEqual(['compact', 'copy']);
    // `/a` is two modes on Claude Code and Codex's own `auto` here. Same key,
    // different engine, never the other one's vocabulary.
    expect(slashRows('a', false, false)).toEqual([{ kind: 'codexMode', mode: 'auto' }]);
  });

  // AND THE CASE THAT MUST NOT MATCH: a query nothing answers is still empty on
  // the engine that HAS the commands, so "empty" is not proof of the gate.
  it('is empty on a Claude Code row too when nothing matches what she typed', () => {
    expect(slashRows('zzz', false, true)).toEqual([]);
  });
});

describe('the menu is told which engine the row runs on', () => {
  const focus = read('renderer/src/components/Focus.tsx');

  it('reads the row\'s own engine rather than assuming Claude Code', () => {
    // The same value the byline already uses, resolved in App by `engineFor` and
    // handed down: `byItem[id] ?? workspace`. Read here rather than re-derived,
    // because a second copy of "which engine is this row on" is a copy that can
    // disagree with the one the supervisor spawns from.
    //
    // IT IS A NAMED CONST SINCE 2026-09-05, AND THAT IS THE POINT OF IT. The
    // expression sat inline on this one line while `canSetMode` twelve lines
    // above answered the same question as `!item.agent`, with no engine in it at
    // all. So the MENU was correctly empty on a Codex row while Shift+Tab and
    // the mode words typed straight through both still set a permission mode
    // there. One const, read by both, is the whole of the fix;
    // tests/a-permission-mode-cannot-be-set-on-a-codex-row.test.mjs holds the
    // other end of it.
    expect(focus).toContain('const claudeCode = (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE;');
    expect(focus.match(/const claudeCode = /g)).toHaveLength(1);
    expect(focus).toContain('const menuRows = slashRows(query, mode !== null, claudeCode, nativeNames);');
    expect(focus).toContain('const canSetMode = !item.agent;');
    expect(focus).toContain('const slashOpen = menuRows.length > 0;');
    // Passed all the way down rather than stopping at Focus, which is where it
    // stopped: Focus has taken `runningEngine` for the byline the whole time and
    // the composer inside it never saw it.
    expect(focus).toContain('<DockComposer item={item} runningMode={runningMode} runningEngine={runningEngine}');
  });
});

/*
 * AND THE OTHER END OF THE SAME GATE. The menu not offering a command is a
   screen; this is the run. She can still type `/context` into the box by hand,
   and the supervisor is the only thing standing between that and the CLI. */
describe('what reaches the CLI on each engine', () => {
  let appDir;
  let storeRoot;
  const productDir = (slug) => path.join(storeRoot, slug);
  const acme = () => ({ slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null });
  const row = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'do the thing', ...over });

  const supervisor = (over = {}) => {
    const s = Object.create(Supervisor.prototype);
    s.appDir = appDir;
    s.dataDir = appDir;
    // Her own folder, which the app keeps outside the checkout (w-3dc46f3a67).
    s.userDir = appDir;
    s.config = { sessionArgs: ['--permission-mode', 'auto'], personalSessionArgs: [], personalProducts: [] };
    s._personalSessions = {};
    s.buildBrief = () => 'THE BRIEF';
    s.resumeBrief = () => 'THE RESUME BRIEF';
    s.store = { listProducts: () => [acme()] };
    // The model check is main/codex-models.mjs's job and has its own file; this
    // one is about the mode and the command.
    s.codexModelRefusal = () => null;
    return Object.assign(s, over);
  };

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-codex-slash-'));
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-codex-slash-store-'));
    fs.mkdirSync(productDir('acme'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  const promptOf = (args) => args[args.indexOf('-p') + 1];

  it('runs the command as the whole prompt on a Claude Code row', () => {
    const plan = supervisor().spawnPlan(
      row({ answer: '/context' }), acme(), { continuation: true, engine: DEFAULT_ENGINE },
    );
    expect(plan.command).toBe(true);
    expect(plan.prompt).toBe('/context');
    expect(promptOf(plan.args)).toBe('/context');
  });

  it('will not hand one of the eight to Codex, which has none of them', () => {
    const plan = supervisor().spawnPlan(
      row({ answer: '/context', engine: 'codex' }), acme(), { continuation: true, engine: 'codex' },
    );
    // `plan.prompt` is the value `_spawnCodexWorker` puts in `turnParams.input`,
    // so this is the assertion about what the CLI really receives.
    expect(plan.prompt).toBe('THE BRIEF');
    expect(plan.command).toBe(false);
  });

  it('leaves an ordinary reply alone on both engines', () => {
    for (const engine of [DEFAULT_ENGINE, 'codex']) {
      const plan = supervisor().spawnPlan(
        row({ answer: 'yes, ship it' }), acme(), { continuation: true, engine },
      );
      expect(plan.command).toBe(false);
      expect(plan.prompt).toBe('THE BRIEF');
    }
  });
});

/*
 * THE ARGUMENT FOR TAKING THE SIX MODES AWAY, MEASURED RATHER THAN ASSERTED.
   It is the whole reason the gate is one boolean over both halves of the menu
   and not two booleans, so it is proved here rather than described. */
describe('a permission mode on a Codex row changes nothing about the run', () => {
  let appDir;
  let storeRoot;
  const productDir = (slug) => path.join(storeRoot, slug);
  const acme = () => ({ slug: 'acme', name: 'Acme', dir: productDir('acme'), repoPath: null });

  const supervisor = () => {
    const s = Object.create(Supervisor.prototype);
    s.appDir = appDir;
    s.dataDir = appDir;
    // Her own folder, which the app keeps outside the checkout (w-3dc46f3a67).
    s.userDir = appDir;
    s.config = { sessionArgs: ['--permission-mode', 'auto'], personalSessionArgs: [], personalProducts: [] };
    s._personalSessions = {};
    s.buildBrief = () => 'THE BRIEF';
    s.resumeBrief = () => 'THE RESUME BRIEF';
    s.store = { listProducts: () => [acme()] };
    s.codexModelRefusal = () => null;
    return s;
  };

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-codex-mode-'));
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-codex-mode-store-'));
    fs.mkdirSync(productDir('acme'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  const plans = (engine) => {
    const s = supervisor();
    const base = { id: 'w-1', product: 'acme', title: 'do the thing', answer: 'go', engine };
    return {
      s,
      plain: s.spawnPlan(base, acme(), { continuation: true, engine }),
      moded: s.spawnPlan({ ...base, answerMode: 'bypassPermissions' }, acme(), { continuation: true, engine }),
    };
  };

  it('is the whole difference between two runs on Claude Code', () => {
    const { plain, moded } = plans(DEFAULT_ENGINE);
    expect(plain.args.join(' ')).toContain('--permission-mode auto');
    expect(moded.args.join(' ')).toContain('--permission-mode bypassPermissions');
    expect(moded.args).not.toEqual(plain.args);
  });

  it('reaches nothing Codex is started with, which is why it may not be offered', () => {
    const { s, plain, moded } = plans('codex');
    // `codexThreadParamsFor` is the one place a Codex thread's settings are
    // built, and `plan.prompt` is the only other thing `_spawnCodexWorker`
    // sends. Both are identical with the mode set and without it.
    const params = (plan) => s.codexThreadParamsFor(plan, '/repo', [], null);
    expect(params(moded)).toEqual(params(plain));
    expect(moded.prompt).toBe(plain.prompt);
    // The posture it really runs under is the constant, on both of them.
    expect(params(moded).approvalPolicy).toBe(WORKER_APPROVAL_POLICY);
    expect(params(moded).sandbox).toBe(WORKER_SANDBOX);
    expect(WORKER_APPROVAL_POLICY).toBe('on-request');
    expect(WORKER_SANDBOX).toBe('workspace-write');
    // And there is no field on the thread it could have gone into.
    expect(Object.keys(params(moded))).not.toContain('permissionMode');
  });
});
