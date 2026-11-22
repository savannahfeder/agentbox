// A picture in Priya's hand-over was labelled 'attachments/mwqm8cwr-slbmr9-empty-state-side-by-side.png':
// its title and the not-delivered fallback used the saved path, not the file's name (tester issue 102).
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactImg, ArtifactMedia } from '../renderer/src/components/Focus.tsx';

const SENT = 'attachments/mwqm8cwr-slbmr9-empty-state-side-by-side.png';
const ROOTS = ['/store/accounts/acct/payments'];

describe('a picture sent with a message', () => {
  it('is titled by the name it was sent as, the reported one', () => {
    const html = renderToStaticMarkup(createElement(ArtifactImg, { src: SENT, roots: ROOTS, onOpen: () => {} }));
    expect(html).toContain('title="empty-state-side-by-side.png"');
    expect(html).not.toContain('title="attachments/');
    // What a press and a right click read is still the path.
    expect(html).toContain(`data-picture="${SENT}"`);
    expect(html).toContain(`data-copy-file="${SENT}"`);
  });

  it('a picture of the project keeps its own file name as its title', () => {
    const html = renderToStaticMarkup(createElement(ArtifactImg, { src: 'designs/the-shot.png', roots: ROOTS, onOpen: () => {} }));
    expect(html).toContain('title="the-shot.png"');
    expect(html).toContain('data-picture="designs/the-shot.png"');
  });

  it('that never arrived is named by that name too', () => {
    const html = renderToStaticMarkup(createElement(ArtifactMedia, { src: 'attachments/mwqm8cwr-slbmr9-walkthrough.mp4', roots: [] }));
    expect(html).toContain('<span class="missing-artifact">walkthrough.mp4</span>');
  });
});
