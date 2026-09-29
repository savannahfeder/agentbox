// PURE. HER EDIT TO A LINE OF A CHANGE, PUT BACK INTO THE REAL FILE.
//
// The artifact she is typing in is a CHANGE, not a file: a handful of hunks the
// agent wrote, each carrying the lines around it. The thing on disk is the
// whole file, which is usually thousands of lines she is not looking at. So a
// save cannot be "write what is on the screen"; it has to be "find these lines
// in the file and swap them for the ones the user typed", which is what this does.
//
// WHY NOT WRITE THE WHOLE FILE BACK. Because the screen never held the whole
// file, and a save that wrote it would delete every line the change did not
// touch. That is the one failure a text editor may never have.
//
// WHY IT CAN REFUSE. The file is on disk and agents keep working; the lines she
// is looking at may have moved on since the run ended. When the block cannot be
// found exactly, NOTHING IS WRITTEN and the reason is said out loud. A save
// that silently lands in the wrong place is worse than a save that did not
// happen, because she would not know to look.

/** One line of a change. `=` is context, `+` added, `-` removed. */
export type Row = ['=' | '+' | '-', string];

/**
 * The lines a hunk LEFT BEHIND in the file: what it added and what it did not
 * touch, in order. The removed lines are gone from the file already, so they
 * are not part of what we look for and are not editable on the screen.
 */
export function postImage(rows: Row[]): string[] {
  return rows.filter(([mark]) => mark !== '-').map(([, text]) => text);
}

/**
 * Which rows of a hunk she may type into, as indices into `rows`.
 *
 * A removed line is history: typing into it could not be saved anywhere,
 * because there is nowhere in the file it corresponds to.
 */
export function editableRows(rows: Row[]): number[] {
  const out: number[] = [];
  rows.forEach(([mark], i) => { if (mark !== '-') out.push(i); });
  return out;
}

export type Splice = { hunk: number; rows: Row[]; edits: Map<number, string> };

export type SpliceResult =
  | { ok: true; text: string; lines: number }
  | { ok: false; error: string };

function splitLines(text: string): { lines: string[]; trailing: boolean } {
  const s = String(text ?? '');
  const lines = s.split('\n');
  const trailing = lines.length > 1 && lines[lines.length - 1] === '';
  if (trailing) lines.pop();
  return { lines, trailing };
}

/** Every place `block` sits in `lines`, as start indices. */
function occurrences(lines: string[], block: string[]): number[] {
  const out: number[] = [];
  if (!block.length || block.length > lines.length) return out;
  for (let i = 0; i + block.length <= lines.length; i++) {
    let hit = true;
    for (let j = 0; j < block.length; j++) {
      if (lines[i + j] !== block[j]) { hit = false; break; }
    }
    if (hit) out.push(i);
  }
  return out;
}

/**
 * Her edits, applied to the file's real bytes.
 *
 * Each splice is one hunk: the rows it was drawn from, and the lines inside it
 * she changed, keyed by index into those rows. For each one we look for the
 * hunk's post-image in the file and swap in her version.
 *
 * A block that appears more than once takes the FIRST place it appears, and
 * that is deliberate rather than a shrug: a repeated block means every copy is
 * the same text, so the first is as right as any other, and refusing would make
 * short hunks unsaveable. A block that appears NOWHERE is a refusal, because
 * then there is no honest place to put the user's words.
 *
 * Splices are applied in file order rather than in the order they were made, so
 * two edits in the same file cannot land on each other's line numbers.
 */
export function applySplices(fileText: string, splices: Splice[]): SpliceResult {
  const { lines, trailing } = splitLines(fileText);
  let out = lines.slice();
  let changed = 0;

  const live = splices.filter((s) => s.edits.size > 0);
  if (!live.length) return { ok: true, text: fileText, lines: 0 };

  // Placed first, then applied from the bottom of the file up, so an earlier
  // splice never shifts a later one's index.
  type Placed = { at: number; before: string[]; after: string[] };
  const placed: Placed[] = [];

  for (const splice of live) {
    const before = postImage(splice.rows);
    if (!before.length) {
      return { ok: false, error: 'Those lines were removed by the run, so there is nothing in the file to save them onto.' };
    }
    const after = splice.rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row[0] !== '-')
      .map(({ row, i }) => (splice.edits.has(i) ? (splice.edits.get(i) as string) : row[1]));

    const where = occurrences(out, before);
    if (!where.length) {
      return { ok: false, error: 'The file has changed since this run, so those lines are not in it any more. Nothing was saved.' };
    }
    placed.push({ at: where[0], before, after });
    changed += [...splice.edits.keys()].length;
  }

  placed.sort((a, b) => b.at - a.at);
  for (const p of placed) {
    // Re-check at the recorded place: an overlapping pair of hunks would have
    // moved the ground under this one.
    const here = out.slice(p.at, p.at + p.before.length);
    if (here.join('\n') !== p.before.join('\n')) {
      return { ok: false, error: 'Two of those edits overlap in the file, so nothing was saved.' };
    }
    out = [...out.slice(0, p.at), ...p.after, ...out.slice(p.at + p.before.length)];
  }

  return { ok: true, text: out.join('\n') + (trailing ? '\n' : ''), lines: changed };
}

/**
 * What to say once it worked. One sentence, the file's own name, and how many
 * lines moved, because "Saved" alone does not tell her the right file was hit.
 */
export function savedLine(path: string, lines: number): string {
  const name = path.split('/').pop() || path;
  return `Saved ${name}, ${lines} line${lines === 1 ? '' : 's'}.`;
}

/**
 * WHICH FILES HAVE SOMETHING UNSAVED IN THEM, out of the keystrokes the pane
 * has been holding.
 *
 * A file counts as unsaved the moment one line of it carries text the user typed.
 * Whether that text happens to read the same as the line already did is not
 * checked here: an editor that decided her file was clean because the user typed a
 * letter and deleted it again would be guessing at her intent, and the save
 * itself already does nothing when the bytes come out identical.
 */
export function unsavedIn(edits: Map<string, Map<number, Map<number, string>>>): string[] {
  return [...edits.entries()]
    .filter(([, byHunk]) => [...byHunk.values()].some((rows) => rows.size > 0))
    .map(([file]) => file);
}
