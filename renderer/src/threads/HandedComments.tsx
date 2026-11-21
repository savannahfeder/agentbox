// The comments a card hands to an agent, each with its writer's face, ticked
// unless you untick it; a press on a name ticks or unticks all of theirs.
import { useContext } from 'react';
import { Face, TeamContext } from '../team/people';
import { whoseComments, type HandedComment } from './comments-to-hand';

export function HandedComments({ comments, leftOut, onLeftOut, nameOf }: {
  comments: readonly HandedComment[];
  leftOut: ReadonlySet<string>;
  onLeftOut: (next: Set<string>) => void;
  nameOf: (id: string | null) => string;
}) {
  const team = useContext(TeamContext);
  if (!comments.length) return null;
  const whose = whoseComments(comments, nameOf);
  const going = comments.filter((c) => !leftOut.has(c.id)).length;
  const face = (by: string | null, mine: boolean) => <Face person={team?.byId.get(by ?? '') ?? null} name={mine ? undefined : nameOf(by)} me={mine} size={18} />;
  const flip = (ids: string[]) => {
    const next = new Set(leftOut);
    const allOut = ids.every((id) => leftOut.has(id));
    for (const id of ids) if (allOut) next.delete(id); else next.add(id);
    onLeftOut(next);
  };
  return (
    <div className="hc" aria-label="Comments that go with it">
      <div className="hc-head">
        <span className="hc-count">{going === 0 ? 'No comments go with it' : `${going} ${going === 1 ? 'comment goes' : 'comments go'} with it`}</span>
        {whose.length > 1 && <span className="hc-whose">
          {whose.map((w) => {
            const theirs = comments.filter((c) => c.by === w.by).map((c) => c.id);
            const on = theirs.some((id) => !leftOut.has(id));
            return <button key={w.by ?? 'me'} type="button" className={`hc-who${on ? ' on' : ''}`} aria-pressed={on} title={on ? `Leave out ${w.mine ? 'yours' : `${w.name}'s`}` : `Add ${w.mine ? 'yours' : `${w.name}'s`}`} onClick={() => flip(theirs)}>
              {face(w.by, w.mine)}<span>{w.name}</span><span className="hc-who-n">{w.count}</span>
            </button>;
          })}
        </span>}
      </div>
      <ul className="hc-list">
        {comments.map((c) => {
          const on = !leftOut.has(c.id);
          return <li key={c.id}>
            <button type="button" role="checkbox" aria-checked={on} className={`hc-row${on ? '' : ' off'}`} onClick={() => flip([c.id])}>
              <span className="hc-tick" aria-hidden="true">{on && <svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
              {face(c.by, c.mine)}
              <span className="hc-words">
                {c.place && <span className="hc-place">{c.quote ? `“${c.place}”` : c.place}</span>}
                <span className="hc-text">{c.text}</span>
                {c.replies.length > 0 && <span className="hc-replies">{c.replies.length === 1 ? '1 reply' : `${c.replies.length} replies`}</span>}
              </span>
            </button>
          </li>;
        })}
      </ul>
    </div>
  );
}
