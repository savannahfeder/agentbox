// A WINDOW ONTO A HUB, AND NOTHING ELSE.
//
// The hub is a headless copy of the app (main/serve.mts) on a machine of its own.
// This process loads the same screen from it and runs no store, no supervisor and
// no agent, so what it costs this Mac does not change with how many agents the
// hub is running (tests/a-window-can-be-a-client-of-a-hub-and-runs-no-agents).

import { app, BrowserWindow, Notification, dialog, ipcMain, nativeImage, powerMonitor, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installNotifier } from './notify.mts';
import { mayOpenOutside, sameHub } from './hub-rules.mts';
import { openInBrowser } from './open-in-browser.mts';
import { NAME } from '../shared/product-name.mjs';
import type { HubAddress } from './hub-address.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const RETRY_MS = 5_000;

const waitingPage = (hubUrl: string) => `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>${NAME}</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1a1a1c;color:#e8e6e3;font:15px -apple-system,system-ui,sans-serif">
<div style="max-width:440px;text-align:center"><p style="font-weight:600">${NAME} can't reach your hub</p>
<p style="color:#a3a09b">Trying ${hubUrl} again every few seconds. Your agents keep running there.</p></div>`)}`;

export function refuseToStart(why: string): void {
  app.whenReady().then(() => {
    dialog.showErrorBox(`${NAME} can't start`, `This Mac names a hub that can't be used, and it will not run agents itself while it does: ${why}`);
    app.quit();
  });
}

export function startHubClient(hub: HubAddress): void {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  let window: BrowserWindow | null = null;
  let retry: NodeJS.Timeout | undefined = undefined;

  // Only reached while the window is open: `closed` clears the retry timer.
  const load = () => { window!.loadURL(`${hub.url}/?token=${encodeURIComponent(hub.key)}`).catch(() => {}); };

  const open = () => {
    window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 720,
      minHeight: 600,
      backgroundColor: '#1a1a1c',
      titleBarStyle: 'hiddenInset',
      webPreferences: { preload: path.join(here, 'hub-client-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const { webContents } = window;
    webContents.setWindowOpenHandler(({ url }) => {
      if (mayOpenOutside(url)) void openInBrowser(url, { shell });
      return { action: 'deny' };
    });
    webContents.on('will-navigate', (event, url) => {
      if (sameHub(url, hub.url)) return;
      event.preventDefault();
      if (mayOpenOutside(url)) void openInBrowser(url, { shell });
    });
    webContents.on('did-fail-load', (_e, code, _why, url, isMain) => {
      // -3 is a load this window itself replaced.
      if (!isMain || code === -3 || !sameHub(url, hub.url)) return;
      window!.loadURL(waitingPage(hub.url)).catch(() => {});
      clearTimeout(retry);
      retry = setTimeout(load, RETRY_MS);
    });
    webContents.on('render-process-gone', () => { clearTimeout(retry); retry = setTimeout(load, RETRY_MS); });
    window.on('closed', () => { clearTimeout(retry); window = null; });
    installNotifier({ app, window, Notification, powerMonitor, ipcMain, nativeImage });
    load();
  };

  ipcMain.handle('zero:badge', (_e, count: number) => {
    if (process.platform === 'darwin') app.dock!.setBadge(count > 0 ? String(count) : '');
  });
  ipcMain.handle('hub:open', async (_e, address: string) => {
    if (!mayOpenOutside(address)) return false;
    return (await openInBrowser(address, { shell })).ok;
  });
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  // Quits like the whole app (main/main.mts): with no window there is nothing to
  // alert from, and a window opened twice would register its handlers twice.
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(open);
}
