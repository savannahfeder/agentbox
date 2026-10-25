// A KEY IN SOMEONE'S CLAUDE CODE SETTINGS NEVER BILLS A WORKER — w-6d8c543a43.
//
// WHAT BROKE. The app scrubs ANTHROPIC_* from a worker's environment so a run
// bills the person's subscription and never a metered key. But Claude Code
// also reads keys for itself, out of `env` in ~/.claude/settings.json and in a
// project's committed .claude/settings.json, and out of `apiKeyHelper`. The
// setups check (verify-agentbox, layer `setups`) ran the real Claude Code
// 2.1.301 on homes shaped like that, against the stand-in model, and every
// request was signed with the key: `api-key`, not the plan.
//
// HOW IT WAS MEASURED, 2026-10-15, scripts/scratch/settings-key-override.mjs:
// the same homes, with `--settings` carrying `env.ANTHROPIC_API_KEY: ""` and
// `apiKeyHelper: ""`, signed every request with the login and answered. The
// per-spawn settings file is the highest layer a person's own files cannot
// outrank, so that is where the blank goes.
//
// THE CASE THAT MUST NOT MATCH: ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN in
// a person's settings are a gateway they chose on purpose (a company proxy,
// another provider behind Claude Code). Blanking those would stop their
// Claude Code working at all, so the file leaves them alone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { harnessFor } from '../main/harnesses.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function workerSettings() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'key-sup-'));
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, codexHome: path.join(tmp, '.codex') }, store, root, tmp, tmp);
  const file = sup.writeWorkerSettings({ dir: null }, `t-${Math.random()}`);
  const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.unlinkSync(file);
  return rules;
}

describe('the settings every Claude Code worker is started with', () => {
  it('blank an API key a person left in their own or a project\'s settings file', () => {
    const rules = workerSettings();
    expect(rules.env).toBeDefined();
    expect(rules.env.ANTHROPIC_API_KEY).toBe('');
  });

  it('turn off a key helper, which signs requests with a metered key the same way', () => {
    expect(workerSettings().apiKeyHelper).toBe('');
  });

  it('leave a gateway the person chose alone: no base address or token is touched', () => {
    const { env } = workerSettings();
    expect(Object.keys(env)).not.toContain('ANTHROPIC_BASE_URL');
    expect(Object.keys(env)).not.toContain('ANTHROPIC_AUTH_TOKEN');
  });

  it('still carry the store folder, so the blank did not replace the rules', () => {
    expect(workerSettings().permissions.additionalDirectories.length).toBeGreaterThan(0);
  });
});

describe('the small calls that name rows and sort messages', () => {
  it('carry the same blank inline, because they read the same settings files', () => {
    const args = harnessFor('claude').smallModelArgs('name this', 'haiku');
    const at = args.indexOf('--settings');
    expect(at).toBeGreaterThan(-1);
    const inline = JSON.parse(args[at + 1]);
    expect(inline.env.ANTHROPIC_API_KEY).toBe('');
    expect(inline.apiKeyHelper).toBe('');
    expect(args.slice(0, 4)).toEqual(['-p', 'name this', '--model', 'haiku']);
  });
});
