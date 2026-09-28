// CHOOSING A FOLDER FROM A TAB, WHICH IS THE ONE THING THE BROWSER ROUTE WAS
// MISSING AND THE ONE THING IT CANNOT DO WITHOUT.
//
// Agents run IN a folder. A route to the app that cannot point at one is not a
// route to the app. So the claim this file has to make good is narrow and it is
// the whole thing: a browser tab ends up holding a real absolute path to a real
// folder on this machine, and that path goes through the same refusal check a
// path from the Mac's own dialog goes through.
//
// WHY IT WORKS, BECAUSE THE OBVIOUS READING IS THAT IT CANNOT. A page is never
// handed a path by the operating system. But the process the terminal started
// is ordinary Node running as the person who typed the command, and it reads
// the disk exactly as the desktop app does. The tab asks it what is in a
// folder. So the answer is not "a browser can return a path" (it cannot, ever)
// but "nothing needs it to".

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listFolders, absolute } from '../main/folders.mjs';
import { bootHeadless, createServer, newToken, nodeHost } from '../main/serve.mjs';
import { checkProjectFolder } from '../shared/project-folder-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

let disk;

beforeAll(() => {
  // A small real disk, because the thing being tested is reading a real one.
  disk = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-disk-'));
  fs.mkdirSync(path.join(disk, 'dev', 'house', 'src'), { recursive: true });
  fs.mkdirSync(path.join(disk, 'dev', 'kestrel'), { recursive: true });
  fs.mkdirSync(path.join(disk, '.hidden'), { recursive: true });
  fs.writeFileSync(path.join(disk, 'dev', 'a-file.txt'), 'not a folder');
  fs.symlinkSync(path.join(disk, 'dev', 'house'), path.join(disk, 'shortcut'));
  fs.symlinkSync(path.join(disk, 'nothing-here'), path.join(disk, 'broken'));
});

afterAll(() => fs.rmSync(disk, { recursive: true, force: true }));

describe('reading one folder off the disk', () => {
  it('lists the folders in it and not the files', () => {
    const r = listFolders({ at: path.join(disk, 'dev'), home: disk });
    expect(r.folders.map((f) => f.name)).toEqual(['house', 'kestrel']);
    expect(r.at).toBe(path.join(disk, 'dev'));
  });

  it('hands back absolute paths, which is the whole point', () => {
    const r = listFolders({ at: path.join(disk, 'dev'), home: disk });
    for (const folder of r.folders) {
      expect(path.isAbsolute(folder.path)).toBe(true);
      expect(fs.statSync(folder.path).isDirectory()).toBe(true);
    }
  });

  it('follows a symlink to a folder and drops one that points nowhere', () => {
    // A checkout reached through a symlink is an ordinary way to keep code.
    const r = listFolders({ at: disk, home: disk });
    const names = r.folders.map((f) => f.name);
    expect(names).toContain('shortcut');
    expect(names).not.toContain('broken');
  });

  it('hides dotted folders unless they are asked for', () => {
    expect(listFolders({ at: disk, home: disk }).folders.map((f) => f.name)).not.toContain('.hidden');
    expect(listFolders({ at: disk, home: disk, showHidden: true }).folders.map((f) => f.name)).toContain('.hidden');
  });

  it('offers the way back up, and stops at the root', () => {
    expect(listFolders({ at: path.join(disk, 'dev'), home: disk }).parent).toBe(disk);
    expect(listFolders({ at: '/', home: disk }).parent).toBe(null);
  });

  it('says so instead of throwing when the folder is not there', () => {
    const r = listFolders({ at: path.join(disk, 'no-such-thing'), home: disk });
    expect(r.folders).toEqual([]);
    expect(r.unreadable).toBeTruthy();
  });

  it('reads ~ as the home folder, the way our own screens write it', () => {
    expect(absolute('~', disk)).toBe(disk);
    expect(absolute('~/dev', disk)).toBe(path.join(disk, 'dev'));
    expect(absolute('', disk)).toBe(disk);
  });
});

describe('the folder channel, over http, with no Electron', () => {
  let dir, booted, server, token, base;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-pick-'));
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
    booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    token = newToken();
    server = createServer({
      channels: booted.channels, token, listeners: booted.window.listeners,
      dist: path.join(dir, 'no-screen-here'),
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise((done) => server.close(done));
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const ask = async (channel, payload) => {
    const res = await fetch(`${base}/api/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agentbox-token': token },
      body: JSON.stringify(payload ?? null),
    });
    return { status: res.status, body: await res.json() };
  };

  it('walks a real folder for a caller that has no operating system dialog', async () => {
    const r = await ask('zero:list-folders', { at: path.join(disk, 'dev') });
    expect(r.status).toBe(200);
    expect(r.body.folders.map((f) => f.name)).toEqual(['house', 'kestrel']);
    // The thing a browser can never produce by itself.
    expect(path.isAbsolute(r.body.folders[0].path)).toBe(true);
  });

  it('tells the screen to draw its own picker rather than refusing', async () => {
    // This used to answer with a sentence saying the desktop app was needed,
    // which was wrong: nothing about this needs the desktop app.
    const r = await ask('zero:choose-folder', {});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ path: null, browse: true });
    expect(JSON.stringify(r.body)).not.toMatch(/desktop app/i);
  });

  it('says on the folder she is standing in whether it would be turned down', async () => {
    // The home folder is refused, because a worker started there lists
    // everything on the machine and macOS asks about each guarded folder.
    const home = await ask('zero:list-folders', { at: os.homedir() });
    expect(home.body.refused).toBeTruthy();
    expect(home.body.refused).toBe(checkProjectFolder(os.homedir(), { home: os.homedir() }).say);

    // And an ordinary project folder is not.
    const fine = await ask('zero:list-folders', { at: path.join(disk, 'dev', 'house') });
    expect(fine.body.refused).toBe(null);
  });

  it('never serves the contents of a file', async () => {
    // This reads directory NAMES so somebody can point at one. Anything that
    // hands back what is inside a file is a different and much larger promise.
    const source = fs.readFileSync(path.join(repoRoot, 'main', 'folders.mjs'), 'utf8');
    expect(source).not.toMatch(/readFileSync|createReadStream/);
  });
});

describe('the stand-in dialog', () => {
  it('says there is no dialog, and does not claim a tab cannot choose', async () => {
    const { dialog } = nodeHost();
    const answer = await dialog.showOpenDialog();
    expect(answer.noDialog).toBe(true);
    expect(answer.canceled).toBe(true);
    expect(answer.refused).toBeUndefined();
  });
});
