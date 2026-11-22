// A FREEZE DURING SETUP OR AN IMPORT, COUNTED AS IT HAPPENS (`app_froze` in
// shared/analytics-events.mts). Somebody stuck in setup may quit and never
// open the app again, so this cannot wait for the next day's count.
import { appCode } from '../shared/analytics-events.mts';

const AFTER_AN_IMPORT_MS = 2 * 60_000;

export interface FreezeCounter {
  /** A count the window or the app sent: setup's steps say where setup is. */
  saw(name: string, count?: unknown): void;
  /** An import of chats started or ended. */
  importing(): void;
  /** A hold that just ended, of the main process or of a window. */
  held(hold: { ms: number; where?: string | null; part: 'main' | 'windows' }): boolean;
}

export function setupFreezeCounter({ track, now = Date.now, minMs = 1000, perLaunch = 5 }: {
  track: (name: string, props: Record<string, number | string>) => unknown;
  now?: () => number;
  minMs?: number;
  perLaunch?: number;
}): FreezeCounter {
  let step: number | null = null;
  let inSetup = false;
  let importsUntil = 0;
  let sent = 0;
  return {
    saw(name, count) {
      if (name === 'first_run_step') { inSetup = true; step = Number.isFinite(count) ? Number(count) : null; }
      if (name === 'first_run_finished') { inSetup = false; step = null; }
    },
    importing() { importsUntil = now() + AFTER_AN_IMPORT_MS; },
    held({ ms, where, part }) {
      if (!(ms >= minMs) || sent >= perLaunch) return false;
      const during = now() <= importsUntil ? 'import' : inSetup ? 'setup' : null;
      if (!during) return false;
      const props: Record<string, number | string> = { seconds: Math.round(ms / 100) / 10, during, heldPart: part };
      if (during === 'setup' && step !== null) props.count = step;
      if (part === 'main' && appCode(where)) props.freezeWhere = where;
      if (!track('app_froze', props)) return false;
      sent += 1;
      return true;
    },
  };
}
