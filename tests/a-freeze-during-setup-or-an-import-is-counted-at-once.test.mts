// PEOPLE GET STUCK IN SETUP, AND NOTHING SAID SO.
//
// New users often find the app slow to the point of being stuck while setup
// brings in their Claude Code or Codex chats, or just after (the first
// multiplayer onboarding call, 2026-11-21: one user's app did not answer for
// over ten minutes after the import). The daily count of how heavy the app
// was goes the next day the app is used, so somebody who gets stuck in setup
// and quits never sends it, and the freeze recorder only ever watched the
// main process, not the window.
//
// So a hold of a second or more, of the main process or of the window, during
// setup or within two minutes of an import, is counted as it happens: how long,
// which of the two held, during which, setup's step, and the app's own
// function when the main process held. At most five a launch.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { EVENTS, sanitize } from '../shared/analytics-events.mts';
import { setupFreezeCounter } from '../main/setup-freezes.mts';

function counter() {
  const clock = { now: Date.UTC(2026, 10, 22, 9) };
  const sent: [string, Record<string, unknown>][] = [];
  const c = setupFreezeCounter({ track: (name, props) => { sent.push([name, sanitize(name, props)!]); return true; }, now: () => clock.now });
  return { c, clock, sent };
}

describe('a freeze during setup or an import', () => {
  it('is a count on the approved list', () => {
    expect(EVENTS.app_froze).toBe('The app froze during setup or an import');
    expect(sanitize('app_froze', { seconds: 2.5, during: 'import', heldPart: 'windows', count: 3, freezeWhere: 'readChats main/chat-reader.mts:12' }))
      .toEqual({ seconds: 2.5, during: 'import', heldPart: 'windows', count: 3, freezeWhere: 'readChats main/chat-reader.mts:12' });
    expect(sanitize('app_froze', { during: 'my-repo', heldPart: 'her-window' })).toEqual({});
  });

  it('is not counted outside setup or an import', () => {
    const { c, sent } = counter();
    c.held({ ms: 4000, where: 'scan main/claude-models.mts:173', part: 'main' });
    expect(sent).toEqual([]);
  });

  it('is counted during setup, with the step it was on', () => {
    const { c, sent } = counter();
    c.saw('first_run_step', 3);
    c.held({ ms: 1500, where: 'scan main/claude-models.mts:173', part: 'main' });
    expect(sent).toEqual([['app_froze', { seconds: 1.5, during: 'setup', heldPart: 'main', count: 3, freezeWhere: 'scan main/claude-models.mts:173' }]]);
    c.saw('first_run_finished');
    c.held({ ms: 1500, part: 'windows' });
    expect(sent).toHaveLength(1);
  });

  it('is counted while chats come in and for two minutes after, and not later', () => {
    const { c, clock, sent } = counter();
    c.importing();
    c.held({ ms: 3000, part: 'windows' });
    clock.now += 119_000;
    c.held({ ms: 1000, part: 'main', where: '…/her-repo/x.js:1' });
    clock.now += 2_000;
    c.held({ ms: 9000, part: 'main' });
    expect(sent.map(([, p]) => p)).toEqual([
      { seconds: 3, during: 'import', heldPart: 'windows' },
      { seconds: 1, during: 'import', heldPart: 'main' },
    ]);
  });

  it('leaves out holds under a second, and stops at five a launch', () => {
    const { c, sent } = counter();
    c.saw('first_run_step', 1);
    c.held({ ms: 999, part: 'main' });
    for (let i = 0; i < 8; i += 1) c.held({ ms: 1200, part: 'windows' });
    expect(sent).toHaveLength(5);
  });

  it('does not use up a launch\'s five while counts are off', () => {
    const sent: unknown[] = [];
    let on = false;
    const c = setupFreezeCounter({ track: () => { if (on) sent.push(1); return on; } });
    c.saw('first_run_step', 1);
    for (let i = 0; i < 5; i += 1) c.held({ ms: 1200, part: 'main' });
    on = true;
    c.held({ ms: 1200, part: 'main' });
    expect(sent).toHaveLength(1);
  });

  it('is wired to the freeze recorder, the window, setup\'s steps and every import', () => {
    const main = fs.readFileSync('main/main.mts', 'utf8');
    expect(main).toMatch(/froze\.held\(\{ ms: f\.ms, where: f\.where, part: 'main' \}\)/);
    const ipc = fs.readFileSync('main/ipc.mts', 'utf8');
    expect(ipc).toMatch(/froze\?\.saw\(name, count\)/);
    expect(ipc).toMatch(/const whileImporting = [^\n]*\n\s*froze\?\.importing\(\);\n\s*try \{ return await fn\(\.\.\.args\); \} finally \{ froze\?\.importing\(\); \}/);
    for (const channel of ['zero:agent-threads', 'zero:search-agent-threads', 'zero:import-threads', 'zero:import-agents']) {
      expect(ipc, channel).toContain(`ipcMain.handle('${channel}', whileImporting(`);
    }
    expect(ipc).toMatch(/ipcMain\.handle\('zero:window-held'/);
    expect(fs.readFileSync('preload.cjs', 'utf8')).toMatch(/windowHeld: \(ms\) => ipcRenderer\.invoke\('zero:window-held', \{ ms \}\)/);
    expect(fs.readFileSync('renderer/src/window-holds.ts', 'utf8')).toMatch(/type: 'longtask'/);
  });
});
