// THE THREADS A THREAD MADE, IN LINE (w-2e8aa16f0f). One bordered row per
// thread, its title and where it stands, and the row opens it. The same list
// an agent answering in a chat shows for the tasks it opened, approved in the
// messages redesign; here it sits under a task whose agent filed threads.
import type { ThreadStateWord } from '../types';
import { stateWord } from '../threads-made';
import './threads-made.css';

export interface MadeRow { id: string; title: string; state: ThreadStateWord | null }

export function ThreadsMade({ rows, onOpen, label }: { rows: MadeRow[]; onOpen: (id: string) => void; label?: string }) {
  if (!rows.length) return null;
  return (
    <div className="made">
      {label && <div className="made-label">{label}</div>}
      <div className="made-list">
        {rows.map((r) => (
          <button type="button" className="made-row" key={r.id} onClick={() => onOpen(r.id)}>
            <span className="made-title">{r.title}</span>
            <span className={`made-state ${r.state ?? ''}`}>{stateWord(r.state)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
