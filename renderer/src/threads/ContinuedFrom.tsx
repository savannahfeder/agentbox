// The line on a thread of your own that carries on a teammate's: whose it was,
// and the way back to it.
import { createContext, useContext, type ReactNode } from 'react';
import { threadToOpen } from './share-rules';
import { continuedFrom } from '../../../shared/thread-continued.mts';
import { firstName, TeamContext } from '../team/people';

export const OpenTeammateThread = createContext<((personId: string, threadId: string) => void) | null>(null);

/** A link in a chat: a thread's link opens the thread here, anything else a new tab. */
export function ChatLink({ href, children }: { href?: string; children?: ReactNode }) {
  const open = useContext(OpenTeammateThread);
  return <a href={href} target="_blank" rel="noreferrer" onClick={(e) => {
    const t = open && threadToOpen(href, e);
    if (t) { e.preventDefault(); open(t.owner, t.id); }
  }}>{children}</a>;
}

export function ContinuedFrom({ labels }: { labels?: string[] | null }) {
  const from = continuedFrom(labels);
  const open = useContext(OpenTeammateThread);
  const team = useContext(TeamContext);
  if (!from) return null;
  const whose = `${firstName(team?.byId.get(from.personId) ?? null) || 'A teammate'}'s thread`;
  return (
    <p className="th-continued">
      Continued from {open ? <button type="button" onClick={() => open(from.personId, from.threadId)}>{whose}</button> : whose}
    </p>
  );
}
