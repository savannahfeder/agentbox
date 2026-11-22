// The Threads list stayed full of the canned inbox (the onboarding flows, the
// card art, the pricing check) after the real store was emptied. Measured
// 2026-10-07: Electron 43 runs this preload sandboxed, readyState "loading",
// documentElement null. The flat-window assignment threw, so
// exposeInMainWorld('zero') never ran, and a window with no bridge draws the
// fixtures. The profile's last saved row was one of those fixtures.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { GLASS_ARG } from '../main/window-glass.mts';

const preloadPath = fileURLToPath(new URL('../preload.cjs', import.meta.url));
const source = fs.readFileSync(preloadPath, 'utf8');

function loadingDocument(present) {
  const listeners = {};
  const html = { dataset: {} };
  const doc = {
    readyState: 'loading',
    documentElement: present ? html : null,
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    arrive() {
      doc.documentElement = html;
      doc.readyState = 'interactive';
      for (const fn of listeners.DOMContentLoaded ?? []) fn();
    },
  };
  return { doc, html };
}

// `argv` is left off the stand-in unless a case gives one, so a line that
// assumes it is there throws here as it would have dropped the bridge.
function run({ platform, document, argv = undefined }) {
  const exposed = [];
  const sandbox = {
    console,
    process: { platform, env: {}, ...(argv ? { argv } : {}) },
    document,
    require(id) {
      if (id !== 'electron') throw new Error(`unexpected require ${id}`);
      return {
        contextBridge: { exposeInMainWorld: (name) => { exposed.push(name); } },
        ipcRenderer: { on() {}, send() {}, invoke() {} },
        webUtils: {},
      };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: preloadPath });
  return exposed;
}

describe('the flat-window mark does not drop the bridge', () => {
  it('exposes the bridge while the document element is still missing, then marks the window flat', () => {
    const { doc, html } = loadingDocument(false);
    const exposed = run({ platform: 'linux', document: doc });
    expect(exposed).toContain('zero');
    expect(html.dataset.window).toBeUndefined();
    doc.arrive();
    expect(html.dataset.window).toBe('flat');
  });

  it('marks a document that already has its element, including one that is still loading', () => {
    const present = loadingDocument(true);
    run({ platform: 'linux', document: { readyState: 'complete', documentElement: present.html, addEventListener() {} } });
    expect(present.html.dataset.window).toBe('flat');

    const early = loadingDocument(true);
    const exposed = run({ platform: 'linux', document: early.doc });
    expect(exposed).toContain('zero');
    expect(early.html.dataset.window).toBe('flat');
  });

  it('does not mark a Mac window flat, and still exposes the bridge', () => {
    const { doc, html } = loadingDocument(false);
    const exposed = run({ platform: 'darwin', document: doc });
    expect(exposed).toContain('zero');
    doc.arrive();
    expect(html.dataset.window).toBeUndefined();
    expect(html.dataset.glassAble).toBeUndefined();
  });

  // The glass mark (tests/on-a-mac-the-ground-can-be-glass) is set the same
  // way, from the argument main/window-glass.mts gives a Mac window.
  it('marks a window able to go glass only when it was started with the glass argument, and keeps the bridge', () => {
    const glass = loadingDocument(false);
    expect(run({ platform: 'darwin', document: glass.doc, argv: ['electron', GLASS_ARG] })).toContain('zero');
    expect(glass.html.dataset.glassAble).toBeUndefined();
    glass.doc.arrive();
    expect(glass.html.dataset.glassAble).toBe('');

    const plain = loadingDocument(true);
    expect(run({ platform: 'darwin', document: plain.doc, argv: ['electron'] })).toContain('zero');
    expect(plain.html.dataset.glassAble).toBeUndefined();
  });
});
