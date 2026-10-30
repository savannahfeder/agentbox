// Expanded HTML stayed inside a viewport-height iframe. Measure the document
// bridge and verify that only the expanded reader asks for content sizing.
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventEmitter } from 'node:events';
import { reportDocumentHeight, wantsDocumentHeight } from '../main/frame-document-height.mjs';
import { quietTheFramesScrollbars } from '../main/frame-scrollbars.mjs';
import { HtmlPreview } from '../renderer/src/components/HtmlPreview.tsx';

describe('expanded HTML shows the whole page', () => {
  it('installs the sizing bridge only in the requested document frame', () => {
    const contents = new EventEmitter();
    contents.mainFrame = {};
    quietTheFramesScrollbars(contents);
    for (const expanded of [false, true]) {
      const frame = Object.assign(new EventEmitter(), {
        url: `astral-doc://file/review.html${expanded ? '?agentbox-height=1' : ''}`,
        executeJavaScript: vi.fn(async () => {}),
      });
      contents.emit('frame-created', {}, { frame });
      frame.emit('dom-ready');
      expect(frame.executeJavaScript.mock.calls.some(([script]) => script.includes('agentbox-document-height'))).toBe(expanded);
    }
  });

  it('only measures an explicitly expanded local document', () => {
    expect(wantsDocumentHeight('astral-doc://file/a.html?agentbox-height=1')).toBe(true);
    expect(wantsDocumentHeight('astral-doc://file/a.html')).toBe(false);
    expect(wantsDocumentHeight('https://example.com/a.html?agentbox-height=1')).toBe(false);
  });

  it.each([280, 680, 4200])('reports all %i pixels and later content changes', (height) => {
    let resize;
    const postMessage = vi.fn();
    const page = {
      innerHeight: 680,
      document: { documentElement: { scrollHeight: height }, body: { scrollHeight: height } },
      parent: { postMessage },
      ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
      addEventListener: vi.fn(),
      requestAnimationFrame: (callback) => { callback(); return 1; },
    };
    reportDocumentHeight(page);
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'agentbox-document-height', height }, '*');
    page.document.documentElement.scrollHeight = 6000;
    resize();
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'agentbox-document-height', height: 6000 }, '*');
    page.innerHeight = 6000;
    page.document.documentElement.scrollHeight = 6016;
    resize();
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('requests sizing only when expanded, preserving the original query and hash', () => {
    const draw = (expanded) => renderToStaticMarkup(h(HtmlPreview, {
      path: 'review.html', url: 'astral-doc://file/review.html?v=2#end', expanded, onExpandedChange() {},
    }));
    expect(draw(false)).not.toContain('agentbox-height');
    expect(draw(true)).toContain('v=2&amp;agentbox-height=1#end');
  });
});
