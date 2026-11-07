import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

export type LiveState = 'connecting' | 'live' | 'offline' | 'off';
export interface LiveRoomRoles { seed: boolean; keeper: boolean }
export interface LiveConnection {
  awareness: Awareness;
  state(): LiveState;
  room(): LiveRoomRoles;
  pending(): boolean;
  stats(): Record<string, number>;
  again(): void;
  close(): void;
}
export function connectLive(opts: {
  doc: Y.Doc;
  hello?: Record<string, unknown>;
  open: () => WebSocket;
  flushMs?: number;
  awarenessMs?: number;
  onRoom?: (room: LiveRoomRoles) => void;
  onState?: (state: LiveState) => void;
}): LiveConnection;
