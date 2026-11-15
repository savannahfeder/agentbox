// Each chat's unsent words, by group and reply thread, kept while the app runs
// (renderer/src/team/rooms/RoomChat.tsx `drafts`).
const drafts = new Map<string, string>();

export const chatDraftKey = (roomId: string, thread: string | null) => `${roomId}:${thread ?? ''}`;
export const chatDraft = (key: string) => drafts.get(key) ?? '';
export function keepChatDraft(key: string, text: string) {
  if (text) drafts.set(key, text);
  else drafts.delete(key);
}
