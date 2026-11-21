// Send at the bottom right of a chat's box (w-f689c07680): an arrow, as Slack's
// is, faint until there is something to send. Its key is in the tooltip, not in
// the button.
import { SendGlyph } from '../components/reply-glyphs';
import { sendKeyFor } from '../reply-keys';

export function ChatSend({ ready, busy = false, sending, onSend }: {
  ready: boolean;
  busy?: boolean;
  /** Said beside the arrow while it sends, such as "Sending 40%". */
  sending?: string;
  onSend: () => void;
}) {
  return <>
    {busy && sending && <span className="chat-sending" role="status">{sending}</span>}
    <button type="button" className="dock-send chat-send" disabled={!ready || busy} onClick={onSend} title={`Send · ${sendKeyFor(true)}`} aria-label="Send">
      <SendGlyph />
    </button>
  </>;
}
