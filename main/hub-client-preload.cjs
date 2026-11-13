// What the page from the hub may ask of this Mac: an alert and a press on it, the
// Dock count, and a link in the browser. The rest of what it does goes to the hub
// (renderer/src/browser-bridge.ts).
const { contextBridge, ipcRenderer } = require('electron');

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
