// The phone's Files place: every file a thread's cloud copy names
// (`snapshot.attached`, main/phone-inbox.mts), one row per project and path,
// shown by the desktop Files page's own rules (renderer/src/files/files-shown.ts).
import { apartScratch, filesShown, sortFiles } from '../../../renderer/src/files/files-shown';
import { isBookkeeping } from '../../../renderer/src/message-artifacts';
import { phoneSlug, type Aliases, type PhoneRows } from '../../../renderer/src/phone-rows';
import type { FileEntry } from '../../../renderer/src/cloud-files';
import type { FileKind, PlacedFile } from '../../../renderer/src/types';
import { viewKind } from '../../../shared/artifact-marks.mts';
import { PLAIN_AGENT } from '../../../shared/agent-voice.mts';

export interface FileThread { product: string; id: string; title: string; at: number }

export interface PhoneFile extends PlacedFile {
  /** The project's slug, which every lookup of its files takes. */
  product: string;
  projectName: string;
  /** The file's key in its project: relative to the documents folder, or `@repo/…`. */
  path: string;
  bytes: number;
  /** Too big for the computer to send up: listed, and opened only on the computer. */
  big: boolean;
  /** The threads that named it, newest first. */
  threads: FileThread[];
}

// The same test cloud-files.ts `cloudPlaces` puts an entry to: a name in the bucket, or too big to have one.
const sentUp = (e: unknown): e is FileEntry => {
  const f = e as FileEntry | null;
  return !!f && typeof f.s === 'number' && (!!f.big || (typeof f.n === 'string' && /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/.test(f.n)));
};

/** Every file the copies name, newest first by the newest thread that named it. */
export function phoneFiles(threads: PhoneRows['threads'], projects: readonly { slug: string; name: string }[], aliases: Aliases = {}): PhoneFile[] {
  const names = new Map(projects.map((p) => [p.slug, p.name]));
  const screenId = new Map(Object.entries(aliases).map(([id, a]) => [`${a.product}/${a.item}`, id]));
  const byKey = new Map<string, PhoneFile>();
  for (const t of threads) {
    const slug = phoneSlug(t.device, t.project);
    const projectName = names.get(slug);
    const item = t.snapshot?.item;
    const listed = t.snapshot?.attached?.files;
    if (!projectName || !item || !listed || typeof listed !== 'object') continue;
    const at = Number(item.updatedAt) || Date.parse(t.updated_at ?? '') || 0;
    const thread = { product: slug, id: screenId.get(`${slug}/${t.item}`) ?? t.item, title: String(item.title ?? ''), at };
    for (const [path, entry] of Object.entries(listed)) {
      if (!sentUp(entry) || isBookkeeping(path)) continue;
      const key = `${slug}/${path}`;
      const was = byKey.get(key);
      if (was) {
        was.threads.push(thread);
        if (at > was.at) Object.assign(was, { at, bytes: entry.s, big: !!entry.big });
        continue;
      }
      byKey.set(key, {
        key, product: slug, project: projectName, projectName, path, name: path.split('/').pop() || path,
        kind: viewKind(path), bytes: entry.s, big: !!entry.big, at, threads: [thread],
        // The phone cannot tell who made a file; a thread's agent named it.
        agent: PLAIN_AGENT, by: null, versions: 1, open: 0, approvedBy: [], opened: null, sentIn: [],
      });
    }
  }
  const files = [...byKey.values()];
  for (const f of files) {
    f.threads.sort((a, b) => b.at - a.at);
    f.sentIn = f.threads.map((t) => ({ kind: 'thread' as const, product: t.product, id: t.id, title: t.title }));
  }
  return sortFiles(files, 'recent');
}

/** What the box, a kind and a project leave; an agent's check pictures only when searched for, as on the desktop. */
export function filesOnPhone(files: PhoneFile[], { query = '', kind = null, project = null }: { query?: string; kind?: FileKind | null; project?: string | null }): PhoneFile[] {
  const found = filesShown(files, { query, kind, project }) as PhoneFile[];
  return query.trim() ? found : apartScratch(found).files as PhoneFile[];
}
