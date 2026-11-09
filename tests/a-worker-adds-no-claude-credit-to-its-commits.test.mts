// A WORKER ADDS NO CLAUDE CREDIT TO ITS COMMITS — w-29159aea05.
//
// WHAT BROKE. Commits made by workers kept showing "<person> and claude
// committed" on GitHub after a personal instruction said never to add the
// credit. Claude Code injects its own reminder to end every commit with
// `Co-Authored-By: Claude ...` and every pull request with a "Generated with
// Claude Code" line, and agents followed it over the instruction.
//
// HOW IT WAS MEASURED, 2026-11-09, reading Claude Code 2.1.317: the reminder
// is built from the `attribution` setting. When `attribution.commit` and
// `attribution.pr` are both "", it instead says "do not add attribution lines
// to git commit messages or pull request descriptions", and that it applies
// even if a CLAUDE.md asks for them. The per-spawn settings file outranks the
// person's own settings, so the blank goes there.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { settingsForTheCloud } from '../main/cloud/run.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function workerSettings() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'credit-sup-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, codexHome: path.join(tmp, '.codex') }, store, root, tmp, tmp);
  const file = sup.writeWorkerSettings({ dir: null }, `t-${Math.random()}`);
  const text = fs.readFileSync(file, 'utf8');
  fs.unlinkSync(file);
  return text;
}

describe('the settings every Claude Code worker is started with', () => {
  it('blank the co-author line Claude Code adds to a commit', () => {
    expect(JSON.parse(workerSettings()).attribution.commit).toBe('');
  });

  it('blank the generated-with line it adds to a pull request', () => {
    expect(JSON.parse(workerSettings()).attribution.pr).toBe('');
  });

  it('keep the blank on the way to a cloud run', () => {
    const sent = JSON.parse(settingsForTheCloud(workerSettings()));
    expect(sent.attribution).toEqual({ commit: '', pr: '' });
  });

  it('still carry the rest of the file, so the blank replaced nothing', () => {
    const rules = JSON.parse(workerSettings());
    expect(rules.env.ANTHROPIC_API_KEY).toBe('');
    expect(rules.permissions.additionalDirectories.length).toBeGreaterThan(0);
  });
});
