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
  ready: (part) => ipcRenderer.invoke('corner-tag:ready', { part }),
  size: (part, width, height) => ipcRenderer.invoke('corner-tag:size', { part, width, height }),
  solid: (part, solid) => ipcRenderer.invoke('corner-tag:solid', { part, solid }),
  hover: (part, inside) => ipcRenderer.invoke('corner-tag:hover', { part, inside }),
  toggle: () => ipcRenderer.invoke('corner-tag:toggle'),
  dragStart: () => ipcRenderer.invoke('corner-tag:drag-start'),
  drag: (dx, dy) => ipcRenderer.invoke('corner-tag:drag', { dx, dy }),
  dragEnd: () => ipcRenderer.invoke('corner-tag:drag-end'),
  go: (id) => ipcRenderer.invoke('corner-tag:go', id),
  hide: (choice) => ipcRenderer.invoke('corner-tag:hide', choice),
  settings: () => ipcRenderer.invoke('corner-tag:settings'),
  menu: () => ipcRenderer.invoke('corner-tag:menu'),
});
