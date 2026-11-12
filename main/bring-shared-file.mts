// A FILE SOMEONE SHARED BY ITS LINK, BROUGHT INTO THIS PERSON'S OWN AGENTBOX:
// their own copy in a project's attachments, on a thread of its own in Later,
// which runs nothing until they write to it. What they edit is theirs;
// the link and its owner's file are left as they were.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveAttachments } from './save-attachments.mts';
import type { FileLinkComment, SharedLinkFile } from './team/index.mts';
import { placeWords, type NotePlace } from '../shared/artifact-marks.mts';

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** The token in a shared file's web address or its app link (agentbox://f/<token>); null for anything else. */
export function fileLinkToken(text: unknown): string | null {
  const s = String(text ?? '').trim();
  const m = /^(?:https?:\/\/[^/\s]+|[a-z][a-z0-9+.-]*:\/)\/f\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i.exec(s);
  return m && TOKEN.test(m[1]) ? m[1] : null;
}

/** As the link page heads it: a document by its first heading, a page by its title, anything else by its name. */
export function sharedFileTitle(file: Pick<SharedLinkFile, 'name' | 'kind' | 'type' | 'body'>): string {
  if (file.kind === 'markdown' && !/csv|tab-separated/i.test(file.type)) {
    const h = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(file.body)?.[1];
    if (h) return h.slice(0, 120);
  }
  if (file.kind === 'page') {
    const t = /<title\b[^>]*>([^<]{1,200})<\/title>/i.exec(file.body)?.[1]?.replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 120);
  }
  return file.name;
}

/** The project on screen when it is a project, else their first own one; never a chat with a teammate. */
export function projectToBringInto(products: readonly { slug: string; team?: { direct?: unknown } | null }[], wanted: unknown): string | null {
  const projects = products.filter((p) => p.team?.direct !== true);
  return (projects.find((p) => p.slug === wanted) ?? projects[0])?.slug ?? null;
}

/** Where a link comment pointed, as a line in a message says it: " at 0:03", " on the picture". */
export function whereSaid(place: NotePlace | null | undefined): string {
  if (!place) return '';
  const at = placeWords({ place: place.kind === 'time' ? { kind: 'time', s: place.s } : place });
  switch (place.kind) {
    case 'time': return typeof place.x === 'number' ? ` on the frame at ${at}` : ` at ${at}`;
    case 'pin': return ' on the picture';
    case 'page': return ` on ${at.toLowerCase()}`;
    case 'quote': return ` on ${at}`;
    default: return '';
  }
}

export interface BroughtIn { product: string; id: string; src: string }

export async function bringSharedFile({ token, product, read, productDir, compose }: {
  token: string;
  product: string;
  read: (token: string) => Promise<{ file: SharedLinkFile; bytes: Buffer; comments?: FileLinkComment[] }>;
  productDir: string;
  compose: (fields: { title: string; body: string; start: 'later' }) => { id: string } | null | undefined;
}): Promise<BroughtIn> {
  const { file, bytes, comments = [] } = await read(token);
  // Through a file rather than base64, since a film is up to 200 MB.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-shared-'));
  let saved;
  try {
    const at = path.join(tmp, 'file');
    fs.writeFileSync(at, bytes);
    [saved] = saveAttachments(productDir, [{ name: file.name, srcPath: at }]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!saved) throw new Error('This file could not be saved.');
  const who = file.ownerName?.trim() || 'Someone';
  const shown = saved.image ? `![${saved.name}](${saved.rel})` : `[${saved.name}](${saved.rel})`;
  // The link stays off the message: a person's own message draws no markdown link, and a raw one fills it.
  const said = comments.map((c) => `- ${c.byName}${whereSaid(c.place)}: ${c.text.replace(/\s+/g, ' ').trim()}`);
  const body = [`${who} shared this with me.`, '', shown, ...(said.length ? ['', 'Comments on the link:', ...said] : [])].join('\n');
  // Written down and not begun, so no agent starts on it until they write.
  const made = compose({ title: sharedFileTitle(file), body, start: 'later' });
  if (!made?.id) throw new Error('The thread for this file could not be made.');
  return { product, id: made.id, src: saved.rel };
}
