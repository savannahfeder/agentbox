// A TASK SENT WHILE ITS TOOL IS OUT OF USAGE SAYS IT IS WAITING, NOT STARTED.
//
// What broke: the pre-deploy breaker (verify-agentbox, 2026-10-15, seen twice)
// sent a Codex task after Codex had run out of usage. The toast said "Started
// in Sandbox", while the thread itself said it was waiting for the limit to
// reset. Nothing had started.
//
// The supervisor already knows: `supervisor.atLimit` names every row whose
// tool has no login left, with the tool and the reset time. The toast now
// reads it for the row just made.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sentLine } from '../renderer/src/compose-says';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

// 4:30pm local, whatever zone the test runs in.
const at430 = new Date(2026, 9, 16, 16, 30).getTime();

describe('the line after Send', () => {
  // The card holds about thirty characters on this line ("Waiting in Sandbox ·
  // Codex is ou…" was cut there on screen), so the reason leads and the
  // project, already obvious from where the task was sent, is left out.
  it('says which tool is out and when it resets, short enough to fit the card', () => {
    const line = sentLine({ to: 'Sandbox', limit: { tool: 'Codex', until: at430 }, now: at430 - 3600_000 });
    expect(line).toBe('Codex is out until 4:30pm · Z to undo');
    expect(line).not.toMatch(/Started/);
    expect(line.replace(' · Z to undo', '').length).toBeLessThanOrEqual(32);
    expect(sentLine({ to: 'Sandbox', limit: { tool: 'Claude Code', until: at430 }, now: at430 - 1000 })
      .replace(' · Z to undo', '').length).toBeLessThanOrEqual(32);
  });

  it('leaves the time out when the tool did not say one', () => {
    expect(sentLine({ to: 'Sandbox', limit: { tool: 'Codex', until: 0 }, now: at430 }))
      .toBe('Codex is out of usage · Z to undo');
  });

  it('leaves the time out once the reset is already past', () => {
    expect(sentLine({ to: 'Sandbox', limit: { tool: 'Claude Code', until: at430 }, now: at430 + 1000 }))
      .toBe('Claude Code is out of usage · Z to undo');
  });

  it('still says Started when the tool has room', () => {
    expect(sentLine({ to: 'Sandbox' })).toBe('Started in Sandbox · Z to undo');
    expect(sentLine({ to: 'Sandbox', limit: null })).toBe('Started in Sandbox · Z to undo');
  });

  it('still says Scheduled for a later start, which waits anyway', () => {
    expect(sentLine({ to: 'Sandbox', when: 'tomorrow 9am', limit: { tool: 'Codex', until: at430 }, now: at430 - 1000 }))
      .toBe('Scheduled in Sandbox · tomorrow 9am · Z to undo');
  });
});

describe('the wiring in App.tsx', () => {
  // Every place a task is made.
  it('passes the new row\'s limit from the fresh snapshot into the line, everywhere a task is made', () => {
    const places = [...app.matchAll(/showToast\(sentLine\(\{/g)].map((m) => m.index);
    expect(places.length).toBeGreaterThanOrEqual(1);
    for (const at of places) expect(app.slice(at, at + 400)).toMatch(/limit: .*atLimit\?\.\[made\.id\]/);
  });
});
