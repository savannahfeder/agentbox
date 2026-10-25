// Z UNDID THE SNOOZE AND LOOKED LIKE IT HAD DONE NOTHING.
//
// w-874411cc63, 2026-10-11. She replied to one task, moved to another and put
// it off with L. Z "did nothing"; a second Z brought back the reply instead.
// Read off App.tsx: the first Z did undo the snooze, but the snooze's undo
// entry named no row (`brings`), so `shownAfterUndo` opened nothing and she
// stayed on whatever the snooze had moved her to. The task was back in the
// inbox, out of sight. The second Z then reached the reply under it.
//
// Closing an outside agent's row had the same gap: its undo put the row back
// in the inbox and left her where she was.
//
// So an undo that put back exactly one task opens it, the way a reopened close
// already did (w-7eb39d3c97). One that put back several, from a ticked
// selection in the list, opens none of them: there is no one task she meant,
// and they are all back in the list she is looking at.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bringsBack, shownAfterUndo } from '../renderer/src/undo-window.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const one = { id: 'w-1', product: 'p', title: 'The task she put off' };
const two = { id: 'w-2', product: 'p', title: 'Another' };
// She put it off from inside a task, which moved her to the next one. A Z from
// a LIST opens nothing: tests/a-z-in-a-list-puts-the-row-back-without-opening-it.
const ON_A_TASK = { onATask: true };

describe('which task an undo hands back', () => {
  it('is the task, when it put back exactly one', () => {
    expect(bringsBack([one])).toBe(one);
    expect(shownAfterUndo(null, bringsBack([one]), ON_A_TASK)).toEqual({ open: one, compose: false });
  });

  it('is none of them, when it put back several at once', () => {
    expect(bringsBack([one, two])).toBeUndefined();
    expect(shownAfterUndo(null, bringsBack([one, two]), ON_A_TASK)).toEqual({ open: null, compose: false });
  });

  it('is nothing, when it put back nothing', () => {
    expect(bringsBack([])).toBeUndefined();
  });
});

describe('the app names the task on every undo that puts one back', () => {
  it('a snooze names the task it put off', () => {
    expect(app).toMatch(/label: 'Back in your inbox', undoes: 'undo moving it to Later', brings: bringsBack\(picked\),/);
  });

  it('closing an outside agent names its row', () => {
    expect(app).toMatch(/label: `Back in your inbox: \$\{agent\.name\}`, undoes: `[^`]+`, brings: item,/);
  });

  it('closing several ticked tasks opens one only when there was one', () => {
    expect(app).toMatch(/label: `Reopened \$\{targets\.length\} items`, undoes: `[^`]+`, brings: bringsBack\(targets\),/);
  });

  // The case that must not match: undoing a start from Later sends the task
  // back to Later, out of the inbox, so there is nothing there to open.
  it('putting a task back in Later opens nothing', () => {
    expect(app).toMatch(/label: 'Returned to Later', undoes: 'put it back in Later', undid:/);
  });
});
