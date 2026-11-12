// A file in a group chat, opened in the same big view a conversation's file
// opens in: its versions, comments, replies and Approve. The group's messages
// stand in for a thread's lines, and its comments are kept in the room.
import { useEffect, useMemo, useState } from 'react';
import { filesInLines, lineAsThread, marksOf, otherFilesInLines, threadFiles } from '../../../../shared/artifact-marks.mts';
import { api } from '../../api';
import { ArtifactView } from '../../components/ArtifactView';
import { markGoesTo, withElsewhere } from '../../components/ThreadArtifacts';
import type { LedgerLine } from '../../thread-history';
import type { ArtifactMark, FileElsewhere, FileLine, FileMarks, Person, Room, RoomMessage } from '../../types';
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
  const own = useMemo(() => marksOf(files.marks.map((r) => ({ ...r.mark, by: r.by, ts: r.at }))) as FileMarks, [files.marks]);
  // The file in Files these copies belong to: its comments and approvals made elsewhere, and its version numbers.
  const copies = useMemo(() => threadFiles([...filesInLines(lines), ...otherFilesInLines(lines)]).flatMap((f) => f.versions.map((v) => ({ path: v.path, file: v.id }))), [lines]);
  const copiesKey = JSON.stringify(copies);
  const [elsewhere, setElsewhere] = useState<FileElsewhere[]>([]);
  const [line, setLine] = useState<FileLine[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => {
      if (copies.length) void api.fileElsewhere({ product: '', id: '', room: room.id, copies }).then((all) => { if (live) setElsewhere(all); });
      void api.fileLine({ product: '', id: '', room: room.id }).then((all) => { if (live) setLine(all); });
    };
    read();
    // A burst of changes asks once.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = api.onChanged(() => { if (timer) clearTimeout(timer); timer = setTimeout(read, 1000); });
    return () => { live = false; if (timer) clearTimeout(timer); off?.(); };
  }, [room.id, copiesKey]);
  const marks = useMemo(() => withElsewhere(own, elsewhere), [own, elsewhere]);
  const numbered = useMemo(() => lineAsThread(line), [line]);
  const allLines = useMemo(() => (numbered.lines.length ? [...lines, ...numbered.lines as LedgerLine[]] : lines), [lines, numbered]);
  const named = useMemo(() => people.map((p): Person => ({ id: p.id, email: '', name: p.name, avatarUrl: p.avatarUrl })), [people]);
  const stage = useMemo(() => ({ find: (path: string) => files.find(nameIn(path)), readText: (path: string) => files.readText(nameIn(path)) }), [files.find, files.readText]);
  const open = useMemo(() => ({
    ...(opening.name ? { path: `attachments/${opening.name}` } : {}),
    ...(opening.note ? { note: opening.note } : {}),
    ...(opening.file ? { file: opening.file } : {}),
    at: opening.at,
  }), [opening]);
  const write = (mark: ArtifactMark) => {
    const key = markGoesTo(mark, elsewhere);
    return key ? api.filesPlaceMark({ key, mark }) : files.write(mark);
  };
  return <ArtifactView product="" draftsAcross={`room:${room.id}`} lines={allLines} numbers={numbered.numbers} marks={marks} me={meId} people={named}
    open={open} ownerOfRow={null} write={write} onNewVersion={onNewVersion} onClose={onClose} files={stage} />;
}
