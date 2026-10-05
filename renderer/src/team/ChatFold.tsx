// A LONG MESSAGE FROM A TEAMMATE FOLDS (w-2e8aa16f0f). The first real one was
// six findings and a sign-off in one message, a full screen of text, so the
// next person's reply sat a scroll away from the message it answered. Past the
// fold it fades out and says how to read the rest; one press opens it.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './chat.css';

// Roughly fourteen lines at the message size. A message only a little longer
// than this is not folded at all: hiding three lines behind a button costs
// more than reading them.
const FOLD_PX = 340;
const WORTH_FOLDING_PX = FOLD_PX + 90;

// Before the frame is drawn in the app; a plain effect where there is no window
// (the tests draw the thread to a string). Same as threads/Pages.tsx.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ChatFold({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useBeforePaint(() => {
    const el = box.current;
    if (el && !open) setLong(el.scrollHeight > WORTH_FOLDING_PX);
  }, [children, open]);
  return (
    <>
      <div ref={box} className={`msg-body${long && !open ? ' chat-folded' : ''}`}>{children}</div>
      {long && (
        <button type="button" className="chat-more" onClick={() => setOpen((was) => !was)}>
          {open ? 'Show less' : 'Show the whole message'}
        </button>
      )}
    </>
  );
}
