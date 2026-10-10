// A LINUX INSTALL OF CLAUDE CODE IS OFTEN A SHELL WRAPPER.
//
// `~/.local/bin/claude` on this machine is a mise shim: a short bash script
// that execs the real binary. The command table lives in that binary. Reading
// the shim finds no commands and the build stops. The reader has to open the
// binary the shim runs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commandBundle, isShellWrapper } from '../scripts/read-claude-commands.mjs';

describe('a shell wrapper is not the bundle', () => {
  it('keeps a real binary and follows a shim to the binary mise names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-shim-'));
    const shim = path.join(dir, 'claude');
    const bin = path.join(dir, 'claude-real');
    fs.writeFileSync(shim, '#!/bin/bash\nexec mise x claude\n');
    fs.writeFileSync(bin, 'not a script');
    try {
      expect(isShellWrapper(shim)).toBe(true);
      expect(isShellWrapper(bin)).toBe(false);
      expect(commandBundle(shim, { which: () => bin })).toBe(fs.realpathSync(bin));
      expect(commandBundle(bin, { which: () => { throw new Error('must not ask'); } })).toBe(fs.realpathSync(bin));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
