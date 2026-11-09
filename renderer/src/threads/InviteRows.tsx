// An invitation as a row in Needs you. A click on the row opens where it is
// answered at length; only Join, or Enter on the row, takes it up.
import { RowCells } from './Pages';
import type { StatusCell } from '../status-word';
import type { InviteRow } from './needs-you-rows';

const WAITING: StatusCell = { word: 'Waiting on you', mark: 'need', agent: false, live: false, cloud: false };

export function InviteRows({ rows, onJoin, onOpen, selected }: {
  rows: InviteRow[]; onJoin: (r: InviteRow) => void; onOpen: (r: InviteRow) => void; selected: string | null;
}) {
  return <>{rows.map((r) => <div key={r.key} className={`row rm-mention unread${selected === r.key ? ' selected' : ''}`} role="button" tabIndex={0} data-invite={r.key}
    onClick={() => onOpen(r)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onJoin(r); }}>
    <span className="mark" aria-hidden="true" />
    <RowCells status={WAITING}
      title={<span className="th-msg"><span className="th-msg-text">{r.words}</span><button type="button" className="rm-btn inv-join" onClick={(e) => { e.stopPropagation(); onJoin(r); }}>Join</button></span>}
      where="Team" priority={null} updatedAt={0} when="" now={0} />
  </div>)}</>;
}

/** The same invitation as a card at the top of the board's Needs you column. */
export function InviteCards({ rows, onJoin, onOpen, selected }: {
  rows: InviteRow[]; onJoin: (r: InviteRow) => void; onOpen: (r: InviteRow) => void; selected: string | null;
}) {
  return <>{rows.map((r) => <div key={r.key} className={`th-card${selected === r.key ? ' selected' : ''}`} role="button" tabIndex={0} data-invite={r.key}
    onClick={() => onOpen(r)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onJoin(r); }}>
    <div className="t">{r.words}</div>
    <div className="m"><span className="p">Team</span><button type="button" className="rm-btn inv-join" onClick={(e) => { e.stopPropagation(); onJoin(r); }}>Join</button></div>
  </div>)}</>;
}
