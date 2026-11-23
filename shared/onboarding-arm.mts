// WHICH FIRST RUN AN INSTALL GOT, kept in a file beside the install id and sent with
// every count, so the daily report can still split installs by onboarding. Every
// first run is the split view ('tour') now; 'classic' is only ever read back from an
// install that went through the old one.
import fs from 'node:fs';
import path from 'node:path';
import { runningAsAFreshUser } from './fresh-user-home.mts';
import { runningAsADemo } from './demo-world.mts';

export const ARMS: string[] = ['tour', 'classic'];
const FILE = 'onboarding-arm';

export function readArm(dir: string | null | undefined): string | null {
  if (!dir) return null;
  try {
    const word = fs.readFileSync(path.join(dir, FILE), 'utf8').trim();
    return ARMS.includes(word) ? word : null;
  } catch { return null; }
}

/** Asked when a first run starts, so the install is written down as having got this one. */
export function armFor(dir: string, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): string {
  // A test window or a demo is not a new install and keeps nothing.
  if (runningAsAFreshUser(env) || runningAsADemo(env)) return 'tour';
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, FILE), 'tour'); } catch {}
  return 'tour';
}
