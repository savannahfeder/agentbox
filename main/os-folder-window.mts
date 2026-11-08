// The system's own file window, for the browser version.
//
// A tab cannot open it, but the server behind the tab runs on the same
// computer and can. Answers null when this system has no chooser we know how
// to open, and the screen then draws its own picker (main/folders.mts).

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface OsDialogOptions {
  title?: string;
  defaultPath?: string;
  properties?: string[];
}

export interface OsDialogAnswer { canceled: boolean; filePaths: string[] }

type Run = (cmd: string, args: string[]) => Promise<{ code: number; out: string }>;

const runIt: Run = (cmd, args) => new Promise((resolve) => {
  // No timeout: the window waits on a person, as Electron's does.
  execFile(cmd, args, { encoding: 'utf8' }, (err, out) => {
    const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
    resolve({ code, out: String(out ?? '') });
  });
});

const onPath = (cmd: string): boolean => (process.env.PATH ?? '').split(path.delimiter).some((dir) => {
  if (!dir) return false;
  try { fs.accessSync(path.join(dir, cmd), fs.constants.X_OK); return true; } catch { return false; }
});

const quoted = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export async function osOpenDialog(
  options: OsDialogOptions = {},
  { platform = process.platform, run = runIt, has = onPath }: { platform?: string; run?: Run; has?: (cmd: string) => boolean } = {},
): Promise<OsDialogAnswer | null> {
  const folder = !(options.properties ?? []).includes('openFile');
  const title = options.title ?? (folder ? 'Choose a folder' : 'Choose a file');
  const answer = ({ code, out }: { code: number; out: string }): OsDialogAnswer => {
    const picked = out.trim().replace(/(.)\/$/, '$1');
    return code === 0 && picked ? { canceled: false, filePaths: [picked] } : { canceled: true, filePaths: [] };
  };

  if (platform === 'darwin') {
    const at = options.defaultPath ? ` default location POSIX file ${quoted(options.defaultPath)}` : '';
    // Asked of the frontmost app, so the window comes up over the browser
    // rather than behind it.
    const script = `tell application (path to frontmost application as text) to POSIX path of (choose ${folder ? 'folder' : 'file'} with prompt ${quoted(title)}${at})`;
    return answer(await run('osascript', ['-e', script]));
  }

  if (platform === 'linux' && has('zenity')) {
    const args = ['--file-selection', `--title=${title}`];
    if (folder) args.push('--directory');
    if (options.defaultPath) args.push(`--filename=${options.defaultPath.replace(/\/?$/, '/')}`);
    return answer(await run('zenity', args));
  }

  return null;
}
