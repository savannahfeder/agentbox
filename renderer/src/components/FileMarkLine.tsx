// What a message is, in its head beside the time: "Comment", "Checkpoint". A
// comment on a file says so after the name, "commented on sign-up-screens.md",
// the file opening at the comment, and quotes the words it is about in its body
// as the notes beside the file quote them.
import { createContext, useContext } from 'react';
import type { AgentTurn, FileMarkLink } from '../types';
import { commentWords, messageKind } from '../threads/message-kind';
import { TeamContext } from '../team/people';

/** What the link does. Null leaves plain words, as on a phone. */
export const FileMarkOpener = createContext<((link: FileMarkLink) => void) | null>(null);

export function MessageKind({ e }: { e: Pick<AgentTurn, 'says' | 'fileMark' | 'text' | 'fromId'> }) {
  const open = useContext(FileMarkOpener);
  const team = useContext(TeamContext);
  if (e.fileMark?.kind === 'note') return null;
  const kind = messageKind(e, { helper: !!e.fromId && !!team?.byId.has(e.fromId) });
  if (!kind) return null;
  if (kind.file && open && e.fileMark) {
    const link = e.fileMark;
    return <button type="button" className="msg-kind msg-kind-file" onClick={() => open(link)}>{kind.word}{kind.why && <span className="msg-kind-why">{kind.why}</span>}</button>;
  }
  return <span className="msg-kind">{kind.word}{kind.why && <span className="msg-kind-why">{kind.why}</span>}</span>;
}

/** After the name in a comment's head: "commented on sign-up-screens.md · Pin 1". */
export function CommentOn({ e }: { e: Pick<AgentTurn, 'fileMark'> }) {
  const open = useContext(FileMarkOpener);
  const link = e.fileMark;
  const words = commentWords(link);
  if (!link || !words) return null;
  return <span className="comment-on">
    {words.verb}{' '}
    {open
      ? <button type="button" className="comment-on-file" title={`Open ${words.file} at this comment`} onClick={() => open(link)}>{words.file}</button>
      : <span className="comment-on-file">{words.file}</span>}
    {words.where && <span className="comment-on-where">{words.where}</span>}
    {link.unsent && <span className="comment-on-where">Goes with your next reply</span>}
  </span>;
}

/** The words a comment is about, over what it says. */
export function CommentQuote({ e }: { e: Pick<AgentTurn, 'fileMark'> }) {
  const quote = commentWords(e.fileMark)?.quote;
  return quote ? <div className="comment-quote">{quote}</div> : null;
}
