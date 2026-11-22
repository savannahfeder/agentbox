// WHAT A TEAMMATE ASKED OF YOU ON THEIR THREAD, as the newest message on it:
// their note, the step they picked, and handing it back with your answer. On
// the task's own page the same buttons sit under the message that asked
// (`AskActions`), since that message already says the rest.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Person, WorkItem } from '../types';
import { Face, firstName } from './people';
import { clock, dayHeading } from '../thread-history';
import './asks.css';

type Verdict = 'done' | 'yes' | 'changes';

/** The thread bar's mark for a code change (ThreadMenu's CodeMark). */
const CodeMark = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8.5 7-5 5 5 5" /><path d="m15.5 7 5 5-5 5" /></svg>
);

/** The code change an ask carries (main/team/index.mts askTeammate), as a path in the task's project. */
export function askChange(task: Pick<WorkItem, 'body'>): string | null {
  return /\]\((attachments\/[^)\s]+\.change)\)/.exec(String(task.body ?? ''))?.[1] ?? null;
}

export function AskBar({ task, owner, onHandBack, onOpenThread, onOpenChange, under = false, answeredBelow = false, className = '', children }: {
  task: WorkItem;
  className?: string;
  /** What the ask hands over (the thread's summary, its pictures and files), between the words and the answers. */
  children?: ReactNode;
  /** The page's own box below answers it, so the bar keeps only its links. */
  answeredBelow?: boolean;
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
  // The ask is often the last thing on the page, so its box would open under the window's edge.
  const backBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (giving) backBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [giving]);
  const ask = task.ask;
  if (!ask) return null;
  const first = firstName(owner) || 'Your teammate';
  const change = onOpenChange ? askChange(task) : null;
  const back = async () => {
    // The same rule as its button: changes asked for say what they are, whichever way it is sent.
    if (!giving || busy || (giving === 'changes' && !words.trim())) return;
    setBusy(true);
    const ok = await onHandBack(giving, words.trim());
    setBusy(false);
    if (ok) { setGiving(null); setWords(''); }
  };
  const ask4 = giving === 'changes' ? `What should ${first} change?` : `Anything ${first} should know? (optional)`;
  return (
    <section className={`ask-bar${under ? ' ask-under' : ''}${className ? ` ${className}` : ''}`} aria-label={`What ${first} asked`}>
      {!under && <div className="ask-bar-head">
        <Face person={owner} size={22} />
        <b>{first}</b><span>{ask.kind === 'help' ? 'asked you to help' : 'asked for your review'}</span>
        {task.createdAt ? <span className="ask-bar-when">{`${dayHeading(task.createdAt)} ${clock(task.createdAt)}`}</span> : null}
      </div>}
      {/* On the task's own page its message already says both. */}
      {ask.note && !onOpenThread && !under && <p className="ask-bar-note">{ask.note}</p>}
      {ask.step && !onOpenThread && !under && <blockquote className="ask-bar-step">{ask.step.length > 400 ? `${ask.step.slice(0, 400)}…` : ask.step}</blockquote>}
      {children}
      {giving ? (
        <div className="ask-bar-back" ref={backBox}>
          <textarea autoFocus value={words} placeholder={ask4} aria-label={ask4} rows={2}
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void back(); } }} />
          <div className="ask-bar-acts">
            {/* Named by what it sends: "Looks good" alone left people thinking it had gone. */}
            <button type="button" disabled={busy || (giving === 'changes' && !words.trim())} onClick={() => { void back(); }}>{giving === 'yes' ? `Send “Looks good” to ${first}` : giving === 'changes' ? `Send changes to ${first}` : `Hand back to ${first}`}</button>
            <button type="button" className="quiet" onClick={() => { setGiving(null); setWords(''); }}>Cancel</button>
          </div>
        </div>
      ) : (onOpenThread || (change && !under) || !answeredBelow) && (
        <div className="ask-bar-acts">
          {onOpenThread && <button type="button" onClick={onOpenThread}>Open {first}'s thread</button>}
          {change && !under && <button type="button" className="ask-bar-change" onClick={() => onOpenChange?.(change)}><CodeMark />View the change</button>}
          {/* Under the ask on its own page, the reply box below carries the answer (TeamRouteStrip). */}
          {answeredBelow || under ? null : ask.kind === 'review'
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
