// L on a thread that had just landed did nothing, and the words typed after it
// ran as shortcuts.
//
// Power-test-2, issue 24: "Press L, type 'tomorrow 9am', Enter. No 'when'
// box opened (my typing landed on the page, not in a field). Nothing said it
// didn't work."
//
// REPRODUCED in the built renderer on 2026-10-20: L on a thread whose agent is
// waiting on an answer is held by the stopped-agent nudge
// (renderer/src/stopped-agent.ts), which swallows the press and says its
// lesson in a toast. The keyboard is then still on the list, so the next word
// runs as keys: typing "every monday 9am" archived the thread on the "e", and
// the toast that came up was about the archive.
//
// The nudge is right and it stays. E takes a row out and opens nothing, so
// "press again" there costs a keystroke and nothing else. L OPENS A TEXT
// FIELD, and renderer/src/keys.ts has the whole story of what happens to a key
// that opens one and is then swallowed. So on L the lesson rides into the box
// instead: said in the place the decision is made, with nothing left running
// on the list behind it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holdForStoppedAgent, stoppedWarning } from '../renderer/src/stopped-agent.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const snooze = fs.readFileSync(path.join(root, 'renderer/src/components/Snooze.tsx'), 'utf8');
const picker = fs.readFileSync(path.join(root, 'renderer/src/components/SchedulePicker.tsx'), 'utf8');

const waiting = {
  id: 'w-aa01',
  product: 'eval-harness',
  result: 'Done.\n\n## Options\n1. Ship it (recommended)\n2. Change something first',
  wrote: { result: { ts: 2 } },
};

describe('the lesson itself is untouched', () => {
  it('still fires once, on a thread whose agent is waiting', () => {
    expect(holdForStoppedAgent({ rows: [waiting], key: 'L', warned: false, walking: false })?.say)
      .toContain('leaves it stuck');
  });

  // The box is already open in front of you, so the way through is the box.
  it('drops "press again" on L, which is no longer true, and keeps it on E', () => {
    expect(holdForStoppedAgent({ rows: [waiting], key: 'L', warned: false, walking: false }).say)
      .toBe(stoppedWarning('L', { pressAgain: false }));
    expect(stoppedWarning('L', { pressAgain: false })).not.toContain('Press again');
    expect(holdForStoppedAgent({ rows: [waiting], key: 'E', warned: false, walking: false }).say)
      .toBe(stoppedWarning('E'));
    expect(stoppedWarning('E')).toContain('Press again to go ahead.');
  });

  it('is still said once ever, and never during the walk', () => {
    expect(holdForStoppedAgent({ rows: [waiting], key: 'L', warned: true, walking: false })).toBe(null);
    expect(holdForStoppedAgent({ rows: [waiting], key: 'L', warned: false, walking: true })).toBe(null);
  });

  it('still holds E, which opens no field', () => {
    expect(app).toContain("if (nudgeOnStopped([item], 'E')) return;");
  });
});

describe('what L does with it', () => {
  const open = app.slice(app.indexOf('const openSnooze'), app.indexOf('const writeMoment'));

  it('opens the box anyway, rather than returning on the lesson', () => {
    expect(open).toContain("holdForStoppedAgent({ rows, key: 'L'");
    expect(open).not.toContain("if (nudgeOnStopped(rows, 'L')) return;");
    expect(open).toContain("setModal('snooze')");
  });

  it('carries the lesson into the box', () => {
    expect(open).toContain('setSnoozeNote(lesson?.say ?? null)');
    expect(app).toContain('note={snoozeNote ?? undefined}');
  });

  it('still spends the one nudge, so it is never in the way again', () => {
    expect(open).toContain('rememberWarned(localStorage)');
  });

  it('and the box has somewhere to draw it', () => {
    expect(snooze).toContain('note={note}');
    expect(picker).toContain('className="modal-note"');
  });
});
