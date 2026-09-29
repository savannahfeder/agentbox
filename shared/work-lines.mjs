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
const VERBS = {
  Bash: 'ran',
  Read: 'read',
  Write: 'wrote',
  Edit: 'edited',
  MultiEdit: 'edited',
  NotebookEdit: 'edited',
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
