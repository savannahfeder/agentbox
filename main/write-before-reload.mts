// ⌘R WRITES WHAT THE PAGE IS HOLDING BEFORE IT RELOADS.
//
// A close, an approval, a picked option and a typed reply are all held in the
// page for three seconds so Z can take them back (`deferCommit` in App.tsx),
// and the only thing that ever writes one is a timer in that page. Reloading
// straight away threw the timer and the action out together: she closed a
// thread, pressed ⌘R, and it came back to her inbox as if she had never
// touched it (w-47218417a5).
//
// So the reload asks first. The page writes what it holds (or answers at once
// when it holds nothing) and says so, and only then does the window reload.
// The wait is bounded: a page that never answers, because it crashed or is a
// build from before this existed, still reloads, since ⌘R doing nothing is a
// complaint this chord has had twice already.

import { randomUUID } from 'node:crypto';

export const WRITE_HELD = 'zero:write-held';
export const WROTE_HELD = 'zero:wrote-held';

// A store write is a local file append, so this is far more than one needs; it
// only has to be short enough that a page that never answers is not mistaken
// for ⌘R not arriving.
const WAIT_MS = 2000;

export async function writeHeldThenReload({ webContents, ipcMain, reload, timeoutMs = WAIT_MS }) {
  if (!webContents || webContents.isDestroyed()) return;
  // Each ask carries its own id, so an answer meant for another one (a page
  // from before the last reload, a second press) is not taken for this one.
  const nonce = randomUUID();
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      ipcMain.removeListener(WROTE_HELD, onWrote);
      resolve();
    };
    const onWrote = (event, answered) => {
      if (answered === nonce && event?.sender === webContents) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    ipcMain.on(WROTE_HELD, onWrote);
    try {
      webContents.send(WRITE_HELD, nonce);
    } catch {
      finish();
    }
  });
  if (webContents.isDestroyed()) return;
  reload();
}
