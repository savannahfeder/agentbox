// WHEN THE WINDOW'S PAGE DIES OR FREEZES, THE WINDOW COMES BACK.
//
// On a Mac either one leaves the window blank in its own background colour,
// and developer tools have no page to open on. The agents keep running in the
// main process, so the only thing lost is the screen, and a reload restores it
// where they were (`reloaded` in boot info).
//
// A death reloads at once. A second death within a minute of a reload this
// made asks instead, so a page that dies as it loads is never reloaded for
// ever. A frozen page asks too: it may still be working, and only the person
// can tell a long wait from a stuck one.

export const REVIVE_LOOP_MS = 60_000;

export function revivedLine(reason) {
  if (reason === 'oom') return 'The screen ran out of memory and reloaded itself';
  if (reason === 'froze') return 'The screen froze and was reloaded';
  return 'The screen crashed and reloaded itself';
}

export function keepThePageAlive({ window, dialog, name, onRevived, report = () => {}, now = Date.now, log = console }) {
  const contents = window.webContents;
  let revivedAt = null;
  let ending = false;
  let asking = null;

  const reload = (reason) => {
    revivedAt = now();
    onRevived(revivedLine(reason));
    contents.reload();
  };

  contents.on('render-process-gone', async (_e, details = {}) => {
    const reason = ending ? 'froze' : details.reason;
    ending = false;
    asking?.abort();
    if (reason === 'clean-exit' || window.isDestroyed()) return;
    log.warn?.(`agentbox: the window's page is gone (${reason}), reloading`);
    if (revivedAt === null || now() - revivedAt >= REVIVE_LOOP_MS) { reload(reason); return; }
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message: 'The screen crashed again',
      detail: 'It crashed twice in a minute, so it did not reload on its own. Your agents are still running.',
      buttons: ['Reload', 'Not now'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0 && !window.isDestroyed()) reload(reason);
  });

  window.on('unresponsive', async () => {
    if (asking || window.isDestroyed()) return;
    report('renderer-hung', new Error('window stopped responding'));
    asking = new AbortController();
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message: `${name} is not responding`,
      detail: 'Reload to bring the screen back where you were. Your agents are still running.',
      buttons: ['Reload', 'Wait'],
      defaultId: 0,
      cancelId: 1,
      signal: asking.signal,
    });
    asking = null;
    if (response !== 0 || window.isDestroyed()) return;
    // A hung page cannot be reloaded; it has to end first, and the reload
    // happens when Electron says it has gone.
    ending = true;
    contents.forcefullyCrashRenderer();
  });

  window.on('responsive', () => asking?.abort());
}
