// What the page from the hub may ask of this Mac: an alert and a press on it, the
// Dock count, and a link in the browser. The rest of what it does goes to the hub
// (renderer/src/browser-bridge.ts).
const { contextBridge, ipcRenderer } = require('electron');

// On Windows this window has the system's buttons over its top-right corner
// (main/window-buttons.mts). The page keeps clear of them only when told, as
// preload.cjs tells the app's own window.
if (process.platform === 'win32') {
  const markButtons = () => {
    if (!document.documentElement) return;
    document.documentElement.dataset.window = 'flat';
    document.documentElement.dataset.windowButtons = 'right';
  };
  if (document.documentElement) markButtons();
  else document.addEventListener('DOMContentLoaded', markButtons);
}

contextBridge.exposeInMainWorld('agentboxShell', {
  notify: (payload) => ipcRenderer.invoke('zero:notify', payload),
  badge: (count) => ipcRenderer.invoke('zero:badge', count),
  open: (address) => ipcRenderer.invoke('hub:open', address),
  onOpenItem: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('zero:open-item', handler);
    return () => ipcRenderer.removeListener('zero:open-item', handler);
  },
});
