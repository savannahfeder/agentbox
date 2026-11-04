// THE TUTORIAL SAYS YOU CAN LEAVE WHILE THE FIRST AGENT WORKS (w-31c71743b5, 2026-10-29).
//
// What happened: the first thread opened by itself and its tip said the answer
// would appear there, so the founder sat on it for several minutes: "this part
// of the tutorial is very boring because you're just sitting here ... I
// immediately just went to a different tab." Her answer: say it will tell you
// when it is done, through the Agent Tray and notifications, and encourage
// turning notifications on: "maybe this is a feature, not a bug." The tip now
// says you can leave, and offers one sample banner, which is also what makes
// macOS ask whether the app may send them.
//
// The first version promised "the Agent Tray will show you when it's done",
// a name nobody knows, for a tag that shows nothing while an agent works, and
// its sample banner then said "when an agent needs you": two promises, neither
// true yet. The founder: "Why do you tell me one thing will get it done when
// it's not done?" Now the tip promises only what is true at the time: before
// notifications, come back when it is done; after, a notification will tell
// you; and the banner says the same word.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createNotifier } from '../main/notify.mjs';
import { REQUEST_CHANNELS as CHANNELS } from '../shared/bridge-map.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the tip while the first agent works', () => {
  const tour = read('renderer/src/components/Tour.tsx');
  it('before notifications, says only that you can come back', () => {
    expect(tour).toContain('busy: { words: <>This agent is working. You can leave and come back when it’s done</>');
  });
  it('after, says a notification will tell you', () => {
    expect(tour).toContain('You’ll get a notification when it’s done. Explore the app while you wait');
    expect(tour).toContain("step === 'busy' && tried ? BUSY_TOLD : step === 'inPalette' ? <InPalette /> : SAY[step].words");
  });
  it('never names a part of the app it has not shown', () => {
    expect(tour).not.toMatch(/Agent Tray/i);
  });
  it('offers to turn notifications on, once', () => {
    expect(tour).toContain("{step === 'busy' && !tried && <button type=\"button\" className=\"tour-act\" onClick={tryNotifications}>Turn on notifications</button>}");
    expect(tour).toContain("try { localStorage.setItem(NOTIFY_TRIED, '1'); } catch {}");
  });
});

describe('the sample banner', () => {
  it('is a channel the window and a browser tab both answer', () => {
    expect(CHANNELS.notifyTest).toBe('zero:notify-test');
    expect(read('preload.cjs')).toContain("notifyTest: () => ipcRenderer.invoke('zero:notify-test'),");
    expect(read('main/serve.mjs')).toContain("ipcMain.handle('zero:notify-test', () => null);");
  });
  it('shows one banner promising what the tip promised', () => {
    const shown = [];
    class Notification { constructor(o) { this.o = o; } show() { shown.push(this.o); } on() {} close() {} }
    const n = createNotifier({ window: { isFocused: () => true }, Notification, powerMonitor: { getSystemIdleTime: () => 0 } });
    n.sample();
    expect(shown).toHaveLength(1);
    expect(shown[0].body).toBe('Notifications are on. You’ll get one when an agent is done.');
  });
});
