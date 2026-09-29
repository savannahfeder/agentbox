// A FILE OR AN ADDRESS A WORKER NAMES IN A MESSAGE IS SOMETHING SHE CAN CLICK.
//
// Filed with a screenshot of a result naming five voice samples,
// `designs/w-…/voices/alice.mp3 designs/w-…/voices/lily.mp3 …`, all five drawn
// as plain grey text: no link, no player, nothing to press. The ask was the
// general one, links "quite often" not showing up as links or previews.
//
// MEASURED OVER EVERY AGENT MESSAGE IN THE STORE FOR THE 30 DAYS BEFORE,
// 2026-09-29: 1,844 results, checkpoints and bodies run through the pane's own
// markdown pipeline (remark-gfm plus remark-artifact-paths), counting what was
// still plain text afterwards. 221 of them, 12%, carried at least one dead
// reference, and four shapes made up nearly all of it:
//
//   a full path into the product's own folder    88   (61 pages, 12 pdfs, 8 pictures)
//   an audio or video file                       41   (36 mp4, 5 mp3)
//   localhost:3000 with no http:// in front       18
//   a markdown document                          15
//
// Web addresses were fine: remark-gfm links anything with a scheme, including
// http://localhost. The rest were our own machinery (scripts, source files,
// paths into /tmp) and stay text on purpose, because a link is a promise that
// pressing it gets her somewhere.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkArtifactPaths, isMediaPath, productPath } from '../renderer/src/remark-artifact-paths.ts';
import os from 'node:os';
import { servable, byteRange, mediaResponse, mediaType } from '../main/img-scheme.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const para = (...children) => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const text = (value) => ({ type: 'text', value });
const only = (tree) => tree.children[0].children;
const links = (tree) => only(tree).filter((n) => n.type === 'link').map((n) => n.url);
const run = (value, opts) => { const tree = para(text(value)); linkArtifactPaths(tree, opts); return tree; };

const DIR = '/Users/you/Zero/accounts/acct/astral';

describe('an audio or video file named in a sentence', () => {
  it('becomes a link, which the pane draws as a player', () => {
    const tree = run('designs/w-a9/voices/alice.mp3');
    expect(only(tree)).toHaveLength(1);
    expect(only(tree)[0].type).toBe('link');
    expect(only(tree)[0].url).toBe('designs/w-a9/voices/alice.mp3');
  });

  it('links all five of the card she sent, on one line', () => {
    const names = ['alice', 'lily', 'sarah', 'matilda', 'library-lily'];
    const tree = run(names.map((n) => `designs/w-a9da9d725e/voices/${n}.mp3`).join(' '));
    expect(links(tree)).toEqual(names.map((n) => `designs/w-a9da9d725e/voices/${n}.mp3`));
  });

  it('covers every audio and video kind a worker writes', () => {
    for (const name of ['a.mp3', 'a.MP3', 'a.wav', 'a.m4a', 'a.aac', 'a.ogg', 'a.mp4', 'a.mov', 'a.m4v', 'a.webm']) {
      expect(links(run(`renders/${name}`)), name).toEqual([`renders/${name}`]);
      expect(isMediaPath(`renders/${name}`), name).toBe(true);
    }
  });

  it('is told apart from a picture and a page', () => {
    expect(isMediaPath('designs/a.png')).toBe(false);
    expect(isMediaPath('designs/a.html')).toBe(false);
    expect(isMediaPath('https://example.com/a.mp3')).toBe(false);
    expect(isMediaPath('designs/a.mp4?t=3')).toBe(true);
  });
});

describe('a markdown document named in a sentence', () => {
  it('becomes a link, since the pane opens one', () => {
    expect(links(run('The script is in designs/w-1d/demo-script.md, have a read.')))
      .toEqual(['designs/w-1d/demo-script.md']);
  });
});

describe('a full path into the product folder', () => {
  it('becomes a link to the short path the rest of the app understands', () => {
    const tree = run(`It is at ${DIR}/designs/w-3a/latest.html now.`, { dir: DIR });
    expect(links(tree)).toEqual(['designs/w-3a/latest.html']);
    // What she reads is what the worker wrote.
    expect(only(tree)[1].children[0].value).toBe(`${DIR}/designs/w-3a/latest.html`);
    expect(only(tree)[2].value).toBe(' now.');
  });

  it('written from the home folder with a tilde, too', () => {
    expect(links(run('~/Zero/accounts/acct/astral/designs/cut.mp4', { dir: DIR })))
      .toEqual(['designs/cut.mp4']);
  });

  it('a picture written in full is drawn, like a short one', () => {
    const tree = run(`${DIR}/designs/w-7b/planet.png`, { dir: DIR });
    expect(only(tree)[0].type).toBe('image');
    expect(only(tree)[0].url).toBe('designs/w-7b/planet.png');
  });

  it('stays text when it is outside the product, which is our scratch', () => {
    expect(links(run('It wrote /tmp/scratch/out.html and threw it away.', { dir: DIR }))).toEqual([]);
    expect(links(run('/Users/you/Desktop/dev/zero/renderer/index.html', { dir: DIR }))).toEqual([]);
  });

  it('stays text in a sibling product whose name starts the same way', () => {
    expect(links(run('/Users/you/Zero/accounts/acct/astral-video-agent/designs/a.html', { dir: DIR }))).toEqual([]);
  });

  it('stays text when the pane does not know the product folder', () => {
    expect(links(run(`${DIR}/designs/a.html`))).toEqual([]);
  });

  it('stays text when it is a script, even in her folder', () => {
    expect(links(run(`${DIR}/designs/w-96/land-it.sh`, { dir: DIR }))).toEqual([]);
  });
});

describe('a local address with no http in front', () => {
  it('becomes a link to it, which opens in the pane', () => {
    const tree = run('The app is running at localhost:3000, open it.');
    expect(links(tree)).toEqual(['http://localhost:3000']);
    expect(only(tree)[1].children[0].value).toBe('localhost:3000');
    expect(only(tree)[2].value).toBe(', open it.');
  });

  it('keeps its path and drops the full stop that ends the sentence', () => {
    expect(links(run('Draft is on localhost:3011/dev/draft.'))).toEqual(['http://localhost:3011/dev/draft']);
    expect(links(run('Try 127.0.0.1:5173.'))).toEqual(['http://127.0.0.1:5173']);
  });

  it('is not a word that merely says localhost, or a port on its own', () => {
    expect(links(run('It binds localhost on port 3000.'))).toEqual([]);
    expect(links(run('Set mylocalhost:3000 in the config.'))).toEqual([]);
  });

  it('is not linked twice when remark-gfm already made it a link', () => {
    const tree = para({ type: 'link', url: 'http://localhost:3000', children: [text('http://localhost:3000')] });
    linkArtifactPaths(tree);
    expect(only(tree)).toHaveLength(1);
    expect(only(tree)[0].children[0].type).toBe('text');
  });
});

describe('what stays text, because pressing it would go nowhere she wants', () => {
  it('source files and scripts', () => {
    expect(links(run('The fold is in renderer/src/list-rules.ts, main/store.mjs and scripts/land.sh.'))).toEqual([]);
  });
});

describe('the pane draws a player for audio and video', () => {
  const focus = read('renderer/src/components/Focus.tsx');

  it('hands a media link to the player before it becomes plain blue text', () => {
    const a = focus.slice(focus.indexOf('a: ({ href, children }'), focus.indexOf('img: ({ src, alt }'));
    expect(a).toContain('ArtifactMedia');
    expect(a.indexOf('ArtifactMedia')).toBeLessThan(a.indexOf('ArtifactLink'));
  });

  it('asks for the file on the app scheme, never file://, which her window cannot load', () => {
    const media = focus.slice(focus.indexOf('export function ArtifactMedia'), focus.indexOf('function ArtifactLink'));
    expect(media).toContain('pictureUrl(');
    expect(media).toContain('<audio');
    expect(media).toContain('<video');
    expect(media).not.toContain('file://');
  });

  it('tells the plugin which folder is the product, so a full path can be linked', () => {
    expect(focus).toMatch(/remarkArtifactPaths, \{ dir: productDir/);
  });

  it('links a full path in backticks into the product folder, the way it does in a sentence', () => {
    expect(focus).toContain('productPath(shown, productDir)');
    expect(productPath(`${DIR}/GreatCollections-form-TO-SIGN.pdf`, DIR)).toBe('GreatCollections-form-TO-SIGN.pdf');
    expect(productPath(`${DIR}-video/a.pdf`, DIR)).toBe(null);
    expect(productPath('designs/a.pdf', DIR)).toBe(null);
  });

  it('links a code span that is nothing but an audio or video path, too', () => {
    const pathRe = focus.match(/const PATH_RE = (\/.*\/i);/)[1];
    expect(pathRe).toContain('mp3');
    expect(pathRe).toContain('mp4');
  });
});

describe('the app hands the window audio and video, from its own folders only', () => {
  const roots = ['/Users/x/Store/accounts/acct', '/Users/x/code/zero'];

  it('serves a voice sample and a render inside the store', () => {
    expect(servable('/Users/x/Store/accounts/acct/astral/designs/w-a9/voices/lily.mp3', roots)).toBe(true);
    expect(servable('/Users/x/Store/accounts/acct/astral/designs/cut.mp4', roots)).toBe(true);
  });

  it('serves none of them outside the folders it owns', () => {
    expect(servable('/Users/x/Music/song.mp3', roots)).toBe(false);
  });

  it('still refuses everything that is not a picture, a sound or a film', () => {
    expect(servable('/Users/x/Store/accounts/acct/zero.config.json', roots)).toBe(false);
    expect(servable('/Users/x/Store/accounts/acct/astral/decisions.md', roots)).toBe(false);
  });
});

// A PLAYER THAT CANNOT BE MOVED IS HALF A PLAYER. Measured in a hidden Electron
// window on her own lily.mp3, served through net.fetch the way pictures are:
// duration 39.36, seekable [0, 0], a jump to the middle stayed at 0. Answered
// in the range asked for: seekable [0, 39.36], the jump landed at 19.68. Her
// 141-second render did the same and asked for its second half on its own.
describe('a sound or a film is answered in the piece the player asks for', () => {
  it('reads the three shapes of range a player sends', () => {
    expect(byteRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(byteRange('bytes=200-299', 1000)).toEqual({ start: 200, end: 299 });
    expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('clips an end past the file, and gives the whole file when nothing is asked', () => {
    expect(byteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange(null, 1000)).toBe(null);
    expect(byteRange('pages=1-2', 1000)).toBe(null);
  });

  it('refuses a range that starts past the end', () => {
    expect(byteRange('bytes=1000-', 1000)).toBe(false);
    expect(byteRange('bytes=5-2', 1000)).toBe(false);
  });

  it('sends back exactly those bytes, with a 206 and the range it covers', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-range-'));
    const file = path.join(dir, 'voice.mp3');
    fs.writeFileSync(file, Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
    const part = await mediaResponse(file, 'bytes=10-19');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 10-19/256');
    expect(part.headers.get('content-type')).toBe('audio/mpeg');
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const whole = await mediaResponse(file, null);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect((await whole.arrayBuffer()).byteLength).toBe(256);
    expect((await mediaResponse(file, 'bytes=999-')).status).toBe(416);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is what the app answers a sound or a film with, and only those', () => {
    const main = read('main/main.mjs');
    expect(main).toMatch(/mediaType\(file\)\s*\?\s*await mediaResponse\(file, request\.headers\.get\('range'\)\)/);
    expect(mediaType('/a/b.mp4')).toBe('video/mp4');
    expect(mediaType('/a/b.png')).toBe(null);
  });
});
