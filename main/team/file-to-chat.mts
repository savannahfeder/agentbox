// Files sent from Share into a chat: the team's group, or the two-person chat
// with one teammate, which `create` finds or makes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WANT_WORDS } from '../../shared/thread-ask.mts';
import type { createRooms } from './rooms.mts';

/** The `to` that means the team's group rather than a person. */
export const TEAM_CHAT = 'team';

const roomFileName = (name: string): string => String(name).replace(/[^\w.-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 130) || 'file';
const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;

/** The message: what you want back and your note, then each file, a picture drawn as one. */
export function fileMessage({ note, want, links }: { note: string; want: 'review' | null; links: readonly { name: string; stored: string }[] }): string {
  const said = note.trim();
  const words = want ? (said ? `${WANT_WORDS[want]}: ${said}` : WANT_WORDS[want]) : said;
  const files = links.map((l) => `${PICTURE.test(l.name) ? '!' : ''}[${l.name}](attachments/${l.stored})`).join('\n');
  return [words, files].filter(Boolean).join('\n\n');
}

/** Puts the files in the chat as one message and answers the room it went to. */
export async function sendFileToChat({ rooms, me, to, toName, files, note = '', want = null }: {
  rooms: Pick<ReturnType<typeof createRooms>, 'state' | 'create' | 'putFileFrom' | 'send'>;
  me: string;
  /** A teammate's id, or TEAM_CHAT. */
  to: string;
  toName: string;
  files: readonly string[];
  note?: string;
  want?: 'review' | null;
}): Promise<string> {
  const gone = files.find((f) => !fs.existsSync(f));
  if (gone) throw new Error(`${path.basename(gone)} could not be read`);
  const roomId = to === TEAM_CHAT
    ? (rooms.state().rooms ?? []).find((r) => r.teamId)?.id
    : await rooms.create({ name: toName.slice(0, 40), kind: 'group', people: [me, to] });
  if (!roomId) throw new Error('Your team has no group to send it to.');
  const links: { name: string; stored: string }[] = [];
  for (const file of files) {
    const name = path.basename(file);
    links.push({ name, stored: await rooms.putFileFrom(roomId, { name: `${crypto.randomBytes(4).toString('hex')}-${roomFileName(name)}`, srcPath: file }) });
  }
  await rooms.send(roomId, fileMessage({ note, want, links }));
  return roomId;
}
