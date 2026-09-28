// A PICTURE ON A CARD OPENS WHEN SHE CLICKS IT.
//
// MEASURED IN A REAL WINDOW on 2026-08-29 rather than read off the source,
// driving the five ways a message ever names a picture past the app's own main
// process. Three of them opened and two did
// not:
//
//   designs/the-shot.png            a link          click handler: a
//   [the drawing](designs/…png)     a link          click handler: a
//   the chip at the foot            a button        click handler: button
//   `designs/the-shot.png`          the PICTURE     click handlers: NONE
//   ![the drawing](designs/…png)    the PICTURE     click handlers: NONE
//
// So the thing on the card that most looks like the picture was the only thing
// that was not a door, and the markdown image is the form briefs/worker.md asks
// a worker for. This holds the picture as a door, and holds the two cases where
// it must not become one.
//
// Rendering rather than reading the source, because the failure is structural:
// a picture that draws perfectly and answers no click has no symptom to grep
// for.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IMG_SCHEME } from '../shared/schemes.mjs';
import { ArtifactImg } from '../renderer/src/components/Focus.tsx';

const ROOTS = ['/store/accounts/acct/agentbox', '/store/accounts/acct/astral/designs'];
const draw = (props) => renderToStaticMarkup(createElement(ArtifactImg, { roots: ROOTS, onOpen: () => {}, ...props }));

describe('a picture a worker put in a message', () => {
  it('is wrapped in something that can be clicked', () => {
    const html = draw({ src: 'designs/w-360943ef8d/the-shot.png' });
    expect(html).toContain('<button');
    expect(html).toContain('class="inline-image-open"');
    expect(html).toContain('<img');
    // The picture is INSIDE the door, not beside it.
    expect(html.indexOf('<button')).toBeLessThan(html.indexOf('<img'));
  });

  it('hands the door the path the message wrote, so the opener resolves it', () => {
    const html = draw({ src: './designs/w-360943ef8d/the-shot.png' });
    expect(html).toContain('title="designs/w-360943ef8d/the-shot.png"');
    // The same attribute the chips carry, so a right click offers the file.
    expect(html).toContain('data-copy-file="designs/w-360943ef8d/the-shot.png"');
  });

  it('opens a picture written out in full from the root', () => {
    const html = draw({ src: '/store/accounts/acct/astral/designs/the-shot.png' });
    expect(html).toContain('data-copy-file="/store/accounts/acct/astral/designs/the-shot.png"');
  });

  it('opens a picture named as a file:// url, by its path', () => {
    const html = draw({ src: 'file:///store/accounts/acct/astral/designs/a%20shot.png' });
    expect(html).toContain('data-copy-file="/store/accounts/acct/astral/designs/a shot.png"');
  });

  it('still draws the picture on the app scheme, never file://', () => {
    // an http page may not load a file:// picture, and hers is served over
    // http. Making the picture clickable must not undo that.
    const html = draw({ src: 'designs/the-shot.png' });
    expect(html).toContain(`${IMG_SCHEME}://file/`);
    expect(html).not.toContain('file:///');
  });
});

describe('what does not become a door', () => {
  it('a pasted picture carrying its own bytes, because there is no file to open', () => {
    const html = draw({ src: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(html).not.toContain('<button');
    expect(html).toContain('<img');
  });

  it('a picture drawn by something that gave no way to open one', () => {
    const html = renderToStaticMarkup(createElement(ArtifactImg, { src: 'designs/the-shot.png', roots: ROOTS }));
    expect(html).not.toContain('<button');
    expect(html).toContain('<img');
  });

  it('a path that is not on disk anywhere, which still says so rather than pretending', () => {
    const html = renderToStaticMarkup(createElement(ArtifactImg, { src: 'designs/gone.png', roots: [], onOpen: () => {} }));
    expect(html).toContain('missing image: designs/gone.png');
    expect(html).not.toContain('<button');
  });
});
