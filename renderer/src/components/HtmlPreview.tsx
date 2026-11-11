import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { letThePagePinch, onPhone } from '../phone-screen';
import { DocumentPreview } from './DocumentPreview';

export function HtmlPreview({ url, path, expanded, onExpandedChange }: {
  url: string; path: string; expanded: boolean; onExpandedChange: (expanded: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => (onPhone() ? letThePagePinch() : undefined), []);
  useLayoutEffect(() => {
    setHeight(undefined);
    if (!expanded) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'agentbox-document-height') return;
      const next = event.data.height;
      if (typeof next === 'number' && Number.isFinite(next) && next > 0 && next <= 10_000_000) setHeight(Math.ceil(next));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [expanded, url]);
  const source = new URL(url, 'http://agentbox.invalid');
  if (expanded) source.searchParams.set('agentbox-height', '1');
  const src = !expanded ? url : /^[a-z][a-z\d+.-]*:/i.test(url) ? source.href : source.pathname + source.search + source.hash;
  return (
    <DocumentPreview expanded={expanded} onExpandedChange={onExpandedChange} alwaysExpandable>
      <iframe ref={frame} key={expanded ? 'reader' : 'preview'} className={`one-frame${expanded ? ' is-expanded' : ''}`} src={src} title={path}
        style={expanded && height ? { height } : undefined}
        scrolling={expanded ? 'auto' : 'no'} tabIndex={expanded ? 0 : -1}
        sandbox={onPhone() ? 'allow-scripts' : 'allow-scripts allow-same-origin'} />
    </DocumentPreview>
  );
}
