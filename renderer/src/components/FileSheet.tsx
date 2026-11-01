// A file from bytes alone, over the whole window: what a room's message opens,
// since a room's files are in the cloud and not in a folder on this computer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { docKind, isPlainText } from '../doc-pane';
import { CodeFile } from './CodeFile';
import { FilmPlayer } from './FilmPlayer';
import { PdfPages } from './PdfPages';
import { PreviewLoading } from './PreviewLoading';
import './file-views.css';

const PLUGINS = [remarkGfm];
// A room carries the one file, so a picture beside it is its words, not a broken mark.
const TEXT_PARTS = {
  img: ({ src, alt }: { src?: string; alt?: string }) => (/^https?:/.test(src ?? '') ? <img src={src} alt={alt ?? ''} /> : <em>{alt || src}</em>),
};
const TYPES: Record<string, string> = { svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

export function FileSheet({ name, shown, load, onClose }: { name: string; shown?: string; load: () => Promise<Blob | null>; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null | undefined>(undefined);
  const [text, setText] = useState<string | null>(null);
  const kind = docKind(name);
  useEffect(() => {
    let live = true;
    load().then((b) => {
      if (!live) return;
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      setBlob(b && TYPES[ext] ? new Blob([b], { type: TYPES[ext] }) : b);
      if (b && (kind === 'markdown' || kind === 'html' || isPlainText(name))) void b.text().then((t) => { if (live) setText(t); });
    }).catch(() => { if (live) setBlob(null); });
    return () => { live = false; };
  }, [name, load, kind]);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const bytes = useCallback(async () => new Uint8Array(await (blob as Blob).arrayBuffer()), [blob]);
  const title = shown || name;
  let body;
  if (blob === undefined) body = <PreviewLoading />;
  else if (!blob || !url) body = <div className="doc-missing">{title} is on its way. Close this and open it again in a moment.</div>;
  else if (kind === 'pdf') body = <PdfPages load={bytes} name={title} />;
  else if (kind === 'film') body = <FilmPlayer url={url} name={title} wide />;
  else if (kind === 'image') body = <img src={url} alt={title} />;
  else if (kind === 'markdown') body = text === null ? <PreviewLoading /> : <div className="file-sheet-text"><ReactMarkdown remarkPlugins={PLUGINS} components={TEXT_PARTS}>{text}</ReactMarkdown></div>;
  else if (kind === 'html') body = text === null ? <PreviewLoading /> : <iframe title={title} sandbox="allow-scripts" srcDoc={text} />;
  else if (isPlainText(name)) body = text === null ? <PreviewLoading /> : <div className="code-scroll"><CodeFile text={text} /></div>;
  else body = <div className="doc-missing">{title} cannot be shown here. <a href={url} download={name}>Save a copy</a>.</div>;
  return <div className="file-sheet" role="dialog" aria-label={title}>
    <div className="file-sheet-card">
      <div className="file-sheet-head"><span>{title}</span><button type="button" className="pdf-step" onClick={onClose}>Close</button></div>
      <div className="file-sheet-body">{body}</div>
    </div>
  </div>;
}
