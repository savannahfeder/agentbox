// A TEAMMATE'S THREAD KEEPS ITS LINKS ACROSS A SYNC (w-f702d60afe, round eight, 2026-11-20).
//
// Both round-eight testers pressed file links on a teammate's thread and got
// nothing, five times each ("Updated confirmation page link cannot be pressed").
// Read in TeammateThread: the markdown's link components were rebuilt whenever
// the thread's lines changed, and the lines are read again on every sync, every
// few seconds. A new component type is a new element, so React threw every link
// away and drew it again, and a press that landed in between went nowhere.
// The handlers now read what changes through refs, so the components are made
// once per project and folder.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

describe("a teammate's thread page", () => {
  it('builds its link components once per project and folder', () => {
    expect(page).toMatch(/return \(text: string\) => <ReactMarkdown[^\n]*\n\s*\}, \[product, dir\]\);/);
  });
  it('reads the lines and the app\'s callbacks through refs, not as dependencies', () => {
    expect(page).toMatch(/const linesHere = useRef<LedgerLine\[\]>\(\[\]\);/);
    expect(page).toMatch(/const calls = useRef\(\{ onOpenDoc, onNotice \}\);/);
    expect(page).not.toMatch(/\[product, onOpenDoc, work\?\.lines\]/);
  });
});
