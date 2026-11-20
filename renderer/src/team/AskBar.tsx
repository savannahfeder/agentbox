// WHAT A TEAMMATE ASKED OF YOU ON THEIR THREAD, as the newest message on it:
// their note, the step they picked, and handing it back with your answer. On
// the task's own page the same buttons sit under the message that asked
// (`AskActions`), since that message already says the rest.
import { useState } from 'react';
import type { Person, WorkItem } from '../types';
import { Face, firstName } from './people';
import './asks.css';

type Verdict = 'done' | 'yes' | 'changes';

/** The code change an ask carries (main/team/index.mts askTeammate), as a path in the task's project. */
export function askChange(task: Pick<WorkItem, 'body'>): string | null {
  return /\]\((attachments\/[^)\s]+\.change)\)/.exec(String(task.body ?? ''))?.[1] ?? null;
}

export function AskBar({ task, owner, onHandBack, onOpenThread, onOpenChange, under = false }: {
  task: WorkItem;
  /** Only the answer, under the message that asked, which already names the thread and the change. */
  under?: boolean;
  owner: Person | null;
  onHandBack: (verdict: Verdict, words: string) => Promise<boolean>;
  onOpenThread?: () => void;
  /** Opens the change it carries, when it carries one. */
  onOpenChange?: (src: string) => void;
}) {
  const [giving, setGiving] = useState<Verdict | null>(null);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = task.ask;
  if (!ask) return null;
  const first = firstName(owner) || 'Your teammate';
  const change = onOpenChange ? askChange(task) : null;
  const back = async () => {
    if (!giving || busy) return;
    setBusy(true);
    const ok = await onHandBack(giving, words.trim());
    setBusy(false);
    if (ok) { setGiving(null); setWords(''); }
  };
  const ask4 = giving === 'changes' ? `What should ${first} change?` : `Anything ${first} should know? (optional)`;
  return (
    <section className={`ask-bar${under ? ' ask-under' : ''}`} aria-label={`What ${first} asked`}>
      {!under && <div className="ask-bar-head">
        <Face person={owner} size={22} />
        <b>{first}</b><span>{ask.kind === 'help' ? 'asked you to help' : 'asked for your review'}</span>
      </div>}
      {/* On the task's own page its message already says both. */}
      {ask.note && !onOpenThread && !under && <p className="ask-bar-note">{ask.note}</p>}
      {ask.step && !onOpenThread && !under && <blockquote className="ask-bar-step">{ask.step.length > 400 ? `${ask.step.slice(0, 400)}…` : ask.step}</blockquote>}
      {giving ? (
        <div className="ask-bar-back">
          <textarea autoFocus value={words} placeholder={ask4} aria-label={ask4} rows={2}
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void back(); } }} />
          <div className="ask-bar-acts">
            <button type="button" disabled={busy || (giving === 'changes' && !words.trim())} onClick={() => { void back(); }}>Hand back to {first}</button>
            <button type="button" className="quiet" onClick={() => { setGiving(null); setWords(''); }}>Not yet</button>
          </div>
        </div>
      ) : (
        <div className="ask-bar-acts">
          {onOpenThread && !under && <button type="button" onClick={onOpenThread}>Open {first}'s thread</button>}
          {change && !under && <button type="button" onClick={() => onOpenChange?.(change)}>View the change</button>}
          {ask.kind === 'review'
            ? <>
              <button type="button" onClick={() => setGiving('yes')}>Looks good</button>
              <button type="button" onClick={() => setGiving('changes')}>Needs changes</button>
            </>
            : <button type="button" onClick={() => setGiving('done')}>Hand back to {first}</button>}
        </div>
      )}
    </section>
  );
}
