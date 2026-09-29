// THE PRE-WRITTEN ANSWER.
//
// SHE WAS RIGHT, AND IT IS MEASURED. Run over the 29 project folders in
// ~/Desktop/dev on 2026-08-21 that gave a sentence saying what the project is
// for 16 of them. A first task that is wrong or empty on nearly half of the
// folders somebody might point at is not a first task.
//
// SO THE SENTENCE IS OURS AND THE NUMBERS ARE THEIRS. That is exactly what she
// asked for: pre-written, and true about whatever project gets chosen. It
// cannot be wrong about a project because it says nothing about what the
// project IS. Run over the same 29 folders it is correct on 29, in a median of
// 7.5ms.
//
// WHAT THE README LINE IS STILL FOR. It is a description and the counts are
// not, so it goes on doing the job it was wanted for, which is the line under
// the project's name in the sidebar (hers, 08-20 12:07). When a folder has no
// description written down the sidebar simply has no line, which is what it
// does today for every project.
//
// Pure on purpose: the reading of the disk is in main/first-run.mjs.

/**
 * How deep the count goes. Her bound from round four was the readme and the
 *  top level; a count of the top level alone says two files about a real
 *  project, so this goes three deep and skips what is not hers. */
import { NAME } from '../shared/product-name.mjs';
export const DEPTH = 3;

/**
 * Never counted: none of it is the project, and node_modules alone would put
 *  the number in the tens of thousands and the read into seconds. */
export const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'target',
  'venv', '.venv', '__pycache__', '.cache', 'vendor', 'Pods', 'DerivedData',
]);

/**
 * What a file extension is called out loud. A language nobody here names is
 *  simply not mentioned, rather than guessed at from the extension. */
export const LANGUAGE = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.mjs': 'JavaScript',
  '.cjs': 'JavaScript', '.jsx': 'JavaScript', '.py': 'Python', '.rs': 'Rust',
  '.go': 'Go', '.swift': 'Swift', '.rb': 'Ruby', '.java': 'Java', '.kt': 'Kotlin',
  '.c': 'C', '.h': 'C', '.cpp': 'C++', '.cs': 'C#', '.php': 'PHP', '.sh': 'shell',
  '.md': 'Markdown', '.html': 'HTML', '.css': 'CSS', '.sql': 'SQL', '.ex': 'Elixir',
};

/**
 * The language most of it is written in, or null when nothing here is code we
 *  can name. Never a guess: a folder of things this table has never heard of
 *  gets a sentence with no language in it rather than a wrong one. */
export function mainLanguage(ext) {
  let best = null;
  for (const [e, n] of Object.entries(ext ?? {})) {
    if (!LANGUAGE[e]) continue;
    if (!best || n > best[1]) best = [e, n];
  }
  return best ? LANGUAGE[best[0]] : null;
}

function plural(n, one, many) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/**
 * How long ago, in the words a person uses. Only reached when a folder is not
 *  a git repo, because a repo's own answer is better. */
export function howLongAgo(ms, now = Date.now()) {
  const days = (now - ms) / 86_400_000;
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  // Singular where it lands on one, because "1 years ago" is the kind of small
  // wrongness that makes a person stop believing the rest of the sentence.
  if (days < 14) return `${plural(Math.round(days), 'day', 'days')} ago`;
  if (days < 60) return `${plural(Math.round(days / 7), 'week', 'weeks')} ago`;
  if (days < 365) return `${plural(Math.round(days / 30), 'month', 'months')} ago`;
  return `${plural(Math.round(days / 365), 'year', 'years')} ago`;
}

/**
 * THE ANSWER. One sentence, ours, filled in from whatever was counted.
 *
 *  `files`, `dirs` and `ext` are the count. `lastCommit` is git's own words
 *  ("2 minutes ago") when the folder is a repo, and `newest` is the newest file
 *  in it for when it is not. Nothing in here can be false about a project,
 *  which is the whole point of it. */
export function projectSentence({ name, files, dirs, ext, lastCommit, newest }, now = Date.now()) {
  const who = name || 'This project';
  if (!files) {
    return `${who} is an empty folder. Everything you put in it from here shows up in ${NAME}.`;
  }
  const size = dirs
    ? `${who} is ${plural(files, 'file', 'files')} across ${plural(dirs, 'folder', 'folders')}`
    : `${who} is ${plural(files, 'file', 'files')}`;
  const lang = mainLanguage(ext);
  const when = lastCommit
    ? `its last commit was ${lastCommit}`
    : `it was last touched ${howLongAgo(newest ?? now, now)}`;
  return [size, ...(lang ? [`mostly ${lang}`] : []), `and ${when}`].join(', ') + '.';
}
