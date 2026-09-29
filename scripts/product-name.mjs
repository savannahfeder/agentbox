#!/usr/bin/env node
// CARRIES THE NAME FROM shared/product-name.mjs INTO package.json.
//
// package.json is the one file that cannot import the name: Electron reads it
// to decide what the app is called before a line of our code runs, and
// electron-builder reads it in a different process entirely. So this is the
// seam, and it is a script rather than a note in a README because a note gets
// skipped and a script does not.
//
// It is also what `tests/the-app-is-named-in-one-place.test.mjs` runs, in
// read-only mode, to fail the suite when package.json has drifted. Renaming the
// app is therefore: edit NAME and WAS in shared/product-name.mjs, run this with
// --write, done.
//
// WHAT IT DELIBERATELY DOES NOT TOUCH, each with the thing it would break:
//
//   build.appId `ac.astral.app`  macOS keys every permission she has already
//                                granted off this string. Change it and the
//                                Accessibility, Desktop and Apple Events grants
//                                all go back to unasked, silently.
//   build.publish owner/repo     the GitHub release the app auto-updates from.
//                                It is a repository that exists under that name.
//   asarUnpack main/agentbox-window   a file on disk, and an agent session cannot
//                                rebuild it (`lipo` refuses here).
//   version, copyright, appId    not names.
//
// The macOS usage sentences live here as templates rather than in package.json,
// because they are sentences: they start with the name and so take the
// sentence-start spelling, which only this side knows how to produce.

import fs from 'node:fs';
import path from 'node:path';
import { NAME, Name, nameSlug } from '../shared/product-name.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WRITE = process.argv.includes('--write');

/** The Info.plist sentences macOS shows when it asks for a folder. `{Name}`
 *  opens each one, so each one takes the sentence-start spelling. */
const USAGE = {
  NSDesktopFolderUsageDescription: '{Name} needs this to let your agents work in a project you keep on the Desktop.',
  NSDocumentsFolderUsageDescription: '{Name} needs this to let your agents work in a project you keep in Documents.',
  NSDownloadsFolderUsageDescription: '{Name} needs this to let your agents work in a project you keep in Downloads.',
  NSRemovableVolumesUsageDescription: '{Name} needs this to let your agents work in a project you keep on an external disk.',
  NSAppleEventsUsageDescription: '{Name} needs this when an agent you started asks another app to do something.',
};

const fill = (s) => s.replaceAll('{Name}', Name).replaceAll('{name}', NAME);

/** Every field package.json owes the name module, as a path and the value it
 *  should hold. A title or a label is the bare name: the brand is spelled the
 *  way it is spelled, and capitalisation is a rule about sentences. */
export function expected() {
  return [
    // `name` IS NOT HERE, AND THAT IS DELIBERATE SINCE 2026-09-25.
    //
    // It used to be `[['name'], nameSlug]`, on the reasonable assumption that
    // the package is called what the product is called. npm decided otherwise:
    // `agentbox` is a security holding package somebody left there in 2022, so
    // the published name is `agentbox-app`.
    //
    // A field whose value is decided by what a registry happens to have free is
    // not a field this file can own. It is chosen once, by hand, and pinned in
    // tests/the-listing-says-what-this-is.test.mjs, which also checks it still
    // CONTAINS the slug: rename the product and that fails, which is the nudge
    // to go and see whether the new name is free.
    [['productName'], NAME],
    [['build', 'productName'], NAME],
    [['build', 'dmg', 'title'], NAME],
    ...Object.entries(USAGE).map(([key, template]) => [
      ['build', 'mac', 'extendInfo', key], fill(template),
    ]),
  ];
}

function at(obj, keys) {
  return keys.reduce((o, k) => (o == null ? o : o[k]), obj);
}

function put(obj, keys, value) {
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {});
  o[keys.at(-1)] = value;
}

/** The drift, as a list of [where, is, shouldBe]. Empty means in sync. */
export function drift(pkg) {
  const out = [];
  for (const [keys, want] of expected()) {
    const has = at(pkg, keys);
    if (has !== want) out.push([keys.join('.'), has, want]);
  }
  return out;
}

export const PACKAGE_FILE = path.join(ROOT, 'package.json');

/** package.json as it is on disk right now. */
export function readPackage() {
  return JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8'));
}

// THE CLI IS BEHIND THIS GUARD because the test imports `drift` out of this
// file, and a module that rewrites package.json the moment it is imported
// rewrites it during `vitest run`.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const pkg = readPackage();
  const bad = drift(pkg);

  for (const [where, has, want] of bad) {
    console.log(`${where}\n  is   ${JSON.stringify(has)}\n  want ${JSON.stringify(want)}`);
  }

  if (!bad.length) {
    console.log(`package.json already says ${NAME}. Nothing to do.`);
  } else if (WRITE) {
    for (const [keys, want] of expected()) put(pkg, keys, want);
    // Two spaces and a trailing newline, which is what npm itself writes, so the
    // diff is the fields that moved and nothing else.
    fs.writeFileSync(PACKAGE_FILE, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`\n${bad.length} field${bad.length === 1 ? '' : 's'} rewritten to ${NAME}.`);
  } else {
    console.log(`\n${bad.length} field${bad.length === 1 ? '' : 's'} out of date (dry run, pass --write).`);
    process.exitCode = 1;
  }
}
