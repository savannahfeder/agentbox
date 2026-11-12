// What a click may open for the person. shell.openPath is a double-click, so a
// file a worker wrote that macOS runs or launches is shown in Finder instead:
// opened, it would run as the person, outside the worker's sandbox.
import fs from 'node:fs';
import path from 'node:path';

const RUNS = new Set([
  '.command', '.tool', '.terminal', '.app', '.workflow', '.action', '.prefpane', '.saver', '.qlgenerator', '.kext', '.bundle', '.plugin',
  '.fileloc', '.webloc', '.inetloc', '.scpt', '.scptd', '.applescript', '.pkg', '.mpkg', '.jar', '.osax',
]);

export function opensAProgram(p: string): boolean {
  let real: string;
  let st: fs.Stats;
  try { real = fs.realpathSync(p); st = fs.statSync(real); } catch { return false; }
  if (RUNS.has(path.extname(real).toLowerCase()) || RUNS.has(path.extname(p).toLowerCase())) return true;
  return st.isFile() && (st.mode & 0o111) !== 0;
}

export interface OpeningShell { openPath?(p: string): Promise<string>; showItemInFolder?(p: string): void }

/** Opens a file for the person, or shows it in Finder when opening would run it. */
export async function openForThePerson(shell: OpeningShell, p: string): Promise<string> {
  if (opensAProgram(p)) { shell.showItemInFolder?.(p); return ''; }
  return (await shell.openPath?.(p)) ?? '';
}
