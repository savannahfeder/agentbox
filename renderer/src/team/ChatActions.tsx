// WHAT YOU CAN DO TO ONE MESSAGE IN A CHAT, and what other people already did
// to it. Drawing A of the messages redesign (w-2e8aa16f0f): small square chips
// under the message, and, on pointing at it, a quiet sharp bar at its top
// corner. Round one came back as "no colour, no rounded corners", so everything
// here is the app's own materials at a square edge and nothing is tinted.
//
// WHERE THE "HAND TO AN AGENT" LINE WENT. It was one line pinned under the
// whole conversation, so it said the same thing under the newest message
// whatever that message was. It is an action ON a message — this is the one you
// want work made of — so it belongs on the message, which is what the drawing
// shows and what this moves it to.
import { useEffect, useRef, useState } from 'react';
import './chat.css';

// THE EMOJI ON OFFER, and it is a short list on purpose. A full picker is a
// search field and a scrolling grid, which is a second window over a
// conversation; these are the ones a working chat actually uses, and anything
// else can be typed into the message. Ordered as they are drawn, left to right.
export const CHAT_EMOJI = ['👍', '🙏', '👀', '✅', '🎉', '❤️', '😄', '🤔'];

/** One emoji, picked from the short list, in a square plate that opens upward. */
export function EmojiPick({ onPick, onClose, title = 'React' }: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Clicking anywhere else closes it, which is the rule every other small
  // drawer in this app follows (Priority, Model, When).
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return (
    <div className="chat-emoji" ref={box} role="group" aria-label={title}>
      {CHAT_EMOJI.map((emoji) => (
        <button key={emoji} type="button" className="chat-emoji-one" title={emoji} onClick={() => onPick(emoji)}>
          {emoji}
        </button>
      ))}
    </div>
  );
}

/**
 * THE CHIPS UNDER A MESSAGE. One per emoji, with how many people are on it, and
 * yours a shade brighter — which is the only difference between them, because
 * the whole row is monochrome and a chip of yours tinted orange would be the
 * only colour on the screen.
 *
 * Pressing one you are on takes yours back; pressing one you are not on adds
 * you. The count is the people, so a chip never reads 0: the store drops an
 * emoji nobody is left on (shared/work-items.mjs).
 */
export function Reactions({ on, me, onReact }: {
  /** emoji -> the people on it, oldest press first. */
  on: Record<string, string[]> | undefined;
  me: string | null;
  onReact: (emoji: string, off: boolean) => void;
}) {
  const chips = Object.entries(on ?? {}).filter(([, who]) => who.length);
  if (!chips.length) return null;
  return (
    <div className="chat-chips">
      {chips.map(([emoji, who]) => {
        const mine = !!me && who.includes(me);
        return (
          <button
            key={emoji}
            type="button"
            className={`chat-chip${mine ? ' mine' : ''}`}
            aria-pressed={mine}
            title={mine ? `You and ${who.length - 1} other${who.length === 2 ? '' : 's'}` : `${who.length}`}
            onClick={() => onReact(emoji, mine)}
          >
            <span className="chat-chip-emoji">{emoji}</span>
            <span className="chat-chip-count">{who.length}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * THE BAR THAT APPEARS WHEN YOU POINT AT A MESSAGE: react, reply, and hand it
 * to an agent. Three actions and no more; the drawing's fourth glyph was an
 * overflow with nothing behind it yet, and a button that does nothing is worse
 * than a gap.
 *
 * It is absolutely positioned over the message's top edge rather than laid out
 * in the flow, so a message does not change height when the pointer crosses it.
 * It stays up while the emoji plate is open, because the plate hangs off it and
 * a bar that vanished the moment the pointer moved into its own menu would be
 * unusable.
 */
export function MessageActions({ onReact, onQuote, onHandToAgent }: {
  onReact: (emoji: string) => void;
  onQuote: () => void;
  // Absent on a conversation where there is nothing to hand work to, which is
  // the single-person app: the two buttons left still stand.
  onHandToAgent?: () => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className={`chat-acts${picking ? ' open' : ''}`}>
      {picking && <EmojiPick onPick={(emoji) => { setPicking(false); onReact(emoji); }} onClose={() => setPicking(false)} />}
      <button type="button" className="chat-act" title="React" aria-label="React" onClick={() => setPicking((was) => !was)}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
          <path d="M14 8A6 6 0 1 1 8 2" />
          <path d="M5.8 6.4h.01M10 6.4h.01" strokeWidth="1.6" />
          <path d="M5.6 9.6c.6.8 1.4 1.2 2.4 1.2s1.8-.4 2.4-1.2" />
          <path d="M12.5 1.8v3.4M10.8 3.5h3.4" />
        </svg>
      </button>
      <button type="button" className="chat-act" title="Reply" aria-label="Reply" onClick={onQuote}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="miter" aria-hidden="true">
          <path d="M2 2.8h12v8.4H7.2L3.6 14v-2.8H2z" />
        </svg>
      </button>
      {onHandToAgent && (
        <button type="button" className="chat-act chat-act-hand" title="Hand to an agent" aria-label="Hand to an agent" onClick={onHandToAgent}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="miter" aria-hidden="true">
            <path d="M2.2 2.2h11.6v11.6H2.2z" />
            <path d="M2.2 6.1h11.6M6.1 6.1v7.7" />
          </svg>
          {/* THE WORDS, not only the glyph. "Hand to an agent" is the one
              action here that makes work happen, and it used to be a sentence
              under the conversation; a bare square would be the app quietly
              taking away the only label it had. */}
          <span className="chat-act-word">Hand to an agent</span>
        </button>
      )}
    </div>
  );
}
