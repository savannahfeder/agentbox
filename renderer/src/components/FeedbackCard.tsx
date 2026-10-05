import { Name } from '../../../shared/product-name.mjs';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { FEEDBACK_LIMITS, checkFeedback } from '../../../shared/feedback.mjs';
import { CrossIcon } from './CrossIcon';
import './feedback-card.css';

/** THE FEEDBACK CARD (w-1b574413db, 2026-10-04).
 *
 *  Opened by the sidebar's Feedback row, over whatever is on screen, so
 *  saying something costs no trip away from the work. Chosen from three
 *  drawings (a page, this card, a small pop-up), then the card was asked for
 *  with two changes: the subheader reads "Goes straight to the Agentbox team."
 *  and Send is the thread composer's own button, ⌘↵ on its face and nothing
 *  that schedules.
 *
 *  Files come in three ways, all landing in the same row of tiles: paste
 *  (a screenshot straight off the clipboard), drop anywhere on the card, or
 *  Attach. What may be sent is shared/feedback.mjs, read here to switch Send
 *  off and again in the main process before anything leaves.
 *
 *  It never names where it goes. The address is a secret on the server and in
 *  no file of this repository. */

export interface FeedbackFile { id: string; name: string; type: string; size: number; data: string; preview: string | null }
type Send = (p: { text: string; files: Omit<FeedbackFile, 'id' | 'preview'>[] }) => Promise<{ ok: boolean; error?: string }>;

// One File, read as base64. Images keep their data URL as the tile's picture.
function readFile(file: File): Promise<FeedbackFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const type = file.type || 'application/octet-stream';
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        // A pasted screenshot arrives named "image.png"; give it a better one.
        name: file.name && file.name !== 'image.png' ? file.name : screenshotName(),
        type, size: file.size, data: url.slice(url.indexOf(',') + 1),
        preview: type.startsWith('image/') ? url : null,
      });
    };
    reader.readAsDataURL(file);
  });
}

// "Screenshot 2026-10-04 at 19.42", in local time, the way macOS names one.
function screenshotName(at = new Date()) {
  const two = (n: number) => String(n).padStart(2, '0');
  return `Screenshot ${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} at ${two(at.getHours())}.${two(at.getMinutes())}.png`;
}

const extension = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE');

export function FeedbackCard({ onClose, onSend }: { onClose: () => void; onSend: Send }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<FeedbackFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // dragenter and dragleave fire for every child crossed, so the drop face
  // is up while this count is above zero rather than on the last event.
  const depth = useRef(0);

  useEffect(() => { box.current?.focus(); }, []);
  // Sent, it thanks you and gets out of the way on its own.
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [sent, onClose]);

  const check = checkFeedback({ text, files });
  // An empty card is not an error worth printing; a limit crossed is.
  const limit = !check.ok && (text.trim() || files.length) ? check.reason : null;
  const canSend = check.ok && !sending && !sent;

  const add = async (list: FileList | File[] | null | undefined) => {
    const incoming = Array.from(list ?? []);
    if (!incoming.length) return;
    setError(null);
    try {
      const read = await Promise.all(incoming.map(readFile));
      setFiles((now) => [...now, ...read]);
    } catch {
      setError('That file could not be read.');
    }
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const out = await onSend({ text, files: files.map(({ name, type, size, data }) => ({ name, type, size, data })) })
      .catch(() => ({ ok: false, error: 'It did not send. Try again in a moment.' }));
    setSending(false);
    if (out.ok) setSent(true);
    else setError(out.error ?? 'It did not send. Try again in a moment.');
  };

  // Every key stays inside the card, so a letter typed here is never one of
  // the app's shortcuts underneath it.
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  };
  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData.files.length) { e.preventDefault(); void add(e.clipboardData.files); }
  };
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragEnter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; setDragging(true); };
  const onDragOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
  const onDragLeave = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); depth.current = 0; setDragging(false); void add(e.dataTransfer?.files); };

  return <div className="fb-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !text.trim() && !files.length) onClose(); }}>
    <div className="fb-card" role="dialog" aria-modal="true" aria-label="Send feedback"
      onKeyDown={onKeyDown} onPaste={onPaste} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {sent ? <div className="fb-sent" role="status">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>
        <span>Sent. Thank you.</span>
      </div> : <>
        <div className="fb-head">
          <h2>Send feedback</h2>
          <button type="button" className="fb-close" aria-label="Close" title="Close · esc" onClick={onClose}><CrossIcon /></button>
        </div>
        <p className="fb-sub">Goes straight to the {Name} team.</p>
        <div className="fb-box">
          <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} maxLength={FEEDBACK_LIMITS.text + 1}
            placeholder="What happened, and what did you expect?" aria-label="Your feedback" />
          {files.length > 0 && <div className="fb-tiles">
            {files.map((f) => <div key={f.id} className={`fb-tile${f.preview ? '' : ' doc'}`} title={f.name}>
              {f.preview ? <img src={f.preview} alt={f.name} /> : <span>{extension(f.name)}</span>}
              <button type="button" className="fb-tile-x" aria-label={`Remove ${f.name}`} onClick={() => setFiles((now) => now.filter((x) => x.id !== f.id))}>×</button>
            </div>)}
          </div>}
          {(error || limit) && <p className="fb-note" role="alert">{error ?? limit}</p>}
          <div className="fb-foot">
            <button type="button" className="fb-attach" onClick={() => picker.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/></svg>
              <span>Attach</span>
            </button>
            <span className="fb-hint">or paste, or drop files here</span>
            <input ref={picker} type="file" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
            <button className="dock-send" onClick={() => void send()} disabled={!canSend} title="Send · ⌘↵">{sending ? 'Sending' : 'Send'} <kbd>⌘↵</kbd></button>
          </div>
        </div>
        {dragging && <div className="fb-drop" aria-hidden="true">
          <i /><i /><i /><i />
          <div>Drop to attach<small>Images, PDFs, docs, logs</small></div>
        </div>}
      </>}
    </div>
  </div>;
}
