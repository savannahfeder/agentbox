// A finished run's change on the phone: the saved change file the computer
// sends with the thread's files (main/phone-uploads.mts), read one file at a time.
import { changePathFor, linesSkipped, saidLine, type ChangedFile, type Row } from '../../../renderer/src/code-artifact';

export type CodeLine =
  | { kind: 'said'; key: string; text: string }
  | { kind: 'skip'; key: string; lines: number }
  | { kind: 'row'; key: string; mark: Row[0]; text: string; num: number | null };

/** A file's hunks as the lines the code screen draws, top to bottom, as the desktop's code pane lays them out. */
export function codeLines(file: ChangedFile): CodeLine[] {
  const out: CodeLine[] = [];
  file.hunks.forEach((h, i) => {
    const gap = i > 0 ? linesSkipped(file.hunks[i - 1], h) : null;
    if (gap) out.push({ kind: 'skip', key: `${i}-skip`, lines: gap });
    const said = saidLine(h.said);
    if (said && said !== saidLine(file.hunks[i - 1]?.said)) out.push({ kind: 'said', key: `${i}-said`, text: said });
    h.rows.forEach(([mark, text], r) => {
      const n = h.nums?.[r];
      out.push({ kind: 'row', key: `${i}-${r}`, mark, text, num: n ? (mark === '-' ? n[0] : n[1]) : null });
    });
  });
  return out;
}

/** The key the computer lists a thread's change under, the same path the desktop opens it by. */
export const changeKeyOf = (id: string) => changePathFor(id);

/** The computer's own id for a thread the phone may show under a stand-in (renderer/src/phone-rows.ts `aliases`). */
export const computerIdOf = (aliases: Record<string, { item: string }> | undefined, id: string) => aliases?.[id]?.item ?? id;

/** One file's rows out of a change's text, or null when the text is not a change or does not hold that file. */
export function changedFileIn(text: string, filePath: string): ChangedFile | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const files = (parsed as { files?: unknown } | null)?.files;
  if (!Array.isArray(files)) return null;
  const hit = files.find((f): f is ChangedFile => !!f && typeof f === 'object' && (f as ChangedFile).path === filePath && Array.isArray((f as ChangedFile).hunks));
  return hit ?? null;
}
