// THE THREADS A THREAD MADE, IN LINE (w-2e8aa16f0f). One bordered row per
// thread, its title and where it stands, and the row opens it. The same list
// an agent answering in a chat shows for the tasks it opened, approved in the
// messages redesign; here it sits under a task whose agent filed threads.
//
// AND THE PRESSES THAT ANSWER ONE (w-9cf2b43110, w-554834e749). Every thread an
// agent files is a proposal waiting on you, and answering it used to mean
// leaving this thread, finding that one's own row and acting there, once per
// thread: "it ends up in my inbox with no clear next step." The next step is
// now in the row that names it.
//
// THE QUIET LIST (w-fcb5fdc2e5), chosen off four looks. The list it replaces
// stood two boxed presses on every waiting row inside an orange border, and it
// read as "the really abrupt orange button might be kind of overwhelming...
// kind of hard to process." Now:
//
//   A DOT IS WHAT A PROPOSAL LOOKS LIKE. The small accent dot before a title is
//   the one mark that says it waits on you, and every proposal carries it. There
//   is no NEEDS YOU word beside it: drawn in orange next to the orange press it
//   made two orange words in one list, "and we can't have two pieces of text in
//   orange. Otherwise it gets very confusing."
//
//   ITS ANSWERS ARE ALWAYS BESIDE IT, where the state word would stand. They
//   were drawn under the cursor only, and the proposal you were not pointing
//   at looked broken: "it should always show those options even if you're not
//   hovering over it."
//
//   DISMISS, DO HERE, NEW THREAD, with the main one at the right-hand edge:
//   "don't you think New Thread should logically be on the right?" Answers
//   hung off a row's right edge end on the one most people pick, it stands in
//   one column down the list, and the throwaway one is furthest from it. NEW
//   THREAD is in the accent, the only orange word the list shows.
//
//   DISMISS IS BACK. "I sometimes will just want to reject something." It used
//   to be left out on the grounds that ignoring a proposal is rejecting it;
//   asked for again, it is the close a proposal's own row makes, with its undo.
//
//   WHAT IS ALREADY UNDER WAY GOES GREY while proposals wait: "Once something is
//   already processed, I think we maybe gray it out to show that it's not meant
//   to get your attention. It's not a proposal."
//
//   AND NOTHING SNAPS. "Everything immediately shades... You typically want
//   those little transitions." Every hover fades (threads-made.css).
//
// AND THE COUNT LINE ANSWERS FOR THE LOT (w-fe64f35bdd). DISMISS ALL and START
// ALL stand over the rows' answers, grey so NEW THREAD stays the one orange
// word, and only where two or more proposals wait. They are presses naming the
// count, never a key: a key once approved on someone's behalf (App.tsx `resolve`).
//
// THE ROW IS A DIV, NOT A BUTTON: no browser accepts a button inside a button.
// The press to open is its own control filling the row, so the row looks
// identical and the presses can never be mistaken for each other.
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

export const START_NEW = 'New thread';
export const DO_HERE = 'Do here';
export const DISMISS = 'Dismiss';
export const START_ALL = 'Start all';
export const DISMISS_ALL = 'Dismiss all';

/** "2 proposals waiting on you". */
export const waitingWords = (n: number): string => `${n} proposal${n === 1 ? '' : 's'} waiting on you`;

export function ThreadsMade({ rows, onOpen, onApprove, onHere, onDismiss, onStartAll, onDismissAll, label }: {
  rows: MadeRow[];
  onOpen: (id: string) => void;
  /** Start it as its own thread: the approval that has always been here. */
  onApprove?: (id: string) => void;
  /**
   * Do it in this thread instead: sends the proposal back to the thread that
   * filed it and closes it (`doItHereWrites`, ../threads-made.ts).
   */
  onHere?: (id: string) => void;
  /** Drop it: it closes and never runs. */
  onDismiss?: (id: string) => void;
  /** Start every proposal in this list, by id, in the order drawn. */
  onStartAll?: (ids: string[]) => void;
  /** Drop every proposal in this list. */
  onDismissAll?: (ids: string[]) => void;
  label?: string;
}) {
  if (!rows.length) return null;
  // Only a row this list can actually answer counts, so a list drawn without
  // the press, or one holding a review, stays quiet. The waiting rows come
  // first (w-d2744c6daa).
  const canPress = (r: MadeRow) => !!onApprove && !!r.approve;
  const asks = rows.filter(canPress);
  const waiting = asks.length > 0;
  const shown = waiting ? [...asks, ...rows.filter((r) => !canPress(r))] : rows;
  const heading = waiting ? waitingWords(asks.length) : label;
  const ids = asks.map((r) => r.id);
  const all = asks.length > 1 && !!onStartAll;
  return (
    <div className={waiting ? 'made made-waiting' : 'made'}>
      {heading && (
        <div className="made-label">
          <span>{heading}</span>
          {all && (
            <div className="made-acts made-all">
              {onDismissAll && <button type="button" className="made-all-dismiss" aria-label={`${DISMISS_ALL} ${asks.length}`} title={`${DISMISS_ALL} ${asks.length}: none of them will run`} onClick={() => onDismissAll(ids)}>{DISMISS_ALL}</button>}
              <button type="button" className="made-all-start" aria-label={`${START_ALL} ${asks.length} as new threads`} title={`${START_ALL} ${asks.length} as new threads`} onClick={() => onStartAll!(ids)}>{START_ALL}</button>
            </div>
          )}
        </div>
      )}
      <div className="made-list">
        {shown.map((r) => {
          const press = canPress(r);
          const cls = press ? 'made-row made-ask' : waiting ? 'made-row made-quiet' : 'made-row';
          return (
            <div className={cls} key={r.id}>
              {/* The word stays INSIDE the press that opens the thread, so on
                  every row that carries no answer the whole width of the row
                  is still the way in. */}
              <button type="button" className="made-open" onClick={() => onOpen(r.id)}>
                {press && <span className="made-dot" />}
                <span className="made-title">{r.title}</span>
                {!press && <span className={`made-state ${r.state ?? ''}`}>{stateWord(r.state)}</span>}
              </button>
              {/* NAMED WITH THE THREAD EACH ONE IS ABOUT. Several rows each say
                  the same words, so the bare words tell a screen reader, and a
                  hovering cursor, nothing about which proposal it is. */}
              {press && (
                <div className="made-acts">
                  {onDismiss && <button type="button" className="made-dismiss" aria-label={`${DISMISS}: ${r.title}`} title={`${DISMISS}: it will not run`} onClick={() => onDismiss(r.id)}>{DISMISS}</button>}
                  {onHere && <button type="button" className="made-here" aria-label={`Do in this thread: ${r.title}`} title={`Do in this thread: ${r.title}`} onClick={() => onHere(r.id)}>{DO_HERE}</button>}
                  <button type="button" className="made-approve" aria-label={`Start new thread: ${r.title}`} title={`Start new thread: ${r.title}`} onClick={() => onApprove!(r.id)}>{START_NEW}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
