// NOTHING INTERRUPTS HER WHILE SHE IS IN AGENTBOX.
//
// What the app did before this, at renderer/src/App.tsx: for every fresh inbox
// arrival, up to three per batch, `new Notification.show`, with no idea
// whether the window had focus. So the two failures were the two halves of her
// sentence. A banner fired while she was reading the very row it was about,
// which is the flow cost she is naming. And a burst of finishes fired three
// banners at once, which is a ledger in Notification Center and makes her do
// the counting (CLAUDE.md: THE SIDEBAR CARRIES THE LAST FEW THINGS, NOT A
// LEDGER).
//
// The rule is shared/notify-rules.mjs and the lifetime is main/notify.mjs.
// Both are pinned here, because the expensive half of this feature is what it
// does NOT do, and a notification that fails to be suppressed has no symptom
// anyone would notice in a screenshot.

import { describe, it, expect, vi } from 'vitest';
import { atTheApp, banner, clip, shouldSpeak, AWAY_AFTER_MS } from '../shared/notify-rules.mjs';
import { createNotifier } from '../main/notify.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

/* --------------------------- a fake macOS banner ------------------------- */
// Records what was shown and what was taken down, so a test can assert on the
// COUNT of banners as well as their words: "one at a time" is the half that
// the old code got wrong three times over.
function fakeNotifications() {
  const shown = [];
  const closed = [];
  class N {
    constructor(opts) { this.opts = opts; this.handlers = {}; }
    on(event, fn) { this.handlers[event] = fn; return this; }
    show() { shown.push(this); }
    close() { closed.push(this); this.handlers.close?.(); }
    click() { this.handlers.click?.(); }
  }
  N.isSupported = () => true;
  return { N, shown, closed };
}

function fakeWindow() {
  const sent = [];
  return {
    focusedNow: false,
    minimized: false,
    shownCount: 0,
    focusCount: 0,
    sent,
    isDestroyed: () => false,
    isFocused() { return this.focusedNow; },
    isMinimized() { return this.minimized; },
    restore() { this.minimized = false; },
    show() { this.shownCount++; },
    focus() { this.focusCount++; },
    webContents: { send: (ch, payload) => sent.push({ ch, payload }) },
  };
}

const idle = (ms) => ({ getSystemIdleTime: () => ms / 1000 });

const item = (id, title, productName = Name) => ({ id, title, productName, kind: 'item' });
const ask = (id, title, productName = Name) => ({ id, title, productName, kind: 'approval' });

describe(`she is in ${NAME}, so nothing speaks`, () => {
  it('a window with focus and a live keyboard is silence', () => {
    expect(atTheApp({ focused: true, idleMs: 0 })).toBe(true);
    expect(atTheApp({ focused: true, idleMs: 30_000 })).toBe(true);
  });

  it('another app is the whole reason to speak', () => {
    expect(atTheApp({ focused: false, idleMs: 0 })).toBe(false);
    // Still elsewhere, and idle. A quiet keyboard while she reads Slack is not
    // a reason to stay quiet.
    expect(atTheApp({ focused: false, idleMs: AWAY_AFTER_MS + 1 })).toBe(false);
  });

  it('a focused window she walked away from is not her being in the app', () => {
    // The lid is open, Agentbox is the front app, and she is in another room.
    // That is "in a diff app" as she meant it.
    expect(atTheApp({ focused: true, idleMs: AWAY_AFTER_MS + 1 })).toBe(false);
    // And the threshold is generous on purpose: reading one long card without
    // touching the keyboard must NOT read as having left.
    expect(atTheApp({ focused: true, idleMs: AWAY_AFTER_MS - 1 })).toBe(true);
  });

  it('shows nothing at all while the window has focus', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    win.focusedNow = true;
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'An agent finished')]);
    vi.advanceTimersByTime(5000);
    expect(shown).toHaveLength(0);
    vi.useRealTimers();
  });

  it('does not bank what arrived while she was watching it arrive', () => {
    // The row appeared in her inbox while she was looking at the list. Telling
    // her about it the moment she switches to Chrome would be news she already
    // has, and it is the shape a naive "queue it up" implementation takes.
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    win.focusedNow = true;
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'An agent finished')]);
    vi.advanceTimersByTime(5000);
    win.focusedNow = false;
    vi.advanceTimersByTime(60_000);
    expect(shown).toHaveLength(0);
    expect(n._pending()).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe('she is somewhere else, so it tells her', () => {
  it('one arrival is one banner, naming the row and no project', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'The landing page edits are live')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(1);
    expect(shown[0].opts.title).toBe('An agent is ready');
    expect(shown[0].opts.body).toBe('The landing page edits are live');
    // TWO LINES, AND NO PROJECT IN EITHER OF THEM. The subtitle field is never
    // set: she read a lone project name stacked under the title as the text
    // bleeding over.(2026-08-20).
    expect(shown[0].opts.subtitle).toBe(undefined);
    expect(shown[0].opts.silent).toBe(false);
    vi.useRealTimers();
  });

  it('a burst is ONE banner, not one per agent', () => {
    // The old code showed up to three. Four workers finishing inside one
    // supervisor tick is the ordinary case.
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'one'), item('w-2', 'two')]);
    vi.advanceTimersByTime(400);
    n.add([item('w-3', 'three', 'Cascade')]);
    vi.advanceTimersByTime(4000);
    expect(shown).toHaveLength(1);
    // Plural, and no number. A count can only ever describe the first second
    // and a half of a stretch that may run for hours.
    // The title is a fixed sentence whatever is waiting, and the body names
    // the row she should look at first.
    expect(shown[0].opts.title).toBe('Agents are ready');
    expect(shown[0].opts.subtitle).toBe(undefined);
    vi.useRealTimers();
  });

  it('a later arrival does NOT speak again, because she has been told once', () => {
    // The version before this took the old banner down and put a fresh one up,
    // which is one banner on screen and twenty interruptions, because macOS
    // has no way to edit a notification that is already showing. Rewriting it
    // IS showing another one, with another sound.
    vi.useFakeTimers();
    const { N, shown, closed } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'one')]);
    vi.advanceTimersByTime(2000);
    n.add([item('w-2', 'two')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(1);
    expect(closed).toHaveLength(0);
    // But it is still banked, so the row is waiting for her and a later
    // escalation would cover it.
    expect(n._pending().map((i) => i.id)).toEqual(['w-1', 'w-2']);
    vi.useRealTimers();
  });

  it('twenty agents over a meeting is one banner', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    for (let i = 0; i < 20; i += 1) {
      n.add([item(`w-${i}`, `agent ${i} finished`)]);
      vi.advanceTimersByTime(2 * 60_000);
    }
    expect(shown).toHaveLength(1);
    expect(shown[0].opts.title).toBe('An agent is ready');
    vi.useRealTimers();
  });

  it('she comes back, leaves again, and may be told once more', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'one')]);
    vi.advanceTimersByTime(2000);
    n.add([item('w-2', 'two')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(1);
    // The window comes forward: everything unseen is now seen, and the stretch
    // is over. The next one starts from nothing.
    n.seen();
    n.add([item('w-3', 'three')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(2);
    expect(shown[1].opts.body).toBe('three');
    vi.useRealTimers();
  });

  it('the same arrival twice is still one thing waiting', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'one')]);
    n.add([item('w-1', 'one')]);
    vi.advanceTimersByTime(2000);
    expect(shown[0].opts.title).toBe('An agent is ready');
    vi.useRealTimers();
  });

  it('speaks when the window holds focus but she has gone', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    win.focusedNow = true;
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(AWAY_AFTER_MS + 1000) });
    n.add([item('w-1', 'one')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('a frozen worker outranks a finished one', () => {
  it('an approval card notifies at all, which it never did before', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([ask('a-1', 'Delete the old release folder')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(1);
    expect(shown[0].opts.title).toBe('An agent is waiting on you');
    expect(shown[0].opts.body).toBe('Delete the old release folder');
    vi.useRealTimers();
  });

  it('the one with a clock on it leads the banner', () => {
    // A finished agent waits as long as it takes. An approval expires, and the
    // worker is frozen the whole time.
    const say = banner([item('w-1', 'finished work'), ask('a-1', 'run a command')]);
    expect(say.title).toBe('Agents are waiting on you');
    expect(say.body).toBe('run a command');
  });

  it('an approval may break the silence once, because it expires', () => {
    // main/approval-prompt-server.mjs denies automatically after fifteen
    // minutes. A finished agent waits as long as it takes; a frozen worker
    // does not, so under the one-banner rule this is the single exception.
    vi.useFakeTimers();
    const { N, shown, closed } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'the landing page edits are live')]);
    vi.advanceTimersByTime(2000);
    // Twenty minutes of finished agents: still silent.
    n.add([item('w-2', 'two'), item('w-3', 'three')]);
    vi.advanceTimersByTime(20 * 60_000);
    expect(shown).toHaveLength(1);
    // Then a worker freezes and needs her.
    n.add([ask('a-1', 'Delete the old release folder')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(2);
    expect(shown[1].opts.title).toBe('Agents are waiting on you');
    expect(shown[1].opts.body).toBe('Delete the old release folder');
    // One on screen, never two: the first was taken down.
    expect(closed).toEqual([shown[0]]);
    vi.useRealTimers();
  });

  it('two is the cap, so a run of approvals is not a run of banners', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'one')]);
    vi.advanceTimersByTime(2000);
    for (let i = 0; i < 6; i += 1) {
      n.add([ask(`a-${i}`, `approval ${i}`)]);
      vi.advanceTimersByTime(5 * 60_000);
    }
    expect(shown).toHaveLength(2);
    vi.useRealTimers();
  });

  it('a stretch that opens with an approval is one banner, full stop', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([ask('a-1', 'run a command')]);
    vi.advanceTimersByTime(2000);
    n.add([ask('a-2', 'run another'), item('w-9', 'done')]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(shown).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('how many times she may be interrupted in one stretch away', () => {
  it('the first thing always speaks', () => {
    expect(shouldSpeak({ spoke: false, waiting: [item('w-1', 'one')] })).toBe(true);
  });

  it('nothing waiting is nothing to say', () => {
    expect(shouldSpeak({ spoke: false, waiting: [] })).toBe(false);
    expect(shouldSpeak({})).toBe(false);
  });

  it('a second finished agent does not', () => {
    expect(shouldSpeak({ spoke: true, waiting: [item('w-1', 'one'), item('w-2', 'two')] })).toBe(false);
  });

  it('an approval does, once', () => {
    const waiting = [item('w-1', 'one'), ask('a-1', 'ask')];
    expect(shouldSpeak({ spoke: true, spokeAsk: false, waiting })).toBe(true);
    expect(shouldSpeak({ spoke: true, spokeAsk: true, waiting })).toBe(false);
  });
});

describe('the banner is a way back, not just an announcement', () => {
  it('a click brings the window forward and opens that row', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    win.minimized = true;
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-abc', 'The landing page edits are live')]);
    vi.advanceTimersByTime(2000);
    shown[0].click();
    expect(win.minimized).toBe(false);
    expect(win.shownCount).toBe(1);
    expect(win.focusCount).toBe(1);
    expect(win.sent).toEqual([{ ch: 'zero:open-item', payload: { id: 'w-abc' } }]);
    vi.useRealTimers();
  });

  it('an approval click only needs the window, because the card is on it', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([ask('a-1', 'run a command')]);
    vi.advanceTimersByTime(2000);
    shown[0].click();
    expect(win.focusCount).toBe(1);
    expect(win.sent).toHaveLength(0);
    vi.useRealTimers();
  });

  it('coming back to the window takes the banner down', () => {
    vi.useFakeTimers();
    const { N, shown, closed } = fakeNotifications();
    const win = fakeWindow();
    const n = createNotifier({ window: win, Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'one')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(1);
    n.seen();
    expect(closed).toEqual([shown[0]]);
    // And it starts counting again from nothing, so the next banner is about
    // what happened AFTER she looked, never a re-run of what she just read.
    n.add([item('w-2', 'two')]);
    vi.advanceTimersByTime(2000);
    expect(shown[1].opts.title).toBe('An agent is ready');
    vi.useRealTimers();
  });
});

describe('the words', () => {
  it('says nothing when there is nothing', () => {
    expect(banner([])).toBe(null);
    expect(banner(null)).toBe(null);
  });

  it('never names the project, however many are waiting', () => {
    const several = banner([
      item('1', 'a', Name), item('2', 'b', 'Cascade'),
      item('3', 'c', 'Halcyon'), item('4', 'd', 'Halcyon'),
    ]);
    expect(several.title).toBe('Agents are ready');
    expect(several.subtitle).toBe(undefined);

    // One project is the case that used to name it, in the subtitle first and
    // then in the title. Neither survives: a project name is a string we do
    // not control the length of, and the title is the line macOS will not wrap.
    const one = banner([item('w-1', 'The landing page edits are live', Name)]);
    expect(one.title).toBe('An agent is ready');
    expect(one.body).toBe('The landing page edits are live');
    expect('subtitle' in one).toBe(false);

    const long = banner([item('w-1', 'ready', 'A Very Long Project Name Somebody Typed')]);
    expect(long.title).toBe('An agent is ready');

    const two = banner([item('w-1', 'one', Name), item('w-2', 'two', Name)]);
    expect(two.title).toBe('Agents are ready');
  });

  it('never names the project on an approval either', () => {
    const waiting = banner([ask('a-1', 'Delete the old release folder', Name)]);
    expect(waiting.title).toBe('An agent is waiting on you');
    expect(waiting.body).toBe('Delete the old release folder');
    expect('subtitle' in waiting).toBe(false);
  });

  it('cuts a long title on a word, not mid-word', () => {
    // Her own rows run past a hundred characters; this item's title is one.
    const long = `Add nice notifications for ${NAME} such that whenever i'm in a diff app and an agent is ready it tells me and it keeps going`;
    const out = clip(long);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith('…')).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
    expect(out.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('leaves a short title exactly alone', () => {
    expect(clip('The landing page edits are live')).toBe('The landing page edits are live');
  });
});
