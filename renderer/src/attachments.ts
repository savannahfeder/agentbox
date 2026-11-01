// Attachments: pasted images and dropped files, staged in the renderer until
// send, then persisted into the product's attachments/ dir and embedded in
// the body as markdown (relative paths: workers read them through the MCP,
// the message view renders them).
import { useCallback, useState } from 'react';
import { turnedName } from '../../shared/picture-formats.mjs';
import { MAX_SENT_MB, sizeWords, tooBigToSend } from '../../shared/carried-files.mjs';

export interface PendingAttachment {
  name: string;
  dataBase64?: string;
  srcPath?: string;
  image: boolean;
  /** A voice note's id in this Mac's store of unsent notes (team/voice-drafts.ts). */
  draftId?: string;
  /** In a room, the name it is stored under, the same on every try. */
  storedAs?: string;
  /** Bytes, so the box can say a file is too big to send before it is sent. */
  size?: number;
  /** Why it could not be attached, in words for the box. Nothing of it is sent. */
  failed?: string;
}

/** A file still on its way into the box, `done` bytes of `size`. */
export type Attaching = { key: string; name: string; size: number; done: number };

// A tab's file has no path and one request carries 32 MB at most
// (main/serve.mjs), so a bigger file crosses in pieces.
export const PIECE_BYTES = 4 * 1024 * 1024;

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const pieceId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');

async function stageInPieces(file: File, name: string, onDone: (bytes: number) => void): Promise<string> {
  const put = window.zero?.stageAttachmentPart;
  if (!put) throw new Error('this app cannot take a file this big here');
  const id = pieceId();
  let staged = '';
  for (let at = 0; at === 0 || at < file.size; at += PIECE_BYTES) {
    const end = Math.min(file.size, at + PIECE_BYTES);
    staged = (await put({ id, name, at, dataBase64: await base64Of(file.slice(at, end)) })).path;
    onDone(end);
  }
  return staged;
}

/** What stops the box sending, said for the person: a file that could not be attached, or one too big to go. */
export function attachProblem(list: PendingAttachment[]): string | null {
  const failed = list.find((a) => a.failed);
  if (failed) return `${failed.failed} Remove it to send the rest.`;
  const big = list.find((a) => tooBigToSend(a.size ?? 0));
  if (big) return `${big.name} is ${sizeWords(big.size ?? 0)}, over the ${MAX_SENT_MB} MB a message can send. Remove it to send the rest.`;
  return null;
}

export const isImageName = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name);

export async function collectFiles(files: FileList | File[], onAttaching?: (now: Attaching[]) => void): Promise<PendingAttachment[]> {
  const out: PendingAttachment[] = [];
  const list = Array.from(files);
  const attaching: Attaching[] = list.map((f, i) => ({ key: String(i), name: f.name || 'file', size: f.size, done: 0 }));
  const shown = () => onAttaching?.(attaching.filter((a) => a.done < a.size || a.size === 0));
  for (const [i, file] of list.entries()) {
    const path = window.zero?.pathForFile?.(file) ?? null;
    if (path) {
      let name = file.name || 'file';
      // A PICTURE SHE DRAGGED IN IS COPIED INSIDE BEFORE IT IS DRAWN.
      //
      // A dropped file comes with its real path, and the thumbnail below asks
      // the app for it on `astral-img://`, which serves pictures inside the
      // account root and a product's repo and nothing else. Her `fun-mode.png`
      // was in neither, so the reply box drew a broken image. Staging copies it
      // next to the pasted ones, in a folder the app already serves and already
      // sweeps.
      //
      // Only pictures, and the TIFF or HEIC that staging turns into one: a
      // file that draws no thumbnail has nothing to gain from being copied,
      // and send-time saving reads whichever path is kept here. A staging that
      // fails leaves the path exactly as it was, so the worst case is the
      // broken thumbnail she has today and never a lost attachment.
      let staged: string | null = null;
      if (isImageName(name) || turnedName(name)) {
        try {
          const got = await window.zero?.stageAttachment?.({ name, srcPath: path });
          staged = got?.path ?? null;
          name = got?.name ?? name;
        } catch { staged = null; }
      }
      out.push({ name, srcPath: staged ?? path, image: isImageName(name), size: file.size });
    } else if (tooBigToSend(file.size)) {
      // Not read at all: the box says it is over the limit and will not send it.
      out.push({ name: file.name || 'file', image: false, size: file.size });
    } else if (file.size > PIECE_BYTES && window.zero?.stageAttachmentPart) {
      const name = file.name || 'file';
      shown();
      try {
        const srcPath = await stageInPieces(file, name, (done) => { attaching[i].done = done; shown(); });
        out.push({ name, srcPath, image: isImageName(name), size: file.size });
      } catch (err) {
        out.push({ name, image: false, size: file.size, failed: `${name} could not be attached: ${String((err as Error)?.message ?? err).replace(/\.$/, '')}.` });
      }
      attaching[i].done = file.size;
      shown();
    } else {
      // No path means clipboard data (a pasted screenshot).
      //
      // THE BYTES GO TO DISK HERE, NOT INTO THE DRAFT.A draft lives in
      // localStorage, which holds about 5 MB for the whole app, so carrying
      // base64 in it put a ~2.25 MB ceiling on a pasted screenshot and dropped
      // seven of the ninety-one she has actually pasted. Staged to disk, the
      // draft carries a path, which the draft format already stores for free
      // and never drops, and the only ceiling left is Claude's own: 10 MB
      // base64 per image.
      //
      // The bytes are the fallback, never the plan: if staging is unavailable
      // (a browser build, an older main process that has no handler) the paste
      // still works exactly as it did, budget and all. Losing the screenshot
      // would be a worse failure than the one being fixed.
      let name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now() % 100000}.png`;
      const dataBase64 = await base64Of(file);
      let staged: string | null = null;
      try {
        const got = await window.zero?.stageAttachment?.({ name, dataBase64 });
        staged = got?.path ?? null;
        name = got?.name ?? name;
      } catch { staged = null; }
      // A TIFF staging could not turn is still a file: drawn, it is a broken picture.
      const image = isImageName(name) || (file.type.startsWith('image/') && !turnedName(name));
      out.push(staged ? { name, srcPath: staged, image, size: file.size } : { name, dataBase64, image, size: file.size });
    }
  }
  return out;
}

let collections = 0;

/** `collect` takes files into a box and `attaching` is what is still on its way, for AttachRow. */
export function useAttaching() {
  const [attaching, setAttaching] = useState<Attaching[]>([]);
  const collect = useCallback(async (files: FileList | File[]) => {
    const call = `c${++collections}:`;
    const show = (now: Attaching[]) => setAttaching((was) => [...was.filter((a) => !a.key.startsWith(call)), ...now.map((a) => ({ ...a, key: call + a.key }))]);
    try { return await collectFiles(files, show); } finally { show([]); }
  }, []);
  return { attaching, collect };
}

export async function fromPaste(e: React.ClipboardEvent): Promise<PendingAttachment[]> {
  const files: File[] = [];
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files.length ? collectFiles(files) : [];
}

// Persist staged attachments for a product; returns the markdown block to
// append to the message body (empty string when nothing staged).
export async function persistAttachments(product: string, pending: PendingAttachment[]): Promise<string> {
  const problem = attachProblem(pending);
  if (problem) throw new Error(problem);
  if (!pending.length || !window.zero?.saveAttachments) return '';
  const saved = await window.zero.saveAttachments({
    product,
    files: pending.map(({ name, dataBase64, srcPath }) => ({ name, dataBase64, srcPath })),
  });
  return attachmentLinks(saved);
}

/** Saved files as the message links them: a picture drawn, anything else a link. */
export function attachmentLinks(saved: Array<{ rel: string; name: string; image: boolean }>): string {
  return saved.map((s) => (s.image ? `![${s.name}](${s.rel})` : `[${s.name}](${s.rel})`)).join('\n');
}
