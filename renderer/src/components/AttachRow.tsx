// Staged attachments, shown as what they are: images as thumbnails that open
// large, a voice note as a note you can play before sending, other files as
// chips. The × removes. In a chat's box every one is a tile of one height, with
// its own × (`look="tiles"`).

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

/** A file's kind as its tile names it: the ending in capitals, or FILE. */
export const kindOf = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1].toUpperCase() ?? 'FILE';

/**
 * A long name in two parts, so a tile too narrow for it cuts the first and
 * keeps the end, which is what tells "report-final-v2" from "report-final-v3":
 * the last words of up to 12 letters, and the ending.
 */
export function nameEnds(name: string): [string, string] {
  if (name.length <= 20) return [name, ''];
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : '';
  const stem = name.slice(0, name.length - ext.length);
  const parts = stem.split(/(?<=[\s_-])/);
  let tail = '';
  while (parts.length > 1 && parts[parts.length - 1].length + tail.length <= 12) tail = parts.pop() + tail;
  if (!tail) tail = stem.slice(-8);
  return [stem.slice(0, stem.length - tail.length), tail + ext];
}

function FileName({ name }: { name: string }) {
  const [head, tail] = nameEnds(name);
  return <span className="attach-name"><span className="attach-head">{head}</span>{tail && <span className="attach-tail">{tail}</span>}</span>;
}

const Cross = () => (
  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
);

export function AttachRow({ attachments, attaching = [], onRemove, look }: {
  attachments: PendingAttachment[];
  /** Files still on their way in, with how far each has got. */
  attaching?: Attaching[];
  onRemove: (index: number) => void;
  /** A chat's box draws every file as a tile of one size, the way Slack's does. */
  look?: 'tiles';
}) {
  const [open, setOpen] = useState<{ pictures: Picture[]; start: number } | null>(null);
  if (!attachments.length && !attaching.length) return null;
  const problem = attachProblem(attachments);
  const viewer = open && (
    <PictureView
      pictures={open.pictures}
      start={open.start}
      resolve={() => Promise.resolve(null)}
      onClose={() => setOpen(null)}
    />
  );
  if (look === 'tiles') {
    const x = (i: number, label: string) => (
      <button type="button" className="attach-x" title="Remove" aria-label={label} onClick={() => onRemove(i)}><Cross /></button>
    );
    return (
      <>
      <div className="attach-row attach-tiles">
        {attachments.map((a, i) => {
          const note = voiceNoteOf(a.name);
          if (note) {
            return (
              <div key={i} className="attach-tile attach-voice">
                <VoiceNote id={`staged:${a.name}:${(a.dataBase64 ?? a.srcPath ?? '').length}`} ms={note.ms} load={() => bytesOf(a)} mine />
                {x(i, 'Remove voice note')}
              </div>
            );
          }
          if (a.image) {
            return (
              <div key={i} className="attach-tile attach-picture" title={a.name}>
                <button type="button" className="attach-open" aria-label={`Open ${a.name} large`} onClick={() => setOpen(stagedPictures(attachments, i))}>
                  <img src={srcFor(a)} alt={a.name} />
                </button>
                {x(i, `Remove ${a.name}`)}
              </div>
            );
          }
          const big = tooBigToSend(a.size ?? 0);
          const meta = a.failed ? 'Not attached' : big ? 'Too big to send' : a.size ? sizeWords(a.size) : '';
          return (
            <div key={i} className={`attach-tile attach-file${a.failed || big ? ' attach-too-big' : ''}`} title={a.failed ?? (big ? overTheLimit(a.size ?? 0) : a.name)}>
              <span className="attach-kind">{kindOf(a.name)}</span>
              <span className="attach-words"><FileName name={a.name} />{meta && <span className="attach-meta">{meta}</span>}</span>
              {x(i, `Remove ${a.name}`)}
            </div>
          );
        })}
        {attaching.map((a) => (
          <div key={a.key} className="attach-tile attach-file attach-coming" role="status">
            <span className="attach-kind">{kindOf(a.name)}</span>
            <span className="attach-words"><FileName name={a.name} /><span className="attach-meta">{a.size ? `${Math.floor((100 * a.done) / a.size)}%` : ''}</span></span>
            <span className="attach-bar" style={{ width: `${a.size ? (100 * a.done) / a.size : 0}%` }} aria-hidden="true" />
          </div>
        ))}
      </div>
      {problem && <div className="compose-note attach-problem" role="alert">{problem}</div>}
      {viewer}
      </>
    );
  }
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
    {viewer}
    </>
  );
}
