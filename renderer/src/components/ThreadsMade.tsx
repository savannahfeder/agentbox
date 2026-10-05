// THE THREADS A THREAD MADE, IN LINE (w-2e8aa16f0f). One bordered row per
// thread, its title and where it stands, and the row opens it. The same list
// an agent answering in a chat shows for the tasks it opened, approved in the
// messages redesign; here it sits under a task whose agent filed threads.
//
// AND THE PRESS THAT STARTS ONE (w-9cf2b43110). Every thread an agent files is
// a proposal waiting on you, and approving it used to mean leaving this thread,
// finding that one's own row and acting there, once per thread: "it ends up in
// my inbox with no clear next step. feels confusing, like it wastes my time."
// The next step is now in the row that names it.
//
// ONE ROW AT A TIME. There is no press that approves the lot, and that is the
// decision rather than an omission: three proposals are three decisions, and
// this app has already been burned once by a key that approved on her behalf
// (the E-key history in App.tsx's `resolve`). What each row carries is its own.
//
// THE ROW IS A DIV, NOT A BUTTON, which it was until the press arrived: no
// browser accepts a button inside a button. The press to open is its own
// control filling the row, so the row looks identical and the two presses can
// never be mistaken for each other.
import type { ThreadStateWord } from '../types';
import { stateWord } from '../threads-made';
import './threads-made.css';

export interface MadeRow {
  id: string;
  title: string;
  state: ThreadStateWord | null;
  /** Waiting on a press from you (`approvableFiled`, ../threads-made.ts). */
  approve?: boolean;
}

export function ThreadsMade({ rows, onOpen, onApprove, label }: {
  rows: MadeRow[];
  onOpen: (id: string) => void;
  onApprove?: (id: string) => void;
  label?: string;
}) {
  if (!rows.length) return null;
  // THE STATE WORDS STAY IN ONE COLUMN. Photographed with four filed threads,
  // two of them approvable: the two rows carrying a button pushed their
  // "NEEDS YOU" 104px left of the two that did not, and the straight right-hand
  // edge is most of what makes this list read as a table. So where ANY row has
  // a press, every row keeps the room for one. A list with no press anywhere
  // reserves nothing and is drawn exactly as it was before.
  //
  // The spacer is the button itself, hidden, rather than a width written down
  // twice: a number copied into the CSS would go stale the first time the word
  // on the button or its padding changed, and the symptom would be a column
  // one pixel out that nobody would think to look for.
  const anyApprove = !!onApprove && rows.some((r) => r.approve);
  return (
    <div className="made">
      {label && <div className="made-label">{label}</div>}
      <div className="made-list">
        {rows.map((r) => (
          <div className="made-row" key={r.id}>
            <button type="button" className="made-open" onClick={() => onOpen(r.id)}>
              <span className="made-title">{r.title}</span>
              <span className={`made-state ${r.state ?? ''}`}>{stateWord(r.state)}</span>
            </button>
            {/* NAMED WITH THE THREAD IT WOULD START. Several rows in a list each
                say "Approve", so the bare word tells a screen reader, and a
                hovering cursor, nothing about which proposal it is. */}
            {onApprove && r.approve ? (
              <button
                type="button"
                className="made-approve"
                aria-label={`Approve: ${r.title}`}
                title={`Approve: ${r.title}`}
                onClick={() => onApprove(r.id)}
              >
                Approve
              </button>
            ) : anyApprove && <span className="made-approve made-approve-room" aria-hidden="true">Approve</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
