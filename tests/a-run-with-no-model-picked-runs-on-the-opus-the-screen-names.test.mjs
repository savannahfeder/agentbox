// "Also not sure why it said it was on Opus 5, pretty sure it's wrong."
//
// A teammate's run told the person it was on Opus 5 while its reply box and its
// settings both said Opus 5.5. A teammate with no model picked writes no model
// on its runs, and the screen reads "no model" as `opus`. The spawn did not: a
// row naming no model sent nothing of its own, so the run took whatever
// `--model` was left in the workspace config (`claude-opus-5`, pinned by the
// Settings row that was removed on 2026-09-23). The new task card has sent
// `opus` outright since then; teammate runs and agent-filed threads never did.
// Measured with spawnPlan over a config carrying `--model claude-opus-5`: a
// row with no model came out `--model claude-opus-5`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { parseSessionArgs } from '../main/settings.mjs';
import { DEFAULT_CLAUDE_MODEL } from '../shared/engines.mjs';
import { DEFAULT_MODEL, modelLabelOf } from '../renderer/src/models.ts';

describe('a Claude Code run whose thread names no model', () => {
  let appDir;
  const acme = () => ({ slug: 'acme', name: 'Acme', dir: path.join(appDir, 'acme'), repoPath: null });
  const item = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'cut the demo video', ...over });
  const supervisor = (sessionArgs) => {
    const s = Object.create(Supervisor.prototype);
    s.appDir = appDir;
    s.dataDir = appDir;
    s.userDir = appDir;
    s.config = { sessionArgs, personalSessionArgs: [], personalProducts: [] };
    s._personalSessions = {};
    s.buildBrief = () => 'THE BRIEF';
    s.store = { listProducts: () => [acme()] };
    return s;
  };
  const modelOf = (plan) => parseSessionArgs(plan.args).model;

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-model-picked-'));
    fs.mkdirSync(path.join(appDir, 'acme'), { recursive: true });
  });
  afterEach(() => fs.rmSync(appDir, { recursive: true, force: true }));

  it('is the model the reply box names', () => {
    expect(DEFAULT_MODEL).toBe(DEFAULT_CLAUDE_MODEL);
    expect(modelLabelOf(null)).toBe(modelLabelOf(DEFAULT_CLAUDE_MODEL));
  });

  it('runs on opus over an old pinned model in the config', () => {
    const plan = supervisor(['--model', 'claude-opus-5']).spawnPlan(item(), acme());
    expect(modelOf(plan)).toBe('opus');
    expect(plan.args).not.toContain('claude-opus-5');
    expect(plan.model).toBe('opus');
  });

  it('runs on opus when the config names no model either', () => {
    expect(modelOf(supervisor(['--allowedTools', 'mcp__agentbox']).spawnPlan(item(), acme()))).toBe('opus');
    expect(modelOf(supervisor(null).spawnPlan(item(), acme()))).toBe('opus');
  });

  it('still runs on the model a thread names', () => {
    expect(modelOf(supervisor(['--model', 'claude-opus-5']).spawnPlan(item({ model: 'sonnet' }), acme()))).toBe('sonnet');
    expect(modelOf(supervisor(['--model', 'opus']).spawnPlan(item({ model: 'claude-opus-5' }), acme()))).toBe('claude-opus-5');
  });

  it('sends no Claude model to a Codex run', () => {
    const plan = supervisor(['--model', 'claude-opus-5']).spawnPlan(item(), acme(), { engine: 'codex' });
    expect(plan.model ?? null).toBe(null);
  });
});
