// A SIDE BUILD IS A SECOND BUNDLE AND IT IS NOT A SECOND AGENTBOX.
//
// 2026-08-27.
//
// The bundle is separate. The DATA FOLDER MUST NOT BE, and this file is the one
// place that says so, because two files saying it is how one of them goes
// quietly wrong.
//
// Why it matters, in main.mjs's own words at the single-instance lock: "Two
// instances mean two supervisors, and two supervisors spawn twin workers for
// every answered item (observed 2026-08-04: nine items double-spawned one
// second apart, four agents told the founder the same thing)." That lock lives
// INSIDE the data folder — measured on this Mac 2026-08-27, the running Agentbox
// holds SingletonLock in ~/Library/Application Support/Astral — so two folders
// would be two locks and the protection would simply not be there.
//
// Sharing the folder also means the side build is not a stranger's copy: her
// store, her settings, her theme, her place in everything, plus the branch.

import { NAME } from '../shared/product-name.mjs';

/**
 * THE BUNDLE NAME, not a sentence, so it is the plain spelling however the
 *  name is capitalised. Everything here compares against what macOS calls the
 *  bundle, which is `productName` in package.json, which is this. */
export const REAL_NAME = NAME;

/**
 * The app's own name and a word after it, yes. The bare name itself, no, that
 *  is the real one. A bare word, or the name run into a word with no space, no:
 *  a name that does not read as the app plus a word is a name
 *  nobody will recognise in the Dock, and pack-side refuses it rather than
 *  quietly building a second supervisor. */
export function isSideBuild(name) {
  const word = REAL_NAME.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
  return new RegExp(`^${word} .+`).test(name ?? '');
}

// THE ONE SIDE BUILD THAT MUST NOT SHARE HER FOLDER.
//
// That folder has to be its OWN, or the hand-over would take the real
// Agentbox's single-instance lock and bring her inbox to the front instead of
// opening a stranger's.
export const NEW_USER_NAME = `${REAL_NAME} new user`;

export function isNewUserBuild(name) {
  return name === NEW_USER_NAME;
}

/**
 * The folder Chromium should name after this app, whatever the bundle is
 * called. Everything downstream keys off app.getName, so a side build sets
 * its name back to this before anything reads a path. */
export function dataFolderName(name) {
  if (isNewUserBuild(name)) return name;
  return isSideBuild(name) ? REAL_NAME : name;
}
