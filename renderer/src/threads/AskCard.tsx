import { rowTitle } from '../list-rules';
import type { InboxAsk } from './inbox-asks';

/**
 * What a cloud thread is waiting on, in the approval card's corner and dress:
 * one card in front, the rest as edges behind it. Its button opens the thread
 * at the ask; Later puts the card away and leaves the thread in Needs you.
 */
export function AskCard({ asks, onGive, onLater, room }: {
  asks: InboxAsk[];
  onGive: (ask: InboxAsk) => void;
  onLater: (ask: InboxAsk) => void;
  room: (el: HTMLDivElement | null) => void;
}) {
  const ask = asks[0];
  if (!ask) return null;
  const waiting = asks.length - 1;
  const first = rowTitle(ask.items[0]);
  const thread = ask.items.length > 1 ? `${first} and ${ask.items.length - 1} more` : first;
  return (
    <div className="approvals ask-cards" ref={room}>
      <div className="approval-stack">
        {waiting > 1 && <div className="approval-ghost g2" />}
        {waiting > 0 && <div className="approval-ghost g1" />}
        <div className="approval-card" key={ask.key}>
          <div className="approval-from">
            <button type="button" className="approval-task" title="Open this thread" onClick={() => onGive(ask)}>
              <span className="approval-task-title">{thread}</span>
              <span className="approval-task-go" aria-hidden="true">↗</span>
            </button>
            {waiting > 0 && <span className="approval-count">{waiting} more waiting</span>}
          </div>
          <div className="approval-lede">{ask.title}</div>
          <div className="approval-actions">
            <button type="button" className="approval-allow" onClick={() => onGive(ask)}>{ask.act}</button>
            <button type="button" className="approval-deny" onClick={() => onLater(ask)}>Later</button>
          </div>
        </div>
      </div>
    </div>
  );
}
