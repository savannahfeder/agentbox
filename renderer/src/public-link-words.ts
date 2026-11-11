// A public link's words, apart from the components so the phone draws the same ones.
import { clock } from './thread-history';

export const shareWords = {
  signedOut: 'Sign in to share this file or see its link.',
  fresh: 'Copy link to let anyone see it and comment',
  // Not "Only you": on a team's project its teammates see the file without a link.
  notPublic: 'No public link',
  anyone: 'Anyone with the link',
  canComment: 'Can see it and its comments',
  stopped: 'Stopped. The old link no longer works.',
  behind: 'The link shows an older copy.',
  ahead: (v: number) => `The link shows version ${v}, newer than this one.`,
  newComments: 'New comments on the link',
  comments: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
  // A link's comments are kept on the thread its file came from (main/team/link-comments.mts).
  stopAsk: (n: number) => (n > 0 ? `Stop, ${n === 1 ? 'its comment stays' : 'its comments stay'} in the thread` : 'Stop the link'),
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
