// Every comment a thread's files carry, as its notes panel shows them: this
// thread's own and those on other copies of the same files.
import type { FileNote, WorkItem } from '../types';
import { api } from '../api';
import { filesInLines, threadFiles } from '../../../shared/artifact-marks.mts';
import { withElsewhere } from '../components/ThreadArtifacts';
import { NO_MARKS } from '../components/ArtifactView';

export async function notesOnThread(item: Pick<WorkItem, 'product' | 'id' | 'artifacts'>): Promise<FileNote[]> {
  const own = item.artifacts ?? NO_MARKS;
  try {
    const history = await api.itemHistory({ product: item.product, id: item.id });
    const copies = threadFiles(filesInLines(history?.lines ?? [])).flatMap((f) => f.versions.map((v) => ({ path: v.path, file: v.id })));
    if (!copies.length) return own.notes;
    return withElsewhere(own, await api.fileElsewhere({ product: item.product, id: item.id, copies })).notes;
  } catch {
    return own.notes;
  }
}
