// A group with a message to me is a row at the top of Needs you, until I write
// in the group or mark it done. Drawn from room state, never written into my store.
import type { RoomMention, Person } from '../../types';
import { RowCells } from '../../threads/Pages';
import type { StatusCell } from '../../status-word';
import { firstRealLine } from '../../format';
import { Face } from '../people';
import { I } from './icons';

const WAITING: StatusCell = { word: 'Waiting on you', mark: 'need', agent: false, live: false, cloud: false };

export function MentionRows({ mentions, faces, now, onOpen, selected = null }: {
  mentions: RoomMention[]; faces: Map<string, string | null>; now: number; onOpen: (m: RoomMention) => void;
  /** The row the keyboard is on (`needs-you-rows`). */
  selected?: string | null;
}) {
  return <>{mentions.map((m) => {
    const who: Person = { id: m.by ?? '', email: '', name: m.byName, avatarUrl: m.by ? faces.get(m.by) ?? null : null };
    return <div key={m.id} className={`row rm-mention${m.unread === false ? '' : ' unread'}${selected === m.id ? ' selected' : ''}`} role="button" tabIndex={0}
      onClick={() => onOpen(m)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m); }}>
      <span className="mark" aria-hidden="true" />
      <RowCells status={WAITING}
        title={<span className="th-msg"><Face person={who} /><b className="th-msg-who">{m.byName || 'Someone'}</b><span className="th-msg-text">{m.thread ? `in ${m.thread === 'yours' ? 'your' : 'a'} thread: ` : ''}{firstRealLine(m.body) || 'sent a file'}</span></span>}
        where={<span className="rm-where">{I.hash()}{m.roomName}</span>}
        priority={null} updatedAt={m.at} now={now} />
    </div>;
  })}</>;
}
