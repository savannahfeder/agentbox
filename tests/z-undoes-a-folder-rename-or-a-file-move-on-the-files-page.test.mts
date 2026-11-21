// Z UNDOES A FOLDER RENAME OR A FILE MOVE ON THE FILES PAGE.
//
// A tester renamed a folder with its pencil, pressed Z, and the toast said
// "Nothing to undo yet."; the same after moving a document to the top of its
// project from its menu. Z reached the undo, but only the Trash ever put an
// entry on the pile: FilesPlace's rename and move called the back end and
// pushed nothing. Measured by reading FilesPlace.tsx: onUndoable was called
// from trash() alone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { moveUndo, renameUndo } from '../renderer/src/files/files-undo.ts';
import type { FileFolder, PlacedFile } from '../renderer/src/types.ts';

const folder = (id: string, name: string): FileFolder => ({ id, project: 'My Workspace', name, parent: null, at: 1 });
const file = (key: string, name: string, at: string | null): PlacedFile =>
  ({ key, project: 'My Workspace', name, kind: 'markdown', versions: 1, at: 1, by: null, open: 0, approvedBy: [], sentIn: [], opened: null, folder: at }) as PlacedFile;

describe('a rename can be taken back', () => {
  const folders = [folder('f1', 'qa46tmp')];

  it('puts the old name back', () => {
    const u = renameUndo(folders, 'f1', 'qa46renamed')!;
    expect(u.back).toEqual({ do: 'rename', id: 'f1', name: 'qa46tmp' });
    expect(u.label).toBe('Renamed back: qa46tmp');
    expect(u.undoes).toBe('rename “qa46renamed” back to “qa46tmp”');
  });

  it('the same name again changes nothing, so there is nothing to undo', () => {
    expect(renameUndo(folders, 'f1', 'qa46tmp')).toBeNull();
    expect(renameUndo(folders, 'f1', '  qa46tmp ')).toBeNull();
  });

  it('a folder it does not know is not guessed at', () => {
    expect(renameUndo(folders, 'gone', 'x')).toBeNull();
  });
});

describe('a move can be taken back', () => {
  const folders = [folder('f1', 'Drafts')];

  it('one file goes back to the folder it was in', () => {
    const u = moveUndo([file('k1', 'qa46doc.md', 'f1')], ['k1'], null, folders)!;
    expect(u.back).toEqual([{ do: 'move', key: 'k1', folder: 'f1' }]);
    expect(u.label).toBe('Back in Drafts: qa46doc.md');
    expect(u.undoes).toBe('move qa46doc.md back to Drafts');
  });

  it('back to the top of its project when it came from there', () => {
    const u = moveUndo([file('k1', 'qa46doc.md', null)], ['k1'], 'f1', folders)!;
    expect(u.back).toEqual([{ do: 'move', key: 'k1', folder: null }]);
    expect(u.label).toBe('Back at the top of My Workspace: qa46doc.md');
  });

  it('several files moved at once are one Z, each back where it was', () => {
    const files = [file('k1', 'a.md', 'f1'), file('k2', 'b.md', null), file('k3', 'c.md', 'f2')];
    const u = moveUndo(files, ['k1', 'k2', 'k3'], 'f2', folders)!;
    expect(u.back).toEqual([{ do: 'move', key: 'k1', folder: 'f1' }, { do: 'move', key: 'k2', folder: null }]);
    expect(u.label).toBe('Moved back: 2 files');
  });

  it('a file already where it was sent did not move, so nothing to undo', () => {
    expect(moveUndo([file('k1', 'a.md', 'f1')], ['k1'], 'f1', folders)).toBeNull();
    expect(moveUndo([], ['k1'], null, folders)).toBeNull();
  });
});

describe('the Files page puts them on the pile', () => {
  const page = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');

  it('after a rename and after a move', () => {
    expect(page).toMatch(/renameUndo\(/);
    expect(page).toMatch(/moveUndo\(/);
    expect(page.match(/onUndoable/g)!.length).toBeGreaterThanOrEqual(4);
  });
});
