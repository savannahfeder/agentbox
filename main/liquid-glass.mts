// The Mac's own Liquid Glass for a window, or null where there is none: not a
// Mac, a macOS before 26, or a build that could not compile main/native
// (scripts/build-liquid-glass.mjs). Null means the page draws its own glass.
import { createRequire } from 'node:module';

export function loadLiquidGlass({ mac = process.platform === 'darwin', load = createRequire(import.meta.url) } = {}) {
  if (!mac) return null;
  let native;
  try {
    native = load('./native/liquid-glass/build/liquid-glass.node');
    if (!native.available()) return null;
  } catch {
    return null;
  }
  const handle = (win) => win.getNativeWindowHandle();
  return {
    // tone: 'light' or 'dark' holds the glass that way; leave it out and the
    // glass decides from what is behind it. style: 'clear' for the Mac's clear
    // glass, which lets a light page through; otherwise the regular glass.
    set: (win, rect, { radius, tone, style } = {}) => native.set(handle(win), rect, {
      radius, ...(tone ? { tone } : {}), ...(style ? { style } : {}),
    }),
    clear: (win) => native.clear(handle(win)),
    tone: (win) => native.tone(handle(win)),
    // How bright the screen behind the glass is, 0 to 1, or null.
    luma: (win) => (native.luma ? native.luma(handle(win)) : null),
  };
}
