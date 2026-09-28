// PURE. WHAT A RUN CHANGED, SAID AT THE RIGHT-HAND END OF A CARD'S BYLINE —.
//
// So the eight others are gone rather than switchable, and there is no variant
// switch in this file at all. The one she picked is the app now.
//
// The byline is printed under every title already, so the figures cost the
// title nothing: measured at 0 pixels of displacement against 52 for the band
// she rejected.
//
// NOT ONE NEW COLOUR: --code-plus and --code-minus are the code pane's own two,
// already answered by dark, by light and by every picture theme.

/** What one run did, as this line needs to say it. */
export type ChangeFigures = { files: number; plus: number; minus: number };

/**
 * The figures out of a saved change, or null when there is nothing to say.
 *
 * The argument is whatever `zero.codeChange` handed back, which is the file
 * `runs/<item>/the-change-it-made.change` parsed. A row with no run, a run that
 * changed no code, and an unreadable file all answer null, and null draws
 * nothing at all: most cards say nothing here and that is correct.
 */
export function figuresFrom(change: unknown): ChangeFigures | null {
  const c = change as { files?: unknown; plus?: unknown; minus?: unknown } | null | undefined;
  if (!c || typeof c !== 'object' || !Array.isArray(c.files)) return null;
  const files = c.files.length;
  const plus = Number(c.plus ?? 0);
  const minus = Number(c.minus ?? 0);
  if (!Number.isFinite(plus) || !Number.isFinite(minus)) return null;
  if (files <= 0 || (plus <= 0 && minus <= 0)) return null;
  return { files, plus, minus };
}

/**
 * A figure with thousands separators, because +2,199 is read at a glance and
 * +2199 is counted.
 */
export function figure(n: number): string {
  return Math.abs(n).toLocaleString('en-US');
}

/**
 * "+2,199" and "−48", ready to colour, WITH A ZERO SIDE LEFT OUT ENTIRELY.
 *
 * A run that only added lines printing "−0" is a number she has to read in
 * order to discard, and 13 of the 30 changes saved on this product removed no
 * lines at all. The minus sign is U+2212, the one the code pane's file bar
 * already uses, not a hyphen.
 */
export function signed(c: { plus: number; minus: number }): Array<{ sign: '+' | '−'; text: string }> {
  const out: Array<{ sign: '+' | '−'; text: string }> = [];
  if (c.plus > 0) out.push({ sign: '+', text: `+${figure(c.plus)}` });
  if (c.minus > 0) out.push({ sign: '−', text: `−${figure(c.minus)}` });
  return out;
}

/**
 * The count of files, which is the noun the two numbers are the size of.
 *
 * "1 file", never "1 files" and never "1 file(s)".
 */
export function fileCount(c: { files: number }): string {
  return c.files === 1 ? '1 file' : `${c.files} files`;
}

/**
 * The whole line as one string, for a title attribute and for a test that wants
 * to read what the button says without a window.
 */
export function figuresLabel(c: ChangeFigures): string {
  return `${signed(c).map((s) => s.text).join(' ')} in ${fileCount(c)}`;
}
