// THE "SENT TO" LINE READS AS A TOAST AND LEAVES ON ITS OWN (w-d12e9e2981).
//
// The line above the reply box (w-4465054f04) was seen, but nobody took it for
// a toast: photographed on a copy of the built app, it had the page's own
// background and the reply box's hairline, no way to close it, and it was still
// there at 17 seconds because nothing but leaving the thread took it down.
//
// Five floating toasts were drawn next. The one lifted over the reply box with
// a shadow was judged too distracting ("you will probably lose about 3 seconds
// on every process"), the top of the thread covers what you read, and the top
// right went unseen. What was asked for: keep today's line, give it "the little
// X in the corner combined with a slightly different background", and let it go
// by itself. So the line keeps its place in the page and gains the toast grey,
// a close, and a ring around the close that stops under the pointer. The ring
// ran 8 seconds first; watching the film of it, that "gives too much time", so
// it is 5.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SentLine, SENT_LINE_MS } from '../renderer/src/components/SentLine.tsx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const line = read('renderer/src/components/SentLine.tsx');
const css = read('renderer/src/styles.css');
const phone = read('renderer/src/phone.css');
const rule = (sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? '';

const draw = (props) => renderToStaticMarkup(React.createElement(SentLine, {
  title: 'Review: welcome-email sequence rewrite', undoes: true,
  onBack: () => {}, onUndo: () => {}, onClose: () => {}, ...props,
}));

describe('it says it is a toast', () => {
  it('has a close at its end, after Back and Undo', () => {
    const html = draw();
    expect(html).toMatch(/<button[^>]*class="sent-line-close"[^>]*aria-label="Close"/);
    expect(html.indexOf('sent-line-close')).toBeGreaterThan(html.indexOf('Undo'));
  });

  it('keeps its close when there is nothing to undo', () => {
    expect(draw({ undoes: false })).toContain('sent-line-close');
  });

  it('sits on the toast grey rather than the page', () => {
    expect(rule('.sent-line')).toMatch(/background: var\(--pop\);/);
  });

  it('stays in the page above the reply box, with no shadow: the floating card was too much', () => {
    expect(rule('.sent-line')).not.toMatch(/position:\s*(fixed|absolute)/);
    expect(rule('.sent-line')).not.toMatch(/box-shadow/);
  });
});

describe('it leaves on its own', () => {
  it('after five seconds, counted by the ring around the close', () => {
    expect(SENT_LINE_MS).toBe(5000);
    const html = draw();
    expect(html).toMatch(/class="sent-line-ring-left"[^>]*animation-duration:5000ms/);
    expect(line).toMatch(/className="sent-line-ring-left"[^>]*onAnimationEnd=\{onClose\}/);
  });

  it('the ring empties once and stops', () => {
    expect(rule('.sent-line-ring-left')).toMatch(/animation: sent-line-ring linear forwards;/);
  });

  it('not while the pointer is on it', () => {
    expect(css).toMatch(/\.sent-line:hover \.sent-line-ring-left \{ animation-play-state: paused; \}/);
  });

  it('the close and the clock both clear it in the app', () => {
    const drawn = app.slice(app.indexOf('<SentLine'), app.indexOf('/>', app.indexOf('<SentLine')));
    expect(drawn).toContain('onClose={() => setToast(null)}');
  });
});

describe('on the phone', () => {
  it('the close is big enough to tap', () => {
    expect(phone).toMatch(/\.sent-line-close \{[^}]*width: 40px;[^}]*height: 40px;/);
  });
});
