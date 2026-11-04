// THE FILES BUTTON over a thread: how many files it made, and a list of them.
import { useEffect, useRef, useState } from 'react';
import type { ThreadFile } from './thread-files';

const FILES = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M8 3.5h6l4 4V17a.5.5 0 0 1-.5.5H8a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M14 3.5v4h4" /><path d="M5 7v12.5a1 1 0 0 0 1 1h9" />
</svg>;

const ext = (name: string) => (name.includes('.') ? name.split('.').pop() ?? '' : 'file').slice(0, 4);

export function ThreadFilesButton({ files, onOpen, startOpen = false }: { files: ThreadFile[]; onOpen: (f: ThreadFile) => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', keys, true); };
  }, [open]);
  if (!files.length) return null;
  return <span className="ts-files-wrap" ref={wrap}>
    <button type="button" className={`ts-done ts-files${open ? ' open' : ''}`} aria-haspopup="dialog" aria-expanded={open}
      aria-label={`Files in this thread (${files.length})`} data-hint="thread-files" data-hint-align="right" onClick={() => setOpen((o) => !o)}>
      {FILES}<b className="ts-files-n">{files.length}</b>
    </button>
    {open && <div className="th-pop ts-files-pop" role="dialog" aria-label="Files in this thread">
      <ul>{files.map((f) => <li key={f.src}>
        <button type="button" onClick={() => { setOpen(false); onOpen(f); }} title={`Open ${f.name}`}>
          <span className="ts-tk-ext" aria-hidden="true">{ext(f.name)}</span>
          <span className="ts-files-name">{f.name}</span>
          {f.notes > 0 && <span className="ts-files-notes">{f.notes === 1 ? '1 note' : `${f.notes} notes`}</span>}
        </button>
      </li>)}</ul>
    </div>}
  </span>;
}
