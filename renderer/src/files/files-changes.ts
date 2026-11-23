// Changes made on the Files page, drawn over a list made before them: making
// the list again takes seconds on a big store, and a rename should not wait.
import type { FileFolder, FileFolderAct, FilesPlaceList, PlacedFile } from '../types';

/** A change as the page draws it. `made` is a new folder once the app has given it its id. */
export type Shown = Exclude<FileFolderAct, { do: 'make' } | { do: 'restore' }> | { do: 'made'; folder: FileFolder };

// As main/files-place.mts keeps a name (cleanFolderName).
export const cleanName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 120);

const onFile = (files: PlacedFile[], key: string, change: (f: PlacedFile) => PlacedFile): PlacedFile[] =>
  files.map((f) => (f.key === key ? change(f) : f));

export function withChanges(list: FilesPlaceList, changes: readonly Shown[]): FilesPlaceList {
  let files = list.files;
  let folders = list.folders ?? [];
  for (const c of changes) {
    if (c.do === 'rename') {
      const name = cleanName(c.name);
      if (name) folders = folders.map((f) => (f.id === c.id ? { ...f, name } : f));
    } else if (c.do === 'made') {
      if (!folders.some((f) => f.id === c.folder.id)) folders = [...folders, c.folder];
    } else if (c.do === 'remove') {
      const gone = new Set([c.id, ...folders.filter((f) => f.parent === c.id).map((f) => f.id)]);
      folders = folders.filter((f) => !gone.has(f.id));
      files = files.map((f) => (f.folder && gone.has(f.folder) ? { ...f, folder: null } : f));
    } else if (c.do === 'move') {
      files = onFile(files, c.key, ({ folderFollows: _follows, ...f }) => ({ ...f, folder: c.folder }));
    } else if (c.do === 'name') {
      const name = cleanName(c.name);
      if (name) files = onFile(files, c.key, (f) => ({ ...f, title: name }));
    } else if (c.do === 'icon') {
      files = onFile(files, c.key, ({ icon: _was, ...f }) => (c.icon ? { ...f, icon: c.icon } : f));
    }
  }
  return { ...list, files, folders };
}
