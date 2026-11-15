// A STAND-IN CLAUDE REPORTS USAGE, SO A TEST COPY CAN LOOK BACK.
//
// What was missing (w-cad26266fb, 2026-11-09): a teammate's look-back runs only
// while the plan's usage reading has room, and the usage corner reads it with a
// `get_usage` control request. The stand-in ignored every control request, so a
// test copy never had a reading and no power tester could ever meet a
// look-back. Measured: runClaudeUsage against the stand-in timed out with no
// limits.
//
// Now the stand-in answers `get_usage` from the power test's world.json: its
// `usage` percents, 12% and 25% when unset, and 100% on a login the world has out.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaudeUsage } from '../main/claude-usage-process.mts';
import { readUsageReport } from '../shared/claude-usage.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(root, 'scripts', 'lib', 'stub-claude-worker.mjs');

function read(world, login = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-world-'));
  const file = path.join(dir, 'world.json');
  if (world) fs.writeFileSync(file, JSON.stringify(world));
  const plan = path.join(dir, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ world: file }));
  const env = { ...process.env, STUB_CLAUDE_PLAN: plan };
  delete env.CLAUDE_CONFIG_DIR;
  if (login) env.CLAUDE_CONFIG_DIR = path.join(dir, login);
  return new Promise((resolve) => {
    runClaudeUsage(process.execPath, [STUB, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json'],
      { cwd: dir, env, timeout: 8000, maxBuffer: 1e6, encoding: 'utf8' },
      (err, out) => resolve(err ? err.message : Object.fromEntries(readUsageReport(out).map((l) => [l.span, l.percent]))));
  });
}

describe('the stand-in answers the usage corner', () => {
  it('reports low usage when the world says nothing', async () => {
    expect(await read(null)).toEqual({ session: 12, week: 25 });
  });

  it('reports the percents the world sets', async () => {
    expect(await read({ usage: { session: 70, week: 61 } })).toEqual({ session: 70, week: 61 });
  });

  it('reports a login the world has out as full, and leaves another login alone', async () => {
    expect(await read({ out: ['.claude-second'] }, '.claude-second')).toEqual({ session: 100, week: 100 });
    expect(await read({ out: ['.claude-second'] }, '.claude')).toEqual({ session: 12, week: 25 });
  });
});
