// A THREAD WHOSE WORK NEVER REACHED MAIN IS NOT CLOSED UNASKED.
//
// What broke: two threads ended "Done, labelled to ship" with the one option
// "Close this task". The ship then failed (w-fbfc05b348, a merge conflict) or
// the cloud run's work was set aside on `cloud/<id>` (w-21b638d821). The app
// wrote a note saying so, but the row still read "Done", pressing 1 still
// closed it (the number keys never asked whether the offer was stale), and
// nothing ever brought the work back. Measured on the store, 2026-10-23: both
// closed within hours, one rebuilt only after main went red again.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { failureNote } from '../main/ship-queue.mjs';
import {
  KEPT_ASIDE, CLOSED_UNSHIPPED, notShipped, notShippedLine, closeRefusal, closedAnywayNote, shipItAsk,
} from '../shared/not-shipped.mjs';
import { rowSummary } from '../renderer/src/list-rules';
import { liveOption } from '../renderer/src/format';
import { unshippedAsk } from '../renderer/src/close-asks-first';
import { statusCell } from '../renderer/src/status-word';

const DONE = "**Done: In Progress now lists newest sent first, and it's labelled to ship.**\n\nBuilt it.\n\n## Options\n1. Close this task";
const conflict = failureNote('Auto-merging cloud/sandbox/server.mjs\nCONFLICT (content): Merge conflict in cloud/sandbox/server.mjs\n');
const keptAside = `${KEPT_ASIDE}this folder changed on this Mac while the run was in the cloud. Nothing is lost. The folder is as this Mac left it, and the run's version is on the branch cloud/w-21b638d821. Reply to have the agent bring the two together; it will not ship until then.`;
const row = (note, { resultAt = 100, noteAt = 200, ...over } = {}) => ({
  id: 'w-1', product: 'team', title: 'In Progress discoverability', status: 'blocked', result: DONE, note,
  wrote: { body: { ts: 10 }, result: { ts: resultAt }, note: { ts: noteAt } }, ...over,
});

describe('reading whether the work reached main', () => {
  it('reads a failed ship, in the words the ship queue writes', () => {
    expect(notShipped(row(conflict))).toEqual({ why: 'CONFLICT (content): Merge conflict in cloud/sandbox/server.mjs', branch: null, reopened: false });
  });

  it('reads work set aside on its own branch, and names the branch', () => {
    expect(notShipped(row(keptAside))).toMatchObject({ branch: 'cloud/w-21b638d821' });
    expect(shipItAsk(row(keptAside))).toContain('cloud/w-21b638d821');
  });

  it('the cloud run writes its note from the same words', () => {
    const run = fs.readFileSync(new URL('../main/cloud/run.mjs', import.meta.url), 'utf8');
    expect(run).toMatch(/const note = `\$\{KEPT_ASIDE\}\$\{why\}\. Nothing is lost\./);
  });

  it('is over once the agent has spoken since, or the ship went out', () => {
    expect(notShipped(row(conflict, { resultAt: 300 }))).toBe(null);
    expect(notShipped(row('Shipped to main as d202b199.'))).toBe(null);
    expect(notShipped(row("main's tests are green again on GitHub, as of 234ae90."))).toBe(null);
    expect(notShipped(row(closedAnywayNote(row(keptAside))))).toBe(null);
  });

  it('still reads it on a thread the sweep brought back', () => {
    expect(notShipped(row(`${CLOSED_UNSHIPPED}${conflict}`))).toMatchObject({ reopened: true, why: expect.stringContaining('CONFLICT') });
  });
});

describe('what the row says', () => {
  it('is "Not shipped", over the agent\'s "Done"', () => {
    expect(rowSummary(row(conflict), 'inbox')).toBe('Not shipped. CONFLICT (content): Merge conflict in cloud/sandbox/server.mjs');
    expect(rowSummary(row(keptAside), 'inbox')).toBe("Not shipped. The cloud run's work is set aside on cloud/w-21b638d821");
  });

  it('is the agent\'s word again once it has written a newer one', () => {
    expect(rowSummary(row(conflict, { resultAt: 300 }), 'inbox')).toMatch(/^Done: In Progress/);
  });

  it('is "Not shipped" in the Status column and the side panel, with the reason on hover', () => {
    expect(statusCell(row(keptAside), { queued: [] })).toMatchObject({ word: 'Not shipped', mark: 'need', title: "Not shipped. The cloud run's work is set aside on cloud/w-21b638d821" });
    expect(statusCell(row(conflict, { resultAt: 300 }), { queued: [] }).word).not.toBe('Not shipped');
  });

  it('says Working while its agent is on it', () => {
    const session = { itemId: 'w-1', startedAt: 5, where: 'cloud' };
    expect(statusCell(row(conflict), { queued: [], session }).word).not.toBe('Not shipped');
  });
});

describe('pressing a number', () => {
  it('does nothing on a "Close this task" a later note has made stale', () => {
    expect(liveOption(row(conflict), 1)).toBe(null);
  });

  it('still picks an offer nothing has come after', () => {
    expect(liveOption(row(undefined, { wrote: { body: { ts: 10 }, result: { ts: 100 } } }), 1)).toMatchObject({ n: 1, text: 'Close this task' });
  });

  it('goes through that check in the app, for the keys and for voice alike', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const pick = app.slice(app.indexOf('const pickOption = useCallback'), app.indexOf('closesTheTask(option.text)'));
    expect(pick).toContain('liveOption(item, n)');
    expect(pick).not.toContain('itemOptions(item).find');
  });
});

describe('closing it', () => {
  it('asks first, with shipping it as the recommended answer', () => {
    expect(unshippedAsk()).toEqual({
      ask: "This thread's work never reached main.",
      options: [
        { n: 1, text: 'Have the agent ship it', recommended: true, act: 'ship' },
        { n: 2, text: 'Close it anyway', recommended: false, act: 'close' },
      ],
    });
  });

  it('is turned down unasked, from the phone or anywhere else, with the reason', () => {
    expect(closeRefusal(row(conflict))).toEqual({ ok: false, error: 'Not shipped. CONFLICT (content): Merge conflict in cloud/sandbox/server.mjs. Reply to have it shipped, or close it on your computer.' });
  });

  it('goes through once asked, and leaves a note that ends the matter', () => {
    expect(closeRefusal(row(keptAside), { closeUnshipped: true })).toBe(null);
    expect(closedAnywayNote(row(keptAside))).toBe('Closed without its work reaching main. It is still on cloud/w-21b638d821.');
  });

  it('is never in the way of a thread whose work did reach main', () => {
    expect(closeRefusal(row('Shipped to main as d202b199.'))).toBe(null);
    expect(closeRefusal(row(conflict, { resultAt: 300 }))).toBe(null);
    expect(closeRefusal(null)).toBe(null);
    expect(notShippedLine({ status: 'open' })).toBe(null);
  });

  it('is refused in the handler every close goes through, before anything is stopped', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:answer'"));
    const refusal = handler.indexOf('closeRefusal(row, { closeUnshipped })');
    expect(refusal).toBeGreaterThan(0);
    expect(refusal).toBeLessThan(handler.indexOf('supervisor.setThreadPins({ [id]: null })'));
    expect(refusal).toBeLessThan(handler.indexOf('supervisor.stopSession(id)'));
  });

  it('asks in the window before every close, and a ticked batch leaves those threads open', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const close = app.slice(app.indexOf('const markDone = useCallback'), app.indexOf('const resolve = useCallback'));
    expect(close).toMatch(/!unshippedOk && !!notShipped\(item\)/);
    expect(close).toContain("closeUnshipped: true");
    const batch = app.slice(app.indexOf('const batchDone = useCallback'));
    expect(batch.slice(0, batch.indexOf('nudgeOnStopped(targets'))).toMatch(/notShipped\(i\)/);
  });
});
