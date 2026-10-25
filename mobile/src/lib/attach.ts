// A message with files, as the desktop's reply box writes one: the words, a
// blank line, then each file linked (attachments.ts `attachmentLinks`).
import { attachmentLinks } from '../../../renderer/src/attachments';

export interface Saved { rel: string; name: string; image: boolean }

export function withAttachments(words: string, saved: Saved[]): string {
  return [words.trim() ? words : '', attachmentLinks(saved)].filter(Boolean).join('\n\n');
}
