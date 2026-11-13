// A public link's words, apart from the components so the phone draws the same ones.
import { clock } from './thread-history';

/** What Share says to someone signed out, by the tab its sign-in page opens on. */
export const shareSignedOutWords = (startOn: 'sign-in' | 'sign-up') => (startOn === 'sign-up'
  ? { line: 'Create an account to share this file.', button: 'Create account' }
  : { line: shareWords.signedOut, button: 'Sign in' });

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
  stopConfirm: (n: number) => `Stop sharing? The link stops working for everyone.${n > 0 ? ` ${n === 1 ? 'Its comment stays' : 'Its comments stay'} in the thread.` : ''}`,
  // The press that ends it says so. As a statement it read as done already (power test, 2026-11-11).
  stopAsk: (_n: number) => 'Stop the link',
  // A link's comments are kept on the thread its file came from (main/team/link-comments.mts).
  keptComments: (n: number) => (n === 1 ? 'Its comment stays in the thread' : 'Its comments stay in the thread'),
  shared: ({ createdAt, updatedAt }: { createdAt: number; updatedAt: number }, now = Date.now()) => {
    const what = updatedAt - createdAt > 1000 ? 'Updated' : 'Shared';
    return new Date(updatedAt).toDateString() === new Date(now).toDateString()
      ? `${what} today at ${clock(updatedAt)}`
      : `${what} ${new Date(updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  },
  editedBy: (name: string, { updatedAt }: { updatedAt: number }, now = Date.now()) => (new Date(updatedAt).toDateString() === new Date(now).toDateString()
    ? `Edited by ${name} today at ${clock(updatedAt)}`
    : `Edited by ${name} ${new Date(updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`),
  // "Shared" already means a teammate's thread, and a file your agent handed you.
  live: 'Public link',
  kept: 'Private link',
  sharedMark: 'Shared',
  access: { anyone: 'Anyone with the link', people: 'Only people added' },
  can: { view: 'can view', comment: 'can comment', edit: 'can edit' },
  addPeople: 'Add people by email',
};

/** One live link's row: its file, when it went up or was updated, and its comments. */
export function publicLinkLine(l: { createdAt: number; updatedAt: number; comments: number }, now = Date.now()): string {
  const when = shareWords.shared(l, now);
  return l.comments ? `${when} · ${shareWords.comments(l.comments)}` : when;
}
