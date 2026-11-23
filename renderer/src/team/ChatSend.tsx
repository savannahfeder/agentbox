// Send in a chat's box: an arrow, faint until there is something to send, with
// its key in the tooltip. A reply to an agent keeps "Send ⌘↵", because its key
// is not Return.
import { SendGlyph } from '../components/reply-glyphs';
import { sendKeyFor } from '../reply-keys';

export function ChatSend({ ready, busy = false, sending, onSend }: {
  ready: boolean;
  busy?: boolean;
  /** Said beside the arrow while it sends, such as "Sending 40%". */
  sending?: string;
  onSend: () => void;
}) {
  return <span className="chat-send-at">
    {busy && sending && <span className="chat-sending" role="status">{sending}</span>}
    <button type="button" className="dock-send chat-send" disabled={!ready || busy} onClick={onSend} title={`Send · ${sendKeyFor(true)}`} aria-label="Send">
      <SendGlyph />
    </button>
  </span>;
}
