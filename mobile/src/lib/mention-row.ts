// What a mention's row says, as the desktop's MentionRows does.
import { firstRealLine } from '../../../renderer/src/format';
import { messageOnRow } from '../../../renderer/src/list-rules';
import type { RoomMention } from '../../../renderer/src/types';

export function mentionRowWords(m: Pick<RoomMention, 'byName' | 'body' | 'thread'>): { who: string; says: string } {
  const where = m.thread ? ` in ${m.thread === 'yours' ? 'your' : 'a'} thread` : '';
  return { who: `${m.byName || 'Someone'}${where}`, says: messageOnRow(firstRealLine(m.body)) || 'Sent a file' };
}
