// Staged attachments, shown as what they are: images as thumbnails that open
// large, a voice note as a note you can play before sending, other files as
// chips. The × removes.

import { useState } from 'react';
import { attachProblem, type Attaching, type PendingAttachment } from '../attachments';
import { PictureView, type Picture } from './PictureView';
import { pictureUrl } from '../picture';
import { overTheLimit, sizeWords, tooBigToSend } from '../../../shared/carried-files.mts';
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

/** The waiting pictures a click on `pressed` steps through, open at that one. */
export function stagedPictures(attachments: PendingAttachment[], pressed: number): { pictures: Picture[]; start: number } | null {
  if (!attachments[pressed]?.image) return null;
  const pictures: Picture[] = [];
  let start = 0;
  attachments.forEach((a, i) => {
    if (!a.image || voiceNoteOf(a.name)) return;
    if (i === pressed) start = pictures.length;
    // The index keeps two pastes with one name apart; the viewer titles it by the last part.
    pictures.push({ path: `${i}/${a.name}`, url: srcFor(a) || null });
  });
  return { pictures, start };
}

export function AttachRow({ attachments, attaching = [], onRemove }: {
  attachments: PendingAttachment[];
  /** Files still on their way in, with how far each has got. */
  attaching?: Attaching[];
  onRemove: (index: number) => void;
}) {
  const [open, setOpen] = useState<{ pictures: Picture[]; start: number } | null>(null);
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
            <button type="button" className="attach-open" aria-label={`Open ${a.name} large`} onClick={() => setOpen(stagedPictures(attachments, i))}>
              <img src={srcFor(a)} alt={a.name} />
            </button>
            <button type="button" className="attach-remove" title="Remove" aria-label={`Remove ${a.name}`} onClick={() => onRemove(i)}>×</button>
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
    {open && (
      <PictureView
        pictures={open.pictures}
        start={open.start}
        resolve={() => Promise.resolve(null)}
        onClose={() => setOpen(null)}
      />
    )}
    </>
  );
}
