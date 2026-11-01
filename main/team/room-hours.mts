// MY AGENT HOURS FOR MY PRESENCE ROW (w-3d0fa23ffb). The run ledger is
// tens of thousands of lines on a busy Mac, and the presence row is checked
// every few seconds, so the summary is worked out again only when the ledger
// has changed or the day may have turned. The old run logs are read into the
// ledger once, the first time Rooms asks.
import fs from 'node:fs';
import path from 'node:path';
import { allRuns, backfillRuns, runLedgerPath } from '../run-ledger.mts';
import type { CloudUsageLine } from '../run-ledger.mts';
import { summarizeRuns } from '../../shared/agent-hours.mts';

const RECHECK_MS = 10 * 60_000;

export interface RoomHoursOptions {
  home: string;
  products?: () => { dir?: string | null; slug?: string | null }[];
  cloudLines?: () => CloudUsageLine[] | null | undefined;
  now?: () => number;
  log?: (line: string) => void;
}

export function createRoomHours({ home, products = () => [], cloudLines = () => [], now = Date.now, log = () => {} }: RoomHoursOptions) {
  const file = runLedgerPath(home);
  const marker = path.join(home, 'runs.backfilled');
  let cached: ReturnType<typeof summarizeRuns> | null = null;
  let seen: string | null = null;
  let at = 0;
  let backfilling: Promise<void> | null = null;

  function backfillOnce() {
    if (backfilling || fs.existsSync(marker)) return backfilling;
    backfilling = backfillRuns({ home, products: products(), file, now: now() })
      .then((n) => {
        try { fs.writeFileSync(marker, `${new Date(now()).toISOString()} ${n}\n`); } catch { /* read again next start */ }
        log(`rooms: read ${n} past runs into the run ledger`);
        cached = null;
      })
      .catch((err) => log(`rooms: reading past runs: ${err.message}`));
    return backfilling;
  }

  return {
    backfillOnce,
    summary() {
      backfillOnce();
      let stamp = '';
      try { const s = fs.statSync(file); stamp = `${s.size}:${s.mtimeMs}`; } catch { stamp = 'none'; }
      if (cached && stamp === seen && now() - at < RECHECK_MS) return cached;
      let cloud: CloudUsageLine[] = [];
      try { cloud = cloudLines() ?? []; } catch { cloud = []; }
      cached = summarizeRuns(allRuns({ file, cloudLines: cloud }), { now: now() });
      seen = stamp;
      at = now();
      return cached;
    },
  };
}
