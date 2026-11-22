// WHAT A HAND-OFF CARRIES, inside the message that asks: what the agent did,
// the thread's pictures drawn, and its other files, so the one message is the
// whole hand-off and the thread above it is there to scroll back through.
import { useState } from 'react';
import { ArtifactImg } from '../components/Focus';
import { DoneTrail } from '../threads/Summary';

export type HandOffLayout = 'grid' | 'full' | 'dock' | 'beside' | 'viewer';

const LAYOUTS: HandOffLayout[] = ['grid', 'full', 'dock', 'beside', 'viewer'];

/** Which of the proposed layouts this window draws, while one is being picked. */
export function handOffLayout(): HandOffLayout {
  try {
    const kept = window.localStorage.getItem('handoff-variant') as HandOffLayout | null;
    return kept && LAYOUTS.includes(kept) ? kept : 'grid';
  } catch { return 'grid'; }
}

interface Shown { src: string; name: string; notes: number; open: () => void }

function Thumb({ p, roots, on, onPress }: { p: Shown; roots: string[]; on?: boolean; onPress: () => void }) {
  return (
    <button type="button" className={`handoff-thumb${on ? ' on' : ''}`} title={p.name} aria-pressed={on} onClick={onPress}>
      <ArtifactImg src={p.src} alt={p.name} roots={roots} />
    </button>
  );
}

export function HandOffWhat({ owner, tried, pictures, files, roots, layout }: {
  owner: string;
  tried: string[];
  pictures: Shown[];
  files: Shown[];
  roots: string[];
  layout: HandOffLayout;
}) {
  const [shown, setShown] = useState(0);
  const small = layout === 'dock' || layout === 'beside';
  const big = pictures[Math.min(shown, pictures.length - 1)];
  return (
    <>
      {tried.length > 0 && !small && <div className="handoff-part">
        <span className="ts-h">What {owner}'s agent did</span>
        <DoneTrail steps={tried} />
      </div>}
      {pictures.length > 0 && layout === 'viewer' && big && <div className="handoff-viewer" aria-label="Pictures on this thread">
        <ArtifactImg key={big.src} src={big.src} alt={big.name} roots={roots} onOpen={big.open} />
        {pictures.length > 1 && <div className="handoff-pics handoff-pics-strip">
          {pictures.map((p, i) => <Thumb key={p.src} p={p} roots={roots} on={i === shown} onPress={() => setShown(i)} />)}
        </div>}
      </div>}
      {pictures.length > 0 && layout !== 'viewer' && <div className={`handoff-pics handoff-pics-${layout}`} aria-label="Pictures on this thread">
        {pictures.map((p) => small
          ? <Thumb key={p.src} p={p} roots={roots} onPress={p.open} />
          : <ArtifactImg key={p.src} src={p.src} alt={p.name} roots={roots} onOpen={p.open} />)}
      </div>}
      {files.length > 0 && <ul className="tp-files handoff-files" aria-label="Other files on this thread">
        {files.map((f) => <li key={f.src}>
          <button type="button" onClick={f.open} title={`Open ${f.name}`}>
            <span className="ts-tk-ext" aria-hidden="true">{(f.name.includes('.') ? f.name.split('.').pop() ?? '' : 'file').slice(0, 4)}</span>
            <span className="ts-tk-fname">{f.name}</span>
            {f.notes > 0 && <span className="ts-tk-notes">{f.notes === 1 ? '1 note' : `${f.notes} notes`}</span>}
          </button>
        </li>)}
      </ul>}
    </>
  );
}
