// A session started outside Agentbox, read off its own transcript. Its newest
// message is laid out like an Agentbox thread from the tool's own words
// (shared/session-layout.mts): the ask in bold, what the agent wrote around
// it, its choices. The whole conversation is one link away. No model reads it
// and nothing is written.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Thread, ThreadWaiting } from './Thread';
import { QueueAnswer, QueueSummary } from './OneThingAtATime';
import { OptionsOffer } from './OptionsOffer';
import { agentAnswer, agentContext, agentLayout, answeredWhereItRuns, choicesArePressed } from '../../../shared/agents.mts';
import { theirWords } from '../../../shared/session-layout.mts';
import type { AgentEvent, AgentSession } from '../types';

const FOLD = { shut: 'Show the full conversation', open: 'Hide the full conversation' };

export function AgentThread({ agent, title, movedAt, md, onPick }: {
  agent: AgentSession;
  title: string;
  // The session's own clock. A new value means it has said or done something
  // since the last read, which is when the conversation is worth reading again.
  movedAt: number;
  md: (text: string) => ReactNode;
  onPick?: (n: number) => void;
}) {
  const { pid, sessionId, cwd, name, engine } = agent;
  const layout = agentLayout(agent);
  // Working on her newer message, its last answer is not the news: the conversation is, ending on what she said.
  const laidOut = !answeredWhereItRuns(agent) && !!(agent.lastSaid || agent.question?.length || agent.approval);
  const [full, setFull] = useState(!laidOut);
  const [whole, setWhole] = useState(false);
  // Opened by her hand, the conversation stays open when the session moves on (a power tester saw it fold shut).
  const opened = useRef(false);
  useEffect(() => { setWhole(false); }, [pid, sessionId, cwd]);
  useEffect(() => { opened.current = false; setFull(!laidOut); }, [pid, sessionId, cwd]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!opened.current) setFull(!laidOut); }, [laidOut]);

  const [state, setState] = useState<{ events: AgentEvent[]; omitted: number; total: number; error?: string } | null>(null);
  // Re-reading the same conversation must not blank it and throw away where she was.
  const shown = useRef<string | null>(null);
  const which = `${engine ?? 'claude'}|${pid}|${sessionId ?? ''}|${cwd}`;
  // Read while the page shows the ask too, so the link opens it at once. A Codex
  // session has no pid here; the main process knows it by its session id.
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
      .catch((err) => { if (live) setState({ events: [], omitted: 0, total: 0, error: String((err as Error)?.message ?? err) }); });
    return () => { live = false; };
  }, [pid, sessionId, cwd, movedAt, whole]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sel, setSel] = useState<number | null>(null);
  const selRef = useRef<HTMLButtonElement>(null);
  const choices = choicesArePressed(agent) ? layout.choices.map((text, i) => ({ n: i + 1, text, recommended: false })) : [];
  const working = answeredWhereItRuns(agent);
  const head = (laidOut || working) && (
    <QueueSummary title={title} context={agentContext(agent, theirWords(agent.lastAsked || agent.asked?.at(-1)?.text))} earlier={0}
      open={full} onToggle={() => { opened.current = !full; setFull((f) => !f); }} fold={laidOut ? FOLD : undefined} />
  );

  if (!full) {
    return (
      <div className="agent-page">
        {head}
        <QueueAnswer text={agentAnswer(agent)} md={md} name={title} />
        {choices.length > 0 && onPick && (
          <div className="one-choices">
            <OptionsOffer ask={layout.under ?? layout.bold ?? ''} askAll={layout.under ?? layout.bold ?? ''} options={choices}
              peekOption={null} askPeek={false} selectedOption={sel} selRef={selRef} onPick={onPick}
              onOptionEnter={(n) => setSel(n)} onAskEnter={() => {}} setPeek={() => {}} setAskPeek={() => {}} bare />
          </div>
        )}
      </div>
    );
  }

  const body = !state ? <ThreadWaiting head={`Reading the conversation with ${name}…`} />
    : state.error ? <div className="thread-wait">{state.error}</div>
      : !state.events.length ? <div className="thread-wait">Nothing has been said in this session yet.</div>
        : <Thread events={state.events} omitted={state.omitted} onWhole={() => setWhole(true)} name={name} landOn={`${sessionId ?? pid}`} md={md} />;
  return <>{head}{body}</>;
}
