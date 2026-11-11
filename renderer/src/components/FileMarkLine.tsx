// What a message is, in its head beside the time: "Comment", "Checkpoint", or
// "Note on onboarding-a.png, Pin 1", which opens the file at the note.
import { createContext, useContext } from 'react';
import type { AgentTurn, FileMarkLink } from '../types';
import { messageKind } from '../threads/message-kind';

/** What the link does. Null leaves plain words, as on a phone. */
export const FileMarkOpener = createContext<((link: FileMarkLink) => void) | null>(null);

export function MessageKind({ e }: { e: Pick<AgentTurn, 'says' | 'fileMark'> }) {
  const open = useContext(FileMarkOpener);
  const kind = messageKind(e);
  if (!kind) return null;
  if (kind.file && open && e.fileMark) {
    const link = e.fileMark;
    return <button type="button" className="msg-kind msg-kind-file" onClick={() => open(link)}>{kind.word}{kind.why && <span className="msg-kind-why">{kind.why}</span>}</button>;
  }
  return <span className="msg-kind">{kind.word}{kind.why && <span className="msg-kind-why">{kind.why}</span>}</span>;
}
