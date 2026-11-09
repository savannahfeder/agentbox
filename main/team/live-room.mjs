// WHICH LIVE ROOM A FILE OPENS IN, if any. Every teammate's copy of a file
// must name the same room, so it is named after what every copy agrees on: the
// team, the project's name and the file's family (shared/file-folders.mjs
// fileKeyIn), hashed so the relay never reads a file's name.
import crypto from 'node:crypto';
import { fileKeyIn } from '../../shared/file-folders.mjs';
import { liveColorOf } from '../../shared/live/colors.mjs';

/** The relay's address for this cloud, or null when it has none. */
export function liveAddress(cloudConfig) {
  if (!cloudConfig) return null;
  if (typeof cloudConfig.live === 'string' && /^wss?:\/\//.test(cloudConfig.live)) return cloudConfig.live.replace(/\/+$/, '');
  // The stand-in cloud holds the rooms on its own door.
  if (cloudConfig.standin && typeof cloudConfig.url === 'string') return cloudConfig.url.replace(/^http/, 'ws').replace(/\/+$/, '');
  return null;
}

// A teammate's copy of a shared thread's file is named after its bytes first
// (main/team/thread-share.mjs), and it is still the same file.
const ownName = (name) => String(name ?? '').split('/').pop().replace(/^[0-9a-f]{12}-(?=.)/, '');

export const liveRoomId = (teamId, project, name) =>
  `${teamId}.${crypto.createHash('sha256').update(fileKeyIn(project, ownName(name))).digest('hex').slice(0, 40)}`;

/**
 * The room for a file, or null when it is nobody else's to open: no relay, no
 * Multiplayer, not signed in, or a project only this person sees. `owner` is
 * whether this copy writes the file itself rather than through its owner.
 */
export function liveRoomFor({ address, state, multiplayer, project, name, shared, owner = false }) {
  if (!address || !multiplayer || !shared || !project || !name) return null;
  const me = state?.me;
  const teamId = state?.team?.id;
  if (!state?.signedIn || !me?.id || !teamId) return null;
  return {
    url: `${address}/room/${encodeURIComponent(liveRoomId(teamId, project, name))}`,
    me: { name: me.name || 'You', person: me.id, color: liveColorOf(me.id), kind: 'person', canSave: true, owner: !!owner },
  };
}
