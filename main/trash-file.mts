// THE COMPUTER'S OWN TRASH, FOR THE COPY OF THE APP THAT HAS NO ELECTRON.
//
// The desktop app moves a file with Electron's shell.trashItem. The browser
// copy (bin/agentbox.mjs) has no Electron, so it moves the file itself: on a
// Mac through Finder, which keeps "Put Back"; on Linux into the desktop's
// Trash as the freedesktop.org spec lays it out, so a file manager can restore it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const FINDER_MS = 30_000;

// HOME can be set to anything; the account's own home cannot.
function signedInHome(env: NodeJS.ProcessEnv): string | null {
  try { return os.userInfo().homedir; } catch { return env.USER ? path.join('/Users', env.USER) : null; }
}

const finderDelete =(from: string): Promise<void> => new Promise<void>((resolve, reject) => {
  execFile('osascript', ['-e', 'on run argv', '-e', 'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)', '-e', 'end run', from], { timeout: FINDER_MS }, (err) => (err ? reject(new Error(`Finder would not move it to the Trash: ${err.message}`)) : resolve()));
});

/**
 * Moves `file` to the Trash; throws when it could not. Answers where it
 * landed, except through Finder. Finder's Trash is always the signed-in
 * person's, so a copy with a home of its own (a test copy) keeps its own.
 */
export async function trashFile(file: string, { platform = process.platform, home = os.homedir(), realHome, env = process.env, now = new Date(), finder = finderDelete }: { platform?: NodeJS.Platform; home?: string; realHome?: string; env?: NodeJS.ProcessEnv; now?: Date; finder?: (from: string) => Promise<void> } = {}): Promise<string | void> {
  const from = path.resolve(file);
  if (!fs.existsSync(from)) throw new Error(`${path.basename(from)} is not there`);
  if (platform === 'darwin') {
    const real = realHome ?? signedInHome(env);
    if (!real || path.resolve(home) === path.resolve(real)) return finder(from);
    const trash = path.join(home, '.Trash');
    fs.mkdirSync(trash, { recursive: true });
    const ext = path.extname(from);
    const stem = path.basename(from, ext);
    let name = path.basename(from);
    for (let n = 2; fs.existsSync(path.join(trash, name)); n += 1) name = `${stem} ${n}${ext}`;
    fs.renameSync(from, path.join(trash, name));
    return path.join(trash, name);
  }
  const trash = path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'Trash');
  fs.mkdirSync(path.join(trash, 'files'), { recursive: true });
  fs.mkdirSync(path.join(trash, 'info'), { recursive: true });
  const ext = path.extname(from);
  const stem = path.basename(from, ext);
  let name = path.basename(from);
  for (let n = 2; fs.existsSync(path.join(trash, 'files', name)) || fs.existsSync(path.join(trash, 'info', `${name}.trashinfo`)); n += 1) name = `${stem}.${n}${ext}`;
  const stamp = now.toISOString().slice(0, 19);
  fs.writeFileSync(path.join(trash, 'info', `${name}.trashinfo`), `[Trash Info]\nPath=${encodeURI(from)}\nDeletionDate=${stamp}\n`);
  try {
    fs.renameSync(from, path.join(trash, 'files', name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') { fs.rmSync(path.join(trash, 'info', `${name}.trashinfo`), { force: true }); throw err; }
    // Another disk: copied across, then the original goes.
    await fs.promises.copyFile(from, path.join(trash, 'files', name));
    await fs.promises.rm(from);
  }
  return path.join(trash, 'files', name);
}
