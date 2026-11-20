// A REVIEW THAT CAME BACK, on the owner's thread: the reviewer's verdict and
// note as a message at the foot of the conversation, signed with their face
// and name, where the newest thing on a thread is read.
import { useContext } from 'react';
import { verdictOf } from '../../../shared/review-sent-back.mts';
import { Face, TeamContext } from '../team/people';
import { clock, dayHeading } from '../thread-history';

type Comment = { by: string; ts: number; text?: string };

/** The newest comment on the thread that carries a review's verdict. */
export function reviewBack(comments: readonly Comment[] | null | undefined) {
  const c = [...(comments ?? [])].reverse().find((x) => verdictOf(x.text));
  if (!c) return null;
  return { by: c.by, at: c.ts, ...verdictOf(c.text)! };
}

export const verdictLine = (v: { verdict: 'approved' | 'changes'; notes: number }): string =>
  v.verdict === 'approved' ? 'Approved it' : v.notes > 0 ? `Sent it back with ${v.notes} note${v.notes === 1 ? '' : 's'}` : 'Sent it back';

export function ReviewCameBack({ comments }: { comments: readonly Comment[] | null | undefined }) {
  const team = useContext(TeamContext);
  const back = reviewBack(comments);
  if (!back) return null;
  const person = team?.byId.get(back.by) ?? null;
  return (
    <div className="outcome one-answer review-back" data-line={`at-${back.at}`}>
      <div className="one-by"><Face person={person} /><span>{person?.name || 'Your teammate'}</span><em>{`${dayHeading(back.at)} ${clock(back.at)}`}</em></div>
      <p className="review-back-verdict">{verdictLine(back)}</p>
      {back.note && <p>{back.note}</p>}
    </div>
  );
}
