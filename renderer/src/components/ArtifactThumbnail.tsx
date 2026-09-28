import {usePreviewReveal} from '../preview-reveal';
import {PreviewLoading} from './PreviewLoading';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThumbnailCache} from '../thumbnail-cache';
import {api} from '../api';
import {docKind} from '../doc-pane';
import type {Change} from '../code-artifact';

/** Show the real page at a desktop width, scaled to a quiet visual overview.
 * Scripts and input are disabled here; opening the viewer enables interaction. */
function ThumbnailContent({product, path}: {product:string; path:string}) {
  const kind = docKind(path) ?? 'html';
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [frameReady, revealFrame] = usePreviewReveal(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null); setFailed(false); setExcerpt(null);
    if (kind === 'code' || kind === 'markdown') {
      const request = kind === 'code'
        ? api.codeChange({product, src:path}).then(r => {
            if (!r.ok || !r.change) throw new Error('Unavailable');
            const change = r.change as Change;
            return change.files.flatMap(file => [file.path, ...file.hunks.flatMap(h => h.rows.map(([mark, line]) => `${mark === '=' ? ' ' : mark} ${line}`))]).slice(0, 5).join('\n');
          })
        : api.readDoc({product, src:path}).then(r => {
            if (!r.ok) throw new Error('Unavailable');
            return (r.text ?? '').split('\n').filter(line => line.trim()).slice(0, 5).join('\n');
          });
      request.then(value => {if (live) setExcerpt(value || 'Empty document');}).catch(() => {if (live) setFailed(true);});
      return () => {live = false;};
    }
    api.resolveDoc({ product, src: path }).then(result => {
      if (!live) return;
      if (result.ok && result.url) setUrl(result.url);
      else setFailed(true);
    }).catch(() => {if (live) setFailed(true);});
    return () => {live = false;};
  }, [product, path, kind]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="artifact-thumbnail" data-kind={kind} aria-label="Artifact preview">
    {excerpt !== null ? <pre>{excerpt}</pre> : url && !failed ? <iframe src={url} title={`Preview of ${path.split('/').pop()}`} sandbox="allow-same-origin" tabIndex={-1} loading="lazy" onError={() => setFailed(true)} onLoad={revealFrame} style={{opacity:frameReady ? 0.55 : 0,transform:`scale(${width / 1200})`}} /> : failed ? <span>Preview unavailable</span> : <PreviewLoading delayed />}
    {url && !failed && <PreviewLoading ready={frameReady} delayed />}
  </div>;
}


type RetainedPreview = {host:HTMLDivElement; dispose:()=>void};
const thumbnails = new ThumbnailCache<RetainedPreview>(12);
let parking:HTMLDivElement | null = null;
function parkingArea() {
  if (!parking) {
    parking = document.createElement('div');
    parking.hidden = true;
    parking.inert = true;
    document.body.appendChild(parking);
  }
  return parking;
}
function movePreview(parent:HTMLElement, host:HTMLElement) {
  // Atomic DOM moves preserve the iframe's loaded document, unlike appendChild.
  (parent as HTMLElement & {moveBefore:(node:Node,before:Node|null)=>void}).moveBefore(host,null);
}

export function ArtifactThumbnail({product,path,revision = 0}:{product:string;path:string;revision?:number}) {
  const target = useRef<HTMLDivElement>(null);
  const canRetain = typeof Element !== 'undefined' && 'moveBefore' in Element.prototype;
  useLayoutEffect(() => {
    if (!canRetain || !target.current) return;
    const key = JSON.stringify([product,path,revision]);
    const entry = thumbnails.acquire(key, () => {
      const host = document.createElement('div');
      host.style.display = 'contents';
      parkingArea().appendChild(host);
      const root = createRoot(host);
      root.render(<ThumbnailContent product={product} path={path} />);
      return {host,dispose:()=>{queueMicrotask(()=>{root.unmount();host.remove();});}};
    });
    movePreview(target.current,entry.host);
    return () => {
      movePreview(parkingArea(),entry.host);
      thumbnails.release(key);
    };
  }, [product,path,revision,canRetain]);
  return canRetain ? <div ref={target} className="retained-preview" /> : <ThumbnailContent product={product} path={path} />;
}
