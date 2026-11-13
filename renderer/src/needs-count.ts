// The sidebar's Inbox number and the Needs you tab count the same things: your
// rows, invitations, and the notices that sit in Needs you (a teammate's file
// news, a thread you asked to hear about finishing).
export function inboxBadge({ rows, leads, fileNews, follows }: { rows: number; leads: number; fileNews: number; follows: number }): number {
  return rows + leads + fileNews + follows;
}
