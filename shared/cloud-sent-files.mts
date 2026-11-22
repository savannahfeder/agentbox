// A FILE THE PERSON SENDS FROM THEIR COMPUTER TO A THREAD'S NEXT CLOUD TURN,
// because a cloud run asked for it (shared/cloud-needs.mts, a file need).
// Pressing Send is the consent. A file that holds sign-ins never goes, whoever
// asks for it, and nothing over 1 GB does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NAME, WAS } from './product-name.mjs';
import { pathHoldsSignIns } from './sign-in-places.mts';

export const SENT_FILE_MAX = 1024 ** 3;

export type FileToSend = { path: string; size: number; error?: undefined } | { error: string; path?: undefined; size?: undefined };

const APP_FOLDERS = [NAME, ...WAS].map((n) => n.toLowerCase());

// An agent reads the code and asks for the app's folder by its current name, but
// a Mac that ran an older build keeps the folder's old name (main/main.mts).
function inAppFolder(file: string, home: string, appData: string): string | null {
  for (const base of [path.join(home, 'Library', 'Application Support'), path.join(home, '.config')]) {
    const rel = path.relative(base, file).split(path.sep);
    if (rel.length > 1 && rel[0] !== '..' && APP_FOLDERS.includes(rel[0].toLowerCase())) {
      const there = path.join(appData, ...rel.slice(1));
      if (fs.existsSync(there)) return there;
    }
  }
  return null;
}

/** The file to send for `asked` (a full or ~/ path), or why it cannot go. `appData` is the app's own data folder. */
export function fileToSend(asked: unknown, { home = os.homedir(), appData }: { home?: string; appData?: string } = {}): FileToSend {
  const raw = String(asked ?? '').trim();
  const full = raw.startsWith('~/') ? path.join(home, raw.slice(2)) : raw;
  if (!path.isAbsolute(full)) return { error: 'That is not a full path on this computer.' };
  let resolved = path.resolve(full);
  if (appData && !fs.existsSync(resolved)) resolved = inAppFolder(resolved, home, appData) ?? resolved;
  let real;
  try { real = fs.realpathSync(resolved); } catch { return { error: `${raw} is not on this computer.` }; }
  if (pathHoldsSignIns(resolved) || pathHoldsSignIns(real)) return { error: 'That file holds sign-ins, so it never goes to the cloud.' };
  let st;
  try { st = fs.statSync(real); } catch { return { error: `${raw} could not be read.` }; }
  if (!st.isFile()) return { error: `${raw} is a folder, not a file.` };
  if (st.size > SENT_FILE_MAX) return { error: `${raw} is over 1 GB, more than a cloud thread can take.` };
  return { path: resolved, size: st.size };
}

/** The files a cloud turn was given to send (AGENTBOX_SEND_FILES), still sendable. */
export function filesSentFor(env: NodeJS.ProcessEnv | null | undefined, opts?: { home?: string }): string[] {
  let list: unknown;
  try { list = JSON.parse(env?.AGENTBOX_SEND_FILES || '[]'); } catch { return []; }
  return Array.isArray(list) ? list.map((f) => fileToSend(f, opts)).filter((f): f is Extract<FileToSend, { size: number }> => Boolean(f.path)).map((f) => f.path) : [];
}
