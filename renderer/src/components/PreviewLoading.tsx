import {useEffect,useState} from 'react';
/** Preserve the document surface while its contents arrive. */
export function PreviewLoading({ready = false, delayed = false}: {ready?: boolean; delayed?:boolean}) {
  const [visible,setVisible] = useState(!delayed);
  useEffect(() => {
    setVisible(!delayed);
    if (!delayed || ready) return;
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [delayed,ready]);
  return <div className="preview-loading" role="status" aria-label="Loading preview" aria-hidden={ready || !visible} data-ready={ready} data-delayed={delayed && !visible}>
    <div className="preview-skeleton" aria-hidden="true">
      <div className="preview-skeleton-title" />
      <div className="preview-skeleton-line" />
      <div className="preview-skeleton-line preview-skeleton-short" />
      <div className="preview-skeleton-block" />
      <div className="preview-skeleton-line" />
      <div className="preview-skeleton-line preview-skeleton-short" />
    </div>
  </div>;
}
