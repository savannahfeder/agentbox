import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

type Run = (cmd: string, args: string[], o: { timeout: number }) => Promise<unknown>;
const runFile = promisify(execFile) as unknown as Run;

/**
 * `src` copied to `to`, sharing its bytes where the disk can. On a Mac, Node's
 * COPYFILE_FICLONE writes a full copy (measured on APFS with Node 22 and with
 * Electron's Node 24), so there it is `cp -c`, which clones.
 */
export async function cloneFile(src: string, to: string, { platform = process.platform, run = runFile }: { platform?: NodeJS.Platform; run?: Run } = {}): Promise<void> {
  if (platform === 'darwin') {
    try {
      await run('/bin/cp', ['-c', src, to], { timeout: 60_000 });
      return;
    } catch { fs.rmSync(to, { force: true }); }
  }
  await fs.promises.copyFile(src, to, fs.constants.COPYFILE_FICLONE);
}
