// WHICH FIRST RUN A NEW INSTALL GETS, for the test of the one that starts on real
// work against the one before it. Drawn once, at random, the first time a first run
// starts, and kept in a file beside the install id, so a restart never moves an
// install to the other half. An install that set up before this never asks and has
// no word, so the comparison is new installs only.
import fs from 'node:fs';
import path from 'node:path';
import { readEnv } from './product-name.mjs';
import { runningAsAFreshUser } from './fresh-user-home.mts';
import { runningAsADemo } from './demo-world.mts';

export const ARMS: string[] = ['tour', 'classic'];
// The share of new installs that get the new first run ('tour'). 0 until it is approved; 0.5 restarts the test.
export const TOUR_SHARE = 0;
const FILE = 'onboarding-arm';

export function readArm(dir: string | null | undefined): string | null {
  if (!dir) return null;
  try {
    const word = fs.readFileSync(path.join(dir, FILE), 'utf8').trim();
    return ARMS.includes(word) ? word : null;
  } catch { return null; }
}

/** The install's word, drawn and kept the first time it is asked for. */
export function armFor(dir: string, { env = process.env, random = Math.random, share = TOUR_SHARE }: { env?: NodeJS.ProcessEnv; random?: () => number; share?: number } = {}): string {
  const named = readEnv('ONBOARDING', env) as string;
  // A test window or a demo is not a new install: it shows the version asked for, or the new one, and keeps nothing.
  if (runningAsAFreshUser(env) || runningAsADemo(env)) return ARMS.includes(named) ? named : 'tour';
  const kept = readArm(dir);
  // A kept 'tour' is asked for again only by a first run that has not finished, so with no share it is moved to 'classic'.
  if (kept && !(kept === 'tour' && share <= 0 && named !== 'tour')) return kept;
  const word = ARMS.includes(named) ? named : random() < share ? 'tour' : 'classic';
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, FILE), word); } catch {}
  return word;
}
