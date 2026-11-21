// PURE. What a Z on the Files page puts back after a folder rename or a move.
import type { FileFolder, FileFolderAct, PlacedFile } from '../types';
import { shownName } from './files-shown';

type Back<A> = { label: string; undoes: string; back: A };

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function renameUndo(folders: readonly FileFolder[], id: string, name: string): Back<FileFolderAct> | null {
  const was = folders.find((f) => f.id === id);
  if (!was || clean(name) === was.name) return null;
  return { label: `Renamed ${was.name} back`, undoes: `rename “${clean(name)}” back to “${was.name}”`, back: { do: 'rename', id, name: was.name } };
}

export function fileRenameUndo(file: Pick<PlacedFile, 'key' | 'name' | 'sentIn' | 'title'>, name: string): Back<FileFolderAct> | null {
  const was = shownName(file);
  if (clean(name) === was) return null;
  return { label: `Renamed ${was} back`, undoes: `rename “${clean(name)}” back to “${was}”`, back: { do: 'name', key: file.key, name: was } };
}

/** Taken before the move, while `files` still says where each one was. */
export function moveUndo(files: readonly PlacedFile[], keys: readonly string[], to: string | null, folders: readonly FileFolder[]): Back<FileFolderAct[]> | null {
  const moved = keys.map((k) => files.find((f) => f.key === k)).filter((f): f is PlacedFile => !!f && (f.folder ?? null) !== to);
  if (!moved.length) return null;
  const back: FileFolderAct[] = moved.map((f) => ({ do: 'move', key: f.key, folder: f.folder ?? null }));
  if (moved.length > 1) return { label: `Moved ${moved.length} files back`, undoes: `move those ${moved.length} files back`, back };
  const [f] = moved;
  const where = folders.find((x) => x.id === f.folder)?.name ?? `the top of ${f.project}`;
  return { label: `Moved ${shownName(f)} back`, undoes: `move ${shownName(f)} back to ${where}`, back };
}
