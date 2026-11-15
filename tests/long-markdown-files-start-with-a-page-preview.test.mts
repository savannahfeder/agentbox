// Inline Markdown files used to add their entire height to chat. Measure the
// preview boundary and later layout changes so only overflowing files expand.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchDocumentOverflow } from '../renderer/src/document-preview.ts';

afterEach(() => vi.unstubAllGlobals());

function layout(height, limit = 560) {
  let resized;
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resized = callback; return observer; }
  });
  const content = { scrollHeight: height };
  const frame = { clientHeight: limit };
  const changed = vi.fn();
  const stop = watchDocumentOverflow(content, frame, changed);
  return { content, frame, changed, observer, stop, resize: () => resized() };
}

describe('a Markdown file in chat', () => {
  it.each([0, 559, 560, 561])('needs no expansion when %i pixels fit the preview', (height) => {
    const view = layout(height);
    expect(view.changed).toHaveBeenLastCalledWith(false);
    view.stop();
  });

  it.each([562, 18000])('offers expansion when %i pixels overflow the preview', (height) => {
    const view = layout(height);
    expect(view.changed).toHaveBeenLastCalledWith(true);
    view.stop();
  });

  it('updates when an image loads or the available preview height changes', () => {
    const view = layout(500);
    view.content.scrollHeight = 900;
    view.resize();
    expect(view.changed).toHaveBeenLastCalledWith(true);
    view.frame.clientHeight = 1000;
    view.resize();
    expect(view.changed).toHaveBeenLastCalledWith(false);
    expect(view.observer.observe.mock.calls.map(([element]) => element)).toEqual([view.content, view.frame]);
    view.stop();
    expect(view.observer.disconnect).toHaveBeenCalledOnce();
  });
});
