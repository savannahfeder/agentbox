// A LONG MESSAGE FROM A TEAMMATE FOLDS (w-2e8aa16f0f). The first real one was
// six findings and a sign-off in one message, a full screen of text, so the
// next person's reply sat a scroll away from the message it answered. Past the
// fold it fades out and says how to read the rest; one press opens it.
//
// EXCEPT THE NEWEST (w-286ad4e81c): folded, it took a click to read at all.
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

/**
 * `kept` is a message that is, or was while on screen, the newest: it stays
 * whole when a newer one lands, so the words being read never fold away.
 */
export function foldOf({ tall, kept, open }: { tall: boolean; kept: boolean; open: boolean }): 'whole' | 'shut' | 'open' {
  if (!tall || kept) return 'whole';
  return open ? 'open' : 'shut';
}

// `lines` is for a message a person wrote: a newline they typed is a new line,
// which markdown on its own would join into one (w-0d55a2b160).
export function ChatFold({ children, lines = false, newest = false }: { children: ReactNode; lines?: boolean; newest?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  const [wasNewest, setWasNewest] = useState(newest);
  useEffect(() => { if (newest) setWasNewest(true); }, [newest]);
  // scrollHeight is the whole message's height even while it is folded.
  useBeforePaint(() => {
    const el = box.current;
    if (el) setTall(el.scrollHeight > WORTH_FOLDING_PX);
  }, [children]);
  const fold = foldOf({ tall, kept: newest || wasNewest, open });
  return (
    <>
      <div ref={box} className={`msg-body${lines ? ' chat-lines' : ''}${fold === 'shut' ? ' chat-folded' : ''}`}>{children}</div>
      {fold !== 'whole' && (
        <button type="button" className="chat-more" onClick={() => setOpen((was) => !was)}>
          {fold === 'open' ? 'Show less' : 'Show the whole message'}
        </button>
      )}
    </>
  );
}
