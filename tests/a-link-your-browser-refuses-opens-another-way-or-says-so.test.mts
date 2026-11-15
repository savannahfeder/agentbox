// A LINK YOUR BROWSER REFUSES OPENS ANOTHER WAY, OR SAYS IT DID NOT OPEN.
//
// Reported after the default browser on a Mac was changed to Chrome: no link in
// the app opened any more, by click, by ⌘-click or by the pane's "Open in your
// browser". Read in the code: every one of those ends in Electron's
// `shell.openExternal`, and every caller dropped its promise, so when macOS
// refused the hand-off the click did nothing and nothing was written anywhere.
// `zero:open-artifact` even answered `ok: true` before the browser had replied.
//
// Now one opener waits for the answer, tries the system's own `open` (Linux:
// `xdg-open`) when Electron is refused, and answers `ok: false` when both fail,
// so the card's existing "could not be opened" notice appears.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { openInBrowser } from '../main/open-in-browser.mts';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const URL_ = 'https://console.cloud.google.com/iam-admin/iam';

function harness({ electron = 'ok', system = 'ok', platform = 'darwin' } = {}) {
  const calls = { electron: [], system: [], log: [] };
  const shell = {
    openExternal: (url) => {
      calls.electron.push(url);
      if (electron === 'ok') return Promise.resolve();
      if (electron === 'hang') return new Promise(() => {});
      return Promise.reject(new Error('The application “Google Chrome” could not be launched (-10810)'));
    },
  };
  const run = async (cmd, args, opts) => {
    calls.system.push({ cmd, args, opts });
    if (system !== 'ok') throw new Error('LSOpenURLsWithRole() failed with error -10810');
  };
  const open = (url) => openInBrowser(url, { shell, platform, run, log: (l) => calls.log.push(l), waitMs: 20 });
  return { calls, open };
}

describe('Electron opens it', () => {
  it('answers ok and runs nothing else', async () => {
    const h = harness();
    expect(await h.open(URL_)).toEqual({ ok: true });
    expect(h.calls.electron).toEqual([URL_]);
    expect(h.calls.system).toEqual([]);
  });
});

describe('Electron is refused', () => {
  it('hands the address to macOS’s own open, and answers ok when that works', async () => {
    const h = harness({ electron: 'refused' });
    expect(await h.open(URL_)).toEqual({ ok: true });
    expect(h.calls.system).toHaveLength(1);
    expect(h.calls.system[0].cmd).toBe('/usr/bin/open');
    expect(h.calls.system[0].args).toEqual([URL_]);
    expect(h.calls.system[0].opts.timeout).toBeGreaterThan(0);
    expect(h.calls.log.join('\n')).toMatch(/-10810/);
  });

  it('uses xdg-open on Linux', async () => {
    const h = harness({ electron: 'refused', platform: 'linux' });
    expect(await h.open(URL_)).toEqual({ ok: true });
    expect(h.calls.system[0].cmd).toBe('xdg-open');
  });

  it('answers not ok, with both reasons in the log, when the system opener fails too', async () => {
    const h = harness({ electron: 'refused', system: 'refused' });
    const answer = await h.open(URL_);
    expect(answer.ok).toBe(false);
    expect(answer.error).toBe(`${URL_} could not be opened.`);
    const log = h.calls.log.join('\n');
    expect(log).toMatch(/could not be launched/);
    expect(log).toMatch(/LSOpenURLsWithRole/);
  });

  it('answers not ok on a platform with no system opener', async () => {
    const h = harness({ electron: 'refused', platform: 'win32' });
    expect((await h.open(URL_)).ok).toBe(false);
    expect(h.calls.system).toEqual([]);
  });
});

describe('Electron never answers', () => {
  it('stops waiting at the deadline and does not open a second copy', async () => {
    const h = harness({ electron: 'hang' });
    const answer = await h.open(URL_);
    expect(answer.ok).toBe(false);
    expect(h.calls.system).toEqual([]);
    expect(h.calls.log.join('\n')).toMatch(/did not answer/);
  });
});

describe('only a web or mail address ever reaches the system opener', () => {
  // `open` on a path or an app bundle runs it, so a refused file: or
  // javascript: address must stop at Electron's refusal.
  for (const url of ['file:///Applications/Calculator.app', '/Applications/Calculator.app', 'javascript:alert(1)', 'x-apple.systempreferences:foo']) {
    it(`not ${url}`, async () => {
      const h = harness({ electron: 'refused' });
      expect((await h.open(url)).ok).toBe(false);
      expect(h.calls.system).toEqual([]);
    });
  }

  it('a mailto: address does', async () => {
    const h = harness({ electron: 'refused' });
    expect(await h.open('mailto:someone@example.com')).toEqual({ ok: true });
    expect(h.calls.system).toHaveLength(1);
  });
});

describe('every link in the window goes through it', () => {
  it('the card’s and the pane’s opener waits for the answer', () => {
    const ipc = read('main/ipc.mts');
    const handler = ipc.slice(ipc.indexOf("'zero:open-artifact'"), ipc.indexOf("'zero:folder-pictures'"));
    expect(handler).toMatch(/await openInBrowser\(src/);
    expect(handler).not.toMatch(/shell\.openExternal\(src\)/);
  });

  it('the window’s own link handlers do too', () => {
    const main = read('main/main.mts');
    expect(main).not.toMatch(/if \(\/\^https\?:\/\.test\(url\)\) shell\.openExternal\(url\)/);
    expect(main).not.toMatch(/else shell\.openExternal\(url\)/);
    expect(main.match(/openInBrowser\(url/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
