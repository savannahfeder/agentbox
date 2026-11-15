// HOME'S IN PROGRESS OPENS IN PROGRESS (w-fbe5e95dea, 2026-11-10).
//
// A round-six tester clicked "In progress 1" on Home and got Needs you, with
// In progress as a tab they still had to click. On the team layout the door
// opened the inbox and picked their own board, which starts on Needs you. It
// now goes to their own In progress tab, as the tab strip does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe("Home's In progress door", () => {
  it('opens your own In progress on the team layout too', () => {
    const line = app.split('\n').find((l) => l.includes('onDoor={(d) =>'));
    expect(line).toBeDefined();
    expect(line).toMatch(/d === 'progress'\) \{ openView\('inbox'\); if \(teamMode\) goMine\('progress'\); else openView\('progress'\); \}/);
  });
});
