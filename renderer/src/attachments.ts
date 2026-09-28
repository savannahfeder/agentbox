// Attachments: pasted images and dropped files, staged in the renderer until
// send, then persisted into the product's attachments/ dir and embedded in
// the body as markdown (relative paths: workers read them through the MCP,
// the message view renders them).

export interface PendingAttachment {
  name: string;
  dataBase64?: string;
  srcPath?: string;
  image: boolean;
}

const isImageName = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name);

function blobToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function collectFiles(files: FileList | File[]): Promise<PendingAttachment[]> {
  const out: PendingAttachment[] = [];
  for (const file of Array.from(files)) {
    const path = window.zero?.pathForFile?.(file) ?? null;
    if (path) {
      const image = isImageName(file.name);
      // A PICTURE SHE DRAGGED IN IS COPIED INSIDE BEFORE IT IS DRAWN.
      //
      // A dropped file comes with its real path, and the thumbnail below asks
      // the app for it on `astral-img://`, which serves pictures inside the
      // account root and a product's repo and nothing else. Her `fun-mode.png`
      // was in neither, so the reply box drew a broken image. Staging copies it
      // next to the pasted ones, in a folder the app already serves and already
      // sweeps.
      //
      // Only pictures: a file that draws no thumbnail has nothing to gain from
      // being copied, and send-time saving reads whichever path is kept here.
      // A staging that fails leaves the path exactly as it was, so the worst
      // case is the broken thumbnail she has today and never a lost attachment.
      let staged: string | null = null;
      if (image) {
        try { staged = (await window.zero?.stageAttachment?.({ name: file.name || 'file', srcPath: path }))?.path ?? null; } catch { staged = null; }
      }
      out.push({ name: file.name || 'file', srcPath: staged ?? path, image });
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
      const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now() % 100000}.png`;
      const image = file.type.startsWith('image/') || isImageName(name);
      const dataBase64 = await blobToBase64(file);
      let staged: string | null = null;
      try { staged = (await window.zero?.stageAttachment?.({ name, dataBase64 }))?.path ?? null; } catch { staged = null; }
      out.push(staged ? { name, srcPath: staged, image } : { name, dataBase64, image });
    }
  }
  return out;
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
  if (!pending.length || !window.zero?.saveAttachments) return '';
  const saved = await window.zero.saveAttachments({
    product,
    files: pending.map(({ name, dataBase64, srcPath }) => ({ name, dataBase64, srcPath })),
  });
  return saved
    .map((s) => (s.image ? `![${s.name}](${s.rel})` : `[${s.name}](${s.rel})`))
    .join('\n');
}
