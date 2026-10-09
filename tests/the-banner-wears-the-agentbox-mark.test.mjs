// THE BANNER SHOWED A GREY SQUARE WHERE THE LOGO SHOULD BE.
//
// Reported 2026-10-07, looking at a real one: "it shows a plain placeholder".
// macOS draws the app's own bundle icon on the left of a banner and the app
// cannot override it, and from a source checkout it is the Electron.app in
// node_modules that gets asked — a bundle macOS often will not resolve an icon
// for, so it falls back to the generic square.
//
// What the app CAN do is hand the notification an image of its own, which
// macOS attaches to the banner. It was handing it nothing at all.
//
// Measured here the same day, in the Electron the app runs from:
// nativeImage.createFromPath on build/icon.icns comes back EMPTY (0x0), so the
// .icns everything else in the repo uses is not a candidate; build/
// notification-icon.png, drawn from the same art, reads 256x256. That is why
// the mark is a png and why an empty image has to be treated as no mark: an
// icon key holding an empty image is how this would silently regress.

import { describe, it, expect, vi } from 'vitest';
import { createNotifier, markFor } from '../main/notify.mjs';

function fakeNotifications() {
  const shown = [];
  class N {
    constructor(opts) { this.opts = opts; shown.push(this); this.handlers = {}; }
    on(event, fn) { this.handlers[event] = fn; return this; }
    show() {}
    close() {}
  }
  N.isSupported = () => true;
  return { N, shown };
}

const awayWindow = () => ({
  isDestroyed: () => false,
  isFocused: () => false,
  isMinimized: () => false,
  show() {}, focus() {}, restore() {},
  webContents: { send() {} },
});

const idle = (ms) => ({ getSystemIdleTime: () => ms / 1000 });
const item = (id, title) => ({ id, title, productName: 'Agentbox', kind: 'item' });

describe('the mark the banner carries', () => {
  it('puts the app mark on every banner it shows', () => {
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const mark = { isEmpty: () => false };
    const n = createNotifier({ window: awayWindow(), Notification: N, powerMonitor: idle(0), icon: mark });
    n.add([item('w-1', 'Check whether notifications actually fire')]);
    vi.runAllTimers();
    expect(shown).toHaveLength(1);
    expect(shown[0].opts.icon).toBe(mark);
    vi.useRealTimers();
  });

  it('leaves the key out entirely when there is no mark to show', () => {
    // Not `icon: null`. A banner with nothing to attach must look to macOS
    // exactly like the banners that came before this change.
    vi.useFakeTimers();
    const { N, shown } = fakeNotifications();
    const n = createNotifier({ window: awayWindow(), Notification: N, powerMonitor: idle(0) });
    n.add([item('w-1', 'Check whether notifications actually fire')]);
    vi.runAllTimers();
    expect(shown).toHaveLength(1);
    expect('icon' in shown[0].opts).toBe(false);
    vi.useRealTimers();
  });
});

describe('finding the mark on disk', () => {
  const png = (root) => `${root}/build/notification-icon.png`;

  it('reads the mark that sits beside the app', () => {
    const img = { isEmpty: () => false };
    const read = vi.fn(() => img);
    expect(markFor({ root: '/app', createFromPath: read })).toBe(img);
    expect(read).toHaveBeenCalledWith(png('/app'));
  });

  it('treats an image that read as nothing as no mark', () => {
    // The .icns case, measured: createFromPath returns a 0x0 image rather than
    // throwing, so "it loaded" is not the question to ask.
    expect(markFor({ root: '/app', createFromPath: () => ({ isEmpty: () => true }) })).toBe(null);
  });

  it('survives a reader that throws', () => {
    // A missing file must cost a banner its logo, never the banner.
    expect(markFor({ root: '/app', createFromPath: () => { throw new Error('ENOENT'); } })).toBe(null);
  });
});
