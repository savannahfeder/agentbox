// An opened repeating task: her instruction, every run of it, and the box she
// changes it in.
//
// The run log is what makes the clean-run suppression honest. A run that
// finished quietly never reaches her inbox, so this is the one place it can
// still be seen, and "did it run, was it clean" is one click rather than a row
// every morning.
//
// Its own file rather than a branch inside Focus, because Focus is about a work
// item's conversation (answers, options, replies, blockers) and a rule has none
// of that: it has a schedule, a history and one standing instruction.
//
// THE BOX, 2026-08-21.There was no way in. The pane drew her instruction as
// unformatted text, a run log, and one button that ends the whole thing, and
// that was all of it. What it has now is the same docked box a task has, opened
// the same way, by R or by clicking the line at the foot.
//
// It holds ONE message, not a title and a body. Those two are a split this app
// made when the thing was typed (`message-split.ts`), and handing back two
// fields nobody filled in is a second thing to learn for nothing. The user edits
// the message; the label is derived again on save, which is also the only
// reason the Scheduled row cannot go stale while the instruction moves.
//
// AND THE INSTRUCTION IS THE BRIEF. `main/repeats.mjs` serves each run with
// `rule.body ?? rule.title`, so what is in this box is literally what tomorrow
// morning's session is told. The line under it says so in those words.

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RepeatRule, WorkItem } from '../types';
import { ago, dayLabel, stamp } from '../format';
import { joinMessage } from '../message-split';
import { isCleanRun, nextRunAt, periodKey, ruleIdOf } from '../../../shared/repeats.mjs';

export interface RunRow {
  id: string;
  when: string;
  what: string;
  news: boolean;
  late: string | null;
}

// Every run of this rule, newest first.
//
// Times come from the occurrence's own createdAt and the write that closed it,
// never from updatedAt, which every accepted line advances including heartbeats.
export function runLog(rule: RepeatRule, items: WorkItem[], now = Date.now()): RunRow[] {
  return items
    .filter((i) => ruleIdOf(i) === rule.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((run) => {
      const clean = isCleanRun(run);
      const running = run.status === 'open' || run.status === 'claimed';
      return {
        id: run.id,
        when: stamp(run.createdAt, now),
        what: running ? 'running' : clean ? 'clean' : (run.result || 'finished without saying anything'),
        news: !running && !clean,
        late: lateness(rule, run, now),
      };
    });
}

// A run says it was late, and does not guess why. Late can equally mean the
// laptop was shut, the fleet was paused, capacity was full, or an append
// failed, and the app cannot tell those apart.
function lateness(rule: RepeatRule, run: WorkItem, now: number): string | null {
  const key = periodKey(rule, run.createdAt);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const [h, min] = rule.at.split(':').map(Number);
  const boundary = new Date(y, m - 1, d, h, min, 0, 0).getTime();
  const lateBy = run.createdAt - boundary;
  if (lateBy < 15 * 60_000) return null;
  return `ran ${ago(boundary, run.createdAt)} late`;
}

// The same wording the Scheduled row uses, because the two are read seconds
// apart and "next AUG 13" against "9:00 AM tomorrow" reads as two facts.
function when(ts: number): string {
  return `${new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ${dayLabel(ts).toLowerCase()}`;
}

export function RepeatFocus({ rule, items, editing, onClose, onEdit, onEditClose, onSave, onEnd }: {
  rule: RepeatRule;
  items: WorkItem[];
  editing: boolean;
  onClose: () => void;
  onEdit: () => void;
  onEditClose: () => void;
  onSave: (message: string) => void;
  onEnd: () => void;
}) {
  const runs = runLog(rule, items);
  const next = nextRunAt(rule);
  const at = new Date(`2026-01-01T${rule.at}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const message = joinMessage(rule);

  // THE SAME SKELETON A TASK HAS: a scrolling sheet with the box docked under
  // it. Drawn as a bare `.focus` the box sat wherever the run log happened to
  // end, which on a short rule is halfway up an empty screen and on a long one
  // is below the fold. `.focus-pane` is the flex column that pins it.
  return (
    <div className="focus-pane">
    <div className="focus-scroll">
    <div className="focus">
      <div className="focus-head">
        {/* It stays in this header's margin because this page has no pane of its own to pin
           against and the one that had to move was the one on a task.
         */}
        <button className="back-esc in-head" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
          <span>esc</span>
        </button>
        <div>
          <div className="focus-title">{rule.title}</div>
          <div className="focus-meta">
            <span>{rule.productName}</span>
            <span>·</span>
            <span>daily at {at}</span>
            {next && <><span>·</span><span>next {when(next)}</span></>}
          </div>
        </div>
      </div>

      {/* THE SAME RENDERER EVERY OTHER BODY IN THIS APP GETS. It used to be
          `<p>{rule.body}</p>`, one paragraph of raw text, so a task dictated
          in one breath arrived as an unbroken wall with its own list markers
          sitting inline. */}
      {rule.body && (
        <div className="focus-body">
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rule.body}</ReactMarkdown>
          </div>
        </div>
      )}

      <div className="runs">
        {runs.length === 0 && <div className="run"><span className="run-what">It has not run yet.</span></div>}
        {runs.map((run) => (
          <div className="run" key={run.id}>
            <span className="run-when">{run.when}</span>
            <span className={run.news ? 'run-what news' : 'run-what'}>
              {run.what}{run.late ? ` · ${run.late}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* The honest boundary of this view: runs are ordinary work items, so the
          oldest eventually leave the store's trailing window. The rule and its
          schedule never do.

          IT NO LONGER SAYS E ENDS THIS. It said that and it was not true. The
          key handler had no branch for this screen, so E fell through to the
          list behind the pane, and in the Scheduled view E means "run it again"
          — measured 2026-08-21 on the built app, where pressing E here raised
          the toast "Running again" and un-deferred whichever scheduled task was
          selected underneath. Ending a repeating task is a deliberate click,
          and nothing on this screen advertises a key that does something else
          to something else. */}
      <div className="runs-note">The runs still on file.</div>
    </div>
    </div>

      <div className="focus-dock">
        <div className="focus-dock-inner">
          <div className="dock-card">
            {editing
              ? <RuleComposer message={message} onSave={onSave} onClose={onEditClose} />
              : (
                <button className="dock-pill" onClick={onEdit}>
                  <span className="dock-pill-text">Change what it does…</span>
                  <span className="dock-pill-key"><kbd>R</kbd></span>
                </button>
              )}
          </div>
          {/* ENDING IT IS NOT THE PRIMARY ACT ON THIS SCREEN. It wore
              `.dock-send`, the app's send button, which made the one loud
              control on an opened repeating task the one that destroys it. */}
          <button className="rule-end" onClick={onEnd}>End this repeating task</button>
        </div>
      </div>
    </div>
  );
}

// The box. Deliberately not `DockComposer`: that one is a work item's reply and
// carries drafts, attachments, a priority tag and a schedule tag, none of which
// a rule has anywhere to put. It wears the same classes so it is the same box
// to look at and to use, and it does the one thing a rule needs.
function RuleComposer({ message, onSave, onClose }: {
  message: string;
  onSave: (message: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(message);
  const ref = useRef<HTMLTextAreaElement>(null);
  // OPEN AT THE END OF WHAT IS ALREADY THERE. The box is for adding to the
  // instruction, and adding is typing at the end, so the caret starts there rather than
  // selecting the whole instruction, which one key would then wipe.
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    box.scrollTop = box.scrollHeight;
  }, []);
  const changed = text.trim() !== message.trim();
  const save = () => { if (changed && text.trim()) onSave(text.trim()); };
  return (
    <>
      <textarea
        className="dock-input rule-input"
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What should it do every time?"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }}
      />
      <div className="compose-sentence">
        <span className="compose-clauses">
          {/* WHAT THE BOX ACTUALLY IS, in the app's own terms. A run is briefed
              with this text and nothing else (`main/repeats.mjs`), so the
              sentence can say it plainly instead of describing a field. */}
          <span className="dim">Every run after this one reads this.</span>
        </span>
        <button
          className="dock-send"
          onClick={save}
          disabled={!changed || !text.trim()}
          title="Save · ⌘↵"
        >Save <kbd>⌘↵</kbd></button>
      </div>
    </>
  );
}
