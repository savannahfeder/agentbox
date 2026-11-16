// Each chat's unsent words and attachments, by group and reply thread, kept
// while the app runs (renderer/src/team/rooms/RoomChat.tsx `drafts`).
import type { Picked } from '../platform/pick';

const drafts = new Map<string, string>();
const attached = new Map<string, Picked[]>();

export const chatDraftKey = (roomId: string, thread: string | null) => `${roomId}:${thread ?? ''}`;
export const chatDraft = (key: string) => drafts.get(key) ?? '';
export function keepChatDraft(key: string, text: string) {
  if (text) drafts.set(key, text);
  else drafts.delete(key);
}
export const chatFiles = (key: string): Picked[] => attached.get(key) ?? [];
export function keepChatFiles(key: string, files: Picked[]) {
  if (files.length) attached.set(key, files);
  else attached.delete(key);
}
