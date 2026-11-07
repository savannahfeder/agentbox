// What Settings says over its pages about the computer, and the version under them.
import { ago } from '../../../renderer/src/phone-rows';
import { Name } from '../../../shared/product-name.mjs';

// The computer sends its copy at least every five minutes (main/phone-inbox.mts).
const AWAY_MS = 15 * 60_000;

type Computer = { computer: { name: string; updated_at: string } | null; loaded: boolean; error: unknown };

export function computerLine(s: Computer, now: number, cloud = false) {
  if (!s.computer) return s.loaded || s.error ? 'Your computer’s settings appear here once Agentbox on it is up to date and signed in to this account.' : undefined;
  const at = Date.parse(s.computer.updated_at) || 0;
  if (now - at <= AWAY_MS) return `From ${s.computer.name}.`;
  // Settings still wait for it; threads do not, when the cloud carries them (phone-rows.ts `computerSays`).
  return `From ${s.computer.name}, last online ${ago(now - at)}. What you change waits for it.${cloud ? ` ${Name} Cloud starts your new threads and replies meanwhile.` : ''}`;
}

/** "Version 0.1.0 (12)": the build number tells one TestFlight build from the next. */
export const versionLine = (version?: string | null, build?: string | null) => `Version ${version ?? ''}${build ? ` (${build})` : ''}`;
