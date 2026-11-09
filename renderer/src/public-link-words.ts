// A public link's words, apart from the components so the phone draws the same ones.
import { clock } from './thread-history';

export const shareWords = {
  signedOut: 'Sign in to share this file or see its link.',
  fresh: 'Make a link anyone can open, without an account. Its comments are public too.',
  stopped: 'Stopped. The old link no longer works.',
  behind: 'The link shows an older copy.',
  ahead: (v: number) => `The link shows version ${v}, newer than this one.`,
  newComments: 'New comments on the link',
  comments: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
  stopAsk: (n: number) => (n > 0 ? `Stop, and delete ${n === 1 ? 'its comment' : `its ${n} comments`}` : 'Stop the link'),
  shared: ({ createdAt, updatedAt }: { createdAt: number; updatedAt: number }, now = Date.now()) => {
    const what = updatedAt - createdAt > 1000 ? 'Updated' : 'Shared';
    return new Date(updatedAt).toDateString() === new Date(now).toDateString()
      ? `${what} today at ${clock(updatedAt)}`
      : `${what} ${new Date(updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  },
  // "Shared" already means a teammate's thread, and a file your agent handed you.
  live: 'Public link',
};

/** One live link's row: its file, when it went up or was updated, and its comments. */
export function publicLinkLine(l: { createdAt: number; updatedAt: number; comments: number }, now = Date.now()): string {
  const when = shareWords.shared(l, now);
  return l.comments ? `${when} · ${shareWords.comments(l.comments)}` : when;
}
