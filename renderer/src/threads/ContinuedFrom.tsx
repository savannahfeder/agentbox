// The line on a thread of your own that carries on a teammate's: whose it was,
// and the way back to it.
import { createContext, useContext } from 'react';
import { continuedFrom } from '../../../shared/thread-continued.mts';
import { firstName, TeamContext } from '../team/people';

export const OpenTeammateThread = createContext<((personId: string, threadId: string) => void) | null>(null);

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
