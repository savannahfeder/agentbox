// What the more menu on one message offers (./MessageMore.tsx draws it), and
// how an edit keeps what the app attached under the words.
import { typedParts } from '../typed-message';
import type { MoreItem } from './MessageMore';

/** The words of a message, without the lines the app wrote for its attachments. */
export function wordsOf(text: string): string {
  return typedParts(text).filter((p): p is { text: string } => 'text' in p).map((p) => p.text).join('\n\n').trim();
}

/** New words, with the original message's attachments kept under them. */
export function withEmbeds(original: string, words: string): string {
  const embeds = typedParts(original).filter((p): p is { embed: string } => 'embed' in p).map((p) => p.embed);
  return [words.trim(), embeds.join('\n')].filter(Boolean).join('\n\n');
}

export function messageMore({ mine, text, onEdit, onDelete, onMarkUnread, onCopied }: {
  mine: boolean;
  text: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkUnread?: () => void;
  onCopied?: () => void;
}): MoreItem[] {
  const words = wordsOf(text);
  const items: MoreItem[] = [];
  if (mine && onEdit && words) items.push({ label: 'Edit message', onClick: onEdit, hint: '↑' });
  if (words) {
    items.push({
      label: 'Copy text',
      onClick: () => { void navigator.clipboard?.writeText(words).then(() => onCopied?.(), () => {}); },
    });
  }
  if (onMarkUnread) items.push({ label: 'Mark unread', onClick: onMarkUnread });
  if (mine && onDelete) items.push('rule', { label: 'Delete message', onClick: onDelete, danger: true });
  return items;
}
