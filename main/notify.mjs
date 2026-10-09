// THE BANNER. Once while she is away, only while she is somewhere else, taken
// down the moment she comes back.
//
// The rule it obeys is in shared/notify-rules.mjs; this file is the live half:
// the window's focus, the machine's idle clock, and the lifetime of the one
// notification that is allowed to exist. Nothing decidable lives here, so that
// what the tests pin is the behaviour and not the wiring.
//
// Before this, the renderer called a bare `new Notification.show` per arrival,
// up to three per batch, with no idea whether she was looking at the app. tell
// me when I am elsewhere, and never when I am here.
//
// AND ONCE, NOT TWENTY TIMES. One at a time is not once. `spoke` below is the
// fix, and shared/notify-rules.mjs carries the rule.

import path from 'node:path';
import { atTheApp, banner, shouldSpeak } from '../shared/notify-rules.mjs';
import { NAME } from '../shared/product-name.mjs';

// THE MARK THE BANNER WEARS, and why it is a png and not the .icns every other
// part of this repo uses.
//
// macOS draws the app's OWN bundle icon down the left of a banner, and no app
// can override that. From a source checkout the bundle being asked is the
// Electron.app in node_modules, which scripts/brand-electron.mjs renames and
// re-icons, and macOS still drew a generic grey square: "it shows a plain
// placeholder", looking at a real one, 2026-10-07.
//
// An image handed to the notification is the half we DO control; macOS attaches
// it to the banner. Measured the same day in the Electron the app runs from:
// nativeImage.createFromPath on build/icon.icns comes back empty, 0x0, so the
// icns is not a candidate however convenient it would be. The png beside it,
// drawn from the same art, reads 256x256.
//
// AN EMPTY IMAGE IS NOT A MARK. createFromPath answers a missing or unreadable
// file with an empty image rather than an error, so "it returned something" is
// the wrong question, and handing that something to macOS is how this goes
// quietly back to a grey square. Returns null when there is nothing to show,
// and the banner then looks exactly as it did before any of this.
export const MARK_FILE = path.join('build', 'notification-icon.png');

export function markFor({ root, createFromPath }) {
  try {
    const img = createFromPath(path.join(root, MARK_FILE));
    return img && !img.isEmpty() ? img : null;
  } catch { return null; }
}

// A BURST IS ONE PIECE OF NEWS. Four workers finishing inside the same
// supervisor tick is the ordinary case, and it arrives as four pushes over a
// second or two. Waiting a beat before speaking turns that into one banner
// with one sound instead of four rewrites and four chimes.
const COALESCE_MS = 1500;

export function createNotifier({ window, Notification, powerMonitor, icon = null, coalesceMs = COALESCE_MS }) {
  // Everything she has not seen since she last had the window, keyed by id so
  // a repeated push is idempotent. Insertion order is arrival order.
  const unseen = new Map();
  let live = null;      // the one notification currently on screen, if any
  let timer = null;
  // HOW MANY TIMES SHE HAS BEEN INTERRUPTED SINCE SHE LAST HAD THE WINDOW.
  // Both reset in seen, so a stretch away is the unit. shouldSpeak in
  // shared/notify-rules.mjs is the rule these two feed; the short version is
  // once, plus one more if an approval turns up afterwards.
  let spoke = false;
  let spokeAsk = false;

  const idleMs = () => {
    try { return powerMonitor.getSystemIdleTime() * 1000; } catch { return 0; }
  };
  const focused = () => {
    try { return !!window && !window.isDestroyed() && window.isFocused(); } catch { return false; }
  };

  const takeDown = () => {
    if (!live) return;
    try { live.close(); } catch {}
    live = null;
  };

  // She is looking at Agentbox, so everything in hand has been seen on the row
  // it lives on. This is also why arrivals that land while she is here are
  // dropped rather than banked: showing them later, when she steps away, would
  // be telling her about work she already watched arrive.
  const seen = () => {
    unseen.clear();
    if (timer) { clearTimeout(timer); timer = null; }
    spoke = false;
    spokeAsk = false;
    takeDown();
  };

  const speak = () => {
    timer = null;
    if (atTheApp({ focused: focused(), idleMs: idleMs() })) return seen();
    const items = [...unseen.values()];
    // She has already been told once this stretch. Everything since is banked
    // on its own row and she will have it the moment she is back; saying it out
    // loud again is the twenty-chimes-in-a-meeting problem she asked us to fix.
    if (!shouldSpeak({ spoke, spokeAsk, waiting: items })) return;
    const say = banner(items);
    if (!say) return;
    takeDown();
    let n;
    try {
      // No subtitle. macOS puts that field directly under the title in nearly
      // the same type, and she read a lone project name there as the title
      // bleeding over mid-render. The project is in the title now; see
      // shared/notify-rules.mjs.
      n = new Notification({
        title: say.title,
        body: say.body,
        silent: false,
        // Omitted rather than passed empty when there is nothing to show, so a
        // banner with no mark is byte for byte the banner that shipped before.
        ...(icon ? { icon } : {}),
      });
    } catch { return; }
    // A banner she can act on. Clicking it brings Agentbox forward and opens the
    // row it was about, which is the difference between being told and having
    // to go find it.
    n.on('click', () => {
      seen();
      if (!window || window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      if (say.open) window.webContents.send('zero:open-item', { id: say.open });
    });
    n.on('close', () => { if (live === n) live = null; });
    // A BANNER macOS REFUSED LOOKS EXACTLY LIKE NO AGENT FINISHING, which is
    // the shape of failure this codebase keeps paying for. Measured on her
    // machine 2026-08-20: across 107 apps registered with Notification Center,
    // neither `ac.astral.app` nor `com.github. Electron` had a record at all, so
    // there is no evidence a banner from here has ever been delivered. If the
    // OS is dropping them, this line is what turns that from a silence into a
    // two-minute diagnosis.
    n.on('failed', (_e, err) => {
      live = null;
      console.warn(`zero: the system refused the notification (${err}). Check ${NAME} in the system notification settings.`);
    });
    live = n;
    try {
      n.show();
      spoke = true;
      if (items.some((i) => i.kind === 'approval')) spokeAsk = true;
    } catch { live = null; }
  };

  return {
    // Fresh arrivals from the renderer, which owns what counts as news (it is
    // the only place that knows what the inbox is). Each is
    // { id, title, product, productName, kind }.
    add(arrivals) {
      if (!Array.isArray(arrivals) || !arrivals.length) return;
      // Asked before banking anything, so that a burst arriving while she is
      // at the app is dropped rather than saved up for when she leaves.
      if (atTheApp({ focused: focused(), idleMs: idleMs() })) return seen();
      for (const a of arrivals) {
        if (!a || !a.id || unseen.has(a.id)) continue;
        unseen.set(a.id, a);
      }
      if (!unseen.size || timer) return;
      timer = setTimeout(speak, coalesceMs);
    },
    // The window came forward. Whatever was on screen is now behind her.
    seen,
    // Tests, and nothing else.
    _pending: () => [...unseen.values()],
    _spoken: () => ({ spoke, spokeAsk }),
  };
}

export function installNotifier({ app, window, Notification, powerMonitor, ipcMain, nativeImage }) {
  if (Notification.isSupported && !Notification.isSupported()) {
    return { add() {}, seen() {} };
  }
  // app.getAppPath() is the repo from source and the asar inside the bundle
  // when it is packaged, and the mark sits at the same place in both.
  const icon = nativeImage
    ? markFor({ root: app.getAppPath(), createFromPath: (p) => nativeImage.createFromPath(p) })
    : null;
  const notifier = createNotifier({ window, Notification, powerMonitor, icon });
  window.on('focus', () => notifier.seen());
  // Unlocking with Agentbox already the front app never fires 'focus' (it never
  // lost it), so without this the banner that fired while the screen was
  // locked would sit in Notification Center after she is back at the row.
  try { powerMonitor.on('unlock-screen', () => { if (window.isFocused()) notifier.seen(); }); } catch {}
  ipcMain.handle('zero:notify', (_e, payload = {}) => {
    notifier.add(Array.isArray(payload.arrivals) ? payload.arrivals : []);
  });
  return notifier;
}
