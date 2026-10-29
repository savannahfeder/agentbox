import { DOC_SCHEMES, isScheme } from '../shared/schemes.mjs';

export function wantsDocumentHeight(url) {
  try {
    const parsed = new URL(url);
    return isScheme(DOC_SCHEMES, parsed.protocol) && parsed.searchParams.get('agentbox-height') === '1';
  } catch { return false; }
}

/** Runs in the document's own origin, without exposing the inbox to it. */
export function reportDocumentHeight(page) {
  const doc = page.document;
  let previous = 0;
  let viewport = page.innerHeight;
  const measure = () => {
    const height = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0));
    if (height > 0 && height !== previous) {
      previous = height;
      // The inbox is loaded from file://, an opaque origin no target but '*' can name; only a height leaves.
      // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
      page.parent.postMessage({ type: 'agentbox-document-height', height }, '*');
    }
  };
  const observer = new page.ResizeObserver(() => {
    // A viewport-sized page must not grow again because its frame just grew.
    if (viewport !== page.innerHeight) { viewport = page.innerHeight; return; }
    measure();
  });
  observer.observe(doc.documentElement);
  if (doc.body) observer.observe(doc.body);
  page.addEventListener('load', measure, true);
  page.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  measure();
}

export const DOCUMENT_HEIGHT_SCRIPT = `(${reportDocumentHeight.toString()})(window)`;
