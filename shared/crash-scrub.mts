// A crash report is scrubbed BEFORE it leaves, never after (the founder,
// 2026-08-19, her yes on). The order matters and it is the whole design: a
// reporter that ships a raw error and filters at the far end has already put a
// stranger's home directory, username and client project name on someone else's
// server, and no retention policy takes that back.
//
// What a real error carries, measured 2026-08-19 (reports/analytics-evaluation.html
// in the Agentbox store): a plain ENOENT puts the user's home dir, their username
// and their project folder name in THREE places at once — `err.message`,
// `err.path`, and the first line of `err.stack`. the app's own code adds a fourth:
// of 46 `throw new Error` sites, several interpolate a user string straight into
// the message (`no such product: ${slug}`, where the slug is the name of the
// project someone is working on).
//
// So this file is the only place that decides what a report may contain, and it
// works by ALLOWLIST: a payload is built field by field out of things we know
// are safe, never by copying an error and deleting the bad parts. Deleting is
// how the fourth place gets missed.
//
// The four rules, in the founder's terms:
//   1. The home directory becomes `~`, everywhere, in every string.
//   2. Below a folder root the names go and the DEPTH stays. `~/<home+4>` says
//      "four levels under home" and names none of them.
//   3. `err.path`, `err.dest` and the rest of the syscall's arguments are gone
//      outright. The syscall NAME (`open`) and the code (`ENOENT`) survive,
//      because they debug and they carry nothing.
//   4. A stack keeps only the frames inside the app bundle. Everything else is
//      counted, not sent.
// And one line under all of them: NO TASK TEXT, EVER. In Agentbox a task's title
// and body ARE the user's prompt, so any payload carrying one turns the page's
// promise about prompts into a lie rather than an imprecision.

import path from 'node:path';

// Anything that looks like a filesystem path: a `/` or `~/` start, then
// everything up to whitespace or a closing quote/bracket. Deliberately greedy
// about what counts as a path, because a missed one is a leak and a false
// positive costs a word of debug detail.
const PATH_RE = /(?:file:\/\/)?(?:~|\/)[^\s'"`)\]},;]*/g;

// A redacted token always carries `<`, which is how later passes tell "already
// handled" from "still raw" without re-parsing.
const MARK = '<';

function depthOf(rest) {
  return rest.split('/').filter(Boolean).length;
}

// A path inside our own bundle, which `scrubPath` has already made relative to
// the bundle root and so cannot contain anything of theirs. It is the same
// string in every report from every Mac, which is exactly why it may be set
// aside before we go looking for the person: it carries no information about
// them. EXPORTED because the check below and the tests both have to set the
// same thing aside, and two definitions of "ours" is how they drift apart.
export function withoutOurOwnPaths(text) {
  return String(text).replace(/app:[^\s'"`)\]},;]*/g, ' ');
}

// One path token in, one safe token out.
export function scrubPath(raw, ctx = {}) {
  const home = ctx.home ? path.resolve(ctx.home) : null;
  const appDir = ctx.appDir ? path.resolve(ctx.appDir) : null;
  let p = raw.startsWith('file://') ? raw.slice('file://'.length) : raw;
  // A trailing `:12:5` from a stack frame is line and column, not path.
  let tail = '';
  const lineCol = p.match(/(:\d+(?::\d+)?)$/);
  if (lineCol) { tail = lineCol[1]; p = p.slice(0, -tail.length); }
  if (home && (p === '~' || p.startsWith('~/'))) p = path.join(home, p.slice(1));

  // Inside the app bundle is OUR code, which is the one thing a crash report
  // exists to tell us. It is also the only path with no user in it.
  if (appDir && (p === appDir || p.startsWith(appDir + path.sep))) {
    const rel = path.relative(appDir, p).split(path.sep).join('/');
    return `app:${rel || '.'}${tail}`;
  }
  if (home && (p === home || p.startsWith(home + path.sep))) {
    const d = depthOf(p.slice(home.length));
    return d ? `<~+${d}>${tail}` : '<~>';
  }
  if (p.startsWith('/')) return `<abs+${depthOf(p)}>${tail}`;
  return `<path>${tail}`;
}

// Every string that leaves goes through this, including ones we believe are
// safe. Belief is what the ENOENT measurement disproved.
export function scrubText(text, ctx = {}) {
  if (typeof text !== 'string' || !text) return text;
  // The trailing value goes FIRST, before the path pass: the shape the audit
  // found in our own throw sites is a RELATIVE path (`no such file: ${rel}`),
  // and the path pass would keep its first segment (`clients<abs+2>`) because a
  // relative path has no leading slash to match on.
  let out = text.replace(/(: )([^\s:'"]{1,200})$/, (m, sep, token) => (token.includes(MARK) ? m : `${sep}<value>`));
  out = out.replace(PATH_RE, (m) => scrubPath(m, ctx));
  // A username reaches a message on its own too (`os.userInfo.username`),
  // with no path around it to catch it.
  const user = ctx.username || (ctx.home ? path.basename(ctx.home) : null);
  if (user && user.length > 2) out = out.split(user).join('<user>');
  // Quoted runs are where interpolated user strings hide when they are not
  // paths. Anything already redacted keeps its shape; the rest goes.
  out = out.replace(/'([^']{1,400})'|"([^"]{1,400})"/g, (m, a, b) => {
    const inner = a ?? b ?? '';
    return inner.includes(MARK) ? m : "'<str>'";
  });
  return out.length > 300 ? out.slice(0, 300) + '…' : out;
}

const FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?([^()]+?)(?::(\d+):(\d+))?\)?\s*$/;

// Rule 4. Frames inside the bundle are kept whole (function name included:
// it is our identifier, not theirs); everything else is counted and dropped.
export function scrubStack(stack, ctx = {}) {
  const frames = [];
  let dropped = 0;
  for (const line of String(stack || '').split('\n')) {
    const m = line.match(FRAME_RE);
    if (!m) continue;
    const [, fn, file, ln, col] = m;
    const safe = scrubPath(file.trim(), ctx);
    if (safe.startsWith('app:')) {
      frames.push({ fn: fn ? fn.trim().slice(0, 80) : null, at: safe, line: ln ? Number(ln) : null, col: col ? Number(col) : null });
    } else {
      dropped += 1;
    }
  }
  return { frames: frames.slice(0, 20), dropped };
}

// Rule 3, as an allowlist rather than a delete-list. `err.path`, `err.dest`,
// `err.address`, `err.port`, `err.hostname`, `err.config`, `err.request` and
// whatever the next library invents are absent because nothing copies them,
// not because someone remembered them.
export function scrubError(err, ctx = {}) {
  const e = err && typeof err === 'object' ? err : { message: String(err) };
  const { frames, dropped } = scrubStack(e.stack, ctx);
  return {
    name: typeof e.name === 'string' ? e.name.slice(0, 60) : 'Error',
    // A code is a constant (`ENOENT`, `EPERM`, `ERR_MODULE_NOT_FOUND`) and a
    // syscall is a verb (`open`). Neither has ever held a user's word.
    code: typeof e.code === 'string' || typeof e.code === 'number' ? String(e.code).slice(0, 40) : null,
    syscall: typeof e.syscall === 'string' ? e.syscall.slice(0, 40) : null,
    message: scrubText(typeof e.message === 'string' ? e.message : String(e), ctx),
    site: frames[0] ? `${frames[0].at}:${frames[0].line ?? 0}` : null,
    frames,
    framesDropped: dropped,
  };
}

// The last gate, and the reason it exists: every rule above is a claim, and a
// claim about a payload is worth what a test of the payload says it is worth.
// This walks the finished report and answers "is there anything private left in
// here", and the writer refuses to keep a report that fails. Scrub before it
// leaves means there is no second chance further down.
export function findPrivate(value, ctx = {}) {
  const home = ctx.home ? path.resolve(ctx.home) : null;
  const user = ctx.username || (home ? path.basename(home) : null);
  const hits = [];
  const walk = (v, at) => {
    if (typeof v === 'string') {
      // A path inside our own bundle is ours and is the point of the report, so
      // it comes out of the string before ANY of the three scans rather than
      // being special-cased inside them. It used to come out before the path
      // scan only, and that cost us every report on a whole class of Mac: a
      // username that happens to be a substring of one of our own file paths
      // reads as a leak, the report is thrown away, and `kind` becomes
      // `redacted`. Measured on a GitHub macOS runner, 2026-08-25, where the
      // account is called `runner` and the bundle ships
      // `node_modules/@vitest/runner`. `dev`, `test`, `app` and `node` are the
      // same shape and are ordinary names for a Mac account. `scrubPath` has
      // already made these relative to the bundle, so nothing of theirs can be
      // in one.
      const rest = withoutOurOwnPaths(v);
      if (home && rest.includes(home)) hits.push(`${at}: home directory`);
      if (user && user.length > 2 && rest.includes(user)) hits.push(`${at}: username`);
      for (const m of rest.match(PATH_RE) || []) {
        if (m.trim().split('/').filter(Boolean).length >= 2) hits.push(`${at}: path ${m.trim()}`);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
  };
  walk(value, '');
  return hits;
}
