// A PICTURE ON THE PHONE SAVES TO PHOTOS AND SHARES AS ITSELF.
//
// What broke (2026-11-08, from the phone app): "On mobile I feel like I can't
// do a lot of things I'd like to, like saving images." A picture opened large
// offered only Open in browser and Close, and a long press on a file offered
// Open in browser or Share its link. The link is a signed address that stops
// working within the hour, so sharing it handed on nothing that lasted, and
// nothing put the picture in Photos. Now a picture or a film can be saved to
// Photos, and any file the phone has is shared as the file itself, which
// brings Save to Files, AirDrop and Messages with it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudPlaces } from '../renderer/src/cloud-files.ts';
import { phoneSlug } from '../renderer/src/phone-rows.ts';
import { openingOf } from '../mobile/src/lib/files';
import { keepableOf, keptName, keepFile, choicesFor } from '../mobile/src/lib/keep';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = '0a1b2c3d4e5f';
const P = phoneSlug(D, 'agentbox');
const n = (c, ext) => `${c.repeat(64 / c.length)}.${ext}`;
const ROUND = 'designs/w-8b9c0d1e2f';
const files = {
  [`${ROUND}/quiet.png`]: { n: n('c1', 'png'), s: 100 },
  [`${ROUND}/walkthrough.mp4`]: { n: n('e1', 'mp4'), s: 4393 },
  [`${ROUND}/voice.m4a`]: { n: n('e3', 'm4a'), s: 900 },
  [`${ROUND}/brief.pdf`]: { n: n('e2', 'pdf'), s: 9000 },
  [`${ROUND}/notes.md`]: { n: n('d1', 'md'), s: 300 },
  'recordings/session.mov': { s: 812_000_000, big: true },
};
const places = cloudPlaces([{ device: D, project: 'agentbox', snapshot: { item: { updatedAt: 1 }, attached: { dir: '~/docs/agentbox', files, folders: { [`${ROUND}/`]: [`${ROUND}/quiet.png`] } } } }], phoneSlug);
const url = (name) => `https://cloud/${name}?token=t`;
const links = new Map(Object.values(files).filter((e) => e.n).map((e) => [e.n, { url: url(e.n), until: Date.now() + 3600_000 }]));
const keep = (src) => keepableOf(openingOf(places, links, P, src), src);

describe('what the phone can keep', () => {
  it('a picture and a film go to Photos, under their own names, not the stored hash', () => {
    expect(keep(`${ROUND}/quiet.png`)).toEqual({ link: url(n('c1', 'png')), name: 'quiet.png', photos: true });
    expect(keep(`${ROUND}/walkthrough.mp4`)).toEqual({ link: url(n('e1', 'mp4')), name: 'walkthrough.mp4', photos: true });
  });

  it('a sound, a PDF and a document are shared as files, since Photos will not take them', () => {
    expect(keep(`${ROUND}/voice.m4a`)).toMatchObject({ name: 'voice.m4a', photos: false });
    expect(keep(`${ROUND}/brief.pdf`)).toMatchObject({ name: 'brief.pdf', photos: false });
    expect(keep(`${ROUND}/notes.md`)).toMatchObject({ name: 'notes.md', photos: false });
  });

  it('nothing for a site, a folder, a file too big for the phone, or one it never had', () => {
    expect(keep('https://example.com/a.png')).toBeNull();
    expect(keep(`${ROUND}/`)).toBeNull();
    expect(keep('recordings/session.mov')).toBeNull();
    expect(keep('designs/elsewhere/missing.png')).toBeNull();
  });

  it('a name the phone cannot write is made safe, and keeps its kind', () => {
    expect(keptName('quiet.png')).toBe('quiet.png');
    expect(keptName('a/b:c?.png')).toBe('a-b-c-.png');
    expect(keptName('')).toBe('file');
  });
});

describe('what a long press offers', () => {
  it('a picture: save it, share it, or open it in the browser', () => {
    expect(choicesFor(keep(`${ROUND}/quiet.png`), url('x'))).toEqual(['Save to Photos', 'Share', 'Open in browser']);
  });
  it('a PDF: share it, which is also how it reaches Files, or open it', () => {
    expect(choicesFor(keep(`${ROUND}/brief.pdf`), url('x'))).toEqual(['Share or save to Files', 'Open in browser']);
  });
  it('a site keeps its own two: open it, or share its address', () => {
    expect(choicesFor(null, 'https://example.com')).toEqual(['Open in browser', 'Share or copy link']);
  });
});

const fake = (over = {}) => {
  const did = [];
  return {
    did,
    deps: {
      download: async (link, name) => { did.push(['download', link, name]); return `file:///cache/keep/${name}`; },
      allowPhotos: async () => { did.push(['ask']); return true; },
      toPhotos: async (uri) => { did.push(['photos', uri]); },
      share: async (uri) => { did.push(['share', uri]); },
      ...over,
    },
  };
};
const picture = { link: url('p'), name: 'quiet.png', photos: true };

describe('keeping a file', () => {
  it('saves a picture to Photos once it is on the phone, and says so', async () => {
    const { did, deps } = fake();
    expect(await keepFile(picture, 'photos', deps)).toBe('Saved to Photos.');
    expect(did).toEqual([['ask'], ['download', url('p'), 'quiet.png'], ['photos', 'file:///cache/keep/quiet.png']]);
  });

  it('asks for Photos before it downloads, and saves nothing when Photos is not allowed', async () => {
    const { did, deps } = fake({ allowPhotos: async () => false });
    expect(await keepFile(picture, 'photos', deps)).toMatch(/Settings/);
    expect(did).toEqual([]);
  });

  it('shares the file itself, never its link', async () => {
    const { did, deps } = fake();
    expect(await keepFile(picture, 'share', deps)).toBeNull();
    expect(did).toEqual([['download', url('p'), 'quiet.png'], ['share', 'file:///cache/keep/quiet.png']]);
  });

  it('says what went wrong when the download fails, rather than nothing', async () => {
    const { deps } = fake({ download: async () => { throw new Error('The cloud took too long to answer.'); } });
    expect(await keepFile(picture, 'photos', deps)).toBe('Could not save quiet.png. The cloud took too long to answer.');
    expect(await keepFile(picture, 'share', deps)).toBe('Could not share quiet.png. The cloud took too long to answer.');
  });
});

describe('the phone app is built to do it', () => {
  const config = fs.readFileSync(path.join(root, 'mobile/app.config.ts'), 'utf8');
  it('Apple is told why the app adds to Photos, or the first save would close the app', () => {
    expect(config).toMatch(/'expo-media-library', \{[^}]*savePhotosPermission:/);
  });
  it('the download has a deadline, as every network call does', () => {
    const platform = fs.readFileSync(path.join(root, 'mobile/src/platform/keep.ts'), 'utf8');
    expect(platform).toMatch(/withDeadline\(fetch\)/);
  });
  it('the picture room has the Save and Share buttons', () => {
    const room = fs.readFileSync(path.join(root, 'mobile/src/app/file.tsx'), 'utf8');
    expect(room).toMatch(/accessibilityLabel=\{how === 'photos' \? 'Save to Photos' : 'Share'\}/);
    expect(room).toMatch(/keep\(\{ link: url, name: nameOf\(shown\), photos: true \}, how/);
  });
});
