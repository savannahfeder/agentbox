// PURE. The files a thread made, for the Files button over it.
import { filesInLines, threadFiles } from '../../../shared/artifact-marks.mjs';

export interface ThreadFile { src: string; name: string; notes: number; at: number }

/** Each file once at its newest version, with the notes on any version, newest first. */
export function filesMadeHere(lines: unknown[], notes: { file: string }[]): ThreadFile[] {
  return threadFiles(filesInLines(lines)).map((family: { versions: { id: string; name: string; path: string; at: number }[] }) => {
    const newest = family.versions[family.versions.length - 1];
    const ids = new Set(family.versions.map((v) => v.id));
    return { src: newest.path, name: newest.name, notes: notes.filter((n) => ids.has(n.file)).length, at: Math.max(...family.versions.map((v) => v.at ?? 0)) };
  }).sort((a: ThreadFile, b: ThreadFile) => b.at - a.at);
}
