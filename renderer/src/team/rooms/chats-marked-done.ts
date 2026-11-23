// A chat marked done leaves Needs you on the press, not when the window next
// reads the Mac's rooms, which drop it for good.
import { useCallback, useMemo, useState } from 'react';

/** Each chat marked done here, by the time of the newest row it had then. */
export type ChatsDone = Readonly<Record<string, number>>;

export interface ChatsMarkedDone {
  done: ChatsDone;
  /** Null takes the mark back, for a mark that did not go through. */
  mark: (roomId: string, at: number | null) => void;
}

export const NO_CHATS_DONE: ChatsMarkedDone = { done: {}, mark: () => {} };

export function notMarkedDone<M extends { roomId: string; at: number }>(rows: readonly M[], done: ChatsDone): M[] {
  return rows.filter((m) => m.at > (done[m.roomId] ?? -Infinity));
}

export function useChatsMarkedDone(): ChatsMarkedDone {
  const [done, setDone] = useState<ChatsDone>({});
  const mark = useCallback((roomId: string, at: number | null) => setDone((was) => {
    const next = { ...was };
    if (at === null) delete next[roomId];
    else next[roomId] = at;
    return next;
  }), []);
  return useMemo(() => ({ done, mark }), [done, mark]);
}
