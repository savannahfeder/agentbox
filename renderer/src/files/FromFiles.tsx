// "From Files" on a reply box's clip: the team's files, searched as Files searches them.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { PlacedFile } from '../types';
import { KIND_ONE } from './files-shown';
import { attachmentOf, filesToAttach } from './from-files';

export type FromFilesPick = { name: string; srcPath: string; image: boolean };

export function FromFiles({ onPick, onClose }: { onPick: (picked: FromFilesPick) => void; onClose: () => void }) {
  const [files, setFiles] = useState<PlacedFile[] | null>(null);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let live = true;
    void api.filesPlace().then((l) => { if (live) setFiles(l.files); }).catch(() => { if (live) setFiles([]); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [onClose]);
  const shown = files ? filesToAttach(files, q) : [];
  const pick = (f: PlacedFile | undefined) => {
    const a = f && attachmentOf(f);
    if (a) onPick(a);
  };
  return <div className="from-files" ref={box} role="dialog" aria-label="Attach from Files">
    <input className="from-files-q" autoFocus placeholder="Search Files" aria-label="Search Files" value={q}
      onChange={(e) => { setQ(e.target.value); setAt(0); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(shown.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(shown[at]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      }} />
    {files === null ? <p className="from-files-none">Reading Files</p>
      : !shown.length ? <p className="from-files-none">{q.trim() ? 'No file matches' : 'Nothing in Files yet'}</p>
      : <ul className="from-files-list">{shown.map((f, i) => {
        const here = !!f.opened;
        return <li key={f.key}>
          <button type="button" className={`from-files-row${i === at ? ' is-on' : ''}`} disabled={!here} onMouseEnter={() => setAt(i)} onClick={() => pick(f)}
            title={here ? undefined : 'Not on this computer yet'}>
            <span className="from-files-name">{f.name}</span>
            <span className="from-files-where">{here ? [f.kind ? KIND_ONE[f.kind] : null, f.project].filter(Boolean).join(' · ') : 'Not on this computer yet'}</span>
          </button>
        </li>;
      })}</ul>}
  </div>;
}
