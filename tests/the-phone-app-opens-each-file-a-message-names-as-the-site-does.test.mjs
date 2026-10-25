// THE PHONE APP OPENS EACH FILE A MESSAGE NAMES, AS THE PHONE SITE DOES.
//
// Codex's audit of the app against the phone site (findings 25 and 26): the
// site draws a message's pictures, a folder's newest pictures, films and
// sounds in a player, and tiles for the documents and pages it names; a press
// opens the picture full screen, the document or the page in place, and says
// why when the file is on the computer, too big or still on its way. The app
// drew text and web links only, and even its own sent pictures were a line of
// brackets. Measured on the phone site built from this branch, against the
// preview's thread with a folder, a document, a page, a film and a big file
// (scripts/scratch/probe-files-open.mjs): each press below and what it did.
import { describe, it, expect } from 'vitest';
import { cloudPlaces } from '../renderer/src/cloud-files.ts';
import { phoneSlug } from '../renderer/src/phone-rows.ts';
import { messageBlocks } from '../mobile/src/lib/markdown';
import { openingOf, pictureLink, folderPictures, playable, typedWords, sentEmbeds, threadFilePaths, pageOnPhone } from '../mobile/src/lib/files';

const D = '0a1b2c3d4e5f';
const P = phoneSlug(D, 'agentbox');
const n = (c, ext) => `${c.repeat(64 / c.length)}.${ext}`;
const ROUND = 'designs/w-8b9c0d1e2f';
const SHOTS = ['quiet-2', 'dense-2', 'cards-2', 'quiet-1', 'dense-1', 'cards-1', 'quiet-0', 'dense-0'];
const files = {
  [`${ROUND}/inbox-versions.md`]: { n: n('d1', 'md'), s: 300 },
  [`${ROUND}/compare.html`]: { n: n('d2', 'html'), s: 900 },
  [`${ROUND}/page.css`]: { n: n('d3', 'css'), s: 40 },
  [`${ROUND}/walkthrough.mp4`]: { n: n('e1', 'mp4'), s: 4393 },
  [`${ROUND}/brief.pdf`]: { n: n('e2', 'pdf'), s: 9000 },
  [`${ROUND}/late.png`]: { n: n('e3', 'png'), s: 10 },
  'recordings/session.mov': { s: 812_000_000, big: true },
  ...Object.fromEntries(SHOTS.map((s, i) => [`${ROUND}/${s}.png`, { n: n(`c${i}`, 'png'), s: 100 }])),
};
const places = cloudPlaces([{ device: D, project: 'agentbox', snapshot: { item: { updatedAt: 1 }, attached: { dir: '~/docs/agentbox', files, folders: { [`${ROUND}/`]: SHOTS.map((s) => `${ROUND}/${s}.png`) } } } }], phoneSlug);
const DIR = places.get(P).dir;
const url = (name) => `https://cloud/${name}?token=t`;
// Every file has a link but the one still on its way from the computer.
const links = new Map(Object.values(files).filter((e) => e.n && e.n !== n('e3', 'png')).map((e) => [e.n, { url: url(e.n), until: Date.now() + 3600_000 }]));
const SENT = n('f1', 'jpg');
links.set(SENT, { url: url(SENT), until: Date.now() + 3600_000 });
const open = (src) => openingOf(places, links, P, src);

describe('what a press on a file opens', () => {
  it('a picture opens full screen, a document and a page in place, a film in a player', () => {
    expect(open(`${ROUND}/dense-2.png`)).toEqual({ kind: 'picture', src: `${ROUND}/dense-2.png`, link: url(n('c1', 'png')), name: 'dense-2.png' });
    expect(open(`${ROUND}/inbox-versions.md`)).toMatchObject({ kind: 'doc', link: url(n('d1', 'md')), name: 'inbox-versions.md' });
    expect(open(`${ROUND}/compare.html`)).toMatchObject({ kind: 'page', name: 'compare.html' });
    expect(open(`${ROUND}/walkthrough.mp4`)).toMatchObject({ kind: 'media', link: url(n('e1', 'mp4')) });
    // Written out in full from the home folder, as a worker on the Mac writes it.
    expect(open(`~/docs/agentbox/${ROUND}/compare.html`)).toMatchObject({ kind: 'page' });
  });

  it('a file the phone has but cannot draw goes to the browser, as the site opens its link', () => {
    expect(open(`${ROUND}/brief.pdf`)).toEqual({ kind: 'elsewhere', link: url(n('e2', 'pdf')) });
  });

  it('says why it cannot, in the site\'s words', () => {
    expect(open('recordings/session.mov')).toEqual({ kind: 'refused', error: 'This file is too big for your phone. Open it on your computer.' });
    expect(open('main/main.mjs')).toEqual({ kind: 'refused', error: 'This file is on your computer.' });
    expect(open(`${ROUND}/late.png`)).toEqual({ kind: 'refused', error: 'This file is on its way from your computer.' });
    expect(open(`phone-files/${n('f2', 'png')}`)).toEqual({ kind: 'refused', error: 'This file is still on its way.' });
  });

  it('a web address opens as the address it is', () => {
    expect(open('https://example.com/a.html')).toEqual({ kind: 'web', url: 'https://example.com/a.html' });
    expect(open('mailto:a@b.c')).toEqual({ kind: 'web', url: 'mailto:a@b.c' });
  });

  // The site says "This file is on your computer." for a folder whose pictures
  // it has just drawn; the app opens them.
  it('a folder opens its pictures, every one, in the order its grid draws them', () => {
    expect(open(`${ROUND}/`)).toEqual({ kind: 'folder', folder: `${DIR}/${ROUND}`, pictures: SHOTS.map((s) => `${DIR}/${ROUND}/${s}.png`) });
    expect(open('designs/elsewhere/')).toEqual({ kind: 'refused', error: 'This folder is on your computer.' });
  });
});

describe('what a message draws from the phone', () => {
  it('a picture is its link, waits while it is on its way, and is missing when it is not here', () => {
    expect(pictureLink(places, links, P, `${ROUND}/quiet-1.png`)).toBe(url(n('c3', 'png')));
    expect(pictureLink(places, links, P, `${DIR}/${ROUND}/quiet-1.png`)).toBe(url(n('c3', 'png')));
    expect(pictureLink(places, links, P, `${ROUND}/late.png`)).toBeUndefined();
    expect(pictureLink(places, links, P, `phone-files/${n('f2', 'png')}`)).toBeUndefined();
    expect(pictureLink(places, links, P, 'designs/none.png')).toBeNull();
  });

  it('a folder gives its pictures as the site\'s grid does: all of them, the count, and its full path', () => {
    expect(folderPictures(places, P, `${ROUND}/`)).toEqual({ folder: `${DIR}/${ROUND}`, pictures: SHOTS.map((s) => `${DIR}/${ROUND}/${s}.png`), total: 8 });
    expect(folderPictures(places, P, 'designs/none/')).toBeNull();
  });

  it('a film plays only when the phone has it, so a big one stays a name in its sentence', () => {
    expect(playable(places, links, P, `${ROUND}/walkthrough.mp4`)).toBe(true);
    expect(playable(places, links, P, 'recordings/session.mov')).toBe(false);
  });

  it('a folder on a line of its own is drawn as the folder, and a film the phone has as its player', () => {
    const can = (src) => playable(places, links, P, src);
    expect(messageBlocks(`The shots:\n\n~/docs/agentbox/${ROUND}/`, { dir: DIR })[1]).toEqual({ kind: 'folder', src: `${ROUND}/` });
    expect(messageBlocks(`The film: \`${ROUND}/walkthrough.mp4\` and after.`, { dir: DIR, playable: can })).toEqual([
      { kind: 'p', spans: [{ text: 'The film:' }] },
      { kind: 'media', src: `${ROUND}/walkthrough.mp4`, label: 'walkthrough.mp4' },
      { kind: 'p', spans: [{ text: 'and after.' }] },
    ]);
    // Too big for the phone: the site keeps it in the sentence, a name that says why when pressed.
    expect(messageBlocks('The full recording, `recordings/session.mov`, is too big.', { dir: DIR, playable: can })[0].spans[1])
      .toEqual({ text: 'session.mov', mention: { kind: 'media', src: 'recordings/session.mov' } });
  });
});

describe('a message you sent', () => {
  const text = `Use this one.\n\n![shot.jpg](phone-files/${SENT})\n[notes.txt](attachments/notes.txt)`;

  it('draws your words as you typed them and the files the app attached under them', () => {
    expect(typedWords(text)).toBe('Use this one.');
    expect(sentEmbeds(text)).toEqual([`![shot.jpg](phone-files/${SENT})`, '[notes.txt](attachments/notes.txt)']);
  });

  it('brackets you typed inside a sentence are your words, not a file', () => {
    const typed = 'Write it as ![alt](x.png) in the doc';
    expect(typedWords(typed)).toBe(typed);
    expect(sentEmbeds(typed)).toEqual([]);
  });

  it('a picture you sent is drawn from where you put it', () => {
    expect(pictureLink(places, links, P, `phone-files/${SENT}`)).toBe(url(SENT));
  });
});

describe('the tiles under a thread', () => {
  it('are its designs and its documents, never the files kept for the agents', () => {
    const item = { note: `See \`${ROUND}/compare.html\`, \`${ROUND}/inbox-versions.md\` and \`STATE.md\`, and \`notes.md\`.` };
    expect(threadFilePaths(item, DIR)).toEqual([`${ROUND}/compare.html`, `${ROUND}/inbox-versions.md`]);
    expect(threadFilePaths({ note: 'Nothing named.' }, DIR)).toEqual([]);
  });
});

describe('a page opened on the phone', () => {
  const page = '<link rel="stylesheet" href="page.css"><script>alert(1)</script><img src="quiet-1.png"><img src="https://example.com/x.png">';
  const read = async (u) => {
    if (u === url(n('d2', 'html'))) return page;
    if (u === url(n('d3', 'css'))) return 'body{background:url(quiet-2.png)}';
    throw new Error('not here');
  };

  it('points what it draws at the links, takes in its stylesheet, and runs none of its code', async () => {
    const out = await pageOnPhone(places, links, P, `${ROUND}/compare.html`, read);
    expect(out.ok).toBe(true);
    expect(out.html).toContain(`<img src="${url(n('c3', 'png'))}">`);
    expect(out.html).toContain(`url(${url(n('c0', 'png'))})`);
    expect(out.html).toContain('<img src="https://example.com/x.png">');
    expect(out.html).not.toContain('<script');
    expect(out.html).not.toContain('<link');
  });

  it('says why when the page is not on the phone, or could not be read', async () => {
    expect(await pageOnPhone(places, links, P, 'designs/none.html', read)).toEqual({ ok: false, error: 'This file is on your computer.' });
    expect(await pageOnPhone(places, links, P, `${ROUND}/compare.html`, async () => { throw new Error('This page could not be read.'); }))
      .toEqual({ ok: false, error: 'This page could not be read.' });
  });
});
