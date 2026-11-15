// PURE. The files a thread made, for the Files button over it.
import { filesInLines, otherFilesInLines, threadFiles, viewKind, type ThreadLine } from '../../../shared/artifact-marks.mts';

export interface ThreadFile { src: string; name: string; notes: number; at: number }

// A page or script in backticks is usually code being talked about, not something the thread made.
const tablesIn = (lines: readonly ThreadLine[]) => otherFilesInLines(lines).filter((f) => viewKind(f.path) === 'table');

/** Each file once at its newest version, with the notes on any version, newest first. */
export function filesMadeHere(lines: readonly ThreadLine[], notes: { file: string }[]): ThreadFile[] {
  return threadFiles([...filesInLines(lines), ...tablesIn(lines)]).map((family: { versions: { id: string; name: string; path: string; at: number }[] }) => {
    const newest = family.versions[family.versions.length - 1];
    const ids = new Set(family.versions.map((v) => v.id));
    return { src: newest.path, name: newest.name, notes: notes.filter((n) => ids.has(n.file)).length, at: Math.max(...family.versions.map((v) => v.at ?? 0)) };
  }).sort((a: ThreadFile, b: ThreadFile) => b.at - a.at);
}
