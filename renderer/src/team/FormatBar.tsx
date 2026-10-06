// THE BAR UNDER THE REPLY BOX IN A CHAT (drawing A, w-2e8aa16f0f).
//
// Bold, italic, strike, link, the two lists, quote and code, then a gap, then
// @, attach and emoji. Square, monochrome, in the app's own materials: round
// one came back as "no colour, no rounded corners" and nothing here has either.
//
// IT IS ONLY EVER ON A CHAT. The reply box on a thread with an agent is a box
// you type an instruction into, and an instruction is not formatted; the bar
// there would be eleven controls that make the agent read asterisks.
//
// What each button does to the text is ./compose-format.ts, which is pure and
// pinned by a test, because where the caret ends up is the half of a formatting
// button that has no symptom when it is wrong.
import { useRef, useState } from 'react';
import { EmojiPick } from './ChatActions';
import { applyFormat, insertAt, type Format } from './compose-format';
import './chat.css';

// The eight that write markdown, in the order the drawing has them, each with
// the glyph it wears. Stroked SVG rather than a letter where a letter would be
// ambiguous; B, I and S are drawn as type because that is what they are.
const WRITES: { what: Format; title: string; glyph: JSX.Element }[] = [
  { what: 'bold', title: 'Bold', glyph: <span className="fmt-letter fmt-b">B</span> },
  { what: 'italic', title: 'Italic', glyph: <span className="fmt-letter fmt-i">I</span> },
  { what: 'strike', title: 'Strikethrough', glyph: <span className="fmt-letter fmt-s">S</span> },
  { what: 'link', title: 'Link', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.4-2.4a2.6 2.6 0 0 0-3.7-3.7l-1 1" />
      <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l1-1" />
    </svg>
  ) },
  { what: 'bullet', title: 'Bulleted list', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 4h8M6 8h8M6 12h8" />
      <path d="M2.6 4h.01M2.6 8h.01M2.6 12h.01" strokeWidth="1.8" />
    </svg>
  ) },
  { what: 'number', title: 'Numbered list', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5" />
      <path d="M2 2.9h.9V5M1.4 11.2h1.6L1.4 13h1.7" strokeWidth="1.1" />
    </svg>
  ) },
  { what: 'quote', title: 'Quote', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M2.6 3.4v9.2" strokeWidth="1.8" />
      <path d="M6 4.8h8M6 8h8M6 11.2h5" />
    </svg>
  ) },
  { what: 'code', title: 'Code', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="miter" aria-hidden="true">
      <path d="M5.6 4.4 1.8 8l3.8 3.6M10.4 4.4 14.2 8l-3.8 3.6" />
    </svg>
  ) },
];

export function FormatBar({ box, onChange, onAttach }: {
  /** The reply box itself: the bar works on the selection that is in it. */
  box: { current: HTMLTextAreaElement | null };
  onChange: (text: string) => void;
  /** Open the file picker. Absent where there is nothing to attach to. */
  onAttach?: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const emojiWrap = useRef<HTMLSpanElement>(null);

  // EVERY BUTTON WORKS ON THE SELECTION THAT WAS IN THE BOX, which means the
  // box must not lose it. A plain button steals focus on mousedown and the
  // selection collapses before the click ever fires, so every press below is
  // prevented at mousedown and the focus is handed straight back afterwards.
  const onText = (make: (text: string, from: number, to: number) => { text: string; from: number; to: number }) => {
    const el = box.current;
    if (!el) return;
    const out = make(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length);
    onChange(out.text);
    // After React has written the new value, not before it: setting the range
    // on the old string puts the caret at a position in text that is gone.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(out.from, out.to);
    });
  };

  const hold = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="fmt-bar" role="toolbar" aria-label="Formatting">
      {WRITES.map(({ what, title, glyph }) => (
        <button
          key={what}
          type="button"
          className="fmt-btn"
          title={title}
          aria-label={title}
          onMouseDown={hold}
          onClick={() => onText((text, from, to) => applyFormat(text, from, to, what))}
        >{glyph}</button>
      ))}
      {/* THE GAP THE DRAWING HAS. The three on the right are not formatting:
          they put something INTO the message rather than marking what is
          already there, and the space is what says so. */}
      <span className="fmt-gap" aria-hidden="true" />
      <button type="button" className="fmt-btn" title="Mention someone" aria-label="Mention someone"
        onMouseDown={hold} onClick={() => onText((text, from, to) => insertAt(text, from, to, '@'))}>
        <span className="fmt-letter">@</span>
      </button>
      {onAttach && (
        <button type="button" className="fmt-btn" title="Attach a file" aria-label="Attach a file"
          onMouseDown={hold} onClick={onAttach}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      )}
      <span className="fmt-emoji-wrap" ref={emojiWrap}>
        {picking && (
          <EmojiPick
            title="Add an emoji"
            onClose={() => setPicking(false)}
            onPick={(emoji) => { setPicking(false); onText((text, from, to) => insertAt(text, from, to, emoji)); }}
          />
        )}
        <button type="button" className="fmt-btn" title="Add an emoji" aria-label="Add an emoji"
          onMouseDown={hold} onClick={() => setPicking((was) => !was)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
            <path d="M5.8 6.4h.01M10.2 6.4h.01" strokeWidth="1.6" />
            <path d="M5.6 9.6c.6.8 1.4 1.2 2.4 1.2s1.8-.4 2.4-1.2" />
          </svg>
        </button>
      </span>
    </div>
  );
}
