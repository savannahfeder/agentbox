// A HANDOFF GOES TO THE BEST CODEX MODEL AND FIXES ONLY WHAT IS LIKELY AND BAD.
//
// w-ca34944396, 2026-10-29. Changes written by Claude are handed to Codex to
// test and review, and the reviewer flags bugs that are possible but almost
// never happen. Claude fixes each, the reviewer finds the next, and the loop
// never ends. The `handoff` skill makes the reviewer score every finding (how
// often x how bad, 1 to 10 each), fixes only products of 5 or more, files the
// rest, and stops after two rounds. Before this test there was no handoff skill
// and nothing in CLAUDE.md or interrogate about rare cases.
//
// The first version named gpt-6.1-sol in the command. The maintainer's reply:
// use it only while it is the best one. So the model is read at handoff time:
// the first model Codex's own list offers this login, which Codex orders newest
// frontier model first.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bestCodexModel } from '../scripts/codex-best-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const skill = () => read('.claude', 'skills', 'handoff', 'SKILL.md');
const codexCalls = () => skill().split('\n').filter((l) => /^\s*codex exec /.test(l));
const cache = (...models) => () => ({ models });

describe('which model the handoff goes to', () => {
  it('is the first model Codex lists for this login', () => {
    const read = cache(
      { slug: 'gpt-6-astra', visibility: 'list', priority: 2 },
      { slug: 'gpt-6.1-sol', visibility: 'list', priority: 1 },
      { slug: 'gpt-5.5', visibility: 'list', priority: 9 },
    );
    expect(bestCodexModel({ home: '/nowhere', read })).toBe('gpt-6.1-sol');
  });

  it('moves on by itself when Codex ranks a newer model first', () => {
    const read = cache(
      { slug: 'gpt-6.1-sol', visibility: 'list', priority: 1 },
      { slug: 'gpt-7-nova', visibility: 'list', priority: 0 },
    );
    expect(bestCodexModel({ home: '/nowhere', read })).toBe('gpt-7-nova');
  });

  it('never picks a model Codex hides, or one with no rank, over a ranked one', () => {
    const read = cache(
      { slug: 'codex-auto-review', visibility: 'hide', priority: 0 },
      { slug: 'gpt-unranked', visibility: 'list', priority: null },
      { slug: 'gpt-6.1-sol', visibility: 'list', priority: 5 },
    );
    expect(bestCodexModel({ home: '/nowhere', read })).toBe('gpt-6.1-sol');
  });

  it('answers nothing when this machine cannot say', () => {
    expect(bestCodexModel({ home: '/nowhere', read: () => null })).toBeNull();
    expect(bestCodexModel({ home: '/nowhere', read: cache() })).toBeNull();
  });

  it('prints the model from the real Codex home, and fails out loud without one', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const script = path.join(root, 'scripts', 'codex-best-model.mjs');
    const env = { ...process.env, CODEX_HOME: home };

    const none = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    expect(none.status).not.toBe(0);
    expect(none.stdout).toBe('');
    expect(none.stderr).toMatch(/codex/i);

    fs.writeFileSync(path.join(home, 'models_cache.json'), JSON.stringify({
      models: [{ slug: 'gpt-6.1-sol', visibility: 'list', priority: 1 }],
    }));
    expect(execFileSync(process.execPath, [script], { env, encoding: 'utf8' })).toBe('gpt-6.1-sol\n');
  });
});

describe('the handoff skill', () => {
  it('exists and can be picked when someone says "hand this off"', () => {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill())[1];
    expect(fm).toMatch(/^name: handoff$/m);
    expect(fm).not.toMatch(/disable-model-invocation/);
  });

  it('runs whichever model is best now, able to run tests but not with full access', () => {
    const calls = codexCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/ -m "\$MODEL" /);
      expect(call).not.toMatch(/gpt-/);
      expect(call).toMatch(/ -s workspace-write /);
      expect(call).not.toMatch(/danger-full-access|dangerously/);
    }
    expect(skill()).toMatch(/^MODEL=\$\(node scripts\/codex-best-model\.mjs\)/m);
  });

  it('never hands Codex a key', () => {
    expect(skill()).not.toMatch(/(OPENAI|ANTHROPIC)_API_KEY=/);
  });

  it('fixes a finding scoring 5 or more and leaves the code alone below 5', () => {
    const text = skill();
    expect(text).toMatch(/how often/i);
    expect(text).toMatch(/how bad/i);
    expect(text).toMatch(/5 or more/);
    expect(text).toMatch(/below 5/);
    expect(text).toMatch(/leave the code alone/i);
  });

  it('stops after two rounds', () => {
    expect(skill()).toMatch(/two rounds/i);
  });
});

describe('the same rule everywhere a change is reviewed or fixed', () => {
  it('tells every agent in CLAUDE.md not to build for cases nobody asked about', () => {
    expect(read('CLAUDE.md')).toContain('Do not design for rare or future cases nobody asked about.');
  });

  it('asks the interrogate reviewers for the same two scores', () => {
    const text = read('.claude', 'skills', 'interrogate', 'SKILL.md');
    expect(text).toMatch(/how often/i);
    expect(text).toMatch(/how bad/i);
  });
});
