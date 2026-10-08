// The corner tag's page talks to main/corner-tag.mjs through this, and through
// nothing else: it is a separate, much smaller door than preload.cjs, because a
// floating window over every other app has no business holding the whole
// bridge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cornerTag', {
  onState: (fn) => {
    const handler = (_e, state) => fn(state);
    ipcRenderer.on('corner-tag:state', handler);
    return () => ipcRenderer.removeListener('corner-tag:state', handler);
  },
  size: (width, height) => ipcRenderer.invoke('corner-tag:size', { width, height }),
  open: (width, height) => ipcRenderer.invoke('corner-tag:open', { width, height }),
  close: () => ipcRenderer.invoke('corner-tag:close'),
  dragStart: () => ipcRenderer.invoke('corner-tag:drag-start'),
  drag: (dx, dy) => ipcRenderer.invoke('corner-tag:drag', { dx, dy }),
  dragEnd: () => ipcRenderer.invoke('corner-tag:drag-end'),
  go: (id) => ipcRenderer.invoke('corner-tag:go', id),
  hide: (choice) => ipcRenderer.invoke('corner-tag:hide', choice),
  settings: () => ipcRenderer.invoke('corner-tag:settings'),
  menu: () => ipcRenderer.invoke('corner-tag:menu'),
});
