// An AI teammate drew as one letter in a dashed box, so a team of them read as
// a row of initials rather than coworkers (w-8ae9f6902e). The multiplayer
// film's rows drew ink head-and-shoulders portraits on pastel circles; each
// teammate now draws one, the same every time, and you can pick another.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { faceSeed, facePaper, offerFace, FACE_PAPERS } from '../shared/teammate-face.mts';
import { faceDrawing, otherFaces } from '../renderer/src/teammates/face-drawing.ts';

const svgOf = (uri: string) => decodeURIComponent(uri.replace(/^data:image\/svg\+xml;[^,]*,/, ''));

describe('a teammate’s face', () => {
  it('is the same drawing every time for the same teammate', () => {
    expect(faceDrawing(faceSeed({ id: 't-iris', name: 'Iris' }))).toBe(faceDrawing(faceSeed({ id: 't-iris', name: 'Iris' })));
  });

  it('differs between two teammates', () => {
    const seeds = ['t-iris', 't-otto', 't-pia', 't-quinn', 't-ada', 't-bo'];
    expect(new Set(seeds.map((id) => faceDrawing(faceSeed({ id })))).size).toBe(seeds.length);
  });

  it('follows its id, not its name, so a rename keeps the face', () => {
    expect(faceSeed({ id: 't-iris', name: 'Iris' })).toBe(faceSeed({ id: 't-iris', name: 'Ivy' }));
  });

  it('is the one you picked once you picked one', () => {
    expect(faceSeed({ id: 't-iris', name: 'Iris', face: 'picked-3' })).toBe('picked-3');
    expect(faceSeed({ id: 't-iris', name: 'Iris', face: '' })).toBe('t-iris');
    expect(faceSeed({ id: 't-iris', name: 'Iris', face: null })).toBe('t-iris');
  });

  it('falls back to the name where only a name is known', () => {
    expect(faceSeed({ name: 'Iris' })).toBe('Iris');
  });

  it('is an ink drawing with no paper of its own, which the circle behind it gives', () => {
    const svg = svgOf(faceDrawing('t-iris'));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/<rect[^>]*fill="#(?!000|fff)/i);
  });

  // At the inbox's 18px the hair ran into the circle's top and read as a cut-off
  // head; drawn whole, the face was too small to make out.
  it('is drawn closer than the whole bust, and low enough that the head clears a round frame', () => {
    const svg = svgOf(faceDrawing('t-iris'));
    expect(svg).toMatch(/transform="translate\(0 [1-9][\d.]*\)"/);
    expect(svg).toMatch(/scale\(1\.2[0-9]*\)/);
  });

  // About one face in twelve raised a hand or held a phone, which the closer crop cut off at the circle's edge.
  it('never draws hands', async () => {
    const { createAvatar } = await import('@dicebear/core');
    const notionists = await import('@dicebear/notionists');
    const withHands = Array.from({ length: 200 }, (_, i) => `t-${i}`)
      .filter((s) => createAvatar(notionists, { seed: s, scale: 125, translateY: 18 }).toString() !== createAvatar(notionists, { seed: s, scale: 125, translateY: 18, gestureProbability: 0 }).toString());
    expect(withHands.length).toBeGreaterThan(5);
    for (const s of withHands) expect(svgOf(faceDrawing(s))).toBe(createAvatar(notionists, { seed: s, scale: 125, translateY: 18, gestureProbability: 0 }).toString());
  });

  // Measured in the inbox: the face sat 2.5px above its title, the other rows' marks at 0.
  it('in an inbox row, centres on the title like every other row’s mark', () => {
    const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.th-mate \{ display: inline-flex; \}/);
  });

  it('sits on one of the soft papers, the same one each time', () => {
    expect(FACE_PAPERS).toContain(facePaper('t-iris'));
    expect(facePaper('t-iris')).toBe(facePaper('t-iris'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(facePaper)).size).toBeGreaterThan(2);
  });
});

describe('picking another face', () => {
  it('offers different faces from the one it has, none twice', () => {
    const now = 't-iris';
    const offered = otherFaces(now, 7);
    expect(offered).toHaveLength(7);
    expect(offered).not.toContain(now);
    expect(new Set(offered.map(faceDrawing)).size).toBe(7);
    expect(offered.map(faceDrawing)).not.toContain(faceDrawing(now));
  });

  it('offers a fresh set on the next page', () => {
    const first = otherFaces('t-iris', 7, 0);
    const next = otherFaces('t-iris', 7, 1);
    expect(next.filter((s) => first.includes(s))).toEqual([]);
  });
});

async function aTeam(tag: string) {
  const { loadStore } = await import('../main/store-modules.mts');
  const { Teammates } = await import('../main/teammates.mts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `zero-face-${tag}-`));
  const mods = await loadStore();
  const w = mods.workItemsDisk;
  const store = {
    config: { storeRoot: root, accountId: `acct-face-${tag}` }, modules: mods,
    listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
    productDir: () => root,
    listItems: () => w.readWorkItems(root).map((i: object) => ({ ...i, product: 'site' })),
    readHistory: (_slug: string, id: string, opts: unknown) => w.readItemHistory(root, id, opts),
  };
  return { team: new Teammates(store as never), store, w, root };
}

describe('the face it keeps', () => {
  it('is the one you pick, kept until you pick another, and its own again when you clear it', async () => {
    const { team } = await aTeam('pick');
    const t = team.create({ name: 'Iris', product: 'site' });
    expect(t.face ?? null).toBe(null);
    team.update(t.id, { face: `${t.id}.3` });
    expect(team.get(t.id)!.face).toBe(`${t.id}.3`);
    team.update(t.id, { name: 'Ivy' });
    expect(team.get(t.id)!.face).toBe(`${t.id}.3`);
    team.update(t.id, { face: '' });
    expect(team.get(t.id)!.face).toBe(null);
  });

  it('made from a thread’s offer, is the face the offer showed', async () => {
    const { team, store, w, root } = await aTeam('offer');
    const now = Date.now();
    const made = w.createWorkItem(root, { title: 'Write the changelog', labels: ['founder'] }, { source: 'founder', now });
    w.updateWorkItem(root, made.id, { routed: { to: 'agent', why: 'x', at: now, by: 'auto', offer: { role: 'Changelog writer' } } }, { source: 'system', now });
    team.answerOffer(store.listItems().find((i: { id: string }) => i.id === made.id), true, now);
    const [mate] = team.list();
    expect(faceSeed(mate)).toBe(offerFace(made.id));
  });

  it('turned down, makes no face and nobody', async () => {
    const { team, store, w, root } = await aTeam('no');
    const now = Date.now();
    const made = w.createWorkItem(root, { title: 'Write the changelog', labels: ['founder'] }, { source: 'founder', now });
    w.updateWorkItem(root, made.id, { routed: { to: 'agent', why: 'x', at: now, by: 'auto', offer: { role: 'Changelog writer' } } }, { source: 'system', now });
    team.answerOffer(store.listItems()[0], false, now);
    expect(team.list()).toHaveLength(0);
  });
});
