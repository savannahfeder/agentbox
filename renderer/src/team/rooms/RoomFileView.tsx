// A file in a group chat, opened in the same big view a conversation's file
// opens in: its versions, comments, replies and Approve. The group's messages
// stand in for a thread's lines, and its comments are kept in the room.
import { useMemo } from 'react';
import { marksOf } from '../../../../shared/artifact-marks.mjs';
import { ArtifactView } from '../../components/ArtifactView';
import type { LedgerLine } from '../../thread-history';
import type { ArtifactMark, FileMarks, Person, Room, RoomMessage } from '../../types';
import type { ChatPerson } from './RoomChat';

export interface RoomFiles {
  marks: { id: string; by: string | null; mark: ArtifactMark; at: number }[];
  write: (mark: ArtifactMark) => Promise<{ ok: boolean; error?: string }>;
  find: (name: string) => Promise<string | null>;
  readText: (name: string) => Promise<string | null>;
}

const nameIn = (path: string) => path.replace(/^\.?\/?attachments\//, '');

/** Where it opens: a file pressed in the chat, or the comment a Needs you row is about. */
export interface RoomFileOpening { name?: string; note?: string | null; file?: string | null; at: number }

export function RoomFileView({ room, messages, people, meId, opening, files, onNewVersion, onClose }: {
  room: Room; messages: RoomMessage[]; people: ChatPerson[]; meId: string | null; opening: RoomFileOpening; files: RoomFiles;
  onNewVersion?: (name: string, text: string) => Promise<string | null>; onClose: () => void;
}) {
  const lines = useMemo(() => messages.filter((m) => !m.deleted).map((m) => (
    { id: m.id, ts: m.at, source: 'founder', by: m.by, patch: { body: m.body } } as unknown as LedgerLine
  )), [messages]);
  const marks = useMemo(() => marksOf(files.marks.map((r) => ({ ...r.mark, by: r.by, ts: r.at }))) as FileMarks, [files.marks]);
  const named = useMemo(() => people.map((p): Person => ({ id: p.id, email: '', name: p.name, avatarUrl: p.avatarUrl })), [people]);
  const stage = useMemo(() => ({ find: (path: string) => files.find(nameIn(path)), readText: (path: string) => files.readText(nameIn(path)) }), [files.find, files.readText]);
  const open = useMemo(() => ({
    ...(opening.name ? { path: `attachments/${opening.name}` } : {}),
    ...(opening.note ? { note: opening.note } : {}),
    ...(opening.file ? { file: opening.file } : {}),
    at: opening.at,
  }), [opening]);
  return <ArtifactView product="" draftsAcross={`room:${room.id}`} lines={lines} marks={marks} me={meId} people={named}
    open={open} ownerOfRow={null} write={files.write} onNewVersion={onNewVersion} onClose={onClose} files={stage} />;
}
