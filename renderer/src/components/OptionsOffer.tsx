// THE OPTIONS AN AGENT OFFERED, AT THE FOOT OF THE TURN IT OFFERED THEM ON.
//
// Reported 2026-10-05 (w-560647d4db), with a screenshot of a thread: "right now
// all my chats have this stuck at the bottom. it should instead occur at the end
// of the turn/message where it occured, not stuck at the bottom. I'd want to see
// it on the turn where the agent is, let's say, 'return to me.' Once I've seen
// it as a user, I don't really want to see it continuously. It's been
// processed."
//
// WHAT IT WAS. This markup lived inside `.dock-card`, above the reply box. The
// dock does not scroll, so a question asked once stood at the foot of the
// window for as long as the thread was open — under the message that asked it,
// under the forty lines of work after that, and under the answer. It followed
// the reader down the page. The original reasoning is still in the heading
// comment below and it was sound for a docked strip: the ask scrolls away, so
// repeat the question over the answers. Drawn at its own turn the ask is one
// line above and that problem does not exist.
//
// WHAT IT IS NOW. One block in the flow, after the agent's last word and after
// the threads that turn filed, where "return to me" actually happened. It
// scrolls with its turn, so reading past it is what makes it go away, and
// nothing had to be remembered or marked as seen to get that.
//
// AND IT CARRIES NO FOLD (w-2e13752a85). "just remove the dropdown as it's not
// needed and it'd be perfect." The chevron was right for a docked strip, which
// stood over the composer for as long as the thread was open: folding it was
// the only way to get the screen back. Drawn at its own turn it scrolls away by
// itself, so the fold answers a question nobody is asking any more, and a
// control that does nothing worth doing is one more thing to read past.
//
// IT IS STILL LIVE UNTIL IT IS ANSWERED, and that was already true: `offerIsLive`
// (format.ts) goes false the moment a reply lands after the offer, so a settled
// question stops being a control on its own. What this row changes is where the
// live one stands.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ParsedOption } from '../format';

export function OptionsOffer({
  ask, askAll, options, peekOption, askPeek,
  selectedOption, selRef, onPick, onOptionEnter, onAskEnter, setPeek, setAskPeek,
}: {
  /** The sentence the options answer, off the same field the options came off. */
  ask: string;
  askAll: string;
  options: ParsedOption[];
  peekOption: ParsedOption | null;
  askPeek: boolean;
  selectedOption: number | null;
  selRef: React.RefObject<HTMLButtonElement>;
  onPick: (n: number) => void;
  onOptionEnter: (n: number, el: HTMLElement) => void;
  onAskEnter: (el: HTMLElement) => void;
  setPeek: (n: number | null) => void;
  setAskPeek: (open: boolean) => void;
}) {
  return (
    <div className="opt-strip">
      {/* THE HEADING IS THE QUESTION, NOT THE NAME OF THE CONTROL. It comes off
          the same field the options came off, so the two can never be from
          different rounds (ask-line.ts).

          The old words are the fallback and nothing more: a row whose offering
          field opens with no sentence still needs a heading saying what the
          numbers under it are. */}
      {/* THE HOVER SITS ON THE WHOLE HEADING ROW, not on the text node
          inside it. A pointer travelling down the pane crosses the
          padding before it crosses the words, and a card that opens
          only on the glyphs themselves blinks shut in the gaps between
          the two lines. */}
      <div
        className={`opt-head ${ask ? 'opt-head-ask' : ''}`}
        onMouseEnter={(e) => onAskEnter(e.currentTarget)}
        onMouseLeave={() => setAskPeek(false)}
      >
        <span>{ask || 'Their options · pick or write your own'}</span>
      </div>
      {/* The card, drawn FIRST so it is the strip's first child: appended
          last it stole the last row's 4px of bottom padding and the
          strip measured 4px short. It is out of the flow entirely
          (`bottom: 100%`), which is the promise of this design: the
          strip is the same height with the card open as without it. */}
      {peekOption && (
        <div className="opt-peek">
          <div className="opt-peek-head">Option {peekOption.n}, in full</div>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {peekOption.text.replace(/\s*\(recommended\)/i, '')}
          </ReactMarkdown>
        </div>
      )}
      {/* ONE SLOT, SO NEVER TWO CARDS. The option card wins when both
          could be open, which cannot happen from one pointer but can
          from a stale state, and two of these stacked would cover the
          message they are supposed to be read against. */}
      {!peekOption && askPeek && (
        <div className="opt-peek">
          <div className="opt-peek-head">The question, in full</div>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{askAll}</ReactMarkdown>
        </div>
      )}
      {options.map((o) => (
        <button
          key={o.n}
          ref={o.n === selectedOption ? selRef : undefined}
          className={`opt-row ${o.n === selectedOption ? 'selected' : ''}`}
          onClick={() => onPick(o.n)}
          onMouseEnter={(e) => onOptionEnter(o.n, e.currentTarget)}
          onMouseLeave={() => setPeek(null)}
        >
          <span className="opt-key">{o.n}</span>
          <span className="opt-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ p: ({ children }) => <>{children}</> }}
            >
              {o.text.replace(/\s*\(recommended\)/i, '')}
            </ReactMarkdown>
          </span>
          {o.n === selectedOption
            ? <span className="opt-rec">↵ send</span>
            : o.recommended && <span className="opt-rec">recommended</span>}
        </button>
      ))}
    </div>
  );
}
