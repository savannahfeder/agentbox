// The urgent thread that arrived while another was open, named in the top bar
// until it is opened or this thread is left. Pressing it, or O, opens it.
//
// DRAFT: five looks to choose from (?urgentlook=a..e). Only the picked one ships.
import { rowTitle } from '../list-rules';
import type { WorkItem } from '../types';

export type UrgentLook = 'a' | 'b' | 'c' | 'd' | 'e';

const Key = () => <kbd className="ur-kbd">O</kbd>;

export function UrgentReady({ row, look = 'a', onOpen }: { row: WorkItem; look?: UrgentLook; onOpen: () => void }) {
  const title = rowTitle(row);
  if (look === 'b') return (
    <button type="button" className="ur ur-b" onClick={onOpen}>
      <span className="ur-dot" /><span className="ur-b-word">Urgent</span><span className="ur-b-title">{title}</span><Key />
    </button>
  );
  if (look === 'c') return (
    <button type="button" className="ur ur-c" onClick={onOpen} title={title}>
      <span className="ur-dot" />1 urgent<Key />
    </button>
  );
  if (look === 'd') return (
    <button type="button" className="ur ur-d" onClick={onOpen}>
      <span className="ur-d-text"><span className="ur-d-word">Urgent</span><span className="ur-d-title">{title}</span></span><Key />
    </button>
  );
  if (look === 'e') return (
    <button type="button" className="ur ur-e" onClick={onOpen}>
      <span className="ur-bell">
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 2.2c-2.2 0-3.8 1.7-3.8 3.9v2.6L3 10.6v.7h10v-.7l-1.2-1.9V6.1C11.8 3.9 10.2 2.2 8 2.2Zm-1.5 10.3a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
        <span className="ur-bell-dot" />
      </span>
      <span className="ur-e-title">{title}</span><Key />
    </button>
  );
  return (
    <button type="button" className="ur ur-a" onClick={onOpen}>
      <span className="ur-dot" /><span className="ur-a-title">{title}</span><Key />
    </button>
  );
}
