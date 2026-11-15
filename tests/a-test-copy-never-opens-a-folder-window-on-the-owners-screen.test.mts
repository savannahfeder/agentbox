// A TEST COPY NEVER OPENS A FOLDER WINDOW ON THE OWNER'S SCREEN (w-fbe5e95dea, 2026-11-09).
//
// The browser copy asks macOS for its folder window through osascript. A test
// copy started by live.mjs did the same, so the window went to whoever owns
// the Mac and not to the tester driving the tab: two synthetic testers pressed
// "Choose a folder" on the first run and in the composer and saw nothing at
// all. A test copy now draws the app's own folder picker in the tab instead.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('a test copy and the system folder window', () => {
  it('live.mjs starts every copy without system windows', () => {
    expect(read('.claude/skills/verify-agentbox/scripts/live.mjs')).toMatch(/AGENTBOX_NO_SYSTEM_WINDOWS\s*=\s*'1'/);
  });
  it('the browser copy skips the system window when told to, so the tab draws its own picker', () => {
    const bin = read('bin/agentbox.mjs');
    expect(bin).toMatch(/osDialog:\s*process\.env\.AGENTBOX_NO_SYSTEM_WINDOWS\s*\?\s*null\s*:\s*osOpenDialog/);
  });
  it('a copy someone starts by hand still opens the system window', () => {
    expect(read('bin/agentbox.mjs')).toContain('osOpenDialog');
  });
});
