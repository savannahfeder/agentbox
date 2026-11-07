// A FILM KEEPS PLAYING WHILE THE THREAD MOVES UNDER IT (w-22c362edd1).
//
// Her words: "I'm watching a video and then I make a new query. With every
// update it's as if the video itself reloads, so it interrupts me." A message is
// drawn again whenever the thread moves: her reply takes the answer from the foot
// into the conversation, a block's key carries its place in a sliding window, and
// a new folder named in a note reorders where a film is looked for. Each of those
// is a new player in React's eyes, and a new player starts at 0:00.
//
// So the player is not React's. It sits on this shelf, and a message drawn again
// takes the same one back, mid-film, in the same commit that let it go. One that
// nobody takes back is paused straight away, so a sound never carries on behind
// her once she leaves the thread, and let go a few seconds later.
//
// The browser keeps a moved player playing: it only pauses one that is still out
// of the page once the current task is done (the HTML spec's "removed from a
// document" steps), and the old message leaves and the new one arrives inside one
// commit. The resume below is for anything slower than that.
//
// tests/a-film-keeps-playing-while-the-thread-moves.test.mjs

/** A film's address asking for its first frame: iPhone Safari draws no frame for metadata alone. */
export const firstFrameSrc = (url: string) => (url.includes('#') ? url : `${url}#t=0.001`);

export type ShelfPlayer ={ paused: boolean; play(): unknown; pause(): void };

type Kept = { url: string; held: boolean; wasPlaying: boolean; turn: number };

export function playerShelf<P extends ShelfPlayer>({ make, drop, later = (fn, ms) => { setTimeout(fn, ms); }, keepFor = 5000 }: {
  make: (url: string) => P;
  drop: (player: P) => void;
  later?: (fn: () => void, ms: number) => void;
  keepFor?: number;
}) {
  const kept = new Map<P, Kept>();
  return {
    // The player for the first of `urls` that has one waiting, which is the film
    // she was watching wherever it is looked for now; otherwise a new one for
    // `urls[start]`. Null once every folder has been tried.
    take(urls: string[], start: number): { player: P; url: string } | null {
      for (const url of urls) {
        for (const [player, k] of kept) {
          if (k.held || k.url !== url) continue;
          k.held = true;
          k.turn += 1;
          if (k.wasPlaying && player.paused) Promise.resolve(player.play()).catch(() => {});
          return { player, url };
        }
      }
      if (start >= urls.length) return null;
      const url = urls[start];
      const player = make(url);
      kept.set(player, { url, held: true, wasPlaying: false, turn: 0 });
      return { player, url };
    },
    give(player: P, { broken = false }: { broken?: boolean } = {}) {
      const k = kept.get(player);
      if (!k) return;
      if (broken) { kept.delete(player); drop(player); return; }
      k.held = false;
      k.wasPlaying = !player.paused;
      const turn = ++k.turn;
      const unclaimed = () => !k.held && k.turn === turn && kept.get(player) === k;
      later(() => { if (unclaimed()) player.pause(); }, 0);
      later(() => { if (unclaimed()) { kept.delete(player); drop(player); } }, keepFor);
    },
  };
}
