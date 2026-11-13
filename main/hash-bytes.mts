import fs from 'node:fs';
import crypto from 'node:crypto';

const PIECE = 1 << 20;

/**
 * The sha256 of a file's bytes, read through one buffer. A read stream hands
 * out a new buffer for every 64 KB, and on a big heap that garbage is what
 * the main thread spends whole seconds collecting.
 */
export async function hashBytesOf(file: string): Promise<string> {
  const h = crypto.createHash('sha256');
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(PIECE);
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, PIECE, null);
      if (!bytesRead) break;
      h.update(buf.subarray(0, bytesRead));
    }
  } finally { await fh.close(); }
  return h.digest('hex');
}
