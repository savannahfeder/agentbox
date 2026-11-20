// SENDING A REVIEW BACK, on the reviewer's copy of the owner's thread: the
// thread's reply box, at its foot, with the verdict as its actions. The
// verdict goes as their comment (shared/review-sent-back.mts).
import { useState, type ReactNode } from 'react';
import { personWait } from '../../../shared/thread-waits.mts';
import { notesWord, sentBackWords, type Verdict } from '../../../shared/review-sent-back.mts';

type Card = { blockedBy?: readonly { id: string; want?: string; note?: string }[] } | null | undefined;

/** The owner's review ask to this person, while the thread waits on it: its note, or ''. */
export function reviewAskedOf(card: Card, me: string | null): { note: string } | null {
  const wait = me ? card?.blockedBy?.find((b) => b.id === personWait(me) && b.want === 'review') : undefined;
  return wait ? { note: wait.note ?? '' } : null;
}

export const reviewIsMine = (card: Card, me: string | null): boolean => !!reviewAskedOf(card, me);

/** The ask, as the reviewer reads it. */
export const reviewAskWords = (owner: string, note: string): string =>
  note.trim() ? `${owner} asked you to review and send back: ${note.trim()}` : `${owner} asked you to review and send back`;

export function sentBackSaid(verdict: Verdict, notes: number, owner: string): string {
  if (verdict === 'approved') return `Approved and sent back to ${owner}`;
  return notes > 0 ? `Sent back to ${owner} with ${notesWord(notes)}` : `Sent back to ${owner}`;
}

export function SendBack({ owner, note: asked, notes, onSend }: {
  owner: string;
  /** The owner's note with the ask. */
  note: string;
  /** Your open notes on the thread's files, which go back with it. */
  notes: number;
  face?: ReactNode;
  /** Sends the verdict's comment, with the words that say it went. */
  onSend: (words: string, said: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (verdict: Verdict) => {
    setBusy(true);
    const ok = await onSend(sentBackWords({ verdict, notes, note }), sentBackSaid(verdict, notes, owner));
    setBusy(false);
    if (ok) setNote('');
  };
  return (
    <form className="tp-dock-form tp-send-back" aria-label={`Send back to ${owner}`} title={reviewAskWords(owner, asked)} onSubmit={(e) => { e.preventDefault(); void send('approved'); }}>
      <textarea className="dock-input" value={note} rows={1} placeholder={`Notes for ${owner}`} aria-label={`Notes for ${owner}`} onChange={(e) => setNote(e.target.value)} />
      <div className="compose-sentence dock-bar">
        <button type="button" className="ts-done tp-send-back-notes" disabled={busy || (!notes && !note.trim())} onClick={() => void send('changes')}>
          {notes ? `Send back with ${notesWord(notes)}` : 'Send back with notes'}
        </button>
        <span className="dock-send-pair solo">
          <button type="submit" className="dock-send" disabled={busy}>Approve</button>
        </span>
      </div>
    </form>
  );
}
