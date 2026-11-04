// THE ROWS AT THE TOP OF NEEDS YOU THAT ARE NOT THREADS: invitations, then the
// groups with a message to you. Pure, tests/a-team-invitation-is-a-row-at-the-top-of-needs-you.
import type { RoomMention } from '../types';

export type InviteRow = { key: string; kind: 'team' | 'group'; id: string; words: string };
export type LeadRow = { key: string; invite?: InviteRow; mention?: RoomMention };

const invited = (by: string | null | undefined, what: string) => {
  const first = String(by ?? '').trim().split(/\s+/)[0];
  return first ? `${first} invited you to ${what}` : `You are invited to ${what}`;
};

export function inviteRows(
  teams: readonly { teamId: string; teamName: string; invitedByName?: string | null }[] | undefined,
  groups: readonly { roomId: string; roomName: string; invitedByName?: string | null }[] | undefined,
): InviteRow[] {
  return [
    ...(teams ?? []).map((t): InviteRow => ({ key: `invite/team/${t.teamId}`, kind: 'team', id: t.teamId, words: invited(t.invitedByName, t.teamName) })),
    ...(groups ?? []).map((g): InviteRow => ({ key: `invite/group/${g.roomId}`, kind: 'group', id: g.roomId, words: invited(g.invitedByName, g.roomName) })),
  ];
}

export const leadRows = (invites: readonly InviteRow[], mentions: readonly RoomMention[]): LeadRow[] => [
  ...invites.map((invite) => ({ key: invite.key, invite })),
  ...mentions.map((mention) => ({ key: mention.id, mention })),
];
