// STAGING A FILE FOR A REPLY BOX, before it is sent: the bytes of a paste, or
// a copy of a picture dropped in, written into the account's .staging folder,
// which the window may draw from (main/ipc.mjs `zero:stage-attachment` says
// why). A picture the window cannot draw is turned into one that it can here,
// so the box, the message and the teammate all get a picture.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { turnedName } from '../shared/picture-formats.mjs';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const SIPS_MS = 30_000;

/**
 * Answers `{ path }`, and `name` too when the file was turned into another
 * format, which is the name it goes on under.
 */
export async function stageAttachment(dir, { name, dataBase64, srcPath } = {}, { turn = turnIntoPicture } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  // Sweep on the way in rather than on a timer: an abandoned paste is only
  // ever discovered by the next one, and a week is longer than any draft has
  // been left open. Failure to sweep must never fail the paste.
  try {
    const week = Date.now() - WEEK;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      try { if (fs.statSync(p).mtimeMs < week) fs.unlinkSync(p); } catch { /* leave it */ }
    }
  } catch { /* a sweep that cannot run is not a paste that failed */ }
  const safe = String(name ?? 'pasted.png').replace(/[^\w.-]+/g, '-').slice(0, 80);
  const abs = path.join(dir, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  // A path is a drag, bytes are a paste. Already inside the folder we serve
  // from is left alone: copying it would only make a second file to sweep.
  if (typeof srcPath === 'string' && srcPath) {
    if (path.resolve(srcPath) === path.resolve(path.join(dir, path.basename(srcPath)))) return { path: srcPath };
    fs.copyFileSync(srcPath, abs);
  } else {
    fs.writeFileSync(abs, Buffer.from(String(dataBase64 ?? ''), 'base64'));
  }
  const as = turnedName(name ?? safe);
  if (!as) return { path: abs };
  // One that cannot be turned goes as the file it is, which is how every TIFF went before.
  const drawn = await Promise.resolve().then(() => turn(abs)).catch(() => null);
  if (!drawn) return { path: abs };
  try { fs.unlinkSync(abs); } catch { /* swept within the week */ }
  return { path: drawn, name: as };
}

/**
 * Turns a TIFF or HEIC into a PNG or JPEG beside it with the Mac's own sips,
 * and answers the new file's path. Null off a Mac, for any other file, or
 * when sips fails or writes nothing.
 */
export async function turnIntoPicture(file, { platform = process.platform, run = sips } = {}) {
  const as = turnedName(path.basename(file));
  if (!as || platform !== 'darwin') return null;
  const out = path.join(path.dirname(file), as);
  try {
    await run(['-s', 'format', as.endsWith('.png') ? 'png' : 'jpeg', file, '--out', out]);
    return fs.statSync(out).size > 0 ? out : null;
  } catch {
    return null;
  }
}

const sips = (args) => new Promise((resolve, reject) => {
  execFile('/usr/bin/sips', args, { timeout: SIPS_MS }, (err) => (err ? reject(err) : resolve()));
});
