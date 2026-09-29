// Staged attachments, shown as what they are: images as thumbnails, other
// files as chips. Click removes.

import type { PendingAttachment } from '../attachments';
import { pictureUrl } from '../picture';

// A staged paste is a path on disk, and a path is asked for on the app's own
// scheme rather than as file://, which a dev-served window may not load.
const srcFor = (a: PendingAttachment) =>
  a.dataBase64 ? `data:image/png;base64,${a.dataBase64}` : a.srcPath ? pictureUrl(a.srcPath) : '';

export function AttachRow({ attachments, onRemove }: {
  attachments: PendingAttachment[];
  onRemove: (index: number) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="attach-row">
      {attachments.map((a, i) => a.image ? (
        <div key={i} className="attach-thumb" title={a.name}>
          <img src={srcFor(a)} alt={a.name} />
          <button className="attach-remove" onClick={() => onRemove(i)}>×</button>
        </div>
      ) : (
        <button key={i} className="attach-chip" title="Remove" onClick={() => onRemove(i)}>
          {a.name} ×
        </button>
      ))}
    </div>
  );
}
