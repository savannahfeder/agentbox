// HER CLAUDE CODE AGENTS, THE FILES.
//
// names three different things on a Mac, and this module is one of them: the
// `.md` agent files Claude Code loads as subagents. It is the literal reading
// of her sentence, because Claude Code's own two scopes ARE all-projects and
// this-project:
//   ~/.claude/agents/*.md              every project on the Mac
//   <project>/.claude/agents/*.md      that project only
//
// Measured on her Mac 08-21: four in the first, four in `astral-desktop`,
// which is the only one of about thirty dev folders that has any.
//
// WHAT THIS DOES NOT CLAIM. Claude Code reads the home folder set itself in
// every session it starts, whatever directory it is in, so nothing here makes
// an agent work that was not working already. What Agentbox gains is that it can
// finally SAY what she has, which it could not do at all: no file under main/
// or renderer/src mentioned `.claude/agents` before this one.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GUARDED } from '../shared/project-folder-check.mjs';
import { RECENT_DAYS, isScratchFolder } from './agent-sessions.mjs';

/**
 * A file bigger than this is not an agent definition, and reading a gigabyte
 *  of something because it was dropped in the folder is not worth the risk. */
const MAX_BYTES = 256 * 1024;

/**
 * AND A FILE OLDER THAN THIS IS NOT AN AGENT SHE IS IMPORTING.
 *
 * The four rows in that shot are the whole of `~/.claude/agents` on her Mac and
 * they were last written on 23 and 30 March, five months before the card that
 * offered them.
 *
 *  NOTHING STOPS WORKING WHEN A FILE FALLS OUT OF THE WINDOW. Claude Code loads
 *  `~/.claude/agents` itself in every session it starts, which the header of
 *  this file has said since it was written. Dropping a March file off the import
 *  card takes it off a list; it does not take it off the Mac. */
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

/**
 * THE FRONT MATTER, and only the parts an agent screen can show. Claude Code
 *  writes `name`, `description` and `tools` between two `---` fences. A file
 *  with no fence is still an agent as far as Claude Code is concerned, so it
 *  is kept and named after itself rather than dropped. */
export function parseAgentFile(text, file = '') {
  const fallback = path.basename(file, '.md');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '');
  if (!m) return { name: fallback, description: firstFromBody(text, fallback) };
  const out = {};
  let key = null;
  for (const raw of m[1].split(/\r?\n/)) {
    // A description can run onto its own indented lines, which is how Claude
    // Code writes the long ones. An indented line with no key continues the
    // key above it rather than starting a new one.
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (kv && !/^\s/.test(raw)) {
      key = kv[1];
      out[key] = kv[2].trim();
    } else if (key && raw.trim()) {
      out[key] = `${out[key]} ${raw.trim()}`.trim();
    }
  }
  const name = strip(out.name) || fallback;
  // TAKE WHAT WE CAN GET.
  //
  // A `description` in the front matter is what Claude Code writes and what
  // her own eight all have. It is not guaranteed: an agent file is a markdown
  // file and a person can write one by hand with nothing but a heading in it.
  // So when the front matter has no description, the body is read for the next
  // best thing rather than the row being left blank.
  const description = strip(out.description) || firstFromBody(text.slice(m[0].length), name);
  return { name, description };
}

/**
 * Two strings that are the same thing said two ways: the file name, the front
 *  matter name and a heading all reach the screen and are often one word apart.
 *  Letters and digits only, so `Docs Reviewer`, `docs-reviewer` and
 *  `Docs reviewer.` are one string. */
function sameThing(a, b) {
  const k = (v) => (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return !!k(a) && k(a) === k(b);
}

/**
 * THE NEXT BEST THING AFTER THE DESCRIPTION, out of the markdown body: the
 *  first heading, and failing that the first line of prose. Both are what a
 *  person wrote for a person, which is the whole reason they beat nothing.
 *
 *  `avoid` is the agent's own name. Most hand written agent files open
 *  `# Docs Reviewer`, and a heading that is the name again is not information,
 *  so in that one case the prose under it is taken instead of the heading.
 *
 *  What is skipped on the way: blank lines, code fences and anything inside
 *  one, list bullets, quotes and horizontal rules. A row reading "```bash" or
 *  "---" says less than an empty row does. */
export function firstFromBody(text, avoid = '') {
  const lines = (text ?? '').split(/\r?\n/);
  let heading = '';
  let prose = '';
  let fenced = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (/^(```|~~~)/.test(t)) { fenced = !fenced; continue; }
    if (fenced || !t) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(t);
    if (h) {
      // The first heading wins, and it is usually the agent's own name written
      // out. It is still better than a blank row, so it is taken and the
      // screen's own de-duplication decides whether to show it.
      if (!heading) heading = h[1].trim();
      continue;
    }
    if (/^([-*+]\s|>\s|\d+[.)]\s|<)/.test(t)) continue;
    if (!prose) prose = t;
    if (heading) break;
  }
  const pick = sameThing(heading, avoid) ? (prose || heading) : (heading || prose);
  return strip(pick).replace(/[*_`#]/g, '').trim();
}

function strip(v) {
  const s = (v ?? '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * ONE SENTENCE OF IT, and not the instruction to Claude at the front of it.
 *
 *  Her descriptions are written to be read by an agent deciding whether to run,
 *  so five of her eight open "Use this agent to ...". Four of those in a column
 *  is four rows that start with the same three words and say nothing until the
 *  fourth. The opening is cut ONLY in the form that leaves a whole sentence
 *  behind it, so "Use this skill AFTER completing ..." is left exactly as its
 *  author wrote it rather than beheaded into nonsense.
 *
 *  The width of the row is the real limit and CSS does that cut; `max` here is
 *  only a stop on a sentence long enough to be worth cutting in the string. */
export function oneLine(description, max = 160) {
  const d = (description ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^use th(?:is|e) (?:agent|skill|subagent) to (\w)/i, (_m, c) => c.toUpperCase());
  if (!d) return '';
  const stop = d.search(/[.!?](\s|$)/);
  const first = stop > 0 ? d.slice(0, stop + 1) : d;
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 40 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '')}...`;
}

/**
 * THE TITLE ON THE SCREEN. A file is named `leon-okafor-qa` and a person is
 *  not, so the hyphens come out and the first letters go up. Anything already
 *  carrying a capital or a space is left exactly as its author wrote it.
 *
 *  The short words stay shouted, because "Leon Okafor Qa" is not what she
 *  called it and a screen that renames her own agents is worse than one that
 *  shows the file name raw. */
const SHOUTED = new Set(['qa', 'ui', 'ux', 'api', 'cli', 'ai', 'db', 'pr', 'seo', 'css', 'html', 'sql', 'mcp']);

export function agentTitle(name) {
  const n = (name ?? '').trim();
  if (!n || /[A-Z\s]/.test(n)) return n;
  return n
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .map((w) => (SHOUTED.has(w) ? w.toUpperCase() : w.replace(/^\w/, (c) => c.toUpperCase())))
    .join(' ');
}

function readDir(dir, scope, { now = Date.now() } = {}) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const f of names.sort()) {
    if (!f.endsWith('.md') || f.startsWith('.')) continue;
    const full = path.join(dir, f);
    let text = '';
    try {
      const st = fs.statSync(full);
      if (st.size > MAX_BYTES) continue;
      if (now - st.mtimeMs > RECENT_MS) continue;
      text = fs.readFileSync(full, 'utf8');
    } catch { continue; }
    const { name, description } = parseAgentFile(text, full);
    if (!name) continue;
    const title = agentTitle(name);
    // A HEADING THAT IS JUST THE NAME AGAIN IS NOT INFORMATION. Most hand
    // written agent files open `# Docs Reviewer`, so the fallback above would
    // put the row's own title underneath it in smaller grey type. When what we
    // could get turns out to be the name, the row simply has no second line.
    const line = oneLine(description);
    out.push({ name, title, line: sameThing(line, title) ? '' : line, scope, path: full });
  }
  return out;
}

/**
 * BOTH SCOPES, in the order the screen shows them. `folder` is the project's
 *  own directory and may be null, which is the case where she has not pointed
 *  Agentbox at any code yet and only the home folder set exists. */
export function readAgentFiles({ home = os.homedir(), folder = null, now = Date.now() } = {}) {
  const user = readDir(path.join(home, '.claude', 'agents'), 'all', { now });
  const project = folder
    ? readDir(path.join(folder, '.claude', 'agents'), 'project', { now })
    : [];
  return { user, project };
}

/* ---------------------- THE FOLDERS SHE HAS NOT NAMED ---------------------- */

/**
 * WHERE ELSE ON THIS MAC AN AGENT LIVES.
 *
 * That settles the scope question and it exposes the gap underneath it. A
 * folder agent only works inside its own folder, so it can never be carried
 * into some other project's inbox and nothing here tries to. What measured on
 * her Mac 2026-08-25, four agents in `~/.claude/agents`, four in
 * `~/Desktop/dev/astral-desktop/.claude/agents`, and no project of hers points
 * at that folder. `readAgentFiles` can only ever look in the folder it is
 * handed, so no choice on the card reached those four.
 *
 *  This looks for the rest, so the card can offer to make the project that
 *  keeps them where they started.
 *
 *  A DOT FOLDER IS NEVER A PROJECT, and that is not a guess about tidiness. The
 *  same scan over her home folder finds
 *  `~/.cursor/extensions/esbenp.prettier-vscode-12.4.0-universal/.claude/agents`
 *  with two files in it, which is an editor extension shipping its own and not
 *  a folder she works in. Skipping names that begin with a dot is what keeps it
 *  off the card. */

/** Folder names that are never a project and are expensive to walk. */
const NOT_A_PROJECT = new Set([
  'node_modules', 'Library', 'Applications', 'Movies', 'Music', 'Pictures',
  'Public', 'Photos Library.photoslibrary',
]);

/**
 * THE FOLDERS macOS GUARDS, AS FULL PATHS, for this walk to refuse to enter.
 *
 *  The walk below used to queue every directory under her home folder, and
 *  measured on her Mac 2026-08-30 that is 122 of them, three of which are
 *  `Desktop`, `Documents` and `Downloads`. macOS answers each with a consent
 *  panel carrying our name, which is the panel in her screenshot. It returned
 *  nothing for the two panels it cost: no folder on her Mac outside her home
 *  set has agents of its own today.
 *
 * `main/first-run.mjs` learned this on 2026-08-25 and `shared/project-folder-
 * check.mjs` holds the list, and this module simply never got the guard.
 *
 *  MATCHED AS WHOLE PATHS DIRECTLY UNDER HOME, never by name, which is the rule
 *  first-run.mjs states: a folder called `Documents` inside somebody's code
 *  folder is their folder, and `~/Documents` is not. A project INSIDE a guarded
 *  folder is still reachable, by the door below rather than by a walk. */
function guardedPaths(home) {
  const here = path.resolve(String(home ?? ''));
  return here ? new Set(GUARDED.map((n) => path.join(here, n))) : new Set();
}

/**
 * WHERE CLAUDE CODE ITSELF SAYS SHE WORKS.
 *
 *  It is not a place on the disk, it is a file. Claude Code keeps one key per
 *  directory it has ever run in under `projects` in `~/.claude.json`, absolute
 *  paths, and reading it needs no permission from anybody: it sits at the top of
 *  the home folder, outside every guarded one. Measured on her Mac 2026-08-30:
 *  46 keys, and they name her dev folders exactly, including the ones the walk
 *  above can no longer reach because they are under `~/Desktop`.
 *
 *  So a folder inside a guarded folder is still offered, on the strength of
 *  Claude Code having run there rather than on the strength of us looking. That
 *  is the difference she is asking for: Agentbox reaches for one folder she has
 *  worked in, not for the whole of Documents.
 *
 *  A temp directory is not a project and neither is a worktree Claude made for
 *  itself, so `isScratchFolder` and the dot-folder rule throw those out here the
 *  same way the walk throws them out below. */
export function claudeProjectFolders({ home = os.homedir() } = {}) {
  const here = path.resolve(String(home ?? ''));
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(here, '.claude.json'), 'utf8'));
  } catch { return []; }
  const keys = Object.keys(parsed?.projects ?? {});
  const out = [];
  for (const key of keys) {
    if (typeof key !== 'string' || !path.isAbsolute(key)) continue;
    const full = path.resolve(key);
    if (full === here) continue;
    if (isScratchFolder(full, here)) continue;
    // `~/Desktop/claude/.claude/worktrees/upbeat-matsumoto-588a8d` is a real key
    // and it is Claude Code's own scratch checkout, not a folder she opens.
    if (full.split(path.sep).some((seg) => seg.startsWith('.'))) continue;
    out.push(full);
  }
  return out;
}

/**
 * How many agent files sit in one `.claude/agents`, without reading any of
 *  them. The card needs the count and nothing else until she picks a folder.
 *
 *  The age window is applied here too, because a count and the list underneath
 *  it are the same fact said twice and a heading reading "four" over an empty
 *  list is worse than either. */
function countAgentFiles(dir, now = Date.now()) {
  try {
    return fs.readdirSync(dir).filter((f) => {
      if (!f.endsWith('.md') || f.startsWith('.')) return false;
      try { return now - fs.statSync(path.join(dir, f)).mtimeMs <= RECENT_MS; } catch { return false; }
    }).length;
  } catch { return 0; }
}

/**
 * Every folder under `roots` that has agents of its own.
 *
 *  `roots` is whatever the app can honestly derive: the parent of each project
 *  folder she has already pointed Agentbox at, which is how her own dev folder is
 *  found without this module guessing at Mac folder conventions. Home and
 *  `~/Desktop` are always included, because a first run has no projects yet and
 *  a scan that finds nothing is worse than one that looks in two obvious places.
 *
 *  HOME ITSELF IS NEVER RETURNED. `~/.claude/agents` is Claude Code's every
 *  project scope and the card already has it on the other side of the switch;
 *  returning it here would draw it twice under two different promises.
 *
 *  Bounded on purpose: two levels below each root and a hard stop at `max`
 *  directories, so a Mac with a deep folder tree cannot turn opening a card
 *  into a disk walk. */
export function findAgentFolders({
  home = os.homedir(), roots = [], depth = 2, max = 4000, now = Date.now(),
  named = null,
} = {}) {
  const here = path.resolve(home);
  const guarded = guardedPaths(here);
  // `~/Desktop` WAS A SEED AND IS NOT ANY MORE. It was here because a first run
  // has no projects to take roots from, and the price of that guess was a
  // consent panel on a folder she had not mentioned. What replaces it is the
  // list Claude Code keeps of the folders it has actually run in, which reaches
  // `~/Desktop/dev/astral-desktop` by name and asks about nothing else.
  const seeds = [here, ...(Array.isArray(roots) ? roots : [])]
    .filter((r) => typeof r === 'string' && r.trim())
    .map((r) => path.resolve(r))
    // A project sitting directly in `~/Desktop` hands this walk `~/Desktop` as
    // its root, which is the guarded folder again by another door.
    .filter((r) => !guarded.has(r));
  const found = new Map();
  const seen = new Set();
  const queue = seeds.map((dir) => ({ dir, left: depth }));
  let looked = 0;
  // THE FOLDERS CLAUDE CODE NAMES ARE PROBED, NEVER ENUMERATED. One `readdir`
  // of one `.claude/agents` inside a folder she works in, and no listing of the
  // folder it is in or of anything above it.
  const byName = Array.isArray(named) ? named : claudeProjectFolders({ home: here });
  for (const dir of byName) {
    const full = path.resolve(dir);
    if (full === here || seen.has(full)) continue;
    seen.add(full);
    const n = countAgentFiles(path.join(full, '.claude', 'agents'), now);
    if (n > 0) found.set(full, n);
  }
  while (queue.length) {
    const { dir, left } = queue.shift();
    if (seen.has(dir)) continue;
    seen.add(dir);
    if (++looked > max) break;
    if (dir !== here) {
      const n = countAgentFiles(path.join(dir, '.claude', 'agents'), now);
      if (n > 0) found.set(dir, n);
    }
    if (left <= 0) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      // isDirectory is false for a symlink, which is also how this cannot
      // walk in a circle.
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.') || NOT_A_PROJECT.has(e.name)) continue;
      const child = path.join(dir, e.name);
      // The guard. macOS asks about each of these separately and this walk has
      // no business in any of them.
      if (guarded.has(child)) continue;
      queue.push({ dir: child, left: left - 1 });
    }
  }
  return [...found]
    .map(([folder, count]) => ({ folder, count, short: shortPath(folder, here), name: path.basename(folder) }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

/**
 * `/Users/you/Desktop/dev/astral-desktop` → `~/Desktop/dev/astral-desktop`. The
 * card prints this, and a path with her account name in it reads like a system
 * string rather than a folder she recognises. */
export function shortPath(folder, home = os.homedir()) {
  const here = path.resolve(home);
  const full = path.resolve(folder ?? '');
  return full === here || full.startsWith(`${here}/`) ? `~${full.slice(here.length)}` : full;
}

/**
 * THE AGENTS INSIDE ONE FOLDER, read the same way a project's own side is.
 *
 *  The line she skipped could only say a number, because `findAgentFolders`
 *  counts files and never opens one. A folder that is going to be a heading on
 *  the card with its agents listed under it needs the agents themselves, so
 *  this reads them. Same `readDir`, same scope tag as a project's own folder,
 *  because that is exactly what this folder is about to become. */
export function readFolderAgents(folder, { now = Date.now() } = {}) {
  return folder ? readDir(path.join(folder, '.claude', 'agents'), 'project', { now }) : [];
}
