// Main went red on GitHub's macOS runner on 2026-11-24, 17 tests in 5 files,
// every one at the ship sandbox's port scan: "Command failed: /usr/sbin/lsof
// -nP -iTCP -sTCP:LISTEN -Fn". lsof exits 1 when it finds nothing, and a fresh
// runner has no listening TCP port; a person's Mac always has some, so it
// passed there. Measured on Linux in an empty network namespace: no listener,
// exit 1 and no output; one listener, exit 0 and "n127.0.0.1:4321".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listening } from '../scripts/lib/branch-sandbox.mjs';

let tmp: string;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-lsof-')); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

/** A stand-in lsof that prints `out` and exits with `status`. */
function lsof(name: string, out: string, status: number) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, `#!/bin/sh\nprintf '%s' '${out}'\nexit ${status}\n`, { mode: 0o755 });
  return file;
}

describe('the ports the sandbox keeps a branch off', () => {
  it('are none when nothing is listening, as on a fresh runner', () => {
    expect(listening(lsof('none', '', 1))).toEqual([]);
  });

  it('are the ones lsof names when something is listening', () => {
    expect(listening(lsof('two', 'p2375\nn127.0.0.1:4321\np2400\nn*:5050\nn[::1]:4321\n', 0))).toEqual([4321, 5050]);
  });

  it('still stop the sandbox when lsof fails for another reason', () => {
    expect(() => listening(lsof('broken', '', 2))).toThrow(/lsof/);
    expect(() => listening(path.join(tmp, 'missing'))).toThrow();
  });
});
