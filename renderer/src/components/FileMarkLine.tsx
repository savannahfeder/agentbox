// What a message is, in its head beside the time: "Comment", "Checkpoint". A
// note on a file is drawn in its body instead (NoteOnFile): the file and the
// words it is about, over what was said, which opens the file at the note.
import { createContext, useContext } from 'react';
import type { AgentTurn, FileMarkLink } from '../types';
import { messageKind } from '../threads/message-kind';
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

/** A comment on a file, at the top of its message: the file, then the words it is about. */
export function NoteOnFile({ e }: { e: Pick<AgentTurn, 'fileMark'> }) {
  const open = useContext(FileMarkOpener);
  const link = e.fileMark;
  if (link?.kind !== 'note') return null;
  const file = link.shown ?? link.file.replace(/#\d+$/, '');
  if (!file) return null;
  const where = link.place && link.place !== 'Whole file' ? link.place : null;
  const quote = !!where && where.startsWith('“');
  const inner = <>
    <span className="note-on-file">
      <svg className="note-on-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 1.8h5.2L12.5 5v9.2H4z" /><path d="M9 1.8V5.2h3.5" />
      </svg>
      <span className="note-on-name">{file}</span>
      {where && !quote && <span className="note-on-where">{where}</span>}
      {link.unsent && <span className="note-on-why">Goes with your next reply</span>}
    </span>
    {quote && <span className="note-on-quote">{where}</span>}
  </>;
  return open
    ? <button type="button" className="note-on" title={`Open ${file} at this comment`} onClick={() => open(link)}>{inner}</button>
    : <div className="note-on">{inner}</div>;
}
