import {useEffect,useState} from 'react';
/** Preserve the document surface while its contents arrive. */
// `words` is only ever passed for a local address (../local-preview.ts), where
// the wait can be long or endless. A file stays the quiet skeleton alone.
// `stopped` is an address nothing answers: the skeleton goes, because nothing
// is on its way, and only the words and Try again are left.
export function PreviewLoading({ready = false, delayed = false, words, stopped = false, onRetry}: {
  ready?: boolean; delayed?: boolean;
  words?: {title: string; detail?: string; retry: boolean} | null;
  stopped?: boolean; onRetry?: () => void;
}) {
  const [visible,setVisible] = useState(!delayed);
  useEffect(() => {
    setVisible(!delayed);
    if (!delayed || ready) return;
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [delayed,ready]);
  return <div className="preview-loading" role="status" aria-label="Loading preview" aria-hidden={ready || !visible} data-ready={ready} data-delayed={delayed && !visible} data-stopped={stopped}>
    {!stopped && <div className="preview-skeleton" aria-hidden="true">
      <div className="preview-skeleton-title" />
      <div className="preview-skeleton-line" />
      <div className="preview-skeleton-line preview-skeleton-short" />
      <div className="preview-skeleton-block" />
      <div className="preview-skeleton-line" />
      <div className="preview-skeleton-line preview-skeleton-short" />
    </div>}
    {words && !ready && <div className="preview-words" aria-live="polite">
      <div className="preview-words-title">{!stopped && <span className="preview-words-pulse" aria-hidden="true" />}{words.title}</div>
      {words.detail && <div className="preview-words-detail">{words.detail}</div>}
      {words.retry && onRetry && <button type="button" className="preview-words-retry" onClick={onRetry}>Try again</button>}
    </div>}
  </div>;
}
