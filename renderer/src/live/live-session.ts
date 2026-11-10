// A copy's place in a file's live room, for as long as the file is open.
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { connectLive, type LiveConnection, type LiveState } from './client';
import { api } from '../api';
import { familyOfName } from '../../../shared/artifact-marks.mts';
import type { LiveRoomTicket } from '../types';

const ROOM_WAIT_MS = 4000;

export interface LiveSession {
  doc: Y.Doc;
  live: LiveConnection;
  me: LiveRoomTicket['me'];
  state: LiveState;
  /** Has been in step with the room at least once. */
  synced: boolean;
  keeper: boolean;
  seed: boolean;
}

/** The room a file opens in, asked of main once per file. Undefined while asking. */
export function useLiveTicket(file: { product: string; project?: string | null; name: string } | null): LiveRoomTicket | null | undefined {
  const [ticket, setTicket] = useState<LiveRoomTicket | null | undefined>(file ? undefined : null);
  // By the file's family, so a newer version of the same file stays in the same room.
  const key = file ? `${file.product}\0${file.project ?? ''}\0${familyOfName(file.name)}` : '';
  useEffect(() => {
    if (!file) { setTicket(null); return undefined; }
    let gone = false;
    setTicket(undefined);
    void api.liveRoom(file).then((t) => { if (!gone) setTicket(t ?? null); });
    return () => { gone = true; };
  }, [key]);
  return ticket;
}

/** The session, null when there is none or it never got in step. */
export function useLiveSession(ticket: LiveRoomTicket | null | undefined): LiveSession | null {
  const [session, setSession] = useState<LiveSession | null>(null);
  useEffect(() => {
    if (!ticket) { setSession(null); return undefined; }
    const doc = new Y.Doc();
    let now: LiveSession | null = null;
    const set = (patch: Partial<LiveSession>) => {
      if (!now) return;
      now = { ...now, ...patch };
      setSession(now);
    };
    const live = connectLive({
      doc,
      hello: ticket.me,
      open: () => new WebSocket(ticket.url),
      onState: (state) => set({ state, ...(state === 'live' ? { synced: true } : {}) }),
      onRoom: (room) => set({ keeper: room.keeper, seed: room.seed }),
    });
    now = { doc, live, me: ticket.me, state: live.state(), synced: false, keeper: false, seed: false };
    setSession(now);
    // A room that has not answered by now is not waited for: this sitting edits the file as before.
    const giveUp = window.setTimeout(() => { if (now && !now.synced) { live.close(); set({ state: 'off' }); } }, ROOM_WAIT_MS);
    return () => { window.clearTimeout(giveUp); now = null; live.close(); doc.destroy(); setSession(null); };
  }, [ticket?.url, ticket?.me.person]);
  return session && !session.synced && session.state === 'off' ? null : session;
}
