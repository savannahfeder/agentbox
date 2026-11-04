// THE PRODUCT LOOP'S PACER RUNS ON A PLAIN NODE.
//
// The daily phone loop's task runs `node .claude/skills/product-loop/scripts/pace.mjs`
// as written. On 2026-11-04, on this Mac's node 22.14, it died with
// ERR_UNKNOWN_FILE_EXTENSION on main/claude-usage.mts before saying run or
// stop, because it imports .mts without re-running itself with the
// type-stripping flags the way workday.mjs does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PACE = path.resolve('.claude/skills/product-loop/scripts/pace.mjs');

describe('pace.mjs run as the task writes it', () => {
  it('reads .mts without the flags being passed', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pace-'));
    const ran = spawnSync(process.execPath, [PACE, '--engine', 'codex', '--home', home], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_OPTIONS: '' } });
    expect(ran.stderr).not.toMatch(/ERR_UNKNOWN_FILE_EXTENSION/);
    expect(ran.stdout).toMatch(/^(run|hold|wait|stop)\b/m);
  });

  it('loads its .mts through the same re-run as workday.mjs', () => {
    expect(fs.readFileSync(PACE, 'utf8')).toMatch(/rerunWithStripTypes\(import\.meta\.url\)/);
  });
});
