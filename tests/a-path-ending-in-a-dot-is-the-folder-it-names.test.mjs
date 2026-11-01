// A PATH ENDING IN "/." IS THE FOLDER IT NAMES, NOT A FOLDER CALLED ".".
//
// QA on the Linux box, 2026-10-27 (F-123). The GTK chooser's location bar was
// left holding a path ending in "/." and Open handed that back whole. Nothing
// between the dialog and the store took the "." off, so the project was made
// for a path nobody had typed and named after the wrong folder.
//
// The same gap let a typed "~/." walk straight past the refusal that exists to
// stop a worker being started in the home folder: `tidy` only took trailing
// slashes off, so "/Users/esther/." was not equal to "/Users/esther" and the
// check said yes to the whole home folder.
//
// Measured on the normaliser and on the check, and then on the handler itself
// with a dialog that answers the way GTK answered.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkProjectFolder, tidyFolder } from '../shared/project-folder-check.mts';
import { bootHeadless, nodeHost } from '../main/serve.mts';

const HOME = '/Users/esther';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('1. the path a picker hands back, tidied', () => {
  it('drops a "." that means "this folder"', () => {
    expect(tidyFolder('/workspace/repos/range-utils-js/.')).toBe('/workspace/repos/range-utils-js');
    expect(tidyFolder('/workspace/repos/.')).toBe('/workspace/repos');
    expect(tidyFolder('/workspace/./repos')).toBe('/workspace/repos');
  });

  it('walks a ".." up one, which is what the path says', () => {
    expect(tidyFolder('/workspace/repos/range-utils-js/..')).toBe('/workspace/repos');
    expect(tidyFolder('/workspace/repos/../other')).toBe('/workspace/other');
  });

  it('still takes trailing and doubled slashes off', () => {
    expect(tidyFolder('/workspace/repos/')).toBe('/workspace/repos');
    expect(tidyFolder('/workspace//repos///')).toBe('/workspace/repos');
  });

  it('leaves the roots alone, because there is nothing above them', () => {
    expect(tidyFolder('/')).toBe('/');
    expect(tidyFolder('/..')).toBe('/');
    expect(tidyFolder('~')).toBe('~');
    expect(tidyFolder('~/')).toBe('~');
    expect(tidyFolder('')).toBe('');
  });

  it('keeps the "~" our own screens write the home folder with', () => {
    expect(tidyFolder('~/dev/house/.')).toBe('~/dev/house');
    expect(tidyFolder('~/dev/./house')).toBe('~/dev/house');
  });
});

describe('2. the refusals cannot be walked around with a dot', () => {
  it('turns down the home folder written with a "." on the end', () => {
    const r = checkProjectFolder(`${HOME}/.`, { home: HOME });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('home');
    expect(checkProjectFolder(`${HOME}/./`, { home: HOME }).ok).toBe(false);
    expect(checkProjectFolder('~/.', { home: HOME }).ok).toBe(false);
  });

  it('turns down a guarded folder reached the long way round', () => {
    const r = checkProjectFolder(`${HOME}/Documents/.`, { home: HOME });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('guarded');
    expect(checkProjectFolder(`${HOME}/Documents/my-app/..`, { home: HOME }).reason).toBe('guarded');
  });

  it('turns down the home folder reached by climbing back out of a project', () => {
    expect(checkProjectFolder(`${HOME}/dev/..`, { home: HOME }).reason).toBe('home');
  });

  it('and a real project is still a real project', () => {
    expect(checkProjectFolder(`${HOME}/Documents/my-app/.`, { home: HOME }).ok).toBe(true);
    expect(checkProjectFolder(`${HOME}/dev/house/`, { home: HOME }).ok).toBe(true);
  });
});

describe('3. the handler the dialog answers to', () => {
  let dir, disk, booted, picked;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-dotpath-'));
    disk = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-dotdisk-'));
    fs.mkdirSync(path.join(disk, 'repos', 'range-utils-js'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
    const host = nodeHost();
    // The GTK chooser hands back whatever its location bar held.
    host.dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [picked] }) };
    booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir, host });
  }, 60_000);

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(disk, { recursive: true, force: true });
  });

  const choose = async (p) => {
    picked = p;
    return booted.channels.get('zero:choose-folder')({}, {});
  };

  it('hands back the folder the path names, with the dot gone', async () => {
    const want = path.join(disk, 'repos', 'range-utils-js');
    expect((await choose(`${want}/.`)).path).toBe(want);
    expect((await choose(`${want}/`)).path).toBe(want);
  });

  it('does not hand back the parent of the folder that was opened', async () => {
    const answer = await choose(`${path.join(disk, 'repos', 'range-utils-js')}/.`);
    expect(answer.path).not.toBe(path.join(disk, 'repos'));
  });

  it('refuses the home folder when the dot is what is hiding it', async () => {
    const answer = await choose(`${os.homedir()}/.`);
    expect(answer.path).toBe(null);
    expect(answer.refused).toMatch(/whole home folder/);
  });
});
