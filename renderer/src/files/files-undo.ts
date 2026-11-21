// PURE. What a Z on the Files page puts back after a folder rename or a move.
import type { FileFolder, FileFolderAct, PlacedFile } from '../types';
import { shownName } from './files-shown';

type Back<A> = { label: string; undoes: string; back: A };

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function renameUndo(folders: readonly FileFolder[], id: string, name: string): Back<FileFolderAct> | null {
  const was = folders.find((f) => f.id === id);
  if (!was || clean(name) === was.name) return null;
  return { label: `Renamed back: ${was.name}`, undoes: `rename “${clean(name)}” back to “${was.name}”`, back: { do: 'rename', id, name: was.name } };
}

/** Taken before the move, while `files` still says where each one was. */
export function moveUndo(files: readonly PlacedFile[], keys: readonly string[], to: string | null, folders: readonly FileFolder[]): Back<FileFolderAct[]> | null {
  const moved = keys.map((k) => files.find((f) => f.key === k)).filter((f): f is PlacedFile => !!f && (f.folder ?? null) !== to);
  if (!moved.length) return null;
  const back: FileFolderAct[] = moved.map((f) => ({ do: 'move', key: f.key, folder: f.folder ?? null }));
  if (moved.length > 1) return { label: `Moved back: ${moved.length} files`, undoes: `move those ${moved.length} files back`, back };
  const [f] = moved;
  const name = shownName(f);
  const into = folders.find((x) => x.id === f.folder)?.name;
  return into
    ? { label: `Back in ${into}: ${name}`, undoes: `move ${name} back to ${into}`, back }
    : { label: `Back at the top of ${f.project}: ${name}`, undoes: `move ${name} back to the top of ${f.project}`, back };
}
