// HTML files kept a tall, independently scrolling frame in chat. Their compact
// preview must offer the full reader without weakening the phone sandbox.
// A blanket iframe rule also blocked video controls; check the reader's override
// and keep thumbnail cards passive.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HtmlPreview } from '../renderer/src/components/HtmlPreview.tsx';

const screen = vi.hoisted(() => ({ phone: false }));
vi.mock('../renderer/src/phone-screen', () => ({ onPhone: () => screen.phone }));
afterEach(() => { screen.phone = false; });

const draw = (path = 'designs/review.html', expanded = false) => renderToStaticMarkup(h(HtmlPreview, {
  path, url: '/files/review.html', expanded, onExpandedChange: () => {},
}));

describe('an HTML file preview', () => {
  it('accepts clicks in the compact and expanded reader, while thumbnails stay passive', () => {
    const css = readFileSync(new URL('../renderer/src/workspace-navigation.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.workspace-layout \.focus-pane \.one-frame\s*\{[^}]*pointer-events:\s*auto\s*;/);
    expect(css).toMatch(/\.artifact-thumbnail iframe\s*\{[^}]*pointer-events:\s*none\s*;/);
    for (const expanded of [false, true]) {
      expect(draw('designs/review.html', expanded)).toContain(`class="one-frame${expanded ? ' is-expanded' : ''}"`);
    }
  });

  it.each(['designs/review.html', 'designs/review.htm'])('bounds %s and offers the full reader', (path) => {
    const html = draw(path);
    expect(html).toContain('document-preview-frame');
    expect(html).toContain('scrolling="no"');
    expect(html).toContain('Show full document');
    expect(html).toContain(`title="${path}"`);
    expect(html).toContain('aria-expanded="false"');
  });

  it('keeps the desktop sandbox and the resolved address', () => {
    const html = draw();
    expect(html).toContain('src="/files/review.html"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
  });

  it('keeps a phone page isolated from the inbox', () => {
    screen.phone = true;
    expect(draw()).toContain('sandbox="allow-scripts"');
    expect(draw()).not.toContain('allow-same-origin');
  });

  it('expands in chat with a collapse button at the bottom', () => {
    const html = draw('designs/review.html', true);
    expect(html).toContain('document-preview-frame is-expanded');
    expect(html).toContain('scrolling="auto"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Show preview');
    expect(html).not.toContain('Show full document');
  });
});
