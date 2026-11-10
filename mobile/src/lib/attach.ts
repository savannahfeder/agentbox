// A message with files, as the desktop's reply box writes one: the words, a
// blank line, then each file linked (attachments.ts `attachmentLinks`).
import { attachmentLinks } from '../../../renderer/src/attachments';
import { SEND_MAX_BYTES } from '../../../renderer/src/phone-sends-files';

/** Why a picked file cannot go, before reading it: a long video read whole can end the app. */
export function tooBigToSend(name: string, bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || bytes <= SEND_MAX_BYTES) return null;
  return `${name} is too big to send from your phone (${Math.floor(SEND_MAX_BYTES / 1024 / 1024)} MB at most).`;
}

export interface Saved { rel: string; name: string; image: boolean }

// iOS will not present the system picker while the Attach menu (a Modal) is
// still being dismissed, and says nothing when it refuses. So a pick waits for
// the menu's onDismiss, or this long if that never comes.
export const SHEET_GONE_MS = 700;
export function pickAfterClose({ ios }: { ios: boolean }) {
  let waiting: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const fn = waiting;
    waiting = null;
    fn?.();
  };
  return {
    request(fn: () => void) {
      waiting = fn;
      timer = setTimeout(run, ios ? SHEET_GONE_MS : 0);
    },
    gone: run,
  };
}

/** A picked photo or video's name; the picker re-encodes an iPhone's HEIC photo as JPEG. */
export function pickedName(fileName: string | null | undefined, type: string | null | undefined, n: number): string {
  if (!fileName) return type === 'video' ? `video-${n + 1}.mov` : `photo-${n + 1}.jpg`;
  return type === 'image' ? fileName.replace(/\.(heic|heif)$/i, '.jpg') : fileName;
}

const PICTURE_TYPES: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp' };

/**
 * What a waiting picture's thumbnail is drawn from: the file itself while the
 * phone has it. iOS draws nothing, and says nothing, for a screenshot handed
 * over as megabytes of base64; the bytes are the fallback for a draft read
 * back from storage.
 */
export function thumbUri(f: { name: string; dataBase64: string; uri?: string }): string {
  if (f.uri) return f.uri;
  return `data:image/${PICTURE_TYPES[f.name.split('.').pop()!.toLowerCase()] ?? 'png'};base64,${f.dataBase64}`;
}

/** The waiting files with `more` added, leaving out a file already waiting. */
export function withPicked<F extends { name: string; dataBase64: string }>(now: F[], more: F[]): F[] {
  const out = [...now];
  for (const f of more) if (!out.some((o) => o.name === f.name && o.dataBase64 === f.dataBase64)) out.push(f);
  return out;
}

export function withAttachments(words: string, saved: Saved[]): string {
  return [words.trim() ? words : '', attachmentLinks(saved)].filter(Boolean).join('\n\n');
}
