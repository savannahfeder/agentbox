// AN AGENT'S MESSAGE TO SOMEONE ALREADY ALLOWED, IN ITS TEN SECONDS. Once its
// owner said "from now on" it asks no more, so this is the last look at the
// words, and the only Undo (main/teammate-reach.mts holds it).
import { useEffect, useState } from 'react';
import { sendingWords } from './agent-sending';

type Held = { id: string; from: string; to: string; text: string; until: number };

export function AgentSending({ held, raised, onUndo }: { held: Held[]; raised: boolean; onUndo: (id: string) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const shown = held.filter((h) => h.until > now);
  if (!shown.length) return null;
  const h = shown[0];
  const said = sendingWords(h, now);
  return (
    <div className={`toast toast-plain agent-sending${raised ? ' agent-sending-raised' : ''}`} role="status">
      <span className="toast-title">{said.title}</span>
      <span className="toast-line">{said.line}</span>
      <span className="toast-keys">
        <span className="toast-key toast-undo" role="button" tabIndex={0}
          onClick={() => onUndo(h.id)} onKeyDown={(e) => { if (e.key === 'Enter') onUndo(h.id); }}>
          <span className="toast-key-word">Undo</span>
        </span>
      </span>
    </div>
  );
}
