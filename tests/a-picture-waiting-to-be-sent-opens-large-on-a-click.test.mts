// A PICTURE WAITING TO BE SENT OPENS LARGE ON A CLICK (w-2e6c0d4fcd, 2026-11-20).
//
// "Sometimes I can't see the contents of an image I attach and quite often I
// wish I could have a way to expand it but I can't." A picture pasted into a
// reply box sat there as an 84px thumbnail (48px in a chat), and a click on it
// did nothing: the only control on it was the × that takes it away. A
// full-window screenshot at that size is unreadable.
//
// Now a click on the thumbnail opens it in the same full-screen viewer a
// picture in a thread opens in, stepping through the other pictures waiting
// with it. The viewer's "Open beside" and Preview are left off: a picture not
// yet sent is no file in the product to open anywhere else.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttachRow, stagedPictures } from '../renderer/src/components/AttachRow.tsx';

const shot = (name: string, data = 'iVBORw0KGgo=') => ({ name, image: true, dataBase64: data });
const file = (name: string) => ({ name, image: false, srcPath: `/x/${name}` });

describe('the pictures a click on a waiting thumbnail opens', () => {
  it('are every picture waiting, in order, open at the one clicked', () => {
    const list = [shot('a.png'), shot('b.png'), shot('c.png')];
    const { pictures, start } = stagedPictures(list, 1);
    expect(pictures.map((p) => p.path.split('/').pop())).toEqual(['a.png', 'b.png', 'c.png']);
    expect(start).toBe(1);
    expect(pictures[1].url).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('leave out a file and a voice note waiting beside them, and still open at the one clicked', () => {
    const list = [file('notes.pdf'), shot('a.png'), { name: 'voice-note-3200ms.webm', image: false, dataBase64: 'AA==' }, shot('b.png')];
    const { pictures, start } = stagedPictures(list, 3);
    expect(pictures.map((p) => p.path.split('/').pop())).toEqual(['a.png', 'b.png']);
    expect(start).toBe(1);
  });

  it('keep two pastes that share a name apart', () => {
    const { pictures } = stagedPictures([shot('pasted.png', 'QQ=='), shot('pasted.png', 'Qg==')], 0);
    expect(new Set(pictures.map((p) => p.path)).size).toBe(2);
    expect(pictures.map((p) => p.path.split('/').pop())).toEqual(['pasted.png', 'pasted.png']);
  });

  it('open nothing for a click on something that is not a picture', () => {
    expect(stagedPictures([file('notes.pdf'), shot('a.png')], 0)).toBe(null);
  });
});

describe('a waiting thumbnail', () => {
  const html = renderToStaticMarkup(h(AttachRow, { attachments: [shot('pasted-9406.png'), file('notes.pdf')], onRemove() {} }));

  it('is a button that says it opens the picture large', () => {
    expect(html).toMatch(/<button[^>]*class="attach-open"[^>]*aria-label="Open pasted-9406.png large"[^>]*>\s*<img/);
  });

  it('keeps its × to take it away, apart from the button that opens it', () => {
    expect(html).toMatch(/<\/button><button[^>]*class="attach-remove"/);
  });

  it('shows a pointer that zooms in', () => {
    const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.attach-open\s*\{[^}]*cursor:\s*zoom-in/);
  });
});

describe('the viewer opened on a picture not yet sent', () => {
  const src = fs.readFileSync(new URL('../renderer/src/components/PictureView.tsx', import.meta.url), 'utf8');
  it('offers Open beside and Preview only when there is somewhere to open it', () => {
    expect(src).toMatch(/\{onBeside && <button[^\n]*title="Open beside the thread"/);
    expect(src).toMatch(/\{onPreview && !onPhone\(\) && <button[^\n]*title="Open in Preview"/);
  });
});
