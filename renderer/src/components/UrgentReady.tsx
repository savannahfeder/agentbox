// The urgent thread that arrived while another was open, named in the top bar
// until it is opened, closed, its time runs out, or this thread is left.
// Pressing it, or O, opens it.
//
// The mark's own animation is its clock, so the CSS pausing it under the
// pointer pauses the close.
import type { AnimationEvent } from 'react';
import { rowTitle } from '../list-rules';
import type { WorkItem } from '../types';

export const URGENT_SHOWN_MS = 20_000;

export function UrgentReady({ row, onOpen, onClose }: { row: WorkItem; onOpen: () => void; onClose: () => void }) {
  const ended = (e: AnimationEvent) => { if (e.animationName === 'ur-goes') onClose(); };
  return (
    <div className="ur" style={{ animationDuration: `${URGENT_SHOWN_MS}ms` }} onAnimationEnd={ended}>
      <button type="button" className="ur-open" onClick={onOpen}>
        <span className="ur-dot" /><span className="ur-word">Urgent</span><span className="ur-title">{rowTitle(row)}</span><kbd className="ur-kbd">O</kbd>
      </button>
      <button type="button" className="ur-close" aria-label="Close" onClick={onClose}>
        <svg width="6" height="6" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1 L7 7 M7 1 L1 7" /></svg>
      </button>
    </div>
  );
}
