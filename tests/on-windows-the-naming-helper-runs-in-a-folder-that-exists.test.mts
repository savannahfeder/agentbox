// ON WINDOWS THE NAMING HELPER RUNS IN A FOLDER THAT EXISTS.
//
// askSmallModel (main/row-label.mts) is what names rows, catches imported chats
// up and routes messages. It started its one-shot Claude or Codex call with
// `cwd: '/tmp'`. On Windows that path means `\tmp` on the current drive, which
// a stock Windows does not have, so the spawn fails and the helper answers ''
// without a word. Measured on Windows 11, Node 24: a spawn whose cwd is a
// missing folder emits ENOENT (blaming the binary, not the folder); with
// os.tmpdir() it runs. Where some other tool has made a C:\tmp, the call ran
// in that shared folder instead, which is not the neutral place it wants.
//
// Mac and Linux keep `/tmp`: there it is deliberate (a folder that is nobody's
// project), and os.tmpdir() on a Mac is a different, per-user folder.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { smallModelCwd } from '../main/row-label.mts';

describe('where the naming helper runs', () => {
  it('is the temp folder on Windows', () => {
    expect(smallModelCwd('win32', () => 'C:\\Users\\someone\\AppData\\Local\\Temp')).toBe('C:\\Users\\someone\\AppData\\Local\\Temp');
  });

  it('stays /tmp on a Mac and on Linux', () => {
    const never = () => { throw new Error('the temp folder is not asked for off Windows'); };
    expect(smallModelCwd('darwin', never)).toBe('/tmp');
    expect(smallModelCwd('linux', never)).toBe('/tmp');
  });

  it('is a folder that exists on this machine', () => {
    expect(fs.statSync(smallModelCwd()).isDirectory()).toBe(true);
  });
});

const runIn = (cwd: string) => new Promise<string>((resolve) => {
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ok")'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
  child.on('close', () => resolve(out));
});

describe('on a real Windows machine', () => {
  it.runIf(process.platform === 'win32')('a helper started where we now start it runs', async () => {
    expect(smallModelCwd()).toBe(os.tmpdir());
    expect(await runIn(smallModelCwd())).toBe('ok');
  });

  // `/tmp` is on the current drive, so a drive that happens to have a \tmp
  // folder hides the failure; the check needs one without.
  it.runIf(process.platform === 'win32' && !fs.existsSync('/tmp'))('a helper started in /tmp never runs', async () => {
    expect(await runIn('/tmp')).toBe('ENOENT');
  });
});
