// WHAT A SESSION'S OWN TRACE LOG SAYS ABOUT WHETHER IT EVER GOT GOING.
//
// The supervisor already knows this while a session is alive: it holds the
// object and can see whether an id ever arrived. The trace is the only place
// that fact survives the process, and surviving the process is the whole point
// here.
//
// She was right, and the reason is a gap rather than a bug. The sentence that
// says a run died was written at the MOMENT of the exit, by the handler
// holding the session. Her four remaining Codex rows had already died before
// that code existed — the last of them at 13:48 and 13:51 — and nothing in the
// app ever looks at a row again to notice it is sitting there silent. So they
// read exactly as they read on Tuesday: in progress, nothing running, no word.
//
// A trace looks like this. The header, then whatever came out, then the exit:
//
// # There's something wrong with our search field. # · spawned
// 2026-08-27T20:51:39.445Z
//
//     stderr: Reading additional input from stdin...
//     Not inside a trusted directory and --skip-git-repo-check was not specified.
//
//     # exited (1) 2026-08-27T20:51:40.139Z
//
// A run that actually started looks nothing like it: from the first line the
// CLI streams, the supervisor writes a clock-stamped line for every step. That
// stamp is the tell, and it is a better one than the exit code, because a
// session can run for six minutes of real work and still exit non-zero.

// Every narration line the supervisor writes is `HH:MM:SS  something`. The
// header lines start with '#', the tool's own output is prefixed 'stderr: ',
// and neither can be mistaken for it.
const NARRATED = /^\d{2}:\d{2}:\d{2}\s{2}\S/m;

const EXITED = /^# exited \((-?\d+)\)/m;

// THE DIAGNOSIS IS ON THE SECOND LINE, NOT THE FIRST, and reading only the
// prefixed line loses it entirely. What the tool prints arrives as one chunk
// and is written with one `stderr: ` in front of the whole chunk, so a refusal
// that comes after a newline sits in the file with no prefix at all:
//
//     stderr: Reading additional input from stdin...
//     Not inside a trusted directory and --skip-git-repo-check was not specified.
//
// Taking prefixed lines alone therefore came back with "Reading additional
// input from stdin", which classifies as 'unknown', and the row would have
// been told the generic sentence about her four Codex tasks whose cause we
// knew exactly. So a chunk runs from its `stderr:` line until the blank line
// that ends it, and nothing of ours can be swept up on the way: the header and
// the narration both end the chunk too.
function stderrChunks(raw) {
  const out = [];
  let inside = false;
  for (const line of raw.split('\n')) {
    if (line.startsWith('stderr:')) {
      inside = true;
      out.push(line.replace(/^stderr:\s?/, ''));
      continue;
    }
    if (!inside) continue;
    if (!line.trim() || line.startsWith('#') || /^\d{2}:\d{2}:\d{2}\s{2}/.test(line)) { inside = false; continue; }
    out.push(line);
  }
  return out.join('\n').slice(-1000);
}

// AND THE OTHER PLACE A REASON HIDES, which is not stderr at all.
//
// A CLI that starts, authenticates and fails says so through its own protocol,
// and the supervisor writes that as the run's result with an ERROR flag on it
// (`== RESULT (success ERROR · 1 turns) ==`). Nothing about it is on stderr.
// Measured on her store 2026-08-27: had 238 traces and 197 recorded strikes,
// every one of them
//
//     Failed to authenticate: OAuth session expired and could not be refreshed
//
// and the row had never carried a single word. Read from stderr alone the
// cause came back 'unknown' and she would have been told the row "stopped
// before it did anything", which is true and useless: the one sentence worth
// having here is the one that tells her to type /login.
//
// Only ever read when the flag is on the line. A result WITHOUT the ERROR flag
// is a worker's own prose about her product, and prose is exactly the thing
// that must not be pattern-matched for words like "unauthorized".
const ERROR_RESULT = /^\d{2}:\d{2}:\d{2}\s{2}== RESULT \([^)]*\bERROR\b[^)]*\) ==$/m;

function errorResult(raw) {
  const at = ERROR_RESULT.exec(raw);
  if (!at) return '';
  const after = raw.slice(at.index + at[0].length);
  const end = after.search(/^# exited \(/m);
  return (end === -1 ? after : after.slice(0, end)).trim();
}

/**
 * @param {string} text the whole trace file
 * @returns {{everRan: boolean, exitCode: number|null, stderr: string}}
 *   `stderr` is what the tool said about itself, from either place it says it.
 *   `everRan` false means the CLI never produced a first line: the process
 *   started and died before it was a session. `exitCode` null means the trace
 *   has no exit line at all, which is what a run killed with the app looks
 *   like, and is deliberately NOT read as a death.
 */
export function readDeadRunTrace(text) {
  const raw = String(text ?? '');
  const exited = EXITED.exec(raw);
  return {
    everRan: NARRATED.test(raw),
    exitCode: exited ? Number(exited[1]) : null,
    stderr: [stderrChunks(raw), errorResult(raw)].filter(Boolean).join('\n').slice(-1000),
  };
}

/**
 * IS THIS THE TRACE OF A RUN THAT LEFT HER NOTHING?
 *
 * Both halves have to be true. It has to have finished — a trace with no exit
 * line belongs to a session that is either still going or was killed with the
 * app, and neither is news. And it has to have finished BADLY: either it never
 * narrated a line, so it was never a session at all, or it exited non-zero.
 * A clean exit means a worker ran and made its own choices about the row, and
 * the supervisor has no business speaking over it.
 */
export function traceShowsASilentDeath(trace) {
  if (!trace || trace.exitCode == null) return false;
  return !trace.everRan || trace.exitCode !== 0;
}
