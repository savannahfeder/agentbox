// A web link clicked inside a file opened full screen, drawn over the file
// with the pane's own browser bar. Closing it puts you back on the file.
import { useCallback, useEffect, useRef, useState } from 'react';
import { addressYouTyped, canFrameAWebsite } from '../../../shared/websites.mts';
import { api } from '../api';
import { BrowserChrome } from './BrowserChrome';
import { CrossIcon } from './CrossIcon';
import { PreviewLoading } from './PreviewLoading';
import { WebsitePane, type Browsing, type PageControl } from './WebsitePane';

export function FileLinkBrowser({ url, product, backTo, onClose }: {
  url: string;
  product: string;
  /** What Close returns to, for its label: "the document", "the page". */
  backTo: string;
  onClose: () => void;
}) {
  const [here, setHere] = useState<Browsing>({ url, canBack: false, canForward: false, loading: true });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const browsing = useRef<PageControl | null>(null);
  const [ownBrowser] = useState(() => canFrameAWebsite(typeof document === 'undefined' ? null : document));
  const onReady = useCallback(() => setReady(true), []);

  // Escape pressed inside the page never reaches this window; main sends it up.
  useEffect(() => {
    const zero = (window as unknown as { zero?: { onKeyInTheFile?: (f: (k: { key: string; fromGuest?: boolean }) => void) => (() => void) | void } }).zero;
    const off = zero?.onKeyInTheFile?.((k) => { if (k.fromGuest && k.key === 'Escape') onClose(); });
    return () => { if (typeof off === 'function') off(); };
  }, [onClose]);

  const openOutside = () => {
    void api.openArtifactExternally({ product, src: here.url });
  };
  const goTo = (typed: string) => {
    const to = addressYouTyped(typed);
    if (!to) return false;
    if (browsing.current) browsing.current.go(to);
    return true;
  };
  const closeWords = `Back to ${backTo} (esc)`;

  return (
    <div className="av-link-browser" role="region" aria-label="Web page">
      <BrowserChrome
        kind="website"
        url={here.url}
        canBack={here.canBack}
        canForward={here.canForward}
        loading={!ready}
        onBack={() => browsing.current?.back()}
        onForward={() => browsing.current?.forward()}
        onReload={() => browsing.current?.reload()}
        onOpenOutside={openOutside}
        onGo={goTo}
        marks={<button type="button" className="web-bar-step av-link-close" title={closeWords} aria-label={closeWords} onClick={onClose}><CrossIcon /></button>}
      />
      <div className="preview-frame av-link-page" aria-busy={!ready}>
        {failed
          ? <div className="doc-missing">{failed} Open it in your browser with the mark above.</div>
          : <>
              {!ready && <PreviewLoading />}
              <WebsitePane url={url} webview={ownBrowser} ready={ready} control={browsing}
                onNavigate={setHere} onReady={onReady} onFailed={setFailed} />
            </>}
      </div>
    </div>
  );
}
