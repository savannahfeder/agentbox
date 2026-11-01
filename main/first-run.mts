// THE FIRST TASK'S ANSWER, READ OFF THE DISK.
//
// This is the whole of what replaces the session. It opens the readme in the
// folder she pointed at, or the description in a package.json beside it, and
// hands back one line. There is no queue, no model and no network in it, which
// is the point: the sentence on screen says the answer comes back in a few
// seconds, and this is the only version of the task that can keep that promise.
//
// The judgement about what makes a good line is in shared/first-run-line.mjs,
// where the tests are. This file only reads.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { firstRunAnswer } from '../shared/first-run-line.mjs';
import { DEPTH, SKIP, projectSentence } from '../shared/first-run-shape.mjs';

/**
 * The names a readme is actually called, in the order worth trying. Case is
 *  not assumed: a folder listing is cheap and `readme.md` is common. */
const README = ['README.md', 'README', 'README.txt', 'README.markdown', 'readme.md'];

/**
 * As much of a readme as could possibly hold its first sentence. A readme is
 *  sometimes a book, and the whole of one has no business in memory here. */
const READ_BYTES = 64 * 1024;

function readHead(file) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(READ_BYTES);
    const n = fs.readSync(fd, buf, 0, READ_BYTES, 0);
    return buf.slice(0, n).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd != null) { try { fs.closeSync(fd); } catch { /* nothing to do */ } }
  }
}

/**
 * The readme at the top of a folder, whatever it is called. Only the top
 *  level, which is the bound she took as recommended on round four: "Read the
 *  readme and the top level of this folder, and nothing deeper than that." */
export function readReadme(folder) {
  if (!folder) return null;
  for (const name of README) {
    const file = path.join(folder, name);
    if (fs.existsSync(file)) return readHead(file);
  }
  // A folder whose readme is spelled some other way. One listing, top level.
  let entries = [];
  try { entries = fs.readdirSync(folder); } catch { return null; }
  const hit = entries.find((e) => /^readme(\.|$)/i.test(e));
  return hit ? readHead(path.join(folder, hit)) : null;
}

/**
 * The one field in a manifest that says what a thing is. package.json is the
 *  common case by a distance; the other two cost two lines each. */
export function readDescription(folder) {
  if (!folder) return null;
  const pkg = path.join(folder, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      const d = JSON.parse(fs.readFileSync(pkg, 'utf8')).description;
      if (typeof d === 'string' && d.trim()) return d.trim();
    } catch { /* a package.json that does not parse is not a description */ }
  }
  for (const name of ['pyproject.toml', 'Cargo.toml']) {
    const file = path.join(folder, name);
    if (!fs.existsSync(file)) continue;
    const m = readHead(file)?.match(/^\s*description\s*=\s*["']([^"'\n]+)["']/m);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * THE DESCRIPTION, when the folder has one written down. Never throws: a
 *  folder deleted between the name screen and this one still gets a sentence,
 *  because the walk is not allowed to stop on it.
 *
 * This is NOT the task's answer any more, and says why: measured over the 29
 * project folders in ~/Desktop/dev on 2026-08-21, only 16 of them have a line
 * anywhere that says what the project is. It is what goes UNDER THE PROJECT'S
 * NAME IN THE SIDEBAR, which is the job it was wanted for. */
export function describeFor({ folder, name, shortFolder }) {
  try {
    return firstRunAnswer({
      readme: readReadme(folder),
      description: readDescription(folder),
      name,
      folder: shortFolder ?? folder,
    });
  } catch {
    return firstRunAnswer({ readme: null, description: null, name, folder: shortFolder ?? folder });
  }
}

/**
 * THE GUARDED FOLDERS AS FULL PATHS, for the walk to refuse to enter.
 *
 * The picker refuses these as a project (shared/project-folder-check.mjs) and
 * that is the door a tester actually walked through. This is the second door.
 * The walk is three levels deep, so ANY caller that hands it the home folder
 * makes it read ~/Desktop, ~/Downloads, ~/Music, ~/Pictures, ~/Movies,
 * ~/Documents and ~/Library, and macOS answers each one with a consent panel
 * carrying our name. Measured on 2026-08-25 against a real home folder: 4,001
 * listings, every one of the seven touched, and 137 apps under Application
 * Support plus 706 under Containers read by name. All of that to say "20,000
 * files across 7,053 folders".
 *
 *  Matched as WHOLE PATHS directly under the home folder, never by name. A
 *  project called `Documents` inside somebody's code folder is their project;
 *  `~/Documents` is not. A project INSIDE a guarded folder still counts
 *  normally, because the walk starts below the guard. */
function guardedPaths(home) {
  const h = String(home ?? '').replace(/\/+$/, '');
  if (!h) return new Set();
  return new Set(
    ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Library', 'Public']
      .map((n) => path.join(h, n)),
  );
}

/**
 * WHAT IS ACTUALLY IN THE FOLDER. Three levels deep, skipping everything that
 *  is not the person's own work, never entering a folder macOS guards, and
 *  stopping at a hard cap so a folder with a million files in it cannot turn a
 *  two second promise into a long one. */
export function countFolder(folder, { cap = 20_000, home = os.homedir() } = {}) {
  const out = { files: 0, dirs: 0, ext: Object.create(null), newest: 0, capped: false };
  const guarded = guardedPaths(home);
  const walk = (dir, depth) => {
    if (out.files >= cap) { out.capped = true; return; }
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.files >= cap) { out.capped = true; return; }
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      // Counted as a folder, never opened. The number stays honest and macOS
      // is never asked.
      if (guarded.has(p)) { out.dirs += 1; continue; }
      if (e.isDirectory()) { out.dirs += 1; if (depth > 0) walk(p, depth - 1); continue; }
      out.files += 1;
      const ext = path.extname(e.name);
      if (ext) out.ext[ext] = (out.ext[ext] ?? 0) + 1;
      try { const m = fs.statSync(p).mtimeMs; if (m > out.newest) out.newest = m; } catch { /* a file that vanished mid-walk is not a failure */ }
    }
  };
  walk(folder, DEPTH);
  return out;
}

/**
 * Git's own words for when the folder last changed, or null when it is not a
 *  repo. Its answer is better than a file's timestamp, which a checkout or a
 *  build can move without anybody having written anything. */
export function lastCommit(folder) {
  try {
    // GIT_DIR beats `-C`, so a shell that exported one (a git hook does, and so
    // does anything launched from inside one) would have every folder answer
    // with THAT repository's last commit, repo or not. Ask about the folder.
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    const out = execFileSync('git', ['-C', folder, 'log', '-1', '--format=%cr'], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 2_000, env,
    }).toString().trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * THE FIRST TASK'S ANSWER.The sentence is ours and every number in it is read
 * off the folder chosen two screens earlier, so it is true about any project
 * and cannot be a guess about what that project is. Never throws. */
export function answerFor({ folder, name }) {
  try {
    const count = countFolder(folder);
    return projectSentence({ ...count, name, lastCommit: lastCommit(folder) });
  } catch {
    return projectSentence({ name, files: 0, dirs: 0, ext: {} });
  }
}
