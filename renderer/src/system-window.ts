// WHILE A WINDOW OF THE OPERATING SYSTEM IS IN FRONT, THE APP TAKES NO KEYS.
//
// A file dialog is modal to the window manager, and a window manager is free
// to treat modal as a hint: on Linux the keys typed into the folder chooser
// arrived in the app behind it as well, and the first task's box filled up
// with the path somebody was typing into the dialog
// (tests/the-app-takes-no-keys-while-a-system-window-is-open).
//
// So the app stops listening rather than trusting that nothing arrives. Each
// of these dialogs is opened and awaited in one call, which is exactly the
// span to drop keys over.

type KeyHost = {
  addEventListener(type: string, fn: (e: KeyEvent) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: KeyEvent) => void, opts?: unknown): void;
};

type KeyEvent = { preventDefault(): void; stopPropagation(): void };

/** Keydown alone would do it in Chromium; the rest are what a paste or an
 *  input method reaches the box by. */
const DROPPED = ['keydown', 'keypress', 'beforeinput', 'textInput', 'paste'];

let openWindows = 0;
let deafen: null | (() => void) = null;

/** Capture, so a box that listens for its own keys never sees them. */
function stopListening(host: KeyHost): () => void {
  const drop = (e: KeyEvent) => { e.preventDefault(); e.stopPropagation(); };
  for (const type of DROPPED) host.addEventListener(type, drop, { capture: true });
  return () => { for (const type of DROPPED) host.removeEventListener(type, drop, { capture: true }); };
}

/**
 * Run `open` with the app deaf to the keyboard until it comes back.
 *
 *  Whatever `open` does with its answer is the caller's; this only promises
 *  that nothing typed at the window in front is typed into the app behind it,
 *  and that the app hears again however the call ends.
 */
export async function whileSystemWindowIsOpen<T>(
  open: () => Promise<T>,
  host: KeyHost | null = typeof window === 'undefined' ? null : (window as unknown as KeyHost),
): Promise<T> {
  if (!host) return open();
  if (openWindows++ === 0) deafen = stopListening(host);
  try {
    return await open();
  } finally {
    if (--openWindows === 0) { deafen?.(); deafen = null; }
  }
}
