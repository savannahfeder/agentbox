// WHAT A HAND-OFF CARRIES, inside the message that asks: what the agent did,
// the thread's pictures drawn two by two, and its other files, so the one
// message is the whole hand-off and the thread above it is there to scroll back through.
import { ArtifactImg } from '../components/Focus';
import { DoneTrail } from '../threads/Summary';

interface Shown { src: string; name: string; notes: number; open: () => void }

export function HandOffWhat({ owner, tried, pictures, files, roots }: {
  owner: string;
  tried: string[];
  pictures: Shown[];
  files: Shown[];
  roots: string[];
}) {
  return (
    <>
      {tried.length > 0 && <div className="handoff-part">
        <span className="ts-h">What {owner}'s agent did</span>
        <DoneTrail steps={tried} />
      </div>}
      {pictures.length > 0 && <div className="handoff-pics" aria-label="Pictures on this thread">
        {pictures.map((p) => <ArtifactImg key={p.src} src={p.src} alt={p.name} roots={roots} onOpen={p.open} />)}
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
