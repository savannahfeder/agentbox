// AN ASK YOU SENT IS NOT A SECOND ROW BESIDE YOUR THREAD (w-f702d60afe, round six, 2026-11-20).
//
// The PM tester asked Priya to review a thread and read In progress: "Two
// adjacent entries have the same title: PRIYA IS REVIEWING and NOTHING RUNNING
// PAYMENTS API." Then, once Priya handed it back: "It appeared under Done
// today with Reopen, even though Priya just handed it back". One was the
// thread, the other the task the ask sent her. The thread says all of it (who
// has it, and Back from Priya when it returns), so the task you sent stays off
// your In progress and Done. It is still in your conversation with them and in
// Tasks you gave on their page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const block = (start: string) => { const at = app.indexOf(start); return app.slice(at, app.indexOf('}, [', at)); };

describe('an ask you sent', () => {
  it('is kept out of In progress', () => {
    expect(block('const progress = useMemo(() => [')).toMatch(/if \(askIGave\(i, team\?\.me \?\? null\)\) return false;/);
  });
  it('is kept out of Done', () => {
    expect(block('const done = useMemo(() => {')).toMatch(/!askIGave\(i, team\?\.me \?\? null\)/);
  });
});
