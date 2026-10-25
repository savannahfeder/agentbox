// A page off the web, drawn beside the thread. Everything else the pane draws
// is a file of ours; this is somebody else's running code, so it gets a
// browser of its own rather than a corner of the app's page.
//
// On the desktop that is an Electron `<webview>`: a separate process on its
// own session partition, and not a frame, so the X-Frame-Options and
// frame-ancestors headers that come with anything carrying a sign-in do not
// refuse it. What it may do is pinned below the tag by main/webview-guard.mjs.
// In a browser tab there is no such tag, so it falls back to an opaque
// iframe, which many sites will refuse; the way out to your own browser is
// always in the bar above.
import { useEffect, useRef } from 'react';
import { WEBSITE_PARTITION } from '../../../shared/websites.mjs';

// `<webview>` is Electron's own element, so React has no type for it.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        useragent?: string;
      };
    }
  }
}

/** What the bar above can make the page do (BrowserChrome via DocPane). */
export type PageControl = { back: () => void; forward: () => void; reload: () => void; go: (to: string) => void };

type Guest = HTMLElement & {
  getURL?: () => string;
  loadURL?: (to: string) => Promise<void>;
  goBack?: () => void;
  goForward?: () => void;
  reload?: () => void;
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
};

/** What the bar above the page can ask of it (BrowserChrome). */
export type Browsing = {
  url: string;
  canBack: boolean;
  canForward: boolean;
  loading: boolean;
};

/**
 * `webview` is whether this page can draw one, asked by the caller so a test
 * can hold both branches. `onNavigate` is how the bar follows the page: a
 * webview navigates inside itself, so after one click the thread's address is
 * no longer where you are.
 */
export function WebsitePane({ url, webview, ready = true, control, onNavigate, onReady, onFailed }: {
  url: string;
  webview: boolean;
  // Held invisible until the page says it is drawn, so a site that takes a
  // second shows the pane's own quiet cover rather than a white rectangle.
  ready?: boolean;
  // Handed back to the pane so the bar above can step the page. It is a ref
  // rather than state because pressing Back must reach the guest that is
  // mounted now, not the one a render closed over.
  control?: React.MutableRefObject<PageControl | null>;
  onNavigate: (here: Browsing) => void;
  onReady?: () => void;
  onFailed?: (why: string) => void;
}) {
  const guest = useRef<Guest | null>(null);

  useEffect(() => {
    const node = guest.current;
    if (!node || !webview) return;
    if (control) {
      control.current = {
        back: () => node.goBack?.(),
        forward: () => node.goForward?.(),
        reload: () => node.reload?.(),
        // A refused load already reaches did-fail-load; the promise only repeats it.
        go: (to) => node.loadURL?.(to)?.catch(() => {}),
      };
    }
    const where = (over: Partial<Browsing> = {}): Browsing => ({
      url: node.getURL?.() || url,
      canBack: !!node.canGoBack?.(),
      canForward: !!node.canGoForward?.(),
      loading: false,
      ...over,
    });
    const walked = () => onNavigate(where());
    const started = () => onNavigate(where({ loading: true }));
    const ready = () => { onReady?.(); walked(); };
    // -3 is Chromium's "load aborted", which every ordinary in-page
    // navigation also reports, so it is not a failure.
    const failed = (e: Event) => {
      const { errorCode, errorDescription, isMainFrame } = e as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean };
      if (isMainFrame === false || errorCode === -3) return;
      onFailed?.(errorDescription || 'That page could not be loaded.');
    };
    node.addEventListener('dom-ready', ready);
    node.addEventListener('did-navigate', walked);
    node.addEventListener('did-navigate-in-page', walked);
    node.addEventListener('did-stop-loading', walked);
    node.addEventListener('did-start-loading', started);
    node.addEventListener('did-fail-load', failed);
    return () => {
      if (control) control.current = null;
      node.removeEventListener('dom-ready', ready);
      node.removeEventListener('did-navigate', walked);
      node.removeEventListener('did-navigate-in-page', walked);
      node.removeEventListener('did-stop-loading', walked);
      node.removeEventListener('did-start-loading', started);
      node.removeEventListener('did-fail-load', failed);
    };
    // `url` is deliberately not a dependency: the webview keeps its own
    // history, and re-running this would tear the listeners off mid-step.
  }, [webview, control, onNavigate, onReady, onFailed]);

  if (webview) {
    return <webview
      ref={guest as React.Ref<HTMLElement>}
      className="doc-view doc-website-view"
      style={{ opacity: ready ? 1 : 0 }}
      src={url}
      partition={WEBSITE_PARTITION}
    />;
  }

  // Opaque on purpose: `allow-same-origin` beside `allow-scripts` lets a page
  // escape its own sandbox, and on the phone door the app is served from this
  // very origin (main/serve.mjs).
  return <iframe
    className="doc-view doc-website-view"
    style={{ opacity: ready ? 1 : 0 }}
    src={url}
    title={url}
    sandbox="allow-scripts allow-forms"
    referrerPolicy="no-referrer"
    onLoad={() => onReady?.()}
  />;
}
