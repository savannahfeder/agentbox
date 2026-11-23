// A group with a message to me is a row at the top of Needs you, until I write
// in the group or mark it done. Drawn from room state, never written into my store.
import type { RoomMention, Person } from '../../types';
import { RowCells } from '../../threads/Pages';
import type { StatusCell } from '../../status-word';
import { STATE_WORD } from '../../threads/summary-rules';
import { dayAndTime, firstRealLine } from '../../format';
import { messageOnRow } from '../../list-rules';
import { Face } from '../people';
import { I } from './icons';

const WAITING: StatusCell = { word: 'Waiting on you', mark: 'need', agent: false, live: false, cloud: false };
const PUT_OFF: StatusCell = { word: STATE_WORD.scheduled, mark: 'sched', agent: false, live: false, cloud: false };

/** A group's row in Needs you, or in Later with when it comes back (`until`). */
export function MentionRows({ mentions, faces, now, onOpen, selected = null }: {
  mentions: (RoomMention & { until?: number })[]; faces: Map<string, string | null>; now: number; onOpen: (m: RoomMention) => void;
  /** The row the keyboard is on (`needs-you-rows`). */
  selected?: string | null;
}) {
  return <>{mentions.map((m) => {
    const who: Person = { id: m.by ?? '', email: '', name: m.byName, avatarUrl: m.by ? faces.get(m.by) ?? null : null };
    return <div key={m.id} className={`row rm-mention${m.unread === false ? '' : ' unread'}${selected === m.id ? ' selected' : ''}`} role="button" tabIndex={0}
      onClick={() => onOpen(m)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m); }}>
      <span className="mark" aria-hidden="true" />
      <RowCells status={m.until ? PUT_OFF : WAITING}
        who={{ face: <Face person={who} />, name: `${m.byName || 'Someone'}${m.thread ? ` in ${m.thread === 'yours' ? 'your' : 'a'} thread` : ''}` }}
        title={messageOnRow(firstRealLine(m.body)) || 'Sent a file'}
        where={<span className="rm-where">{I.hash()}{m.roomName}</span>}
        priority={null} updatedAt={m.at} now={now} when={m.until ? dayAndTime(m.until) : undefined} />
    </div>;
  })}</>;
}

/** The same message as a card at the top of the board's Needs you column. */
export function MentionCards({ mentions, onOpen, selected = null }: {
  mentions: RoomMention[]; onOpen: (m: RoomMention) => void; selected?: string | null;
}) {
  return <>{mentions.map((m) => (
    <button type="button" key={m.id} className={`th-card rm-mention-card${selected === m.id ? ' selected' : ''}`} onClick={() => onOpen(m)}>
      <div className="t"><b className="th-msg-who">{m.byName || 'Someone'}</b> {m.thread ? `in ${m.thread === 'yours' ? 'your' : 'a'} thread: ` : ''}{messageOnRow(firstRealLine(m.body)) || 'sent a file'}</div>
      <div className="m"><span className="p">#{m.roomName}</span></div>
    </button>
  ))}</>;
}
