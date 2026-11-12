import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { watchDocumentOverflow } from '../document-preview';
import '../document-preview.css';

export function DocumentPreview({ children, expanded, onExpandedChange, alwaysExpandable = false, onOpen }: {
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  alwaysExpandable?: boolean;
  /** Opens the document beside the chat, in place of unfolding it inside the card. */
  onOpen?: () => void;
}) {
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const wasExpanded = useRef(expanded);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    if (wasExpanded.current && !expanded) {
      const preview = frame.current?.closest('.one-file') ?? frame.current;
      preview?.scrollIntoView({ block: 'nearest' });
    }
    wasExpanded.current = expanded;
    if (!expanded && !alwaysExpandable && content.current && frame.current) {
      return watchDocumentOverflow(content.current, frame.current, setOverflow);
    }
  }, [expanded, alwaysExpandable]);

  return (
    <div className="document-preview">
      <div id={id} ref={frame} className={`document-preview-frame${expanded ? ' is-expanded' : overflow || alwaysExpandable ? ' is-cut' : ''}${onOpen ? ' opens' : ''}`}
        onClick={onOpen ? (event) => {
          // A selection, or a link in the page, is not a press on the page.
          if (window.getSelection()?.toString() || (event.target as HTMLElement).closest('a, button, video, audio')) return;
          onOpen();
        } : undefined}>
        <div ref={content}>{children}</div>
      </div>
      {onOpen ? (
        <button type="button" className="document-preview-toggle" onClick={onOpen}>Open on the side</button>
      ) : (overflow || expanded || alwaysExpandable) && (
        <button type="button" className="document-preview-toggle" aria-expanded={expanded} aria-controls={id}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
          onClick={() => onExpandedChange(!expanded)}>
          {expanded ? 'Show preview' : 'Show full document'}
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
          </svg>
        </button>
      )}
    </div>
  );
}
