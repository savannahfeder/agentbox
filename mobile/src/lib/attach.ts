// A message with files, as the desktop's reply box writes one: the words, a
// blank line, then each file linked (attachments.ts `attachmentLinks`).
import { attachmentLinks } from '../../../renderer/src/attachments';

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

export function withAttachments(words: string, saved: Saved[]): string {
  return [words.trim() ? words : '', attachmentLinks(saved)].filter(Boolean).join('\n\n');
}
