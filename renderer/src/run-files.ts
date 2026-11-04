// PURE. Every file a run MADE FOR HER, read out of the run's own trace.
//
// referenced-files.ts already says the message text IS the manifest, which was
// her 2026-08-06 call and is still right. What this adds is the half that does
// not depend on a worker writing anything down: THE RUN IS ALSO THE MANIFEST.
// The supervisor already logs every tool call under
// <product>/sessions/<item-id>/<startedAt>.log, so the file a run wrote is on
// disk whether or not the agent thought to mention it. A worker that forgets
// now costs her nothing.
//
// WHY IT WENT WRONG, measured on her store 2026-08-20 and the reason this file
// exists rather than another line in a brief: agent checkpoints carried a file
// path in 83% of 470 writes over the eight days to 08-19, and in 28% of the 18
// after 18:57 that evening, when a writing rule told workers to keep file names
// out of a checkpoint. The rule was aimed at OUR source paths and swept up HER
// document with them. A prompt fixed a prompt once already; this is the part
// that cannot regress.
//
// WHAT IS DELIBERATELY NOT HERE. source, tests, /tmp scratch, the store's own
// bookkeeping. Attaching those would bury the one file she wanted under fifty
// she did not, which is the same failure in the other direction. So this keeps
// only what is BOTH inside the product's own folders AND a kind she can
// actually open.

import type { TraceSession } from './notes';

// The tools that put a file where she might read it. `write_document` is the
// store's own, and its argument is already product-relative; the rest hand us
// an absolute path that has to land inside a root to count.
const MAKES_A_FILE = /^(Write|Edit|NotebookEdit)$/;
const WRITES_A_DOCUMENT = /write_document$/;

// What she can open by clicking it. Narrower than referenced-files.ts on
// purpose: that list serves a path a worker CHOSE to name, and being named is
// itself the evidence it was meant for her. Nothing here was chosen, so the
// extension is the only evidence there is. `change` joins them on: a run that
// wrote code writes one, and it is the only file on that card she or a tester
// could ever want first.
const OPENABLE = /\.(html?|png|jpe?g|gif|webp|pdf|change)$/i;

// The store's own machinery, which lives in the same folders as her documents
// and is never a thing she opens. `sessions/` is the traces this very file
// reads; `attachments/` is what SHE pasted, so handing it back as our output
// would be the app taking credit for her screenshot.
const NOT_HERS = /^(sessions|attachments|node_modules|scripts|\.)\//;

/** One line of a trace, as the supervisor stamps it: "05:12:44  [Write] /x". */
const STAMPED = /^\d\d:\d\d:\d\d {2}(.*)$/;

function toolAndArg(body: string): { tool: string; arg: string } | null {
  if (!body.startsWith('[')) return null;
  const close = body.indexOf(']');
  if (close <= 0) return null;
  return { tool: body.slice(1, close), arg: body.slice(close + 1).trim() };
}

/**
 * A path made product-relative, or null when it belongs to nobody we can show.
 *
 * Roots nest (the docs dir contains its own designs/), so the SHORTEST match
 * wins and the answer keeps its folder: "designs/round-3.html", which is how a
 * worker writes it, what the opener resolves, and what makes the dedupe
 * against the message's own paths land. Taking the longest match instead would
 * yield a bare "round-3.html" and the same file would sit on the card twice.
 */
function relativeTo(roots: string[], abs: string): string | null {
  const sorted = [...roots].filter(Boolean).sort((a, b) => a.length - b.length);
  for (const root of sorted) {
    const base = root.endsWith('/') ? root : `${root}/`;
    if (abs.startsWith(base)) return abs.slice(base.length);
  }
  return null;
}

/**
 * Every file the runs on one item made for her, in the order they made them.
 *
 * Paths come back product-relative, which is the only shape the opener can
 * resolve (main/artifact-path.mjs), and deduped by path so a file written and
 * then edited four times is one chip. Order is first-write, not last: the run
 * reads top to bottom and so does she.
 */
export function filesFromRuns(sessions: TraceSession[], roots: Array<string | null>): string[] {
  const clean = roots.filter(Boolean) as string[];
  const found: string[] = [];
  const seen = new Set<string>();

  const take = (raw: string) => {
    const path = raw.replace(/^\.\//, '').trim();
    if (!path || !OPENABLE.test(path) || NOT_HERS.test(path)) return;
    const key = path.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(path);
  };

  const ordered = [...sessions].filter((s) => s && s.text).sort((a, b) => a.startedAt - b.startedAt);
  for (const session of ordered) {
    for (const raw of session.text.split('\n')) {
      const stamped = STAMPED.exec(raw);
      if (!stamped) continue;
      const call = toolAndArg(stamped[1]);
      if (!call || !call.arg) continue;
      // The store's own writer hands us the path she would see in her
      // documents, already relative. Nothing to resolve.
      if (WRITES_A_DOCUMENT.test(call.tool)) { take(call.arg); continue; }
      if (!MAKES_A_FILE.test(call.tool)) continue;
      // Everything else is a raw file path, and only the ones under this
      // product's own roots are hers. /tmp scratch and another product's
      // checkout both fall out here.
      const rel = relativeTo(clean, call.arg);
      if (rel) take(rel);
    }
  }

  return found;
}
