// PURE. A file in a group chat bigger than one room file goes in parts, with a
// short list under its own name saying how many (main/team/rooms.mts).
import { MAX_SHARED_SENT_BYTES } from './carried-files.mts';

/** A part fits a room file (10 MiB) with room to spare. */
export const ROOM_PART_BYTES = 8 * 1024 * 1024;
export const ROOM_MAX_BYTES = MAX_SHARED_SENT_BYTES;

/** How many parts a file of this size goes in, or 0 when it is too big to send. */
export function partsOf(size: unknown): number {
  const n = Number(size);
  if (!Number.isFinite(n) || n < 0 || n > ROOM_MAX_BYTES) return 0;
  return Math.max(1, Math.ceil(n / ROOM_PART_BYTES));
}

export const partName = (name: string, i: number): string => `${name}.p${i}`;

export interface PartList { parts: number; size: number }

const MARK = 'agentbox-parts';

/** The list kept under the file's own name, as base64 like every room file. */
export function partList(parts: number, size: number): string {
  return Buffer.from(JSON.stringify({ [MARK]: 1, parts, size })).toString('base64');
}

/** The list, if this file is one; null for any real file. */
export function readPartList(dataBase64: unknown): PartList | null {
  const data = String(dataBase64 ?? '');
  if (!data || data.length > 400) return null;
  try {
    const got = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    if (got?.[MARK] !== 1 || !Number.isInteger(got.parts) || got.parts < 1 || !Number.isInteger(got.size)) return null;
    return { parts: got.parts, size: got.size };
  } catch {
    return null;
  }
}
