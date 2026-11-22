// CTRL+Q QUIT AT ONCE, SAYING NOTHING, WHILE AN AGENT WAS THINKING (QA
// sessions 44 and 45, 2 of 2).
//
// A tester sent a reply, saw the row read Thinking, and pressed Ctrl+Q within
// five seconds. The window closed with no dialog. Only the window's close
// button asked first; the menu's Quit was Electron's own `role: 'quit'`, which
// goes straight to `app.quit()`. Quit and its keys now ask the same question
// the close button does. A quit nobody pressed (an update's restart, the
// system logging out) still goes ahead without asking.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { askBeforeClosingWhileWorking } from '../main/close-while-working.mts';
import { Supervisor } from '../main/supervisor.mts';
import { HostedRun } from '../main/hosted-run.mts';

const harness = ({ working = 1, answer = 1 } = {}) => {
  const app = Object.assign(new EventEmitter(), { quits: 0, quit() { this.quits += 1; this.emit('before-quit'); } });
  const window = Object.assign(new EventEmitter(), { close() {}, isDestroyed: () => false });
  const asked: unknown[] = [];
  const dialog = { showMessageBox: async (_w: never, options: unknown) => { asked.push(options); return { response: answer }; } };
  const ask = askBeforeClosingWhileWorking({ app, window, dialog, working: () => working, name: 'Agentbox' });
  return { app, window, asked, ask };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Quit from the menu or its keys', () => {
  it('asks while an agent is working, and Cancel keeps the app open', async () => {
    const h = harness({ working: 1, answer: 1 });
    h.ask.quit();
    await settle();
    expect(h.asked).toHaveLength(1);
    expect(h.app.quits).toBe(0);
  });

  it('Quit in the question quits, once', async () => {
    const h = harness({ working: 2, answer: 0 });
    h.ask.quit();
    await settle();
    expect(h.app.quits).toBe(1);
    expect(h.asked).toHaveLength(1);
  });

  it('quits at once when nothing is working', () => {
    const h = harness({ working: 0 });
    h.ask.quit();
    expect(h.app.quits).toBe(1);
    expect(h.asked).toHaveLength(0);
  });

  it('a second press while the question is up does not stack another', async () => {
    const h = harness({ working: 1 });
    h.ask.quit();
    h.ask.quit();
    await settle();
    expect(h.asked).toHaveLength(1);
  });

  it('after Quit was answered, closing the window does not ask again', async () => {
    const h = harness({ working: 1, answer: 0 });
    h.ask.quit();
    await settle();
    const e = { prevented: false, preventDefault() { this.prevented = true; } };
    h.window.emit('close', e);
    expect(e.prevented).toBe(false);
    expect(h.asked).toHaveLength(1);
  });
});

describe('a quit nobody pressed', () => {
  it('an update restart or a logout goes ahead without asking', () => {
    const h = harness({ working: 3 });
    h.app.emit('before-quit');
    const e = { prevented: false, preventDefault() { this.prevented = true; } };
    h.window.emit('close', e);
    expect(e.prevented).toBe(false);
    expect(h.asked).toHaveLength(0);
  });
});

describe('the menu is wired to it', () => {
  const menu = fs.readFileSync(new URL('../main/menu.mts', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../main/main.mts', import.meta.url), 'utf8');

  it('the Quit item is ours, on CommandOrControl+Q, not Electron’s role', () => {
    expect(menu).not.toMatch(/role: 'quit'/);
    expect(menu).toMatch(/accelerator: 'CommandOrControl\+Q', click: \(\) => \(onQuit \?\? \(\(\) => app\.quit\(\)\)\)\(\)/);
  });

  it('main hands the menu the asking quit', () => {
    expect(main).toMatch(/onQuit: \(\) => askingQuit\(\)/);
    expect(main).toMatch(/askingQuit = askBeforeClosingWhileWorking\(\{ app, window, dialog, working: \(\) => supervisor\._stoppedByQuitting\(\), name: Name \}\)\.quit/);
  });
});

// The question says quitting stops the agent. A local Claude Code run held by
// the run host is let go on quit and keeps working (main/run-host.mts), so it
// is not counted; a Codex run, a run nothing holds, and one still starting are.
describe('which runs a quit would stop', () => {
  const hosted = (itemId: string) => {
    const child = Object.create(HostedRun.prototype);
    return { itemId, sessionId: `s-${itemId}`, hosted: true, child, engine: 'claude' };
  };
  const supervisor = (sessions: object[], { preparing = 0, live = {} as Record<string, { sessionId: string }> } = {}) => {
    const s = Object.create(Supervisor.prototype);
    s.sessions = new Map(sessions.map((x, i) => [String(i), x]));
    s._preparing = new Map(Array.from({ length: preparing }, (_, i) => [`p${i}`, { engine: 'codex' }]));
    s._liveSessions = live;
    return s as Supervisor;
  };

  it('leaves out a Claude Code run the run host carries on with', () => {
    expect(supervisor([hosted('a')], { live: { a: { sessionId: 's-a' } } })._stoppedByQuitting()).toBe(0);
  });

  it('counts a hosted run the app has no record to pick back up from', () => {
    expect(supervisor([hosted('a')])._stoppedByQuitting()).toBe(1);
  });

  it('counts a Codex run, a run nothing holds, and one still starting', () => {
    const codex = { itemId: 'c', sessionId: 's-c', engine: 'codex', child: {} };
    const bare = { itemId: 'b', sessionId: 's-b', engine: 'claude', child: {} };
    expect(supervisor([codex, bare], { preparing: 1, live: { c: { sessionId: 's-c' }, b: { sessionId: 's-b' } } })._stoppedByQuitting()).toBe(3);
  });

  it('leaves out cloud runs and typed commands, as the load does', () => {
    const cloud = { itemId: 'x', engine: 'claude', cloud: true, child: {} };
    const command = { itemId: 'y', engine: 'claude', command: true, child: {} };
    expect(supervisor([cloud, command])._stoppedByQuitting()).toBe(0);
  });
});
