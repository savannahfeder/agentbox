// THE OPTIONS AN AGENT OFFERED, ON THE TURN IT OFFERED THEM ON.
//
// This was a strip docked above the reply box. Said 2026-10-05: "right
// now all my chats have this stuck at the bottom. it should instead occur at
// the end of the turn/message where it occured, not stuck at the bottom. I'd
// want to see it on the turn where the agent is, let's say, 'return to me.'
// Once I've seen it as a user, I don't really want to see it continuously.
// It's been processed."
//
// It is the same control and the same classes, so it still reads as the
// app's one option strip, and three things the dock made necessary are gone
// with the dock:
//
//   THE QUESTION AS A HEADING. The heading existed because the strip was
//   docked and the sentence it answered scrolled off the top of the screen
//   (`askLine`). On the turn itself the sentence is the paragraph directly
//   above these rows, so a heading would print it twice, inches apart.
//
//   THE TWO-LINE CLAMP AND THE CARD THAT OPENED OVER IT. The clamp was there
//   because a docked strip has a fixed slice of the pane and a long option
//   would have pushed the message up the screen. In the stream the option is
//   just more conversation, so it reads whole and there is nothing to peek at.
//
//   THE CHEVRON THAT FOLDED IT AWAY. Folding was the only way to get a
//   permanent fixture out of the way. It scrolls away on its own now, which is
//   what was asked for.
//
// AND IT STAYS WHEN IT IS ANSWERED, which is the other half of the row. A
// spent offer used to vanish, taking with it the record of what was on the
// table at the moment it was answered. It stands in place as a record
// instead: not pressable, with the one that was pressed marked. "It's been
// processed" is a thing the page should be able to show you, not a thing it
// should go quiet about.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useRef } from 'react';
import type { Offer } from '../offer-in-thread';

export function OptionBlock({ offer, selected, onPick }: {
  offer: Offer;
  /** Which row the arrow keys are standing on (App.tsx holds it). */
  selected?: number | null;
  onPick?: (n: number) => void;
}) {
  // Arrowing onto an option that is off the screen brings it into view. It
  // reads better here than it did on the dock: the whole conversation scrolls,
  // so the message the option answers comes with it.
  const sel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (offer.live && selected != null) sel.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, offer.live]);

  const words = (text: string) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>
      {text.replace(/\s*\(recommended\)/i, '')}
    </ReactMarkdown>
  );

  if (!offer.live) {
    // NO LABEL OVER IT, because the thread under it is already saying this.
    // Drawn with one, the screen read "YOU PICKED OPTION 2", then the option
    // marked `yours`, then the app's own action line, "Picked Take the extra
    // beat off the rare card first", within 150px of each other: the same fact
    // three times. What a spent offer has to show is WHAT WAS ON THE TABLE,
    // which is the list, and which one was taken, which is the mark.
    return (
      <div className="opt-strip opt-strip-inline is-settled">
        {offer.options.map((o) => (
          <div key={o.n} className={`opt-row ${o.n === offer.picked ? 'is-picked' : ''}`}>
            <span className="opt-key">{o.n}</span>
            <span className="opt-text">{words(o.text)}</span>
            {o.n === offer.picked && <span className="opt-rec">yours</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="opt-strip opt-strip-inline">
      {offer.options.map((o) => (
        <button
          key={o.n}
          ref={o.n === selected ? sel : undefined}
          className={`opt-row ${o.n === selected ? 'selected' : ''}`}
          onClick={() => onPick?.(o.n)}
        >
          <span className="opt-key">{o.n}</span>
          <span className="opt-text">{words(o.text)}</span>
          {o.n === selected
            ? <span className="opt-rec">↵ send</span>
            : o.recommended && <span className="opt-rec">recommended</span>}
        </button>
      ))}
    </div>
  );
}
