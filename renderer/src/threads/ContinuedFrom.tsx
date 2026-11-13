// The line on a thread of your own that carries on a teammate's: whose it was,
// and the way back to it.
import { createContext, useContext, type ReactNode } from 'react';
import type { WorkItem } from '../types';
import { threadToOpen } from './share-rules';
import { continuedFrom } from '../../../shared/thread-continued.mts';
import { handedFrom } from '../../../shared/thread-link.mts';
import { taskGiver } from '../../../shared/team-rules.mts';
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

function WayBack({ word, personId, threadId }: { word: string; personId: string; threadId: string }) {
  const open = useContext(OpenTeammateThread);
  const team = useContext(TeamContext);
  const whose = `${firstName(team?.byId.get(personId) ?? null) || 'A teammate'}'s thread`;
  return (
    <p className="th-continued">
      {word} {open ? <button type="button" onClick={() => open(personId, threadId)}>{whose}</button> : whose}
    </p>
  );
}

export function ContinuedFrom({ labels }: { labels?: string[] | null }) {
  const from = continuedFrom(labels);
  if (!from) return null;
  return <WayBack word="Continued from" personId={from.personId} threadId={from.threadId} />;
}

/** On a task a teammate handed you: the thread it came from, whole conversation and all. */
export function HandedFrom({ item }: { item: WorkItem }) {
  const team = useContext(TeamContext);
  const from = team && item.assignee === team.me ? handedFrom(item.body, taskGiver(item)) : null;
  if (!from) return null;
  return <WayBack word="Handed on from" personId={from.owner} threadId={from.id} />;
}
