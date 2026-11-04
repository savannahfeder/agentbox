// Types for main/notes-wake.mjs.
import type { ReplySupervisor } from './live-replies.mts';

type Person = { id: string; name?: string | null };
type NoteMark = { do: 'sent' | 'resolve'; on?: unknown; in?: unknown };

interface NotesStore {
  listProducts(): { slug: string; team?: { direct?: unknown } | null }[];
  listItems(now?: number): { id: string; product: string; status?: string }[];
  productDir(product: string): string;
  fileMark(product: string, id: string, mark: NoteMark): unknown;
}

interface NoteReplyStore extends Omit<NotesStore, 'listItems'> {
  readItem(product: string, id: string): { status?: string } | null;
  answerItem(product: string, id: string, input: { answer: string; fromNotes: string[] }): unknown;
}

export type NotesTell = (product: string, id: string, line: { text: string; from: { teammate: string; name: string }; fromNotes: string[] }) => Promise<unknown>;

/** Tells each agent the notes on its files once; resolves to how many were told. */
export function wakeForNotes(opts: {
  store: NotesStore;
  team: { state?(): { me?: { id?: string } | null; people?: readonly Person[] } | null | undefined } | null | undefined;
  tell: NotesTell | null | undefined;
  now?: number;
}): Promise<number>;

/** Resolves the notes a newer version answered; returns how many. */
export function resolveAnsweredNotes(opts: { store: NotesStore; people?: readonly Person[]; now?: number }): number;

/** Sends your note on an agent's file to that agent as your reply; resolves false when nothing went. */
export function noteToItsAgent(opts: {
  store: NoteReplyStore;
  supervisor: ReplySupervisor & { liftBrakeForHer?(): unknown; wake?(): unknown };
  product?: string;
  id?: string;
  mark: unknown;
  nameOf?: (by: string) => string;
  people?: readonly Person[];
}): Promise<boolean>;
