// A thread you asked about is done, or shipped: a row at the top of Needs you
// until you open it.
import type { Person, ThreadCard } from '../types';
import type { StatusCell } from '../status-word';
import { followWords, type FollowNews } from '../team/following';
import { Face, firstName, type TeamView } from '../team/people';
import { RowCells } from './Pages';
import { cardPlace } from './page-rules';

const cell = (word: string): StatusCell => ({ word, mark: 'done', agent: false, live: false, cloud: false });

const whoOwns = (team: TeamView | null, n: FollowNews): Person => team?.byId.get(n.owner) ?? { id: n.owner, email: '', name: 'A teammate', avatarUrl: null };

export function FollowRows({ news, team, now, onOpen }: { news: FollowNews[]; team: TeamView | null; now: number; onOpen: (n: FollowNews, card: ThreadCard) => void }) {
  return <>{news.map((n) => {
    const who = whoOwns(team, n);
    const words = followWords(n, firstName(who));
    return <div key={n.key} className="row rm-mention unread" role="button" tabIndex={0}
      onClick={() => onOpen(n, n.card)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n, n.card); }}>
      <span className="mark" aria-hidden="true" />
      <RowCells status={cell(n.kind === 'shipped' ? 'Shipped' : 'Done')}
        title={<span className="th-msg"><Face person={who} /><span className="th-msg-text">{words}</span></span>}
        where={cardPlace(n.card)} priority={null} updatedAt={n.at} now={now} />
    </div>;
  })}</>;
}

/** The same news as a card at the top of the board's Needs you column. */
export function FollowCards({ news, team, onOpen }: { news: FollowNews[]; team: TeamView | null; onOpen: (n: FollowNews, card: ThreadCard) => void }) {
  return <>{news.map((n) => (
    <button type="button" key={n.key} className="th-card rm-mention-card" onClick={() => onOpen(n, n.card)}>
      <div className="t">{followWords(n, firstName(whoOwns(team, n)))}</div>
      <div className="m"><span className="p">{cardPlace(n.card)}</span></div>
    </button>
  ))}</>;
}
