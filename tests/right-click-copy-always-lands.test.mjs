// w-f7d2841075: "Copy" in the right-click menu left the old clipboard in place.
// The page's own copy did not land in the real app, so the words she clicked on
// are written directly when it does not.
import { describe, it, expect } from 'vitest';
import { copySelection } from '../main/copy-selection.mjs';

function fakeClipboard(start = 'what she copied an hour ago') {
  let text = start;
  let formats = start ? ['text/plain'] : [];
  return {
    get text() { return text; },
    clear() { text = ''; formats = []; },
    availableFormats() { return formats; },
    writeText(t) { text = t; formats = ['text/plain']; },
    land(t) { text = t; formats = ['text/plain', 'text/html']; },
  };
}
const noWait = { sleep: async () => {} };

describe('Copy in the right-click menu', () => {
  it('writes the clicked words when the page copy lands nothing (the bug)', async () => {
    const clip = fakeClipboard();
    const how = await copySelection({ copy() {} }, 'the landing page draft', clip, noWait);
    expect(how).toBe('direct');
    expect(clip.text).toBe('the landing page draft');
  });

  it('never leaves the old clipboard behind, even if copy throws', async () => {
    const clip = fakeClipboard();
    await copySelection({ copy() { throw new Error('destroyed'); } }, 'designs/landing.html', clip, noWait);
    expect(clip.text).toBe('designs/landing.html');
  });

  it("keeps the page's own copy when it lands, because it carries the rich version", async () => {
    const clip = fakeClipboard();
    const how = await copySelection({ copy() { clip.land('the landing page draft, rewritten by copy-out'); } }, 'the landing page draft', clip, noWait);
    expect(how).toBe('page');
    expect(clip.text).toBe('the landing page draft, rewritten by copy-out');
  });

  it('keeps a page copy that lands a moment later', async () => {
    const clip = fakeClipboard();
    let ticks = 0;
    const how = await copySelection({ copy() {} }, 'words', clip, { sleep: async () => { if (++ticks === 3) clip.land('rich words'); } });
    expect(how).toBe('page');
    expect(clip.text).toBe('rich words');
  });

  it('does not clear her clipboard when nothing was selected', async () => {
    const clip = fakeClipboard();
    await copySelection({ copy() {} }, '', clip, noWait);
    expect(clip.text).toBe('what she copied an hour ago');
  });
});
