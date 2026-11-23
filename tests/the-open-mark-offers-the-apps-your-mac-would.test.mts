// THE OPEN MARK OFFERS THE APPS YOUR MAC WOULD, AND SAYS WHEN ONE IS OPENING.
//
// What broke (2026-11-22): the open mark over a table handed the csv to the
// Mac's default app with no word on screen, and that app was Codex, which took
// about ten seconds to start (the freeze itself is
// opening-a-file-on-a-mac-never-freezes-the-window). She asked for a choice of
// where it opens, the way other apps offer one, and a sign that something is
// happening. She picked option 1 of five drawn: the same mark opens a menu of
// the apps the Mac lists for the file, default first, then Show in Finder, and
// the row picked says Opening until the app is up.
//
// Measured here: the Mac's answer read into rows, the osascript call that asks
// it, the open with a chosen app, the two IPC channels with a fake shell, and
// the menu drawn through react-dom/server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appsFromAnswer, appsThatOpen, APPS_MS, ASK_THE_MAC } from '../main/open-with.mts';
import { openForThePerson } from '../main/opens-a-program.mts';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { registerIpc } from '../main/ipc.mts';
import { collectingIpcMain, broadcastingWindow, nodeHost } from '../main/serve.mts';
import { OpenWithMenu, DEFAULT_APP, IN_FOLDER } from '../renderer/src/components/OpenWith.tsx';
import { api } from '../renderer/src/api.ts';

const answer = (first: string | null, paths: string[]) => JSON.stringify({ first, paths });

describe("the Mac's answer, as rows", () => {
  it('puts the default first and the rest by name', () => {
    const apps = appsFromAnswer(answer('/Applications/Codex.app', ['/Applications/TextEdit.app', '/Applications/Codex.app', '/Applications/Microsoft Excel.app', '/Applications/Numbers.app']));
    expect(apps.map((a) => a.name)).toEqual(['Codex', 'Microsoft Excel', 'Numbers', 'TextEdit']);
    expect(apps.map((a) => a.isDefault)).toEqual([true, false, false, false]);
    expect(apps[0].path).toBe('/Applications/Codex.app');
  });

  it('lists an app once when the Mac knows two copies of it, keeping the default copy', () => {
    const apps = appsFromAnswer(answer('/Applications/Numbers.app', ['/Users/x/Downloads/Numbers.app', '/Applications/Numbers.app', '/Applications/numbers.app']));
    expect(apps).toEqual([{ path: '/Applications/Numbers.app', name: 'Numbers', isDefault: true }]);
  });

  it('still lists the apps when there is no default, and marks none', () => {
    const apps = appsFromAnswer(answer(null, ['/Applications/TextEdit.app', '/Applications/BBEdit.app']));
    expect(apps.map((a) => [a.name, a.isDefault])).toEqual([['BBEdit', false], ['TextEdit', false]]);
  });

  it('keeps only apps, and reads a broken answer as no list', () => {
    expect(appsFromAnswer(answer('/usr/bin/vim', ['/usr/bin/vim', '/Applications/Numbers.app', 3 as unknown as string]))
      .map((a) => [a.name, a.isDefault])).toEqual([['Numbers', false]]);
    for (const text of ['', 'not json', 'null', '[]', '{"paths":"x"}']) expect(appsFromAnswer(text), text).toEqual([]);
  });
});

describe('asking the Mac', () => {
  const asker = (reply: () => Promise<string>) => {
    const calls: [string, string[], { timeout: number }][] = [];
    return { calls, ask: (cmd: string, args: string[], opts: { timeout: number }) => { calls.push([cmd, args, opts]); return reply(); } };
  };

  it('asks NSWorkspace through osascript, with the file as an argument and a deadline', async () => {
    const a = asker(async () => `${answer('/Applications/Numbers.app', ['/Applications/Numbers.app'])}\n`);
    const apps = await appsThatOpen('/tmp/it has spaces/leads.csv', { platform: 'darwin', ask: a.ask });
    expect(apps.map((x) => x.name)).toEqual(['Numbers']);
    expect(a.calls).toEqual([['/usr/bin/osascript', ['-l', 'JavaScript', '-e', ASK_THE_MAC, '/tmp/it has spaces/leads.csv'], { timeout: APPS_MS }]]);
    expect(ASK_THE_MAC).toContain('URLsForApplicationsToOpenURL');
    expect(ASK_THE_MAC).toContain('URLForApplicationToOpenURL');
    expect(ASK_THE_MAC).toContain('argv[0]');
    expect(APPS_MS).toBeLessThanOrEqual(10_000);
  });

  it('offers no list when the Mac will not say, and never asks anywhere else', async () => {
    const refused = asker(async () => { throw new Error('execution error: -2700'); });
    expect(await appsThatOpen('/tmp/a.csv', { platform: 'darwin', ask: refused.ask })).toEqual([]);
    for (const platform of ['linux', 'win32'] as const) {
      const a = asker(async () => answer('/x.app', ['/x.app']));
      expect(await appsThatOpen('/tmp/a.csv', { platform, ask: a.ask })).toEqual([]);
      expect(a.calls).toEqual([]);
    }
  });
});

describe('opening with the app you picked', () => {
  // Resolved, because open is handed the checked real path and a Mac's temp folder is behind a link.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'open-with-')));
  const file = (name: string, mode = 0o644) => { const p = path.join(dir, name); fs.writeFileSync(p, 'a,b\n'); fs.chmodSync(p, mode); return p; };
  const shell = () => { const calls: string[][] = []; return { calls, openPath: async (p: string) => { calls.push(['openPath', p]); return ''; }, showItemInFolder: (p: string) => { calls.push(['finder', p]); } }; };

  it('hands that app to open on a Mac', async () => {
    const ran: string[][] = [];
    const p = file('leads.csv');
    expect(await openForThePerson(shell(), p, { app: '/Applications/Microsoft Excel.app', platform: 'darwin', run: async (cmd, args) => { ran.push([cmd, ...args]); } })).toBe('');
    expect(ran).toEqual([['/usr/bin/open', '-a', '/Applications/Microsoft Excel.app', p]]);
  });

  it('still shows a program in Finder whatever app was picked', async () => {
    const s = shell();
    const ran: string[][] = [];
    const p = file('run.command', 0o755);
    await openForThePerson(s, p, { app: '/Applications/Terminal.app', platform: 'darwin', run: async (cmd, args) => { ran.push([cmd, ...args]); } });
    expect(ran).toEqual([]);
    expect(s.calls).toEqual([['finder', p]]);
  });
});

describe('the two channels the menu uses', () => {
  let root: string;
  let leads: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-with-ipc-'));
    fs.mkdirSync(path.join(root, 'p'));
    fs.writeFileSync(path.join(root, 'p', 'project.json'), JSON.stringify({ name: 'Example' }));
    leads = path.join(root, 'p', 'leads.csv');
    fs.writeFileSync(leads, 'a,b\n1,2\n');
    vi.spyOn(fs, 'watch').mockReturnValue({ close() {} } as unknown as fs.FSWatcher);
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

  const LISTED = [{ path: '/Applications/Numbers.app', name: 'Numbers', isDefault: true }, { path: '/Applications/TextEdit.app', name: 'TextEdit', isDefault: false }];
  async function door({ opens = true } = {}) {
    const store = await new Store({ accountRoot: root, products: [] }).init();
    const supervisor = new Supervisor({ storeRoot: root, maxConcurrentSessions: 1 }, store, root);
    supervisor.spawnWorker = vi.fn();
    const ipcMain = collectingIpcMain();
    const shown: string[] = [];
    const opened: string[] = [];
    const base = nodeHost();
    const shell = { openExternal: async () => {}, showItemInFolder: (p: string) => { shown.push(p); }, ...(opens ? { openPath: async (p: string) => { opened.push(p); return ''; } } : {}) };
    const asked: string[] = [];
    registerIpc({
      store, supervisor, config: { storeRoot: root, accountRoot: root }, window: broadcastingWindow(),
      host: { ...base, ipcMain, shell, app: { ...base.app, getFileIcon: async (p: string) => ({ toDataURL: () => `data:image/png;base64,${Buffer.from(p).toString('base64')}` }) } },
      listApps: async (f: string) => { asked.push(f); return LISTED; },
    });
    const call = (channel: string, payload: unknown) => ipcMain.handlers.get(channel)(null, payload);
    return { call, shown, opened, asked };
  }

  it('lists the apps for the file, each with its own icon, and the way to Finder', async () => {
    const d = await door();
    const r = await d.call('zero:open-with', { product: 'p', src: 'leads.csv' });
    expect(r.ok).toBe(true);
    expect(r.reveal).toBe(true);
    expect(r.apps.map((a: { name: string }) => a.name)).toEqual(['Numbers', 'TextEdit']);
    expect(Buffer.from(r.apps[1].icon.split(',')[1], 'base64').toString()).toBe('/Applications/TextEdit.app');
    expect(d.asked.map((f) => fs.realpathSync(f))).toEqual([fs.realpathSync(leads)]);
  });

  it('lists no apps where the copy cannot open files, and none for a web page', async () => {
    const quiet = await door({ opens: false });
    expect((await quiet.call('zero:open-with', { product: 'p', src: 'leads.csv' })).apps).toEqual([]);
    expect(quiet.asked).toEqual([]);
    const d = await door();
    expect((await d.call('zero:open-with', { product: 'p', src: 'https://example.com/a.csv' })).apps).toEqual([]);
    expect((await d.call('zero:open-with', { product: 'p', src: 'nowhere.csv' })).ok).toBe(false);
  });

  it('refuses an app the Mac did not offer for that file, and opens nothing', async () => {
    const d = await door({ opens: false });
    const r = await d.call('zero:open-artifact', { product: 'p', src: 'leads.csv', app: '/Users/x/Downloads/Planted.app' });
    expect(r).toEqual({ ok: false, error: 'That app does not open this kind of file.' });
    expect(d.opened).toEqual([]);
    expect((await d.call('zero:open-artifact', { product: 'p', src: 'leads.csv', app: '/Applications/TextEdit.app' })).ok).toBe(true);
  });

  it('shows the file in Finder for Show in Finder, and opens nothing', async () => {
    const d = await door();
    const r = await d.call('zero:open-artifact', { product: 'p', src: 'leads.csv', mode: 'reveal' });
    expect(r.ok).toBe(true);
    expect(d.shown.map((f) => fs.realpathSync(f))).toEqual([fs.realpathSync(leads)]);
    expect(d.opened).toEqual([]);
  });
});

describe('the menu', () => {
  const list = { ok: true, reveal: true, finder: true, apps: [
    { path: '/Applications/Numbers.app', name: 'Numbers', isDefault: true, icon: 'data:image/png;base64,AA' },
    { path: '/Applications/Microsoft Excel.app', name: 'Microsoft Excel', isDefault: false, icon: null },
  ] };
  const draw = (props: Partial<React.ComponentProps<typeof OpenWithMenu>>) => renderToStaticMarkup(React.createElement(OpenWithMenu, { list, opening: null, onPick: () => {}, ...props }));
  const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  it('lists the apps in order, marks only the default, and ends with Show in Finder', () => {
    const html = draw({});
    expect(words(html)).toBe('Numbers Default Microsoft Excel Show in Finder');
    expect(html).toContain('src="data:image/png;base64,AA"');
    expect(html).toContain('role="menu"');
    expect(html).not.toContain('aria-busy');
  });

  it('says Opening on the row picked, in place of Default, until the app is up', () => {
    const html = draw({ opening: '/Applications/Numbers.app' });
    expect(words(html)).toBe('Numbers Opening Microsoft Excel Show in Finder');
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/open-with-spin/g)).toHaveLength(1);
    expect(words(draw({ opening: '/Applications/Microsoft Excel.app' }))).toBe('Numbers Default Microsoft Excel Opening Show in Finder');
    expect(draw({ opening: IN_FOLDER })).not.toContain('open-with-spin');
  });

  it('keeps room for Opening on every app row, so the menu does not widen when you pick one', () => {
    // Measured in the built screen: 236 points wide at rest, 252 once Opening appeared beside Microsoft Excel.
    expect(draw({}).match(/open-with-detail/g)).toHaveLength(list.apps.length);
    const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.open-with-menu \.open-with-detail \{[^}]*min-width: 86px/);
  });

  it('still offers the default app when the Mac gave no list', () => {
    expect(words(draw({ list: { ok: false, apps: [], reveal: true, finder: true } }))).toBe('Default app Show in Finder');
    expect(DEFAULT_APP).not.toMatch(/\//);
  });

  it('names the folder by what this computer calls it, and leaves it out where it cannot be shown', () => {
    expect(words(draw({ list: { ...list, finder: false } }))).toContain('Show in folder');
    expect(words(draw({ list: { ...list, reveal: false } }))).toBe('Numbers Default Microsoft Excel');
  });
});

describe('where the menu is', () => {
  const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

  it('is the open mark over a file beside the chat and over one in Focus', () => {
    expect(read('renderer/src/components/DocPane.tsx')).toContain('<OpenWithMark');
    expect(read('renderer/src/components/ArtifactView.tsx')).toContain('<OpenWithMark');
  });

  it('reads no list on a door that has no such channel', async () => {
    const was = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { zero: { openWith: async () => { throw new Error('not here'); } } };
    try { expect(await api.appsThatOpen({ product: 'p', src: 'a.csv' })).toEqual({ ok: false, apps: [] }); }
    finally { (globalThis as { window?: unknown }).window = was; }
  });
});
