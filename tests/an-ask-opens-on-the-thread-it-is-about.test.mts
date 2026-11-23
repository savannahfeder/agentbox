// AN ASK OPENS ON THE THREAD IT IS ABOUT (w-f702d60afe, 2026-11-21).
//
// A review of the hand-off flow: the person asked to help opened the row in
// Needs you and landed on a task page. Its reply box went to the asker, not to
// the agent, the thread was a button away, and the task's own words had to
// explain it ("Theo, write to Sam's agent on Sam's thread. A reply here goes to
// Sam."). The thread page carries the same hand-back, so the ask opens there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const block = app.slice(app.indexOf('// AN ASK OPENS ON THE THREAD IT IS ABOUT.'), app.indexOf('// AN ASK OPENS ON THE THREAD IT IS ABOUT.') + 900);

describe('opening an ask you were asked', () => {
  it('opens the thread it is about, for an open ask on you', () => {
    expect(block).toContain("if (!f?.ask || !team?.me || f.assignee !== team.me || !askIsOpen(f)) return;");
    expect(block).toContain('openTeammateCard(card);');
  });
  it('stays on the task page when this computer has no card for the thread', () => {
    expect(block).toContain('if (!card) return;');
  });
  it('leaves an ask you gave, and one handed back, where they were', () => {
    expect(block).toContain('f.assignee !== team.me');
    expect(block).toContain('!askIsOpen(f)');
  });
  it("tries again when the thread's card arrives after the ask was opened", () => {
    expect(app).toContain('}, [focused?.product, focused?.id, weekCards.length]);');
  });
  it('offers the person asked no Tell me when it is done on that thread', () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    // A row in the thread's ⋯ menu since w-8a8eac7620; null leaves the row out.
    expect(page).toContain("onFollow={following && card.state !== 'done' && !ask ? ");
  });
});
