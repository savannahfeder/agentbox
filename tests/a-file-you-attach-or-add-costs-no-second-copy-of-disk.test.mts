// A FILE YOU ATTACH OR ADD COSTS NO SECOND COPY OF DISK.
//
// A Mac ran short of disk, and its largest files were the same launch films
// held two and three times over: a 625 MB film as an attachment and again in a
// folder (w-439393243c). Attaching, dragging into the reply box and adding to
// Files each copied every byte: measured before this, all three called
// copyFileSync with no clone flag. On APFS a clone shares the blocks, so the
// copy costs nothing until one side is changed. On a disk that cannot clone,
// COPYFILE_FICLONE falls back to an ordinary copy, so the file still arrives.
import { it, expect, beforeEach, afterEach, describe, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { saveAttachments } from '../main/save-attachments.mts';
import { stageAttachment } from '../main/stage-attachment.mts';

const { COPYFILE_FICLONE, COPYFILE_FICLONE_FORCE, COPYFILE_EXCL } = fs.constants;
const FILM = Buffer.from('not really a film, but bytes all the same');

let root; let from; let copies;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-'));
  from = path.join(root, 'launch film.mp4');
  fs.writeFileSync(from, FILM);
  copies = vi.spyOn(fs, 'copyFileSync');
});
afterEach(() => { copies.mockRestore(); fs.rmSync(root, { recursive: true, force: true }); });

const modes = () => copies.mock.calls.filter(([src]) => src === from).map(([, , mode]) => mode ?? 0);
const cloned = (mode) => (mode & COPYFILE_FICLONE) !== 0 && (mode & COPYFILE_FICLONE_FORCE) !== COPYFILE_FICLONE_FORCE;

describe('attaching a file to a message', () => {
  it('clones it into the attachments folder, and the bytes arrive', () => {
    const [saved] = saveAttachments(path.join(root, 'project'), [{ name: 'launch film.mp4', srcPath: from }]);
    expect(modes()).toHaveLength(1);
    expect(cloned(modes()[0])).toBe(true);
    expect(fs.readFileSync(path.join(root, 'project', saved.rel))).toEqual(FILM);
  });

  it('writes pasted bytes as they are, with no copy to clone', () => {
    const [saved] = saveAttachments(path.join(root, 'project'), [{ name: 'shot.png', dataBase64: FILM.toString('base64') }]);
    expect(copies).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(root, 'project', saved.rel))).toEqual(FILM);
  });
});

describe('dragging a file into the reply box', () => {
  it('clones it into the staging folder, and the bytes arrive', async () => {
    const out = await stageAttachment(path.join(root, '.staging'), { name: 'launch film.mp4', srcPath: from }, { turn: () => null });
    expect(modes()).toHaveLength(1);
    expect(cloned(modes()[0])).toBe(true);
    expect(fs.readFileSync(out.path)).toEqual(FILM);
  });
});

describe('adding a file to Files', () => {
  let place;
  beforeEach(async () => {
    disk._internals.forgetFolds();
    const accountRoot = path.join(root, 'accounts', 'a');
    const dir = path.join(accountRoot, 'company');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'company', name: 'Company' }));
    const store = await new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
    place = appFilesPlace({ store, accountRoot, storeRoot: root });
  });

  it('clones it, still refusing to overwrite a file already there', async () => {
    const picture = path.join(root, 'Logo.png');
    fs.writeFileSync(picture, FILM);
    from = picture;
    await place.addFiles({ project: 'Company', paths: [picture] });
    expect(modes()).toHaveLength(1);
    expect(cloned(modes()[0])).toBe(true);
    expect(modes()[0] & COPYFILE_EXCL).toBe(COPYFILE_EXCL);
    const documents = path.join(root, 'accounts', 'a', 'company', 'documents');
    const [added] = fs.readdirSync(documents);
    expect(fs.readFileSync(path.join(documents, added))).toEqual(FILM);
  });
});
