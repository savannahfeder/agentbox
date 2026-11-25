// THE EMPTY INBOX WEARS THE MOUNTAINS AND BIRDS (w-ef3bfd38f2, 2026-11-24).
//
// On the light orange mountains theme, Home drew the ranges and the birds and
// the empty Inbox ("Nothing needs you") drew nothing: a plain white page under
// the heading and the writing box. Light skies only reach the Inbox when they
// carry `inbox`, and the mountains do not, because their strip over the list
// was never drawn. Six layouts were photographed in the real page and Home's
// own scene was picked: the same ranges and four birds, with the ranges thinned
// out round the words wherever the page puts them. Measured in a 1440x900
// window: a 1358x836 card, the words padded by 24px as the page reads them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { emptyInboxHills, EMPTY_INBOX_BIRDS } from '../renderer/src/home/empty-inbox-scene.ts';
import { mountainDots } from '../renderer/src/home/mountains.ts';
import { MAX_BIRDS } from '../renderer/src/home/birds.ts';
import { skyTheme } from '../renderer/src/home/sky.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const scene = read('renderer/src/home/EmptyScene.tsx');

const base = skyTheme('mountains')!.art.mountains!;
const W = 1358, H = 836;
const words = { x: 301, y: 342, w: 768, h: 193 };
const unpadded = { x: words.x + 24, y: words.y + 24, w: words.w - 48, h: words.h - 48 };
// A dot is 2px across, so one starting just left of or above a box still lands in it.
const inside = (d: { x: number; y: number }, b = words) => d.x + 2 >= b.x && d.x <= b.x + b.w && d.y + 2 >= b.y && d.y <= b.y + b.h;
const ours = mountainDots(W, H, emptyInboxHills(base, words, W, H));
const unclear = mountainDots(W, H, { ...base, lift: 1, quiet: null });

describe('the empty Inbox mountains', () => {
  it('never touch the heading or the writing box', () => {
    expect(ours.filter((d) => inside(d, unpadded))).toEqual([]);
  });
  it('thin out in the margin round them', () => {
    expect(ours.filter((d) => inside(d)).length).toBeLessThan(unclear.filter((d) => inside(d)).length / 4);
  });
  it('still rise right beside the words', () => {
    const beside = { x: 0, y: words.y + words.h - 60, w: words.x, h: 60 };
    expect(ours.filter((d) => inside(d, beside)).length).toBeGreaterThan(20);
  });
  it('fill the foot of the card under the words', () => {
    const foot = { x: words.x, y: H - 120, w: words.w, h: 120 };
    expect(ours.filter((d) => inside(d, foot)).length).toBeGreaterThan(500);
  });
  it('need the clearing: without it they run into the writing box', () => {
    expect(unclear.filter((d) => inside(d, unpadded)).length).toBeGreaterThan(0);
  });
  it('are drawn whole until the words are found', () => {
    expect(emptyInboxHills(base, null, W, H).quiet).toBeNull();
  });
  it('keep clear of the tabs at the top of the card', () => {
    expect(Math.min(...ours.map((d) => d.y))).toBeGreaterThan(160);
  });
});

describe('the empty Inbox birds', () => {
  it('are Home’s four, never a flock', () => {
    expect(EMPTY_INBOX_BIRDS).toBeLessThanOrEqual(MAX_BIRDS);
    expect(scene).toMatch(/flyBirds\(/);
  });
});

describe('where it is drawn', () => {
  it('on the empty Inbox under a light sky with mountains and no Inbox sky of its own', () => {
    expect(app).toMatch(/const mountainsOnEmpty = !!sky\?\.art\.mountains && !skyOnInbox && !homeShown && inboxPageUp;/);
    expect(app).toMatch(/\{mountainsOnEmpty && sky && <EmptyScene art=\{sky\.home \?\? sky\.art\} \/>\}/);
  });
  it('with no preview switch left over', () => {
    expect(scene).not.toMatch(/preview|SCENES|sceneChoice/);
  });
});
