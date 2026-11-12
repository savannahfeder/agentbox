// While threads are ticked, the app's own toast stays up saying how many and
// which keys act on them (picked from five drawings, option 1).
import { tickedKeys, type TickedKey } from '../ticked-keys';

export function TickedBar({ count, view, onKey }: { count: number; view: string; onKey: (does: TickedKey['does']) => void }) {
  return (
    <div className="toast toast-plain toast-ticked" role="status">
      <span className="toast-line">{count} selected</span>
      <span className="toast-keys">
        {tickedKeys(view).map((k) => (
          <span key={k.key} className="toast-key" role="button" tabIndex={-1} onClick={() => onKey(k.does)}>
            <kbd>{k.key}</kbd><span className="toast-key-word">{k.word}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
