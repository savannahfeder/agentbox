// A file sent from its Share panel into a chat: the team's group, or the
// two-person chat with one teammate, which `create` finds or makes.
import crypto from 'node:crypto';
import path from 'node:path';
import type { createRooms } from './rooms.mts';

/** The `to` that means the team's group rather than a person. */
export const TEAM_CHAT = 'team';

const roomFileName = (name: string): string => String(name).replace(/[^\w.-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 130) || 'file';

/** Puts the file in the chat as a message of its own and answers the room it went to. */
export async function sendFileToChat({ rooms, me, to, toName, file }: {
  rooms: Pick<ReturnType<typeof createRooms>, 'state' | 'create' | 'putFileFrom' | 'send'>;
  me: string;
  /** A teammate's id, or TEAM_CHAT. */
  to: string;
  toName: string;
  file: string;
}): Promise<string> {
  const roomId = to === TEAM_CHAT
    ? (rooms.state().rooms ?? []).find((r) => r.teamId)?.id
    : await rooms.create({ name: toName.slice(0, 40), kind: 'group', people: [me, to] });
  if (!roomId) throw new Error('Your team has no group to send it to.');
  const name = path.basename(file);
  const stored = await rooms.putFileFrom(roomId, { name: `${crypto.randomBytes(4).toString('hex')}-${roomFileName(name)}`, srcPath: file });
  await rooms.send(roomId, `[${name}](attachments/${stored})`);
  return roomId;
}
