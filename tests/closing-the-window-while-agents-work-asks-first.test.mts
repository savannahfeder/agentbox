// CLOSING THE WINDOW WHILE AN AGENT WORKED QUIT AT ONCE, SAYING NOTHING
// (QA batch 011, F-165).
//
// A tester sent a task and clicked the window's close button as the row read
// WORKING. The app quit with no dialog; fourteen seconds later no Agentbox or
// codex process was left and the task folder had no changes. The agent only
// carried on once the app was opened again. Closing the window quits
// (`window-all-closed` in main/main.mts), so the close button now asks first
// while agents are working, and only then.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { askBeforeClosingWhileWorking, closeQuestion } from '../main/close-while-working.mts';

const harness = ({ working = 1, answer = 1 } = {}) => {
  const app = new EventEmitter();
  const window = new EventEmitter();
  const asked = [];
  let closes = 0;
  window.close = () => { closes += 1; const e = { prevented: false, preventDefault() { this.prevented = true; } }; window.emit('close', e); return e; };
  window.isDestroyed = () => false;
  const dialog = { showMessageBox: async (_w, options) => { asked.push(options); return { response: answer }; } };
  askBeforeClosingWhileWorking({ app, window, dialog, working: () => working, name: 'Agentbox' });
  const press = () => { const e = { prevented: false, preventDefault() { this.prevented = true; } }; window.emit('close', e); return e; };
  return { app, window, asked, press, closes: () => closes };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the window’s close button', () => {
  it('asks while an agent is working, and Cancel keeps the window', async () => {
    const h = harness({ working: 1, answer: 1 });
    expect(h.press().prevented).toBe(true);
    await settle();
    expect(h.asked).toHaveLength(1);
    expect(h.closes()).toBe(0);
  });

  it('Quit closes it, without asking a second time', async () => {
    const h = harness({ working: 2, answer: 0 });
    h.press();
    await settle();
    expect(h.closes()).toBe(1);
    expect(h.asked).toHaveLength(1);
  });

  it('closes at once when nothing is working', () => {
    const h = harness({ working: 0 });
    expect(h.press().prevented).toBe(false);
    expect(h.asked).toHaveLength(0);
  });

  it('does not ask for a quit asked for by name: the menu, the keys, an update', () => {
    const h = harness({ working: 3 });
    h.app.emit('before-quit');
    expect(h.press().prevented).toBe(false);
    expect(h.asked).toHaveLength(0);
  });

  it('a second press while the question is up does not stack another', async () => {
    const h = harness({ working: 1 });
    h.press();
    h.press();
    await settle();
    expect(h.asked).toHaveLength(1);
  });
});

describe('what it says', () => {
  it('one agent', () => {
    expect(closeQuestion(1, 'Agentbox')).toMatchObject({
      message: 'An agent is still working',
      detail: 'Quitting Agentbox stops it. It picks up where it left off when you open Agentbox again.',
      buttons: ['Quit', 'Cancel'],
      cancelId: 1,
      defaultId: 1,
    });
  });

  it('several', () => {
    expect(closeQuestion(3, 'Agentbox').message).toBe('3 agents are still working');
    expect(closeQuestion(3, 'Agentbox').detail).toBe('Quitting Agentbox stops them. They pick up where they left off when you open Agentbox again.');
  });
});

describe('the app window uses it', () => {
  it('counting the agents running on this computer', () => {
    const main = fs.readFileSync(new URL('../main/main.mts', import.meta.url), 'utf8');
    expect(main).toMatch(/askBeforeClosingWhileWorking\(\{ app, window, dialog, working: \(\) => supervisor\._load\(\), name: Name \}\)/);
  });
});
