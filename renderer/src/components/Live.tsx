// THE MARK AT THE END OF THE CONVERSATION that says an agent is on this task.
//
// The block of prose it replaces added 57px and drew a rule across it.
//
// `live-line.ts` owns WHICH of the four things is true and every word of it.
// This draws them and keeps the clock moving.

import { useEffect, useId, useState } from 'react';
import { liveLine, shortSpan, shortWord, type LiveFacts } from '../live-line';
import { keepActivityKeyLocal, LIVE_STEPS_SHOWN, previousActivity, stepsSinceLastSaid } from '../activity-summary';
import { LiveMark } from './LiveMark';
import { api } from '../api';
import { runNodes } from '../item-thread';
import type { AgentWork } from '../types';
import type { WorkItem } from '../types';

// The clock, while a run is up. The elapsed reading is in whole minutes and
// never in seconds, so this only has to be fast enough that a minute boundary
// is not visibly late.
const TICK_MS = 15_000;

// Only this lowest status line owns the lattice and shimmer (2026-09-19).
// The task header repeats status in plain text, never another animation.

export function Live({ item, facts }: { item: WorkItem; facts: LiveFacts }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const [history, setHistory] = useState<AgentWork[]>([]);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    setHistory([]);
    setHistoryError(false);
    if (!expanded || !facts.session) return;
    let active = true;
    const read = () => api.sessionTrace({ product: item.product, id: item.id })
      .then(result => {
        if (!active) return;
        // Only the run that is up, and only since it last said something.
        const newest = (result?.sessions ?? []).at(-1);
        setHistory(newest ? stepsSinceLastSaid(runNodes(newest)).filter((node): node is AgentWork => node.kind === 'work') : []);
        setHistoryError(false);
      }).catch(() => { if (active) setHistoryError(true); });
    read();
    const off = api.onChanged(read);
    const timer = setInterval(read, 8000);
    return () => { active = false; off(); clearInterval(timer); };
  }, [expanded, item.id, item.product, facts.session?.startedAt]);
  useEffect(() => setExpanded(false), [item.id, item.product, facts.session?.startedAt]);
  const [now, setNow] = useState(() => Date.now());
  // A SILENT ROW HAS A CLOCK TOO. Its reading is how long ago the run that said
  // nothing ended, and a reading that froze at the minute the pane opened would
  // be the pane telling her something was fresher than it is.
  const counting = !!facts.session || !!facts.silent?.endedAt;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [counting]);

  const live = liveLine(item, { ...facts, now });
  if (!live) return null;

  const working = live.state === 'working';
  // The timing is only ever the age of something that really happened. On a
  // working row that is how long the run has been up. On a silent one it is how
  // long ago the run that said nothing ended, which is the reading that turns
  // "an agent finished quietly" into "and nobody has looked since". There is
  // nothing to count on a queued or a paused row, so nothing is printed there
  // rather than a number that would have to be invented.
  const span = facts.session
    ? shortSpan(Math.max(0, now - facts.session.startedAt))
    : live.state === 'silent' && facts.silent?.endedAt
      ? shortSpan(Math.max(0, now - facts.silent.endedAt))
      : null;

  const activity = facts.session?.activity ?? [];
  const current = activity[activity.length - 1];
  const word = working ? (current?.label || 'Thinking') : shortWord(live.state, facts.session?.helpers ?? 0);
  const finished = previousActivity(history, activity);
  // The newest few, oldest at the top and what is running now at the foot, the
  // way Codex stacks them. The rest of this group is one quiet count.
  const recent = finished.slice(-LIVE_STEPS_SHOWN);
  const earlier = finished.length - recent.length;
  // THE AGENT'S NAME IS NOT ON THIS LINE, AND THAT IS A DECISION.
  //
  // So this file asks nothing about engines, takes no engine facts, and is back
  // to the line she approved on 2026-08-24. `agentAtWork` still exists and the
  // byline still calls it; the two surfaces that draw it are the task header and
  // the inbox row.

  return (
    <div className="live-activity">
      <div className={`live-brief live-${live.state}`}>
        <LiveMark still={!working} />
        {working ? (
          <button type="button" className="live-disclosure" onKeyDown={keepActivityKeyLocal} aria-expanded={expanded}
            aria-controls={detailId} onClick={() => setExpanded(value => !value)}>
            <span className="live-word is-shimmering">{word}</span>
            {activity.length > 1 && <span className="live-span">+{activity.length - 1}</span>}
            {span && <span className="live-span">{span}</span>}
            <svg className="live-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
          </button>
        ) : <span className="live-word">{word}</span>}
        {!working && span && <span className="live-span">{span}</span>}
        <span className="live-announcement" role="status">{working ? word : live.line}</span>
      </div>
      {working && expanded && (
        <div className="live-details" id={detailId}>
          {earlier > 0 && <div className="live-earlier">{earlier} earlier {earlier === 1 ? 'step' : 'steps'} since it last said something</div>}
          {recent.map((action, index) => <ActivityRow key={`${action.at}-${index}`}
            label={`${action.verb.charAt(0).toUpperCase()}${action.verb.slice(1)} ${action.subject}`.trim()}
            detail={action.full || action.subject || ''} />)}
          {activity.map(action => <ActivityRow key={action.id} label={action.label} detail={action.detail} />)}
          {historyError && <div>Couldn’t read the command history.</div>}
          {!historyError && !activity.length && !recent.length && <div>No commands yet.</div>}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ label, detail }: { label: string; detail: string }) {
  return <details className="live-command">
    <summary onKeyDown={keepActivityKeyLocal}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" /><path d="m4 5 3 3-3 3m5 0h3" /></svg>
      <span>{label}</span>
    </summary>
    <pre>{detail}</pre>
  </details>;
}
