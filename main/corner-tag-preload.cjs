// The corner tag's two pages (the tag, and the list beside it) talk to
// main/corner-tag.mjs through this, and through nothing else: it is a separate,
// much smaller door than preload.cjs, because a window floating over every
// other app has no business holding the whole bridge.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

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
  // 'light' or 'dark': which way the Mac's own glass went over what is behind
  // it, so the ink can follow.
  onTone: listen('corner-tag:tone'),
  // Measure again and say so: the tag has just come up.
  onMeasure: listen('corner-tag:measure'),
  // The zoom this page is drawn at, so it can say its size in screen points.
  zoom: () => webFrame.getZoomFactor(),
  ready: (part) => ipcRenderer.invoke('corner-tag:ready', { part }),
  // glass: where the glass itself sits inside that window, and how big it is.
  // The tag's window is the glass plus a clear band; the list is lined up with the glass, never with the
  // window, which may be roomier than the page drew. radius: how round it is,
  // so the Mac's glass is drawn to the same shape.
  size: (part, width, height, glass, radius) => ipcRenderer.invoke('corner-tag:size', { part, width, height, glass, radius }),
  // Whether what is under the pointer right now belongs to the tag. In the
  // clear band it does not, and the click must reach the app underneath.
  clickable: (on) => ipcRenderer.invoke('corner-tag:clickable', { on: !!on }),
  hover: (part, inside) => ipcRenderer.invoke('corner-tag:hover', { part, inside }),
  toggle: () => ipcRenderer.invoke('corner-tag:toggle'),
  // The button went down on the tag, and came up (or was taken away). What
  // happens in between, a drag or nothing, the main process reads off the
  // real cursor.
  press: (x, y) => ipcRenderer.invoke('corner-tag:press', { x, y }),
  release: (cancelled) => ipcRenderer.invoke('corner-tag:release', { cancelled: !!cancelled }),
  go: (id) => ipcRenderer.invoke('corner-tag:go', id),
  // The X on a line of the list: that thread off the tray, and only the tray.
  dismiss: (id) => ipcRenderer.invoke('corner-tag:dismiss', id),
  hide: (choice) => ipcRenderer.invoke('corner-tag:hide', choice),
  // One notch bigger or smaller, from the list's own foot, so she can see the
  // tag change while she decides.
  resize: (by) => ipcRenderer.invoke('corner-tag:resize', { by }),
  // 'tl', 'tr', 'bl' or 'br', picked from the list's Place.
  place: (corner) => ipcRenderer.invoke('corner-tag:place', corner),
  settings: () => ipcRenderer.invoke('corner-tag:settings'),
  menu: () => ipcRenderer.invoke('corner-tag:menu'),
});
