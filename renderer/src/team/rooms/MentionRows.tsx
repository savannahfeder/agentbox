// A message in a room that names me is a row at the top of Needs you, until I
// read the room past it (docs/team/ROOMS-PLAN.md, Chat, mentions, unread).
// Drawn from room state, never written into my store.
import type { RoomMention, Person } from '../../types';
import { RowCells } from '../../threads/Pages';
import { STATE_WORD } from '../../threads/summary-rules';
import type { StatusCell } from '../../status-word';
import { Face } from '../people';
import { I } from './icons';
import type { MentionRow } from './room-rules';

// A mention is waiting on me the way a teammate's message is, so it says so in the same word.
const WAITING: StatusCell = { word: STATE_WORD.waiting, mark: 'need', agent: false, live: false, cloud: false };

export function MentionRows({ mentions, faces, now, onOpen }: {
  mentions: MentionRow[]; faces: Map<string, string | null>; now: number; onOpen: (m: RoomMention) => void;
}) {
  return <>{mentions.map((m) => {
    const who: Person = { id: m.by ?? '', email: '', name: m.byName, avatarUrl: m.by ? faces.get(m.by) ?? null : null };
    return <div key={m.id} className="row rm-mention unread" role="button" tabIndex={0}
      onClick={() => onOpen(m)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m); }}>
      <span className="mark" aria-hidden="true" />
      <RowCells status={WAITING}
        title={<span className="th-msg"><Face person={who} /><b className="th-msg-who">{m.byName || 'Someone'}</b><span className="th-msg-text">{m.count > 1 ? `sent you ${m.count} messages` : m.body}</span></span>}
        where={<span className="rm-where">{I.hash()}{m.roomName}</span>}
        priority={null} updatedAt={m.at} now={now} />
    </div>;
  })}</>;
}
