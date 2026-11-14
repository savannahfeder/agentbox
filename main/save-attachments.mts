// SAVING THE FILES A MESSAGE CARRIES, into a project's attachments folder.
//
// One copy, used by the reply box (main/ipc.mts zero:save-attachments) and by
// a message to a person (main/team/index.mts), whose conversation may not
// exist until the message makes it, so it cannot save them beforehand.
// Relative paths keep them readable by workers through the MCP and renderable
// in the message view, and they are the names the team sync sends on
// (main/team/sync.mts).
import fs from 'node:fs';
import path from 'node:path';

/**
 * `files` are `{ name, dataBase64 }` or `{ name, srcPath }`. Answers what was
 * saved: `{ rel, name, image }`, in order, skipping one with neither.
 */
export interface AttachmentFile { name?: string; dataBase64?: string; srcPath?: string }
export interface SavedAttachment { rel: string; name: string; image: boolean }

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '-');

/** A folder goes as the files inside it, named under it, leaving out hidden ones like Finder's .DS_Store. */
function filesIn(file: AttachmentFile): AttachmentFile[] {
  const src = file?.srcPath;
  if (file?.dataBase64 || !src || !fs.statSync(src).isDirectory()) return [file];
  const top = file.name || path.basename(src);
  return fs.readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(src, path.join(e.parentPath, e.name)))
    .filter((rel) => !rel.split(path.sep).some((part) => part.startsWith('.')))
    .sort()
    // Trimmed from the front, so a long folder name never costs the file its extension.
    .map((rel) => ({ name: safeName(`${top}-${rel}`).slice(-80), srcPath: path.join(src, rel) }));
}

export function saveAttachments(dir: string, files?: AttachmentFile[] | null) {
  const outDir = path.join(dir, 'attachments');
  fs.mkdirSync(outDir, { recursive: true });
  const saved: SavedAttachment[] = [];
  for (const file of (files ?? []).flatMap(filesIn)) {
    const safe = safeName(String(file?.name ?? 'file')).slice(0, 80);
    // A RANDOM SUFFIX, THE SAME ONE THE STAGING PATH ALREADY USES. The name
    // was the millisecond plus the filename, so two files saved in the same
    // millisecond with the same name overwrote each other and the message
    // ended up with two links to one picture. Screenshots are often sent in
    // pairs, which is exactly the shape that collides. It has never been observed
    // happening; it is one line to make impossible.
    const rel = `attachments/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const abs = path.join(dir, rel);
    if (file?.dataBase64) fs.writeFileSync(abs, Buffer.from(file.dataBase64, 'base64'));
    // A clone on APFS shares the blocks, so a film attached costs no second copy of disk.
    else if (file?.srcPath) fs.copyFileSync(file.srcPath, abs, fs.constants.COPYFILE_FICLONE);
    else continue;
    saved.push({ rel, name: safe, image: /\.(png|jpe?g|gif|webp)$/i.test(safe) });
  }
  return saved;
}

/** The links a message carries for what was saved, one per line. */
export function attachmentMarkdown(saved: SavedAttachment[]) {
  return saved.map((s) => (s.image ? `![${s.name}](${s.rel})` : `[${s.name}](${s.rel})`)).join('\n');
}
