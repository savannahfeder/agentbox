// WHAT A TEAMMATE ASKED OF YOU ON THEIR THREAD, over that thread: their note,
// the step they picked, and handing it back with your answer. On the task's own
// page it also opens their thread.
import { useState } from 'react';
import type { Person, WorkItem } from '../types';
import { Face, firstName } from './people';
import './asks.css';

type Verdict = 'done' | 'yes' | 'changes';

export function AskBar({ task, owner, onHandBack, onOpenThread }: {
  task: WorkItem;
  owner: Person | null;
  onHandBack: (verdict: Verdict, words: string) => Promise<boolean>;
  onOpenThread?: () => void;
}) {
  const [giving, setGiving] = useState<Verdict | null>(null);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = task.ask;
  if (!ask) return null;
  const first = firstName(owner) || 'Your teammate';
  const back = async () => {
    if (!giving || busy) return;
    setBusy(true);
    const ok = await onHandBack(giving, words.trim());
    setBusy(false);
    if (ok) { setGiving(null); setWords(''); }
  };
  const ask4 = giving === 'changes' ? `What should ${first} change?` : `Anything ${first} should know? (optional)`;
  return (
    <section className="ask-bar" aria-label={`What ${first} asked`}>
      <div className="ask-bar-head">
        <Face person={owner} size={24} />
        <span><b>{first}</b> {ask.kind === 'help' ? 'asked you to help on this thread.' : 'asked for your review.'}</span>
      </div>
      {/* On the task's own page its message already says both. */}
      {ask.note && !onOpenThread && <p className="ask-bar-note">{ask.note}</p>}
      {ask.step && !onOpenThread && <blockquote className="ask-bar-step">{ask.step.length > 400 ? `${ask.step.slice(0, 400)}…` : ask.step}</blockquote>}
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
          {onOpenThread && <button type="button" onClick={onOpenThread}>Open {first}'s thread</button>}
          {ask.kind === 'review'
            ? <>
              <button type="button" className={onOpenThread ? 'quiet' : undefined} onClick={() => setGiving('yes')}>Looks good</button>
              <button type="button" className="quiet" onClick={() => setGiving('changes')}>Needs changes</button>
            </>
            : <button type="button" className={onOpenThread ? 'quiet' : undefined} onClick={() => setGiving('done')}>Hand back to {first}</button>}
        </div>
      )}
    </section>
  );
}
