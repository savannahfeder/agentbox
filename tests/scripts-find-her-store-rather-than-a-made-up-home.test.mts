// SCRIPTS FIND HER STORE RATHER THAN A MADE-UP HOME.
//
// The open source sweep (ec2a58fc, 2026-09-22) replaced every literal path to
// her store with `/Users/you/Zero/accounts/00000000-0000-4000-8000-000000000000`.
// Measured the same evening: 225 lines across the scripts folder named
// `/Users/you`, a folder that does not exist on her Mac, so every measuring and
// screenshot script an agent ran against her real store read nothing. (The same
// sweep commented out a shebang and stopped every Claude agent, which is
// tests/every-agent-dies-when-the-approvals-launcher-cannot-run.test.mjs.)
//
// The scripts now take their paths from scripts/lib/machine-paths.mjs, which
// reads the OS home folder and zero.config.json at run time. Two things pinned:
// the helper resolves to real places, and no script is back to hardcoding a
// home folder in code it runs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME, STORE_ROOT, ACCOUNT_ID, ACCOUNT_ROOT, MACHINERY_PREFIX } from '../scripts/lib/machine-paths.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('the helper resolves to this Mac', () => {
  it('home is the OS home folder, never a placeholder', () => {
    expect(HOME).toBe(os.homedir());
    expect(HOME).not.toMatch(/\/Users\/(you|them|leon)$/);
  });

  it('the account folder sits under the store root and names the account', () => {
    expect(ACCOUNT_ROOT).toBe(path.join(STORE_ROOT, 'accounts', ACCOUNT_ID));
  });

  it('the machinery prefix encodes the account folder exactly as the store does', async () => {
    const { encodeProjectPath } = await import('../main/store/home.mjs');
    expect(`${MACHINERY_PREFIX}agentbox`).toBe(path.join(STORE_ROOT, 'projects', encodeProjectPath(path.join(ACCOUNT_ROOT, 'agentbox'))));
  });
});

// Code lines only: a comment may describe a path, and a fixture drawn in a
// screenshot is meant to be fake. What must not come back is a script that
// RUNS against `/Users/you/...` as if it were a place.
const RUNNING_PATH = /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(process\.env\.\w+\s*\?\?\s*)?['"`]\/Users\/(you|them|leon)\b|\?\?\s*['"`]\/Users\/(you|them|leon)\b|new AgentSchedule\(\s*['"`]\/Users\/|^\s*(const|let)\s+\w+\s*=\s*['"]00000000-0000-4000-8000-000000000000['"]/;

describe('no script runs against a made-up home folder', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|mts|js|cjs)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(repo, 'scripts'));

  it('the pattern catches the swept shapes and not a fixture or a comment', () => {
    expect("const ACCOUNT = '/Users/you/Zero/accounts/x';").toMatch(RUNNING_PATH);
    expect("const REF = process.env.REF ?? '/Users/you/Zero/a.png';").toMatch(RUNNING_PATH);
    expect("  ?? '/Users/you/Zero/accounts/x/astral';").toMatch(RUNNING_PATH);
    expect("const schedule = new AgentSchedule('/Users/you/Zero');").toMatch(RUNNING_PATH);
    expect("const ACCOUNT = '00000000-0000-4000-8000-000000000000';").toMatch(RUNNING_PATH);
    expect("  storePath: '/Users/you/Zero/accounts/00000000',").not.toMatch(RUNNING_PATH);
    expect("// const ACCOUNT = '/Users/you/Zero'").not.toMatch(RUNNING_PATH);
    expect('const ACCOUNT = `${ACCOUNT_ROOT}`;').not.toMatch(RUNNING_PATH);
  });

  it('every script takes its paths from this Mac', () => {
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (RUNNING_PATH.test(line)) offenders.push(`${path.relative(repo, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
