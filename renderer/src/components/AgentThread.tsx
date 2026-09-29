// THE ITEM IS THE CONVERSATION, WITH THE WORK IN IT — the Claude Code side.
//
// WHAT IT REPLACES AND WHY. A ported session's item used to be a card Agentbox
// wrote ABOUT the conversation (what it was started with, three later
// messages, one sentence of where it stopped) with the conversation itself
// behind a button.
//
// The card is still written, because the INBOX ROW reads it and two lines under
// a title is all that surface has. What changed is that opening the row no
// longer shows her a summary of a conversation she can see: it shows the
// conversation.
//
// AND THE SECOND HALF OF THE PROBLEM IS THE WORK LINES. The answer this
// component gives: show all of it, in the order it happened, with what it SAID
// at reading size and what it RAN quiet underneath. Nothing is picked over, so
// nothing can be picked wrong.
//
// WHAT IS LEFT HERE IS THE READING. The drawing moved to Thread. Her own tasks
// come through the same component now (ItemThread.tsx), so this file's whole
// job is to fetch one Claude Code transcript and hand it over. Nothing about
// the look, the folding or the landing lives here any more, which is the point:
// two chats that are drawn by two files drift, and hers had.
//
// STILL NO MODEL AND STILL NOTHING WRITTEN. This opens a file already on her
// disk and reads it.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Thread, ThreadWaiting } from './Thread';
import type { AgentEvent } from '../types';

export function AgentThread({ pid, sessionId, cwd, name, movedAt, md }: {
  pid: number;
  sessionId: string | null;
  cwd: string;
  name: string;
  // The session's own clock. A new value means it has said or done something
  // since the last read, which is exactly when this is worth reading again and
  // the only time it is: the old fault was a card that never changed, and a
  // thread that reloads on every snapshot poll would be the same failure with
  // the opposite symptom.
  movedAt: number;
  md: (text: string) => ReactNode;
}) {
  const [state, setState] = useState<{
    events: AgentEvent[]; omitted: number; total: number; error?: string;
  } | null>(null);
  // THE MIDDLE CAN BE ASKED FOR BACK. Read again with the window off rather than
  // held in the renderer, because this conversation lives in a transcript on
  // disk and the middle was never sent here in the first place. Dropped when
  // she moves to another session, so nothing opens at full length.
  const [whole, setWhole] = useState(false);
  useEffect(() => { setWhole(false); }, [pid, sessionId, cwd]);

  // WHICH CONVERSATION THIS IS, so that re-reading the SAME one does not blank
  // it. Asking for the middle back re-reads from disk, and clearing `state`
  // first would unmount the thread, throw away where she was standing and land
  // her at the bottom again — the opposite of what she pressed for.
  const shown = useRef<string | null>(null);
  const which = `${pid}|${sessionId ?? ''}|${cwd}`;

  useEffect(() => {
    let live = true;
    if (shown.current !== which) { setState(null); shown.current = which; }
    api.agentConversation({ pid, sessionId, cwd, whole })
      .then((r) => {
        if (!live) return;
        setState(r?.ok
          ? { events: (r.turns ?? []) as AgentEvent[], omitted: r.omitted ?? 0, total: r.total ?? 0 }
          : { events: [], omitted: 0, total: 0, error: r?.reason ?? 'That conversation could not be read.' });
      })
      .catch((err) => {
        if (live) setState({ events: [], omitted: 0, total: 0, error: String((err as Error)?.message ?? err) });
      });
    return () => { live = false; };
  }, [pid, sessionId, cwd, movedAt, whole]);

  // WHILE IT IS BEING READ, THE SHAPE OF WHAT IS COMING.There WAS a line here
  // saying so, and one faint sentence is what 25 characters on a 793px page
  // looks like, which is to say blank. Reading her longest live conversation
  // costs 508ms, so this is half a second of nothing, on her own measurement of
  // it.
  if (!state) return <ThreadWaiting head={`Reading the conversation with ${name}…`} />;
  if (state.error) return <div className="thread-wait">{state.error}</div>;
  if (!state.events.length) {
    return <div className="thread-wait">Nothing has been said in this session yet.</div>;
  }

  return (
    <Thread
      events={state.events}
      omitted={state.omitted}
      onWhole={() => setWhole(true)}
      name={name}
      landOn={`${sessionId ?? pid}`}
      md={md}
    />
  );
}
