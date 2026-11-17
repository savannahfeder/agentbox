// Daily security review, 2026-11-17. The pre-push hook runs the public check
// from the branch's own folder while git still carries the push token
// (GIT_AGENTBOX_GITHUB_TOKEN, main/github-push-sign-in.mts), and the check
// started `claude -p` there with that environment. `claude -p` loads a
// project's .claude/settings.json without asking: on a scratch folder with a
// committed SessionStart hook and a dummy token, the hook wrote the token out.
// So a worker whose branch shipped could read the push token. The model now
// starts in an empty folder of its own, with user settings only and no GIT_*.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reviewByModel } from '../scripts/check-before-public.mjs';

const saved = { PATH: process.env.PATH, token: process.env.GIT_AGENTBOX_GITHUB_TOKEN, dir: process.env.GIT_DIR };
let bin = '';
afterEach(() => {
  process.env.PATH = saved.PATH;
  if (saved.token === undefined) delete process.env.GIT_AGENTBOX_GITHUB_TOKEN; else process.env.GIT_AGENTBOX_GITHUB_TOKEN = saved.token;
  if (saved.dir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = saved.dir;
  if (bin) fs.rmSync(bin, { recursive: true, force: true });
});

describe("the public check's model runs outside the branch, without the push token", () => {
  it('starts in an empty folder that is not the push folder, with user settings only and no git variable', async () => {
    bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'));
    const record = path.join(bin, 'record.json');
    fs.writeFileSync(path.join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({
  cwd: process.cwd(), entries: fs.readdirSync(process.cwd()), args: process.argv.slice(2),
  git: Object.keys(process.env).filter((k) => k.startsWith('GIT_')),
}));
process.stdin.resume();
process.stdin.on('end', () => process.stdout.write('{"findings":[]}'));
`, { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
    process.env.GIT_AGENTBOX_GITHUB_TOKEN = 'dummy-not-a-real-token';
    process.env.GIT_DIR = '/nowhere/.git';

    const out = await reviewByModel(new Map([['a.txt', [[1, 'hello']]]]));
    expect(out).toMatchObject({ findings: [], ran: true });
    const seen = JSON.parse(fs.readFileSync(record, 'utf8'));
    expect(path.relative(fs.realpathSync(process.cwd()), seen.cwd).startsWith('..')).toBe(true);
    expect(seen.entries).toEqual([]);
    expect(seen.git).toEqual([]);
    expect(seen.args.join(' ')).toContain('--setting-sources user');
    expect(fs.existsSync(seen.cwd)).toBe(false);
  });
});
