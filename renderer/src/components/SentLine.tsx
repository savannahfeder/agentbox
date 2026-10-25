// WHERE A REPLY WENT, ON THE LINE ABOVE THE REPLY BOX OF THE THREAD IT MOVED
// HER TO (w-4465054f04). Picked from six drawings; the corner card it replaces
// was far from where she was looking and gone in six seconds.
//
// The ring around the close is the line's clock: its animation ending is what
// closes the line, so the CSS pausing it under the pointer pauses the close.
export const SENT_LINE_MS = 5000;

export function SentLine({ title, undoes, onBack, onUndo, onClose }: {
  title: string;
  undoes: boolean;
  onBack: () => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sent-line" role="status">
      <span className="sent-line-dot" aria-hidden="true" />
      <span className="sent-line-said">Sent to <span className="sent-line-title">{title}</span></span>
      <span className="sent-line-keys">
        <button type="button" className="sent-line-key" onClick={onBack}><kbd>O</kbd><span className="sent-line-word">Back</span></button>
        {undoes && <button type="button" className="sent-line-key" onClick={onUndo}><kbd>Z</kbd><span className="sent-line-word">Undo</span></button>}
      </span>
      <button type="button" className="sent-line-close" aria-label="Close" onClick={onClose}>
        <svg className="sent-line-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle className="sent-line-ring-track" cx="10" cy="10" r="8.25" />
          <circle className="sent-line-ring-left" cx="10" cy="10" r="8.25" style={{ animationDuration: `${SENT_LINE_MS}ms` }} onAnimationEnd={onClose} />
        </svg>
        <svg className="sent-line-x" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M1 1 L7 7 M7 1 L1 7" />
        </svg>
      </button>
    </div>
  );
}
