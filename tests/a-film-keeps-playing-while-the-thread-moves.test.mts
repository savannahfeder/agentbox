// A FILM IN A MESSAGE RESTARTED EVERY TIME THE THREAD MOVED (w-22c362edd1).
//
// Reported 2026-10-15: "I'm watching a video and then I make a new query. With
// every update it's as if the video itself reloads, so it interrupts me."
//
// Read off the code, three things each threw the player away and made a new one,
// which starts the film again from 0:00 with nothing loaded:
//
//   1. The pieces that draw a message (Focus.tsx, `mdComponents`) were rebuilt
//      whenever the row's result, note, body or answer changed. React tells a
//      piece apart by its identity, so every note a worker wrote and every
//      reply she sent remounted every player on the screen.
//   2. Sending a reply moves the answer from the foot of the thread into the
//      conversation (ItemThread.tsx), a different place in the tree, and a
//      thread block's key carries its position, which shifts as the window of
//      shown messages slides.
//   3. The player was keyed by its address, and the address is picked from a
//      list of folders that changes order when a new message names a folder.
//
// 2 and 3 are how a thread is meant to move, so the player no longer lives in
// the tree at all: it lives on a shelf (renderer/src/player-shelf.ts), and a
// message that is drawn again takes the same player back, mid-film. 1 is fixed
// outright, because it also reloaded every picture.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerShelf } from '../renderer/src/player-shelf.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');

// A player as far as the shelf cares: a film that is playing or not.
const fakePlayer = (url) => ({
  url,
  paused: true,
  dropped: false,
  play() { this.paused = false; },
  pause() { this.paused = true; },
});

// Timers the test turns by hand.
const clock = () => {
  let now = 0;
  let due = [];
  return {
    later: (fn, ms) => { due.push({ at: now + ms, fn }); },
    pass(ms) {
      now += ms;
      const ready = due.filter((t) => t.at <= now);
      due = due.filter((t) => t.at > now);
      ready.forEach((t) => t.fn());
    },
  };
};

const shelfWith = () => {
  const time = clock();
  const made = [];
  const shelf = playerShelf({
    make: (url) => { const p = fakePlayer(url); made.push(p); return p; },
    drop: (p) => { p.dropped = true; },
    later: time.later,
    keepFor: 5000,
  });
  return { shelf, made, time };
};

describe('a film keeps playing while the thread moves under it', () => {
  it('a message drawn again takes back the same player, still playing', () => {
    const { shelf, made, time } = shelfWith();
    const first = shelf.take(['/docs/designs/demo.mp4'], 0);
    first.player.play();
    // The old message goes and the new one arrives in the same commit.
    shelf.give(first.player);
    const again = shelf.take(['/docs/designs/demo.mp4'], 0);
    expect(again.player).toBe(first.player);
    expect(made).toHaveLength(1);
    time.pass(10_000);
    expect(again.player.paused).toBe(false);
    expect(again.player.dropped).toBe(false);
  });

  it('finds its player when a new folder in the thread reorders where it looks', () => {
    const { shelf } = shelfWith();
    const first = shelf.take(['/docs/designs/demo.mp4', '/repo/demo.mp4'], 0);
    first.player.play();
    shelf.give(first.player);
    // A note named a folder, which now comes first and does not hold the film.
    const again = shelf.take(['/docs/designs/w-1/demo.mp4', '/docs/designs/demo.mp4', '/repo/demo.mp4'], 0);
    expect(again.player).toBe(first.player);
    expect(again.url).toBe('/docs/designs/demo.mp4');
  });

  it('starts again where it was if it was paused before it was taken back', () => {
    const { shelf, time } = shelfWith();
    const first = shelf.take(['/a.mp4'], 0);
    first.player.play();
    shelf.give(first.player);
    time.pass(1);
    expect(first.player.paused).toBe(true);
    const again = shelf.take(['/a.mp4'], 0);
    expect(again.player).toBe(first.player);
    expect(again.player.paused).toBe(false);
  });

  it('does not start a film she had paused herself', () => {
    const { shelf } = shelfWith();
    const first = shelf.take(['/a.mp4'], 0);
    shelf.give(first.player);
    const again = shelf.take(['/a.mp4'], 0);
    expect(again.player.paused).toBe(true);
  });

  it('two messages naming the same film at once get two players', () => {
    const { shelf, made } = shelfWith();
    const one = shelf.take(['/a.mp4'], 0);
    const two = shelf.take(['/a.mp4'], 0);
    expect(two.player).not.toBe(one.player);
    expect(made).toHaveLength(2);
  });

  it('a different film is never handed somebody else\'s player', () => {
    const { shelf } = shelfWith();
    const first = shelf.take(['/a.mp4'], 0);
    shelf.give(first.player);
    const other = shelf.take(['/b.mp4'], 0);
    expect(other.player).not.toBe(first.player);
    expect(other.url).toBe('/b.mp4');
  });

  it('a film nobody takes back stops at once and is let go a little later', () => {
    const { shelf, time } = shelfWith();
    const first = shelf.take(['/a.mp4'], 0);
    first.player.play();
    shelf.give(first.player);
    // She left the thread: the sound must not carry on behind her.
    time.pass(1);
    expect(first.player.paused).toBe(true);
    expect(first.player.dropped).toBe(false);
    time.pass(5000);
    expect(first.player.dropped).toBe(true);
    // Gone means gone: the next one is new.
    expect(shelf.take(['/a.mp4'], 0).player).not.toBe(first.player);
  });

  it('a player that could not load is let go at once and the next folder is tried', () => {
    const { shelf } = shelfWith();
    const first = shelf.take(['/x/a.mp4', '/y/a.mp4'], 0);
    shelf.give(first.player, { broken: true });
    expect(first.player.dropped).toBe(true);
    const next = shelf.take(['/x/a.mp4', '/y/a.mp4'], 1);
    expect(next.player).not.toBe(first.player);
    expect(next.url).toBe('/y/a.mp4');
  });

  it('has nothing to give once every folder has been tried', () => {
    const { shelf } = shelfWith();
    expect(shelf.take(['/x/a.mp4'], 1)).toBeNull();
  });
});

describe('the message pieces are not rebuilt when the thread says something new', () => {
  const start = focus.indexOf('const { resolveSrc, mdComponents, openHref } = useMemo(');
  const deps = focus.slice(focus.indexOf('}, [', start), focus.indexOf(']);', focus.indexOf('}, [', start)));

  it('builds them once per thread, not once per message', () => {
    expect(start).toBeGreaterThan(-1);
    expect(deps).toContain('item.id');
    for (const field of ['item.result', 'item.note', 'item.body', 'item.answer']) expect(deps).not.toContain(field);
  });

  it('draws a film off the shelf rather than as a player of its own', () => {
    const media = focus.slice(focus.indexOf('export function ArtifactMedia'), focus.indexOf('// A FOLDER A WORKER NAMES'));
    expect(media).toContain('players.take(');
    expect(media).toContain('players.give(');
    expect(media).not.toMatch(/<video\b/);
    expect(media).not.toMatch(/<audio\b/);
  });
});
