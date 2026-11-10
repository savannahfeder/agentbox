// A FILE SOMEONE SHARED BY ITS LINK, BROUGHT INTO THIS PERSON'S OWN AGENTBOX:
// their own copy in a project's attachments, on a thread of its own that runs
// nothing until they write to it. What they edit is theirs; the link and its
// owner's file are left as they were.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveAttachments } from './save-attachments.mts';
import type { SharedLinkFile } from './team/index.mts';

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

export interface BroughtIn { product: string; id: string; src: string }

export async function bringSharedFile({ token, product, read, productDir, compose, close }: {
  token: string;
  product: string;
  read: (token: string) => Promise<{ file: SharedLinkFile; bytes: Buffer }>;
  productDir: string;
  compose: (fields: { title: string; body: string }) => { id: string } | null | undefined;
  close: (id: string) => void;
}): Promise<BroughtIn> {
  const { file, bytes } = await read(token);
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
  const body = [`${who} shared this with me.`, '', shown].join('\n');
  const made = compose({ title: sharedFileTitle(file), body });
  if (!made?.id) throw new Error('The thread for this file could not be made.');
  close(made.id);
  return { product, id: made.id, src: saved.rel };
}
