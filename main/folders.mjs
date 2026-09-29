// WALKING THE DISK FOR A SCREEN THAT CANNOT OPEN A MAC DIALOG.
//
// THE MISUNDERSTANDING THIS FILE EXISTS TO CORRECT. A browser tab cannot be
// handed a real path by the operating system: the file input gives a page a
// blob and a bare filename, on purpose, because a web page is not trusted with
// somebody's disk. That is true and it is not going to change.
//
// It is also not the problem. The thing that needs to read the disk is not the
// tab, it is the process the terminal started, and that process is ordinary
// Node running as the person who typed the command. It has exactly the same
// access the desktop app has. So the tab never asks the operating system for a
// path. It asks the app what is in a folder, draws the answer, and sends back
// the folder she clicked. The picker is ours instead of the Mac's, and the
// answer is a real absolute path either way.
//
// This is how every editor in a browser does it, and it is the only part of
// the desktop app that needed replacing rather than reusing.
//
// WHAT IS DELIBERATELY NOT HERE. No serving of file CONTENTS, and no walking
// upward past the root. This lists directory names so somebody can point at
// one. The folder it ends up pointing at still goes through
// checkProjectFolder, the same as a path the Mac's own dialog returned.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the picker opens when nothing has been chosen yet. */
export const startingPoint = (home = os.homedir()) => home;

/**
 * Resolve what a screen typed or clicked into an absolute path.
 *
 *  `~` is how our own screens write the home folder, and somebody typing a path
 *  by hand writes it that way too.
 */
export function absolute(at, home = os.homedir()) {
  const s = String(at ?? '').trim();
  if (!s) return startingPoint(home);
  if (s === '~') return home;
  if (s.startsWith('~/')) return path.join(home, s.slice(2));
  return path.resolve(s);
}

/**
 * The folders inside one folder, and the way back up.
 *
 *  Returns `{ at, parent, home, folders }`, or `{ at, unreadable }` when the
 *  folder is gone or the system will not open it. Unreadable is an ordinary
 *  answer rather than a throw: somebody navigating a disk lands on a folder
 *  they cannot open fairly often, and the screen should say so and stay put.
 */
export function listFolders({ at, home = os.homedir(), showHidden = false } = {}) {
  const here = absolute(at, home);
  const parent = path.dirname(here);

  let entries;
  try {
    entries = fs.readdirSync(here, { withFileTypes: true });
  } catch (err) {
    return {
      at: here,
      parent: parent === here ? null : parent,
      home,
      folders: [],
      unreadable: err.code === 'EACCES' || err.code === 'EPERM'
        ? 'The system will not let this be opened.'
        : 'That folder is not there any more.',
    };
  }

  const folders = entries
    .filter((entry) => {
      // A symlink to a directory is a directory as far as somebody choosing a
      // project folder is concerned, and plenty of real checkouts are one.
      if (!entry.isDirectory() && !entry.isSymbolicLink()) return false;
      if (!showHidden && entry.name.startsWith('.')) return false;
      return true;
    })
    .map((entry) => ({ name: entry.name, path: path.join(here, entry.name) }))
    .filter((folder) => {
      if (!folder.path) return false;
      // A symlink that points at a file, or at nothing, is not a folder to walk
      // into. statSync follows it; a broken one throws and is dropped.
      try { return fs.statSync(folder.path).isDirectory(); } catch { return false; }
    })
    // The way a person reads a folder listing, not the way the disk returns it.
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return { at: here, parent: parent === here ? null : parent, home, folders };
}
