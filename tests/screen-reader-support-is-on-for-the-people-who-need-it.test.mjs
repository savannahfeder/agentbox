// THE LAST CRASH OF LAUNCH WEEK, AND THE ONE WE TURNED ON OURSELVES.
//
// One install, one report, 91 minutes in. Message "invalid range", and two
// frames that name the culprit outright:
//
//   qt._handleSelectionChange  app:renderer/dist/assets/xterm-BT7tBf8A.js:26
//   HTMLDocument.<anonymous>   app:renderer/dist/assets/xterm-BT7tBf8A.js:25
//
// That is xterm's own AccessibilityManager. It listens on the DOCUMENT for
// 'selectionchange', works out which terminal row and column the selection
// covers, and if that comes back empty or reversed it does
// `throw new Error('invalid range')` under its own comment, "This should not
// happen unless we have some bugs." It is xterm's bug, not ours, and there is
// no newer xterm to take: 6.0.0 is both what we ship and what npm offers.
//
// WHAT IS OURS. AccessibilityManager is built only when `screenReaderMode` is
// on. xterm's own default for it is false (OptionsService.ts), and it exists,
// in xterm's words, "to support NVDA on Windows and VoiceOver on macOS".
// TaskTerminal.tsx turned it on for EVERYBODY, unconditionally. Electron is
// blunter still about what that costs, beside its own accessibility switch:
// "Rendering accessibility tree can significantly affect the performance of
// your app. It should not be enabled by default."
//
// So every install was paying for an accessibility tree it was not using, and
// one of them found the bug in it. The fix is not to drop screen reader
// support, and not to vendor a patch into a minified bundle we cannot test
// against a crash we cannot yet reproduce. It is to ask the question we never
// asked: is anybody actually using assistive technology? macOS and Windows
// both answer, through `app.accessibilitySupportEnabled`.
//
// WHAT THIS DOES NOT FIX, said plainly because the next person will ask: a
// VoiceOver user still has the AccessibilityManager, and still has xterm's
// bug. This narrows who meets it from everyone to the people the feature is
// for; it does not repair xterm's row-and-column arithmetic. That needs a
// reproduction and an upstream fix, which is filed separately.
//
// The read happens when a terminal is BUILT, not on a live subscription.
// Turning VoiceOver on mid-session is rare, a terminal pane in this app is
// opened and closed constantly, and the next one opened picks the new answer
// up. A subscription for that is machinery nobody asked for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { registerIpc } from '../main/ipc.mjs';
import { collectingIpcMain, broadcastingWindow, nodeHost } from '../main/serve.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let store;
let dir;
let home;

beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-a11y-'));
  dir = path.join(home, 'p');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Example' }));
  store = await new Store({ accountRoot: home, products: [] }).init();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

// The one handler, driven for real through registerIpc.
function askTheApp(app) {
  const ipcMain = collectingIpcMain();
  const sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 1 }, store, home);
  sup.spawnWorker = vi.fn();
  const host = nodeHost();
  registerIpc({
    store,
    supervisor: sup,
    config: { storeRoot: home },
    window: broadcastingWindow(),
    host: { ...host, ipcMain, app: { ...host.app, ...app } },
  });
  const handler = ipcMain.handlers.get('zero:assistiveTech');
  return { handler, answer: handler ? handler(null) : undefined };
}

describe('the app answers whether assistive technology is running', () => {
  // THE CASE THAT MUST BE FALSE, which is nearly every install: nobody is
  // using a screen reader, so nobody pays for the accessibility tree.
  it('says no when macOS reports no assistive technology', () => {
    expect(askTheApp({ accessibilitySupportEnabled: false }).answer).toBe(false);
  });

  // AND THE CASE THE FEATURE EXISTS FOR.
  it('says yes when macOS reports assistive technology', () => {
    expect(askTheApp({ accessibilitySupportEnabled: true }).answer).toBe(true);
  });

  // THE BOUNDARY: Electron documents this property for darwin and win32 only,
  // so on Linux, or on an Electron that has not emitted `ready` yet, it is
  // simply absent. Absent is "no", and reading it may not throw: this runs on
  // the path that opens a terminal.
  it('says no, without throwing, when the platform does not answer', () => {
    const { handler, answer } = askTheApp({});
    expect(handler).toBeTruthy();
    expect(answer).toBe(false);
    expect(() => handler(null)).not.toThrow();
  });

  // A truthy non-boolean is still an answer about a boolean question, and the
  // renderer hands it straight to xterm, which wants a real boolean.
  it('always answers a boolean', () => {
    expect(askTheApp({ accessibilitySupportEnabled: 1 }).answer).toBe(true);
    expect(askTheApp({ accessibilitySupportEnabled: undefined }).answer).toBe(false);
  });
});

// The renderer half is read as source, for the reason the other renderer tests
// give: there is no harness here that runs effects, and the terminal is built
// inside one.
describe('the terminal asks before it turns the accessibility tree on', () => {
  const terminal = read('renderer/src/components/TaskTerminal.tsx');
  const preload = read('preload.cjs');
  const api = read('renderer/src/api.ts');
  const ipc = read('main/ipc.mjs');

  // THE REPORTED ONE: this is the line that gave every install an
  // accessibility tree, and the crash in it.
  it('no longer turns screen reader mode on for everybody', () => {
    expect(terminal).not.toContain('screenReaderMode:true');
    expect(terminal).not.toContain('screenReaderMode: true');
  });

  it('sets screen reader mode from the answer instead', () => {
    expect(terminal).toMatch(/screenReaderMode\s*:\s*assistive/);
  });

  // The whole way down, and the channel is named ONLY in the preload: the
  // renderer hands over a function name and never a channel, which is the rule
  // the rest of this bridge already follows.
  it('asks the main process for that answer', () => {
    expect(terminal).toContain('api.assistiveTech');
    expect(api).toMatch(/window\.zero\?\.assistiveTech/);
    expect(preload).toContain("ipcRenderer.invoke('zero:assistiveTech')");
    expect(ipc).toContain("ipcMain.handle('zero:assistiveTech'");
  });

  // THE CASE THAT MUST NOT BREAK THE APP. A terminal that cannot ask is a
  // terminal that still opens: this runs in the same effect that builds it,
  // and an older preload after an update has no such channel at all.
  it('falls back to off rather than failing to open a terminal', () => {
    expect(api).toMatch(/assistiveTech[\s\S]{0,400}?catch/);
    expect(api).toMatch(/window\.zero\?\.assistiveTech/);
  });
});
