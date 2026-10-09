// The corner tag's two pages (the tag, and the list beside it) talk to
// main/corner-tag.mjs through this, and through nothing else: it is a separate,
// much smaller door than preload.cjs, because a window floating over every
// other app has no business holding the whole bridge.
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('cornerTag', {
  onState: listen('corner-tag:state'),
  onOpen: listen('corner-tag:open'),
  onReset: listen('corner-tag:reset'),
  onDragging: listen('corner-tag:dragging'),
  ready: (part) => ipcRenderer.invoke('corner-tag:ready', { part }),
  size: (part, width, height) => ipcRenderer.invoke('corner-tag:size', { part, width, height }),
  hover: (part, inside) => ipcRenderer.invoke('corner-tag:hover', { part, inside }),
  toggle: () => ipcRenderer.invoke('corner-tag:toggle'),
  // The button went down on the tag, and came up (or was taken away). What
  // happens in between, a drag or nothing, the main process reads off the
  // real cursor.
  press: (x, y) => ipcRenderer.invoke('corner-tag:press', { x, y }),
  release: (cancelled) => ipcRenderer.invoke('corner-tag:release', { cancelled: !!cancelled }),
  go: (id) => ipcRenderer.invoke('corner-tag:go', id),
  hide: (choice) => ipcRenderer.invoke('corner-tag:hide', choice),
  settings: () => ipcRenderer.invoke('corner-tag:settings'),
  menu: () => ipcRenderer.invoke('corner-tag:menu'),
});
