// A MERMAID CHART IN A MESSAGE, DRAWN (tests/a-flowchart-in-a-message-is-drawn-as-a-chart).
//
// The library is about a megabyte, so it is fetched the first time a chart is
// on screen and never by a window that shows none. It runs in its strict mode,
// which strips script and html out of labels, because the source is whatever a
// worker wrote. A chart that will not draw shows its source exactly as before,
// so a typo costs her the picture and never the words.

import { useEffect, useState, type ReactNode } from 'react';

type Mermaid = typeof import('mermaid')['default'];
let library: Promise<Mermaid> | null = null;
let next = 0;

// The look the window has now: its theme and its skin both move the colours.
const lookNow = () => {
  const root = document.documentElement;
  return `${root.getAttribute('data-theme')}|${root.getAttribute('data-skin')}`;
};

// One of the stylesheet's colours as the library can read it, rgb() rather
// than a var().
function cssColor(name: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

async function draw(source: string): Promise<string> {
  library ??= import('mermaid').then((m) => m.default);
  const mermaid = await library;
  // The chart is drawn in the app's own colours, so it reads as part of the
  // message in every look rather than as a picture pasted into it.
  const surface = cssColor('--bg-raised');
  const fontFamily = getComputedStyle(document.body).fontFamily;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'base',
    fontFamily,
    themeVariables: {
      darkMode: document.documentElement.getAttribute('data-theme') !== 'light',
      fontFamily,
      fontSize: '14px',
      background: surface,
      primaryColor: cssColor('--bg'),
      primaryBorderColor: cssColor('--line-strong'),
      primaryTextColor: cssColor('--text'),
      secondaryColor: surface,
      tertiaryColor: surface,
      lineColor: cssColor('--text-faint'),
      textColor: cssColor('--text'),
      edgeLabelBackground: surface,
      clusterBkg: surface,
      clusterBorder: cssColor('--line-strong'),
    },
  });
  const id = `ab-chart-${++next}`;
  try {
    return (await mermaid.render(id, source)).svg;
  } finally {
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  }
}

export function DiagramBlock({ source, fallback }: { source: string; fallback: ReactNode }) {
  const [look, setLook] = useState(lookNow);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  // The chart is redrawn when the look changes.
  useEffect(() => {
    const watch = new MutationObserver(() => setLook(lookNow()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    draw(source)
      .then((out) => { if (live) { setSvg(out); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [source, look]);

  if (failed) return <>{fallback}</>;
  return (
    <div className="code-wrap diagram-wrap">
      {svg
        ? <div className="diagram" role="img" aria-label="Chart" dangerouslySetInnerHTML={{ __html: svg }} />
        : <div className="diagram diagram-pending arriving" />}
      <button
        className={`code-copy ${copied ? 'copied' : ''}`}
        onClick={() => {
          navigator.clipboard.writeText(source).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }).catch(() => {});
        }}
      >{copied ? 'copied ✓' : 'copy'}</button>
    </div>
  );
}
