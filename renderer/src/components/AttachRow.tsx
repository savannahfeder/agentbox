// Staged attachments, shown as what they are: images as thumbnails, a voice
// note as a note you can play before sending, other files as chips. Click
// removes.

import type { PendingAttachment } from '../attachments';
import { pictureUrl } from '../picture';
import { VoiceNote } from '../team/VoiceNote';
import { voiceNoteOf } from '../team/voice-note';

// A staged paste is a path on disk, and a path is asked for on the app's own
// scheme rather than as file://, which a dev-served window may not load.
const srcFor = (a: PendingAttachment) =>
  a.dataBase64 ? `data:image/png;base64,${a.dataBase64}` : a.srcPath ? pictureUrl(a.srcPath) : '';

const bytesOf = async (a: PendingAttachment): Promise<Blob | null> => {
  if (a.dataBase64) return new Blob([Uint8Array.from(atob(a.dataBase64), (c) => c.charCodeAt(0))]);
  if (a.srcPath) return fetch(pictureUrl(a.srcPath)).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
  return null;
};

export function AttachRow({ attachments, onRemove }: {
  attachments: PendingAttachment[];
  onRemove: (index: number) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="attach-row">
      {attachments.map((a, i) => {
        const note = voiceNoteOf(a.name);
        if (note) {
          return (
            <div key={i} className="attach-voice">
              <VoiceNote id={`staged:${a.name}:${(a.dataBase64 ?? a.srcPath ?? '').length}`} ms={note.ms} load={() => bytesOf(a)} mine />
              <button type="button" className="attach-voice-remove" title="Remove voice note" aria-label="Remove voice note" onClick={() => onRemove(i)}>×</button>
            </div>
          );
        }
        return a.image ? (
          <div key={i} className="attach-thumb" title={a.name}>
            <img src={srcFor(a)} alt={a.name} />
            <button className="attach-remove" onClick={() => onRemove(i)}>×</button>
          </div>
        ) : (
          <button key={i} className="attach-chip" title="Remove" onClick={() => onRemove(i)}>
            {a.name} ×
          </button>
        );
      })}
    </div>
  );
}
