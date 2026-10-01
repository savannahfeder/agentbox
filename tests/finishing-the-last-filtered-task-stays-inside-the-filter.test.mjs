// FINISHING THE LAST TASK IN A FILTERED INBOX NEVER OPENS ONE THE FILTER HIDES.
//
// Reported 2026-10-01 (w-27759abd33): with the inbox narrowed to one project,
// working down it from inside each task, finishing the last one opened a task
// from a DIFFERENT project. The filter held on the list and let go the moment
// she was processing.
//
// The cause was one word. The box filter (w-aa3fa4cbf0) is applied to the box
// on screen, but the advance (./advance) noted where the finished task sat in,
// and then picked the next one out of, the WHOLE inbox. So the slot after the
// last filtered task was whatever unfiltered task sat there. In the middle of
// the list it could jump too, because the index was counted against a list she
// was not looking at.
//
// Now there is one copy of "what the filter lets through" (`filterBox`), and
// the advance reads the inbox through it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_FILTER, filterBox } from '../renderer/src/box-filter';
import { advanceAfter, nextAfterAdvance } from '../renderer/src/advance';

const row = (id, product, priority = 5) => ({ id, product, priority, labels: [] });

// Her inbox, mixed. The two Gilded rows are what she filtered to.
const inbox = [
  row('w-a1', 'astral'),
  row('w-g1', 'gilded'),
  row('w-a2', 'astral'),
  row('w-g2', 'gilded'),
  row('w-a3', 'astral'),
];
const gilded = { ...NO_FILTER, project: 'gilded' };

// What the app does: note the slot in the box she sees, then reopen from it.
function finish(id, filter, rows = inbox) {
  const shown = filterBox(rows, filter);
  const pending = advanceAfter({ fromTask: true, index: shown.findIndex((i) => i.id === id), id });
  return nextAfterAdvance(shown, pending)?.item.id ?? null;
}

describe('finishing a task with a project filter on', () => {
  // Her case: she has worked down the project and w-g2 is the one left. Before
  // the fix this opened w-a3, from another project.
  it('opens nothing from another project after the last filtered task', () => {
    const lastOneLeft = inbox.filter((i) => i.id !== 'w-g1');
    expect(finish('w-g2', gilded, lastOneLeft)).toBe(null);
  });

  it('still opens the filtered task above when the bottom one is finished first', () => {
    expect(finish('w-g2', gilded)).toBe('w-g1');
  });

  it('opens the next task in the same project from the middle of the list', () => {
    expect(finish('w-g1', gilded)).toBe('w-g2');
  });

  it('never opens a task the filter hides, from any slot', () => {
    for (const r of inbox.filter((i) => i.product === 'gilded')) {
      const next = finish(r.id, gilded);
      if (next) expect(inbox.find((i) => i.id === next).product).toBe('gilded');
    }
  });

  it('holds for a priority filter too, not only a project one', () => {
    const mixed = [row('w-u1', 'astral', 9), row('w-l1', 'astral', 1), row('w-u2', 'gilded', 9)];
    const shown = filterBox(mixed, { ...NO_FILTER, priority: 'urgent' });
    expect(shown.map((i) => i.id)).toEqual(['w-u1', 'w-u2']);
    // In the whole inbox the slot after w-u1 is the Low row.
    const pending = advanceAfter({ fromTask: true, index: 0, id: 'w-u1' });
    expect(nextAfterAdvance(shown, pending)?.item.id).toBe('w-u2');
  });
});

describe('with no filter on, nothing changes', () => {
  it('still opens whatever task takes the finished one\'s place', () => {
    expect(finish('w-g1', NO_FILTER)).toBe('w-a2');
  });

  it('falls back to the one above when the last task in the inbox is finished', () => {
    expect(finish('w-a3', NO_FILTER)).toBe('w-g2');
  });
});

describe('the finished task is never reopened while its write is still pending', () => {
  it('leaves it out even though it is still in the list for a few seconds', () => {
    const shown = filterBox(inbox, gilded);
    const pending = advanceAfter({ fromTask: true, index: 0, id: 'w-g1' });
    expect(nextAfterAdvance(shown, pending)).toEqual({ item: shown[1], index: 0 });
  });
});

describe('the app reads the filtered inbox when it advances', () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

  it('notes the slot in the filtered inbox', () => {
    const start = app.indexOf('const noteAdvance = useCallback(');
    const body = app.slice(start, app.indexOf('\n  }, [', start));
    expect(body).toContain('shownInbox.findIndex');
    expect(body).not.toMatch(/[^n]inbox\.findIndex/);
  });

  it('picks the next task out of the filtered inbox', () => {
    const start = app.indexOf('const pending = advanceRef.current;\n    if (!pending');
    const body = app.slice(start, app.indexOf('\n  }, [', start));
    expect(body).toContain('nextAfterAdvance(shownInbox, pending)');
  });

  it('filters the list on screen through the same rule', () => {
    expect(app).toContain('filterBox(wholeBox, boxFilter)');
    expect(app).toContain('filterBox(inbox, boxFilter)');
  });
});
