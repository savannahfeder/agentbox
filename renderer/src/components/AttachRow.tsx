// Staged attachments, shown as what they are: images as thumbnails, a voice
// note as a note you can play before sending, other files as chips. Click
// removes.

import { attachProblem, type Attaching, type PendingAttachment } from '../attachments';
import { pictureUrl } from '../picture';
import { overTheLimit, sizeWords, tooBigToSend } from '../../../shared/carried-files.mjs';
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

export function AttachRow({ attachments, attaching = [], onRemove }: {
  attachments: PendingAttachment[];
  /** Files still on their way in, with how far each has got. */
  attaching?: Attaching[];
  onRemove: (index: number) => void;
}) {
  if (!attachments.length && !attaching.length) return null;
  const problem = attachProblem(attachments);
  return (
    <>
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
          <button key={i} className={a.failed || tooBigToSend(a.size ?? 0) ? 'attach-chip attach-too-big' : 'attach-chip'} title={a.failed ?? (tooBigToSend(a.size ?? 0) ? overTheLimit(a.size ?? 0) : 'Remove')} onClick={() => onRemove(i)}>
            {a.name}{a.size && !a.failed && !tooBigToSend(a.size) ? <span className="attach-size"> {sizeWords(a.size)}</span> : null} ×
          </button>
        );
      })}
      {attaching.map((a) => (
        <span key={a.key} className="attach-chip attach-coming" role="status">
          {a.name} <span className="attach-size">{a.size ? `${Math.floor((100 * a.done) / a.size)}%` : ''}</span>
          <span className="attach-bar" style={{ width: `${a.size ? (100 * a.done) / a.size : 0}%` }} aria-hidden="true" />
        </span>
      ))}
    </div>
    {problem && <div className="compose-note attach-problem" role="alert">{problem}</div>}
    </>
  );
}
