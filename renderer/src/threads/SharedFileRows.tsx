// A note naming you on a teammate's shared thread is a row at the top of Needs
// you, until you open it or it is resolved. Their thread is not in your store,
// so these are drawn from the team state, the way a room's mentions are.
import type { Person, SharedFileNews, ThreadCard } from '../types';
import type { StatusCell } from '../status-word';
import { Face, firstName, type TeamView } from '../team/people';
import { RowCells } from './Pages';
import { STATE_WORD } from './summary-rules';

const WAITING: StatusCell = { word: STATE_WORD.waiting, mark: 'need', agent: false, live: false, cloud: false };

const whoNoted = (team: TeamView | null, n: SharedFileNews): Person => team?.byId.get(n.by) ?? { id: n.by, email: '', name: 'A teammate', avatarUrl: null };
const newsWords = (n: SharedFileNews) => `named you on ${n.file.replace(/#\d+$/, '')}: ${n.text}`;

export function SharedFileRows({ news, cards, team, now, onOpen }: {
  news: SharedFileNews[]; cards: ThreadCard[]; team: TeamView | null; now: number;
  onOpen: (n: SharedFileNews, card: ThreadCard) => void;
}) {
  return <>{news.map((n) => {
    const card = cards.find((c) => c.personId === n.owner && c.threadId === n.threadId);
    if (!card) return null;
    const who = whoNoted(team, n);
    return <div key={n.id} className="row rm-mention unread" role="button" tabIndex={0}
      onClick={() => onOpen(n, card)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n, card); }}>
      <span className="mark" aria-hidden="true" />
      <RowCells status={WAITING}
        title={<span className="th-msg"><Face person={who} /><b className="th-msg-who">{firstName(who)}</b><span className="th-msg-text">{newsWords(n)}</span></span>}
        where={<span className="rm-where">{card.title ?? 'Shared thread'}</span>}
        priority={null} updatedAt={n.ts} now={now} />
    </div>;
  })}</>;
}

/** The same note as a card at the top of the board's Needs you column. */
export function SharedFileCards({ news, cards, team, onOpen }: {
  news: SharedFileNews[]; cards: ThreadCard[]; team: TeamView | null; onOpen: (n: SharedFileNews, card: ThreadCard) => void;
}) {
  return <>{news.map((n) => {
    const card = cards.find((c) => c.personId === n.owner && c.threadId === n.threadId);
    if (!card) return null;
    return <button type="button" key={n.id} className="th-card rm-mention-card" onClick={() => onOpen(n, card)}>
      <div className="t"><b className="th-msg-who">{firstName(whoNoted(team, n))}</b> {newsWords(n)}</div>
      <div className="m"><span className="p">{card.title ?? 'Shared thread'}</span></div>
    </button>;
  })}</>;
}
