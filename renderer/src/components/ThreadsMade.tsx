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

export function ThreadsMade({ rows, onOpen, onApprove, onReject, label }: {
  rows: MadeRow[];
  onOpen: (id: string) => void;
  onApprove?: (id: string) => void;
  /**
   * AND THE OTHER HALF OF THE DECISION (w-9cf2b43110). A proposal nobody
   * answers waits in Later and brings this thread back a day later; rejecting
   * it is what settles it and stops the asking. Drawn only under the cursor,
   * because no is the rarer press and the row should read as one offer.
   */
  onReject?: (id: string) => void;
  label?: string;
}) {
  if (!rows.length) return null;
  // WHILE ANY OF THEM WAITS FOR A YES, THE LIST SAYS SO (w-d2744c6daa): "I
  // often miss these filed tasks... they're not very visible and it's really
  // easy to skip them." One had waited 22 hours under a closed thread. Chosen
  // off seven rounds of drawings: the list's outer border goes orange, the
  // label reads "Still waiting on you" in white, and the waiting rows come
  // first. Only a row this list can actually answer counts, so a list drawn
  // without the press, or one holding a review, stays quiet.
  const canPress = (r: MadeRow) => !!onApprove && !!r.approve;
  const waiting = rows.some(canPress);
  const shown = waiting ? [...rows.filter(canPress), ...rows.filter((r) => !canPress(r))] : rows;
  // THE PRESS IS THE STATE WORD, NOT A SECOND THING BESIDE IT (2026-10-05).
  //
  // It first shipped as a button to the right of the word, which meant every
  // row without one had to hold the room for one so the column stayed straight,
  // and the words ended 104px short of the right-hand edge: "look very
  // unattractive. was more thinking in the place of needs you etc... Right now
  // this button looks a little weird because of how much space there is."
  //
  // So a row waiting on you says APPROVE where it would have said NEEDS YOU.
  // Nothing is reserved, nothing is said twice, and every row — word or press —
  // ends at the same right-hand edge. The press wears the app's own square
  // capitals in the accent, chosen off four drawings.
  return (
    <div className={waiting ? 'made made-waiting' : 'made'}>
      {(waiting || label) && <div className="made-label">{waiting ? 'Still waiting on you' : label}</div>}
      <div className="made-list">
        {shown.map((r) => {
          const press = canPress(r);
          return (
            <div className="made-row" key={r.id}>
              {/* The word stays INSIDE the press that opens the thread, so on
                  every row that carries no Approve the whole width of the row
                  is still the way in. */}
              <button type="button" className="made-open" onClick={() => onOpen(r.id)}>
                <span className="made-title">{r.title}</span>
                {!press && <span className={`made-state ${r.state ?? ''}`}>{stateWord(r.state)}</span>}
              </button>
              {/* NAMED WITH THE THREAD IT WOULD START. Several rows in a list
                  each say "Approve", so the bare word tells a screen reader, and
                  a hovering cursor, nothing about which proposal it is. */}
              {press && onReject && (
                <button
                  type="button"
                  className="made-reject"
                  aria-label={`Reject: ${r.title}`}
                  title={`Reject: ${r.title}`}
                  onClick={() => onReject(r.id)}
                >
                  No
                </button>
              )}
              {press && (
                <button
                  type="button"
                  className="made-approve"
                  aria-label={`Approve: ${r.title}`}
                  title={`Approve: ${r.title}`}
                  onClick={() => onApprove!(r.id)}
                >
                  Approve
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
