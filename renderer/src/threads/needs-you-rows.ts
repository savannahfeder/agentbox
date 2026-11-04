// THE ROWS AT THE TOP OF NEEDS YOU THAT ARE NOT THREADS: team invitations, then the
// groups with a message to you. Pure, tests/a-team-invitation-is-a-row-at-the-top-of-needs-you.
import type { RoomMention } from '../types';

export type InviteRow = { key: string; kind: 'team'; id: string; words: string };
export type LeadRow = { key: string; invite?: InviteRow; mention?: RoomMention };

const invited = (by: string | null | undefined, what: string) => {
  const first = String(by ?? '').trim().split(/\s+/)[0];
  return first ? `${first} invited you to ${what}` : `You are invited to ${what}`;
};

// A group is only ever your team, so an old invitation to any other group is not offered.
export function inviteRows(
  teams: readonly { teamId: string; teamName: string; invitedByName?: string | null }[] | undefined,
): InviteRow[] {
  return (teams ?? []).map((t): InviteRow => ({ key: `invite/team/${t.teamId}`, kind: 'team', id: t.teamId, words: invited(t.invitedByName, t.teamName) }));
}

export const leadRows = (invites: readonly InviteRow[], mentions: readonly RoomMention[]): LeadRow[] => [
  ...invites.map((invite) => ({ key: invite.key, invite })),
  ...mentions.map((mention) => ({ key: mention.id, mention })),
];
