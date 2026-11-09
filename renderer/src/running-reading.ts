// WHAT THE RUNNING PAGE LEADS WITH, on the desktop and the phone
// (components/Settings.tsx `Reading`, mobile/src/ui/SettingsPages.tsx).
// Every figure is read, never worked out for display; one the computer did
// not measure takes its cell with it rather than showing a nought.

export interface GateReading {
  heavy: number | null; waiting: number | null; pressure: string | null; usedPct: number | null;
  asked: number | null; waited: number | null; refused: number | null; holding?: boolean;
}

export interface RunningFigures {
  cells: Array<{ n: string; of: string }>;
  usedPct: number | null;
  /** The bar is drawn hot unless memory is normal. */
  hot: boolean;
  holding: string | null;
  tally: string | null;
}

/** Null with the memory check off: then the only figure is how many run, which the page already says. */
export function runningFigures({ running, capacity, gate }: { running?: number; capacity?: number; gate?: { on: boolean; reading?: GateReading | null } }): RunningFigures | null {
  const r = gate?.on ? gate.reading : null;
  if (!r) return null;
  const word = r.pressure === 'critical' ? 'Very short' : r.pressure === 'tight' ? 'Tight' : r.pressure ? 'Fine' : null;
  const cells: Array<{ n: string; of: string }> = [];
  if (Number.isFinite(running)) cells.push({ n: String(running), of: capacity ? `of ${capacity} running` : 'running' });
  if (r.heavy !== null) cells.push({ n: String(r.heavy), of: 'heavy at once' });
  if (r.waiting !== null) cells.push({ n: String(r.waiting), of: 'waiting on memory' });
  if (word) cells.push({ n: word, of: 'memory now' });
  // "None turned away" is the part that answers "is this computer coping", so it is said in full.
  const tally = r.asked
    ? `Today: ${r.asked} commands asked, ${r.waited ?? 0} waited, ${r.refused ? `${r.refused} turned away` : 'none turned away'}.`
    : null;
  // A queue that is not moving and says nothing reads as broken.
  const holding = r.holding ? 'New agents wait until memory frees up. Urgent tasks still start.' : null;
  if (!cells.length && !tally && !holding) return null;
  return { cells, usedPct: r.usedPct, hot: r.pressure !== 'normal', holding, tally };
}
