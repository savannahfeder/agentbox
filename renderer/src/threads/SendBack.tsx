// SENDING A REVIEW BACK, on the reviewer's copy of the owner's thread. The
// verdict goes as their comment (shared/review-sent-back.mts).
import { useState } from 'react';
import { personWait } from '../../../shared/thread-waits.mts';
import { notesWord, sentBackWords, type Verdict } from '../../../shared/review-sent-back.mts';

/** The card's owner waits on this person to review it and send it back. */
export const reviewIsMine = (card: { blockedBy?: readonly { id: string; want?: string }[] } | null | undefined, me: string | null): boolean =>
  !!me && !!card?.blockedBy?.some((b) => b.id === personWait(me) && b.want === 'review');

export function sentBackSaid(verdict: Verdict, notes: number, owner: string): string {
  if (verdict === 'approved') return `Approved and sent back to ${owner}`;
  return notes > 0 ? `Sent back to ${owner} with ${notesWord(notes)}` : `Sent back to ${owner}`;
}

export function SendBack({ owner, notes, open, onSend }: {
  owner: string;
  /** Your open notes on the thread's files, which go back with it. */
  notes: number;
  open: boolean;
  onSend: (words: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  if (sent) return <p className="tp-sent-back" role="status">{sent}</p>;
  if (!open) return null;
  const send = async (verdict: Verdict) => {
    setBusy(true);
    const ok = await onSend(sentBackWords({ verdict, notes, note }));
    setBusy(false);
    if (ok) setSent(sentBackSaid(verdict, notes, owner));
  };
  return (
    <form className="tp-send-back" aria-label={`Send back to ${owner}`} onSubmit={(e) => { e.preventDefault(); void send('approved'); }}>
      <textarea value={note} rows={2} placeholder={`Notes for ${owner}`} aria-label={`Notes for ${owner}`} onChange={(e) => setNote(e.target.value)} />
      <div className="tp-send-back-acts">
        <button type="submit" className="is-primary" disabled={busy}>Approve</button>
        <button type="button" disabled={busy || (!notes && !note.trim())} onClick={() => void send('changes')}>
          {notes ? `Send back with ${notesWord(notes)}` : 'Send back with notes'}
        </button>
      </div>
    </form>
  );
}
