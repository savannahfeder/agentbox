// The urgent thread that arrived while another was open, named in the top bar
// until it is opened or this thread is left. Pressing it, or O, opens it.
import { rowTitle } from '../list-rules';
import type { WorkItem } from '../types';

export function UrgentReady({ row, onOpen }: { row: WorkItem; onOpen: () => void }) {
  return (
    <button type="button" className="ur" onClick={onOpen}>
      <span className="ur-dot" /><span className="ur-word">Urgent</span><span className="ur-title">{rowTitle(row)}</span><kbd className="ur-kbd">O</kbd>
    </button>
  );
}
