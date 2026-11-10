import {execFile,spawn as spawnChild} from 'node:child_process';
import type {ChildProcess,SpawnOptions} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {windowsRoot} from './shell-path.mts';
const run = promisify(execFile);
interface OpenSourceFileHow {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  spawn?: (command: string, args: string[], options: SpawnOptions) => Pick<ChildProcess, 'once' | 'unref'>;
}
export async function openSourceFile(file: unknown, execute: (file: string, args: string[], options: { timeout: number }) => Promise<unknown> = run, {platform = process.platform, env = process.env, spawn = spawnChild}: OpenSourceFileHow = {}) {
  if (platform === 'win32') {
    if (typeof file === 'string' && /^[\\/]{2}(?![?.][\\/])/.test(file)) throw Error('A file on a network share is not opened from here.');
    // Drive-rooted only, so it cannot resolve against our own folder or read as a Notepad switch.
    if (typeof file !== 'string' || !/^[A-Za-z]:[\\/]/.test(file)) throw Error('Resolve the source file before opening it.');
    // Windows has no open -t, so a source file opens as text in Notepad, by its full path.
    const notepad = path.win32.join(windowsRoot(env), 'System32', 'notepad.exe');
    // Not awaited to its end, since Notepad stays open until the person closes it.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(notepad, [path.win32.normalize(file)], {detached:true, stdio:'ignore'});
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    return;
  }
  if (typeof file !== 'string' || !path.posix.isAbsolute(file)) throw Error('Resolve the source file before opening it.');
  await execute('/usr/bin/open', ['-t', file], {timeout:10000});
}
