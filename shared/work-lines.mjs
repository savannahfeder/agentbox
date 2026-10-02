// PURE. WHAT A TOOL CALL SAYS ON SCREEN.
//
// WHAT MESSY ACTUALLY WAS, measured over seven live imported sessions, off the
// drawn screen and not off the source:
//
//   535 work lines in 162 runs 328 of them (61%) ran past the end of their box
//   and were cut by the ellipsis, so they could not be read at all 368 of them
//   (69%) were over sixty characters the six worst showed 2% to 4% of
//   themselves; every one of those was `cd /Users/you/Desktop/dev/... &&
//   python3 - <<'PY' ...` 18 distinct raw tool names were printed as verbs, the
//   worst being `mcp__plugin_paper-desktop_paper__write_html`, 31 times in one
//   thread the longest unbroken run was 20 lines, and that happened three times
//
// So there are three separate defects wearing one word, and this file is the
// three answers.
//
// ONE. THE INTERESTING PART OF A COMMAND IS NEVER AT THE FRONT. Every one of
// the six worst lines was a real command hiding behind a `cd` into an absolute
// path, or an `export PATH=` prelude, or both. Truncating from the right, which
// is what an ellipsis does, therefore threw away the only part that mattered and
// kept the part every line shares. `plainCommand` drops the prelude instead, so
// the line STARTS at the thing that ran.
//
// TWO. A PATH IS SHOWN FROM THE END. `/Users/you/Desktop/dev/zero/
// renderer/src/components/Tweaks.tsx` is 63 characters of which the last 11 are
// the answer. Under the session's own folder it becomes
// `renderer/src/components/Tweaks.tsx`; deeper than that it keeps the last
// three segments behind a leading ellipsis. Nothing is invented and nothing is
// silently dropped: the whole string is one press away on the line itself.
//
// THREE. A RUN AGGREGATES. Consecutive tool calls fold into one line that says
// how many and what kind. The threshold is three and it is measured, not
// chosen: the run-length histogram is
// {1:38, 2:42, 3:36, 4:18, 5:6, 6:6, 7:8, 8:2, 11:2, 13:1, 20:3}. Folding at
// two takes the screen down 70% and folding at three takes it down 62%, so the
// last eight points cost the 42 pairs, and a pair read as two short clean
// lines says more than "2 things it ran" does. Three is where a wall starts.
//
// NOTHING HERE HIDES A FAILURE. A folded run says on its own line that
// something in it failed, in the same words and the same colour a single line
// would, because a fold she has to open to find bad news in is worse than the
// wall it replaced.

/* ------------------------------ WHAT IT DID ------------------------------- */
// PLAIN WORDS AND NOT OUR TOOL NAMES. The design law forbids jargon in UI copy,
// so "Bash" and "Glob" are ours, not the reader's.
//
// `changed` RATHER THAN `edited` (2026-10-01). A tester who is not a programmer
// reads "edited" as a document being revised; the thing that happened is that a
// file in the code is now different, and the line next to it already offers the
// file as a chip into the change. One word for one event.
const VERBS = {
  Bash: 'ran',
  Read: 'read',
  Write: 'wrote',
  Edit: 'changed',
  MultiEdit: 'changed',
  NotebookEdit: 'changed',
  Glob: 'looked for',
  Grep: 'searched for',
  WebFetch: 'fetched',
  WebSearch: 'searched the web for',
  Task: 'sent off a helper',
  TodoWrite: 'kept its list',
  ListAgents: 'listed the other sessions',
  SendMessage: 'messaged',
  ToolSearch: 'looked up a tool',
  // Measured in her own threads on 2026-08-20 and printed raw until now:
  // `skill` 3 times and `askuserquestion` twice, both as bare lowercase names.
  Skill: 'used a skill',
  AskUserQuestion: 'asked a question',
  BashOutput: 'checked on a command',
  KillShell: 'stopped a command',
  ExitPlanMode: 'finished planning',
};

// THE PREFIX STRIP WAS BROKEN AND HER LONGEST THREAD IS WHERE IT SHOWED. The
// old pattern was `^mcp__[^_]+__`, which needs the server's name to hold no
// underscore. `mcp__plugin_paper-desktop_paper__write_html` went through
// untouched and she read that string 31 times in one afternoon. An MCP name is
// `mcp__<server>__<tool>` and a server may contain anything, so the tool is
// what follows the LAST double underscore.
export function workVerb(name) {
  const n = String(name ?? '').trim();
  if (!n) return 'did something';
  if (VERBS[n]) return VERBS[n];
  const mcp = n.startsWith('mcp__') ? n.slice(n.lastIndexOf('__') + 2) : n;
  // Underscores are how a machine spells a space. She reads the result, so it
  // gets the space: `list_work_items` is jargon and `list work items` is a
  // name, which is all this line has ever claimed to be.
  return mcp.replace(/_+/g, ' ').trim().toLowerCase() || 'did something';
}

/* ------------------------------ A PATH, SHORT ----------------------------- */
// From the END, because that is where the answer is. Three segments is the
// budget: measured over her 535 lines, three segments holds the whole of every
// path that sits inside a repo and the meaningful tail of every scratch path.
const PATH_SEGMENTS = 3;

// `home` IS THE MACHINE'S, AND IT HAS NO DEFAULT. It used to default to
// `/Users/you`, which meant every path this shortened was shortened correctly
// on exactly one Mac in the world. Agentbox is downloaded now: on anybody
// else's, `~/notes.md` came out as `/Users/leon/notes.md`, which is the
// prefix-only line this whole file exists to stop. Nothing is guessed when
// nobody says whose Mac it is; the path is shown whole, which is worse than a
// tilde and is at least true.
export function shortPath(raw, cwd = '', home = '') {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (!s.startsWith('/') && !s.startsWith('~')) return s;

  let p = s;
  // `/private/tmp` and `/tmp` are the same folder on a Mac and she has never
  // typed either. Saying `/private` first is the filesystem talking.
  p = p.replace(/^\/private\/tmp\//, '/tmp/');

  // Inside the folder this session is running in, a path is what she would
  // type: relative, with nothing above it.
  const base = String(cwd ?? '').replace(/^\/private\/tmp\//, '/tmp/').replace(/\/+$/, '');
  if (base && (p === base || p.startsWith(`${base}/`))) {
    const rel = p === base ? '' : p.slice(base.length + 1);
    return rel ? trimSegments(rel) : './';
  }

  const h = String(home ?? '').replace(/\/+$/, '');
  if (h && p.startsWith(`${h}/`)) p = `~/${p.slice(h.length + 1)}`;

  return trimSegments(p);
}

// Keep the last few segments and say, with an ellipsis, that there were more.
// The leading `…/` is the whole of the honesty here: a bare `components/
// Tweaks.tsx` would read as a path from the root of something.
function trimSegments(p) {
  // The lead is kept whole when nothing is trimmed, because `/x/store.mjs` and
  // `x/store.mjs` are two different files and dropping the slash would be this
  // function quietly saying the wrong one.
  const lead = p.startsWith('~/') ? '~/' : p.startsWith('/') ? '/' : '';
  const body = p.slice(lead.length);
  const parts = body.split('/').filter(Boolean);
  if (parts.length <= PATH_SEGMENTS) return lead + parts.join('/');
  return `…/${parts.slice(-PATH_SEGMENTS).join('/')}`;
}

/* --------------------------- A COMMAND, PLAIN ----------------------------- */
// THE PRELUDE COMES OFF THE FRONT. Every shape below was counted in her own
// sessions on 2026-08-20; none of it is hypothetical.
//
//   `cd /Users/you/Desktop/dev/zero && …`         the commonest by far
//   `export PATH="$HOME/.nvm/versions/node/…" ; …`     29 times in one thread
//   `SP=/private/tmp/claude-501/-Users-…/… ; …`        a bare assignment
// `source ~/.zshrc && …`
//
// Each is scaffolding that says nothing about what the agent was doing, and
// each is long enough on its own to fill the line. They come off one at a time
// until what is left is a command.
//
// WHAT IT NEVER DOES IS INVENT. If stripping leaves nothing, the original
// stands: an agent that genuinely only ran `cd somewhere` did that, and a line
// reading empty would be this function lying about it.
const PRELUDE = [
  // cd <path> && |; | \n
  /^cd\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;|\n)\s*/,
  // export NAME=<value> && |; | \n (value may be quoted and may hold; or &)
  /^export\s+[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s;&]*)\s*(?:&&|;|\n)\s*/,
  // NAME=<value> && |; | \n (a bare assignment, same shapes)
  /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s;&]*)\s*(?:&&|;|\n)\s*/,
  // source|. <file> && |; | \n
  /^(?:source|\.)\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;|\n)\s*/,
  // echo "=== a banner ===" && |; | \n
  //
  // ONLY A BANNER, and the `===` or `---` is what makes it one. An agent
  // labelling its own terminal output is talking to itself, and four of the 31
  // worst lines left on her screen after the preludes came off were exactly
  // this. A plain `echo something` is a real command and is left alone, because
  // it may be the whole of what ran.
  /^echo\s+(?:"[^"]*(?:===|---)[^"]*"|'[^']*(?:===|---)[^']*')\s*(?:&&|;|\n)\s*/,
];

// A heredoc is a whole script pretending to be an argument. The longest in her
// sessions was 84 lines of python inside one `ran`. Everything from the marker
// onward becomes an ellipsis, so the line says which program was fed a script
// without printing the script.
const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1([\s\S]*)$/;

// EXCEPT WHEN THE PROGRAM IS THE WHOLE OF WHAT IS LEFT. Drawn over her own
// thread on 2026-08-20 the first cut put three `python3 - …` lines in a row
// inside one fold, which distinguishes nothing. In every one of those the file
// being worked on was named on the script's FIRST line, so when the command in
// front of the marker is this short the first line comes with it.
const HEREDOC_HEAD = 12;

function firstScriptLine(body, marker) {
  for (const line of String(body ?? '').split('\n')) {
    const t = line.trim();
    // The marker itself closes the heredoc and is not a line of the script.
    // Matched exactly, because a one-word line of script looks just like one.
    if (!t || t === marker) continue;
    if (t.startsWith('#') || t.startsWith('//')) continue;
    return t;
  }
  return '';
}

export function plainCommand(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const whole = s;

  // Peel the scaffolding, repeatedly: `cd x && export Y=z && npm test` is all
  // three of these in a row.
  for (let i = 0; i < 6; i += 1) {
    const before = s;
    for (const re of PRELUDE) s = s.replace(re, '');
    if (s === before) break;
  }
  const doc = s.match(HEREDOC);
  if (doc) {
    const head = s.slice(0, doc.index).trim();
    const first = head.length <= HEREDOC_HEAD ? firstScriptLine(doc[3], doc[2]) : '';
    s = first ? `${head} … ${first}` : `${head} …`;
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s || whole.replace(/\s+/g, ' ').trim();
}

/* --------------------- THE STORE'S OWN BOOKKEEPING ------------------------ */
// NOT WORK, AND NOT SHOWN AT ALL.
//
// Testers who are not programmers read the top of every thread as noise, and
// the top of every thread is this: a tool lookup, a claim, and later an update
// to the item. MEASURED over 3,344 real session traces from 2026-09-20 to
// 2026-10-01: 55,500 tool lines, of which 2,462 are the store's own records
// (claim 1,212, update 999, release 138, the lists 113) and 498 are a tool
// lookup. Three per cent of the lines and the first two lines of nearly every
// thread.
//
// NOTHING OF THE WORK IS HIDDEN BY THIS. Reading a document, writing one,
// filing a question and looking at a page are what the session was asked to do;
// taking the item and writing its status back are how it tells the app it is
// running. The second kind is what comes off the screen.
//
// The server is named after the product (`mcp__agentbox__`, `mcp__daydream__`),
// so the prefix is never one fixed string and the tool is what follows the last
// double underscore, the same reading `workVerb` makes.
const BOOKKEEPING = new Set([
  'claim_work_item', 'release_work_item', 'update_work_item',
  'list_work_items', 'list_documents', 'list_products', 'list_skills',
  'list_chats', 'get_product',
]);

// The name arrives three ways and all three are the same tool: the full
// `mcp__<server>__<tool>` a Claude transcript writes, the bare tool Codex
// reports beside its server, and `ToolSearch`, which is the harness loading a
// schema and is nobody's work.
export function isBookkeeping(name) {
  const n = String(name ?? '').trim();
  if (!n) return false;
  if (n === 'ToolSearch') return true;
  return BOOKKEEPING.has(n.startsWith('mcp__') ? n.slice(n.lastIndexOf('__') + 2) : n);
}

/* ------------------------- A COMMAND, IN PLAIN WORDS ---------------------- */
// "Running cat README.md; echo ---; cat package.json" is what a tester was
// shown. What happened was that it read two files.
//
// MEASURED over the same 3,344 traces: 32,349 Bash lines, 361 distinct leading
// programs, and the eleven commonest cover 80% of them (grep 5,325, git 3,998,
// sed 3,894, npx 2,471, python3 2,435, cat 2,074, ls 1,814, a shell -c 1,464,
// arch 947, a for loop 894, node 689). 55% of the lines are compound (`a && b;
// c`) and 48% hold a pipe, so the thing on the screen is a shell one-liner and
// not a sentence.
//
// THE RULE IS THAT A GUESS IS WORSE THAN A COMMAND. Every segment has to be
// recognised and they all have to agree on one verb; one unknown part, or two
// different verbs, and this returns null and the line stays the command it
// always was. A wrong verb on her screen cannot be checked against anything,
// and the raw command at least is true. The exact string is one press away
// either way (`full` on the work line).
//
// `doing` IS THE SAME EVENT WHILE IT IS STILL HAPPENING, because the live line
// under a running row reads "Reading README.md" and the thread above it reads
// "Read README.md". One table, so the two can never drift.

// Scaffolding between the real steps of a line. A banner, a `cd`, a wait.
const NOISE = new Set(['echo', 'cd', 'pwd', 'true', 'false', ':', 'sleep', 'clear', 'date', 'printf', 'set']);

// `2>&1` and `2>/dev/null` say nothing about what ran and are on a third of
// these lines. Any OTHER redirect writes or reads a file we have not accounted
// for, so it gives up rather than guess.
const QUIET_REDIRECT = /^[0-9]*>>?&?(?:[0-9]+|\/dev\/null)$/;

const FAMILIES = [
  { verb: 'read', doing: 'Reading', heads: ['cat', 'head', 'tail', 'less', 'more', 'nl', 'bat'], take: 'files', skip: ['-n', '-c', '-m'] },
  { verb: 'counted the lines in', doing: 'Counting the lines in', heads: ['wc'], take: 'files' },
  { verb: 'searched for', doing: 'Searching for', heads: ['grep', 'rg', 'ag', 'ack'], take: 'first', many: 'things', skip: ['-e', '-m', '-A', '-B', '-C'] },
  { verb: 'listed', doing: 'Listing', heads: ['ls'], take: 'files', empty: './', many: 'folders' },
  { verb: 'looked for', doing: 'Looking for', heads: ['find', 'fd'], take: 'named', many: 'things' },
  { verb: 'copied', doing: 'Copying', heads: ['cp'], take: 'files' },
  { verb: 'moved', doing: 'Moving', heads: ['mv'], take: 'files' },
  { verb: 'deleted', doing: 'Deleting', heads: ['rm'], take: 'files' },
  { verb: 'made a folder', doing: 'Making a folder', heads: ['mkdir'], take: 'files', many: 'folders', plural: { verb: 'made folders', doing: 'Making folders' } },
  { verb: 'made a file', doing: 'Making a file', heads: ['touch'], take: 'files', plural: { verb: 'made files', doing: 'Making files' } },
  { verb: 'fetched', doing: 'Fetching', heads: ['curl', 'wget'], take: 'url', many: 'pages', skip: ['-o', '-w', '-H', '-X', '-d', '-u', '-A', '-e', '-F', '--output', '--header', '--data'] },
];
const BY_HEAD = new Map();
for (const family of FAMILIES) for (const head of family.heads) BY_HEAD.set(head, family);

// A `git` subcommand is the verb; the ones not listed keep their command,
// because "checked the code" over `git merge-base` says less than the line did.
const GIT = {
  status: { verb: 'checked what changed', doing: 'Checking what changed' },
  diff: { verb: 'checked what changed', doing: 'Checking what changed' },
  log: { verb: 'read the code history', doing: 'Reading the code history' },
  show: { verb: 'read the code history', doing: 'Reading the code history' },
  blame: { verb: 'read the code history', doing: 'Reading the code history' },
  add: { verb: 'saved the changes', doing: 'Saving the changes' },
  commit: { verb: 'saved the changes', doing: 'Saving the changes' },
  branch: { verb: 'looked at the branches', doing: 'Looking at the branches' },
  push: { verb: 'pushed the branch', doing: 'Pushing the branch' },
  fetch: { verb: 'fetched the latest code', doing: 'Fetching the latest code' },
  pull: { verb: 'fetched the latest code', doing: 'Fetching the latest code' },
  merge: { verb: 'merged the branch', doing: 'Merging the branch' },
  checkout: { verb: 'switched branch', doing: 'Switching branch' },
  switch: { verb: 'switched branch', doing: 'Switching branch' },
};

const TESTS = { verb: 'ran the tests', doing: 'Running the tests', many: 'test files' };
const SCRIPT = { verb: 'ran a script', doing: 'Running a script', many: 'scripts' };
const RUNNERS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bun']);
const SHELLS = new Set(['sh', 'bash', 'zsh', '/bin/sh', '/bin/bash', '/bin/zsh']);
const SCRIPTS = new Set(['node', 'python', 'python3', 'ruby', 'osascript', 'deno', 'tsx']);
const TEST_RUNNERS = new Set(['vitest', 'jest', 'pytest', 'mocha', 'ava']);
const TEST_FILE = /\.(?:test|spec)\.[a-z]+$/;

const lastSegment = (file) => String(file).split('/').filter(Boolean).pop() ?? '';

function unquote(token) {
  const t = String(token);
  if (t.length > 1 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1);
  return t;
}

// Split on separators that are OUTSIDE quotes. A `;` inside a sed script or a
// grep pattern is not a new command, and splitting on it is how a reader of
// shell lines invents steps that never ran.
function splitOutside(text, separators) {
  const out = [];
  let buffer = '';
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      buffer += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buffer += ch; continue; }
    const pair = text.slice(i, i + 2);
    if (separators.includes(pair)) { out.push(buffer); buffer = ''; i += 1; continue; }
    if (separators.includes(ch)) { out.push(buffer); buffer = ''; continue; }
    buffer += ch;
  }
  out.push(buffer);
  return out.map((part) => part.trim()).filter(Boolean);
}

const tokens = (segment) => splitOutside(segment, [' ', '\t']);
const isFlag = (token) => token.startsWith('-') && token !== '-';
const looksLikeAFile = (token) => /[./]/.test(token) && !token.startsWith('-');

// The arguments of one stage, with the quiet redirects and the flag values
// dropped. Null when something is there that this file cannot account for.
function argumentsOf(words, skip = []) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const raw = words[i];
    const quoted = raw[0] === '"' || raw[0] === "'";
    const token = unquote(raw);
    if (!quoted) {
      if (QUIET_REDIRECT.test(token)) continue;
      // Anything else involving a file handle, a subshell or a glob of
      // commands is a shape nobody taught this.
      if (/[<>`]/.test(token) || token.includes('$(')) return null;
    }
    if (isFlag(token)) {
      if (skip.includes(token)) i += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

// One stage of one segment, as a verb and the things it names, or 'noise', or
// null for "this file does not know".
function stageWords(stage, cwd, home) {
  const words = tokens(stage);
  if (!words.length) return 'noise';
  const head = unquote(words[0]);
  const rest = words.slice(1);
  if (NOISE.has(head)) {
    // `echo something > a file` writes a file, and this is not the reader of it.
    const args = argumentsOf(rest);
    return args === null ? null : 'noise';
  }
  // `timeout 300 npx vitest …` and `arch -arm64 node …` are the real command
  // with a wrapper in front of it.
  if (head === 'timeout' || head === 'nice' || head === 'arch' || head === 'env') {
    const inner = rest.filter((w) => !isFlag(unquote(w)) && !/^[0-9]+$/.test(unquote(w)));
    return inner.length ? stageWords(inner.join(' '), cwd, home) : null;
  }
  // A shell asked to run a string: the string is the command.
  if (SHELLS.has(head)) {
    const flag = rest.findIndex((w) => /^-[a-z]*c$/.test(unquote(w)));
    if (flag < 0 || !rest[flag + 1]) return null;
    const words2 = commandWork(unquote(rest[flag + 1]), cwd, home);
    return words2 ? { ...words2, names: words2.subject ? [words2.subject] : [], whole: true } : null;
  }
  if (head === 'git') return gitWords(rest, cwd, home);
  if (head === 'sed' || head === 'perl') return sedWords(rest, cwd, home);
  if (RUNNERS.has(head)) return runnerWords(rest, cwd, home);
  if (SCRIPTS.has(head) || /\.(?:sh|mjs|js|py)$/.test(head)) {
    const args = argumentsOf(rest);
    if (args === null) return null;
    // `python3 - <<'PY'` is a script with no name, and `plainCommand` already
    // puts its first line after the ellipsis. That line is what a developer
    // reads to tell one of 2,793 of these from another, so it is kept.
    if (stage.includes('…')) {
      const first = stage.slice(stage.lastIndexOf('…') + 1).trim();
      return { ...SCRIPT, names: first ? [first] : [] };
    }
    const file = args.find(looksLikeAFile);
    return { ...SCRIPT, names: file ? [lastSegment(file)] : [] };
  }
  if (TEST_RUNNERS.has(head)) return testWords(rest);
  if (head === 'tsc') return { verb: 'checked the types', doing: 'Checking the types', names: [] };
  if (head === 'eslint') return { verb: 'checked the code style', doing: 'Checking the code style', names: [] };
  const family = BY_HEAD.get(head);
  if (!family) return null;
  const args = argumentsOf(rest, family.skip);
  if (args === null) return null;
  return { ...family, names: namesFor(family, args, cwd, home) };
}

const URL_LIKE = /^(?:https?:\/\/|www\.|localhost|127\.0\.0\.1)/;

function namesFor(family, args, cwd, home) {
  if (family.take === 'first') return args.slice(0, 1);
  // A fetch names the page, which is not always the first argument: `curl -s -o
  // /dev/null -w '%{http_code}' <url>` had three before it.
  if (family.take === 'url') {
    const url = args.find((a) => URL_LIKE.test(a));
    return url ? [url] : args.slice(0, 1);
  }
  if (family.take === 'named') {
    const named = args.find((a) => /[*?]/.test(a));
    return named ? [named] : args.slice(0, 1).map((a) => shortPath(a, cwd, home));
  }
  const files = args.filter(looksLikeAFile).map((a) => shortPath(a, cwd, home));
  if (!files.length) return family.empty ? [family.empty] : [];
  return files;
}

// WHAT THE SUBCOMMAND NAMED, because a developer reads these lines for the
// file, the branch or the message, and a verb on its own tells them less than
// the command did. Measured over the same traces: `git add`, `git commit`,
// `git push` and `git merge` are 563 lines that said nothing but their verb.
function gitWords(rest, cwd, home) {
  const words = [...rest];
  // `git -C <path> <subcommand>`: the folder is not the verb.
  while (words.length && isFlag(unquote(words[0]))) {
    const flag = unquote(words.shift());
    if (flag === '-C' || flag === '--git-dir' || flag === '--work-tree') words.shift();
  }
  const sub = unquote(words[0] ?? '');
  const known = GIT[sub];
  if (!known) return null;
  return { ...known, names: gitNames(sub, words.slice(1), cwd, home) };
}

// Not a ref: the remote it went to, and the `--` that ends the flags.
const NOT_A_REF = new Set(['origin', 'upstream', '.', '--', 'HEAD']);

function gitNames(sub, rest, cwd, home) {
  if (sub === 'commit') {
    // The message, which is the one thing a commit line is read for. It is
    // absent when the message came in on stdin (`git commit -F -`).
    const at = rest.findIndex((w) => unquote(w) === '-m' || unquote(w) === '--message');
    const message = at >= 0 ? unquote(rest[at + 1] ?? '') : '';
    return message ? [message] : [];
  }
  const args = argumentsOf(rest, ['-m', '--message', '-C', '-S']);
  if (args === null) return [];
  if (sub === 'push' || sub === 'merge' || sub === 'checkout' || sub === 'switch' || sub === 'fetch' || sub === 'pull') {
    const refs = args.filter((a) => a && !NOT_A_REF.has(a));
    return refs.length ? [refs[refs.length - 1]] : [];
  }
  const files = args.filter(looksLikeAFile).map((a) => shortPath(a, cwd, home));
  // A HISTORY COMMAND OFTEN NAMES SOMETHING THAT IS NOT A PATH, and it is the
  // point of the line: `git log --grep w-4ac1af8c99` is a search for one
  // thread. The value a flag carried survives when no file does.
  if (files.length) return files;
  return args.length ? [args[0]] : [];
}

// The leading quote survives on a line the trace cut mid-string.
const SED_SCRIPT = /^['"]?[0-9,$]*[a-zA-Z]?[/#|]/;

function sedWords(rest, cwd, home) {
  const args = argumentsOf(rest);
  if (args === null) return null;
  const flags = rest.map(unquote).filter(isFlag);
  const inPlace = flags.some((f) => f.startsWith('-i'));
  // THE FILE IS THE LAST ARGUMENT, AND A SED SCRIPT IS NOT IT. A trace line is
  // cut at 200 characters, so the file is sometimes not on it at all and the
  // script (`s#a#b#`) is the last thing that looks like a path.
  const file = [...args].reverse().find((a) => looksLikeAFile(a) && !SED_SCRIPT.test(a));
  if (inPlace) {
    return file ? { verb: 'changed', doing: 'Changing', names: [shortPath(file, cwd, home)] } : null;
  }
  // `sed -n 1,200p <file>` is how an agent reads part of a file; 3,529 of the
  // 3,894 sed lines measured were exactly that, against 325 that edited.
  if (!flags.some((f) => f === '-n' || f === '-e' || f === '-E')) return null;
  return file ? { verb: 'read', doing: 'Reading', names: [shortPath(file, cwd, home)] } : null;
}

function runnerWords(rest, cwd, home) {
  const words = rest.map(unquote).filter((w) => w !== '--yes' && w !== '-y' && w !== '-s');
  let tool = words[0] ?? '';
  if (tool === 'run' || tool === 'exec') tool = words[1] ?? '';
  // `npx vitest@4` and `npx hyperframes@0.8.77` name a version, not a tool.
  tool = tool.replace(/@[^@/]*$/, '');
  if (tool === 'test' || TEST_RUNNERS.has(tool)) return testWords(words.slice(1));
  if (tool === 'tsc' || tool === 'typecheck') return { verb: 'checked the types', doing: 'Checking the types', names: [] };
  if (tool === 'eslint' || tool === 'lint') return { verb: 'checked the code style', doing: 'Checking the code style', names: [] };
  if (tool === 'build' || (tool === 'vite' && words.includes('build'))) {
    return { verb: 'built the app', doing: 'Building the app', names: [] };
  }
  if (tool === 'install' || tool === 'ci' || tool === 'i') {
    return { verb: 'installed the packages', doing: 'Installing the packages', names: [] };
  }
  if (SCRIPTS.has(tool)) return stageWords(words.join(' '), cwd, home);
  return null;
}

// A trace line is cut at 200 characters, so the last test file on a long
// `vitest run a b c` often arrives without its extension. Anything that looks
// like a path counts, which is how 586 lines that named nothing got their name.
function testWords(rest) {
  const args = rest.map(unquote).filter((w) => !isFlag(w) && w !== 'run');
  const files = args.filter((w) => TEST_FILE.test(w) || w.includes('/'));
  return { ...TESTS, names: files.map(lastSegment) };
}

// Up to three names, then the count. Her standing objection to a cap is one
// that rounds off in silence, so the count says what it counted.
function joinNames(names, many = 'files') {
  const list = [...new Set(names.filter(Boolean))];
  if (!list.length) return '';
  if (list.length > 3) return `${list.length} ${many}`;
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * What a shell command did, in words, or null to leave it as the command.
 *
 * `cwd` and `home` are the folder the session ran in and the Mac's home, the
 * same two arguments `shortPath` takes and for the same reason: a path is only
 * shortenable against the folder it sits under, and nothing is guessed when
 * nobody says.
 */
export function commandWork(raw, cwd = '', home = '') {
  const command = plainCommand(raw);
  if (!command) return null;
  const steps = [];
  for (const segment of splitOutside(command, ['&&', '||', ';', '\n'])) {
    // A pipeline's first stage is what ran; the rest is plumbing that shapes
    // its output (`| head`, `| sort | uniq -c`).
    const stage = splitOutside(segment, ['|'])[0] ?? '';
    const read = stageWords(stage, cwd, home);
    if (read === null) return null;
    if (read !== 'noise') steps.push(read);
  }
  if (!steps.length) return null;
  const first = steps[0];
  if (steps.some((step) => step.verb !== first.verb)) return null;
  if (first.whole) return { verb: first.verb, doing: first.doing, subject: first.names[0] ?? '' };
  const names = [...new Set(steps.flatMap((step) => step.names).filter(Boolean))];
  // "Made a folder, 4 folders" is the verb and the count disagreeing about how
  // many there were. A family that counts its own subject says both ways.
  const said = names.length > 1 && first.plural ? first.plural : first;
  return { verb: said.verb, doing: said.doing, subject: joinNames(names, first.many) };
}

/* ------------------------------- THE SUBJECT ------------------------------ */
// WHICH ONE THIS WAS, in as few characters as the truth allows. `cwd` is the
// folder the session is running in, which is what makes a path relative; it is
// optional so that nothing that calls this without one gets worse than before.
export function workSubject(input, cwd = '', home = '') {
  const i = input ?? {};
  if (i.command != null && String(i.command).trim()) {
    return plainCommand(i.command);
  }
  const path = i.file_path ?? i.path ?? i.notebook_path;
  if (path != null && String(path).trim()) return shortPath(path, cwd, home);
  const raw = i.pattern ?? i.query ?? i.to ?? i.url ?? i.prompt ?? '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

// THE WHOLE OF IT, for the line she opened. Nothing this file shortens is
// lost: the full string goes back on the screen above the output, and this is
// the function that says whether there is anything to put there.
export function fullSubject(input) {
  const i = input ?? {};
  const raw = i.command ?? i.file_path ?? i.path ?? i.notebook_path
    ?? i.pattern ?? i.query ?? i.to ?? i.url ?? i.prompt ?? '';
  return String(raw).replace(/\s+$/, '');
}

/* -------------------------------- THE RUN --------------------------------- */
// AGGREGATE, HER WORD. Three or more consecutive tool calls fold into one line.
// Two do not, because two clean lines say more than a fold does and 42 of her
// 162 runs are exactly two.
export const RUN_MIN = 3;

export function groupWork(events, { min = RUN_MIN } = {}) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length >= min) out.push({ kind: 'run', at: run[0].at ?? 0, items: run });
    else out.push(...run);
    run = [];
  };
  for (const e of events ?? []) {
    if (e && e.kind === 'work') { run.push(e); continue; }
    flush();
    out.push(e);
  }
  flush();
  return out;
}

// WHAT THE FOLDED LINE SAYS. It says the number first, because the number is
// the thing a fold owes her: her standing objection to every cap in this
// codebase is a total that was rounded off without saying so.
//
//   one verb, and one we have a plain word for   `20 things it ran`
//   one verb we do not                           `31 things it did · write html 31`
//   several                                      `24 things it did · ran 18 · read 4 · edited 2`
//
// Three verbs is the tally's budget; past that the rest is one more count, so
// the line never grows past what fits.
//
// A COUNT OF ONE IS NOT PRINTED. Drawn over her own threads on 2026-08-20 the
// first cut read `8 things it did · ran 5 · read 2 · asked a question 1`, and
// that trailing 1 reads as part of the name rather than as a number. A bare
// verb already says once.
const PLAIN = new Set(['ran', 'read', 'wrote', 'edited', 'looked for', 'searched for', 'fetched', 'messaged']);
const TALLY_VERBS = 3;

export function runSummary(items) {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return '';
  const counts = new Map();
  for (const e of list) counts.set(e.verb, (counts.get(e.verb) ?? 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (byCount.length === 1 && PLAIN.has(byCount[0][0])) {
    return `${list.length} thing${list.length === 1 ? '' : 's'} it ${byCount[0][0]}`;
  }
  const shown = byCount.slice(0, TALLY_VERBS).map(([v, n]) => (n === 1 ? v : `${v} ${n}`));
  const rest = byCount.slice(TALLY_VERBS).reduce((s, [, n]) => s + n, 0);
  if (rest) shown.push(`${rest} more`);
  return `${list.length} things it did · ${shown.join(' · ')}`;
}

// THE BAD NEWS IS NEVER BEHIND THE FOLD. Said in plain words on the closed line,
// in the one colour this surface uses.
export function runFailures(items) {
  const bad = (items ?? []).filter((e) => e && e.failed).length;
  if (!bad) return '';
  return `${bad} failed`;
}

/* --------------------------- THE FILE IT CHANGED -------------------------- */
// A WORK LINE THAT SAYS IT CHANGED A FILE HANDS THE FILE OVER, so the thread
// can make it a chip.
//
// The same four tools main/code-change.mjs reads, and they have to stay the
// same four: one list saying which calls become a diff and another saying which
// lines become a chip is two lists that drift, and the symptom of the drift is
// a chip that opens onto a file the change does not hold.
export const CHANGES_A_FILE = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/**
 * The path a tool call changed, whole and unshortened, or '' when it changed
 * nothing. Whole because it is matched against the change's own list, and the
 * shortened form on screen has had its front thrown away.
 */
export function changedFile(name, input) {
  if (!CHANGES_A_FILE.has(String(name ?? ''))) return '';
  const i = input ?? {};
  return String(i.file_path ?? i.notebook_path ?? '').trim();
}

/**
 * Which entry of a change a path on a work line is, or null.
 *
 * A transcript records the ABSOLUTE path it wrote; a change records the path
 * relative to one of the run's roots when it sits under one, and the absolute
 * path when it does not (main/code-change.mjs). So the two shapes have to meet,
 * and matching on the tail is what makes them: the change's key is either the
 * whole string or a suffix of it at a segment boundary.
 *
 * The LONGEST match wins. `src/a.ts` and `renderer/src/a.ts` are different
 * files and both are suffixes of the second one's absolute path; taking the
 * first match would open whichever the change happened to list first.
 */
export function fileInChange(paths, raw) {
  const p = String(raw ?? '').trim().replace(/^\/private\/tmp\//, '/tmp/');
  if (!p) return null;
  let best = null;
  for (const key of paths ?? []) {
    const k = String(key ?? '').trim();
    if (!k) continue;
    const hit = k === p || p.endsWith(`/${k}`)
      || k.replace(/^\/private\/tmp\//, '/tmp/') === p;
    if (!hit) continue;
    if (!best || k.length > best.length) best = key;
  }
  return best;
}
