// A DRAFT SURVIVES THE WINDOW'S STORAGE BEING THROWN AWAY (w-4d2fa02866).
//
// Reported: "was in the middle of writing a task, app crashed and all my saved
// inputs were gone."
//
// Measured on her Mac: every draft lives in the window's localStorage, and that
// is one Chromium database. On 2026-11-08 the disk filled (the run host logged
// ENOSPC from 22:12 to 22:36), Chromium's writes to that database failed, and
// at 22:46 its log reads "Creating DB ... since it was missing": it had thrown
// the whole database away and made an empty one, with the app still running
// (up 255 minutes at 22:42). The open window kept showing every draft from its
// memory, so nothing looked wrong until the restart at 11:38 the next morning,
// when all of them were gone at once.
//
// The fix keeps a second copy of the drafts in a file the app writes itself,
// and the window fills back from it whatever its storage no longer has.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isDraftKey, takeDraftCopy, putDraftsBack, COPY_STAMP_KEY,
} from '../renderer/src/draft-copy';
import { readDraftCopyFile, writeDraftCopyFile } from '../main/draft-copy.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

const fakeStore = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

describe('which keys are drafts', () => {
  it('takes every kind of unsent words', () => {
    for (const k of [
      'zero.draft.agentbox-team:w-1', 'zero.draftimg.agentbox-team:w-1', 'zero.draftpick.p:w-1',
      'zero.draftwhen.p:w-1', 'zero.draft.compose', 'zero.draft.compose.card-2',
      'zero.commentdraft.p:doc.md', 'doc-edit-draft:p:notes.md',
    ]) expect(isDraftKey(k), k).toBe(true);
  });
  it('leaves settings, the heartbeat and its own stamp out', () => {
    for (const k of ['zero.theme', 'zero.skin', 'zero.window-alive', COPY_STAMP_KEY, 'draft', 'my.zero.draft.x'])
      expect(isDraftKey(k), k).toBe(false);
  });
});

describe('the copy', () => {
  it('holds only the drafts, and stamps the storage with the same moment', () => {
    const s = fakeStore({ 'zero.draft.p:w-1': 'half a sentence', 'zero.theme': 'dark' });
    const copy = takeDraftCopy(s, 1000);
    expect(copy).toEqual({ at: 1000, drafts: { 'zero.draft.p:w-1': 'half a sentence' } });
    expect(s.getItem(COPY_STAMP_KEY)).toBe('1000');
  });
});

describe('putting drafts back', () => {
  const copy = { at: 2000, drafts: { 'zero.draft.compose': 'a whole task', 'zero.draft.p:w-1': 'a reply' } };

  it('brings every draft back into storage that was thrown away (her case)', () => {
    const s = fakeStore();
    expect(putDraftsBack(s, copy)).toBe(2);
    expect(s.getItem('zero.draft.compose')).toBe('a whole task');
    expect(s.getItem('zero.draft.p:w-1')).toBe('a reply');
  });

  it('brings them back when the new storage was stamped after the wipe but lost the drafts', () => {
    // The window kept writing into the empty database, stamp included.
    const s = fakeStore({ [COPY_STAMP_KEY]: '2000' });
    expect(putDraftsBack(s, copy)).toBe(2);
    expect(s.getItem('zero.draft.compose')).toBe('a whole task');
  });

  it('takes the copy over older words when the storage lost its last writes', () => {
    const s = fakeStore({ [COPY_STAMP_KEY]: '1500', 'zero.draft.compose': 'a whole' });
    putDraftsBack(s, copy);
    expect(s.getItem('zero.draft.compose')).toBe('a whole task');
  });

  it('never writes over words the storage holds that are newer than the copy', () => {
    const s = fakeStore({ [COPY_STAMP_KEY]: '2000', 'zero.draft.compose': 'a whole task, edited since' });
    putDraftsBack(s, copy);
    expect(s.getItem('zero.draft.compose')).toBe('a whole task, edited since');
    const later = fakeStore({ [COPY_STAMP_KEY]: '2500', 'zero.draft.compose': 'newer' });
    putDraftsBack(later, copy);
    expect(later.getItem('zero.draft.compose')).toBe('newer');
  });

  it('does nothing with no copy, a damaged one, or one that is not drafts', () => {
    const s = fakeStore({ 'zero.draft.compose': 'mine' });
    expect(putDraftsBack(s, null)).toBe(0);
    expect(putDraftsBack(s, { at: 'x', drafts: 4 } as unknown as never)).toBe(0);
    expect(putDraftsBack(s, { at: 3000, drafts: { 'zero.theme': 'light', 'zero.draft.x': 7 } } as unknown as never)).toBe(0);
    expect(s.getItem('zero.theme')).toBe(null);
    expect(s.getItem('zero.draft.compose')).toBe('mine');
  });

  it('survives a storage that refuses to be written to', () => {
    const s = { ...fakeStore(), setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => putDraftsBack(s, copy)).not.toThrow();
  });
});

describe('the file the app keeps', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'draft-copy-'));

  it('reads back what it wrote', async () => {
    const file = path.join(dir(), 'drafts-copy.json');
    await writeDraftCopyFile(file, JSON.stringify({ at: 1, drafts: { 'zero.draft.compose': 'x' } }));
    expect(JSON.parse(readDraftCopyFile(file)!)).toEqual({ at: 1, drafts: { 'zero.draft.compose': 'x' } });
  });

  it('keeps the last good copy when a write fails part way, as on a full disk', async () => {
    const d = dir();
    const file = path.join(d, 'drafts-copy.json');
    await writeDraftCopyFile(file, '{"at":1,"drafts":{}}');
    const failing = { ...fs.promises, writeFile: async () => { throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); } };
    await expect(writeDraftCopyFile(file, '{"at":2,"drafts":{}}', failing as typeof fs.promises)).resolves.toBe(false);
    expect(readDraftCopyFile(file)).toBe('{"at":1,"drafts":{}}');
    expect(fs.readdirSync(d)).toEqual(['drafts-copy.json']);
  });

  it('answers nothing for a file that is not there', () => {
    expect(readDraftCopyFile(path.join(dir(), 'none.json'))).toBe(null);
  });
});

describe('the window wires it in', () => {
  it('puts drafts back before the first screen is drawn, and keeps the copy after', () => {
    const boot = read('renderer', 'src', 'main.tsx');
    const at = boot.indexOf('keepACopyOfTheDrafts(');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(boot.indexOf('ReactDOM.createRoot('));
  });
  it('the bridge reads the copy before anything else runs and writes it in the background', () => {
    const preload = read('preload.cjs');
    expect(preload).toMatch(/draftCopy:\s*\{[^}]*sendSync\('zero:draft-copy-read'\)[^}]*send\('zero:draft-copy-write'/s);
    const main = read('main', 'main.mts');
    expect(main).toMatch(/answerDraftCopy\(\{\s*ipcMain,\s*file:\s*path\.join\(userDir, 'drafts-copy\.json'\)/);
  });
});
