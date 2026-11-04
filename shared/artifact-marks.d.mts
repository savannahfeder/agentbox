import type { ArtifactMark, FileApproval, FileMarks, FileNote, NotePlace } from '../renderer/src/types';

export type ThreadFile = { path: string; by?: string | null; at?: number; agent?: string; edited?: boolean; newer?: boolean };
/** `agent` is set when an agent shared it: its name, or empty when it has none. */
export type FileVersion = { id: string; name: string; path: string; n: number; by: string | null; at: number; agent?: string; edited?: boolean; also?: string[]; /** Made in another place after this thread's own. */ newer?: boolean };
export type FileFamily = { key: string; versions: FileVersion[] };
export type FileNews = { kind: 'note' | 'named' | 'approved'; id: string; by: string; ts: number; file: string; text?: string };

export const MAX_QUOTE_CHARS: number;
export function cleanMark(value: unknown): ArtifactMark | undefined;
export function isBookkeepingMark(mark: unknown): boolean;
export function marksOf(entries: unknown[] | null | undefined): FileMarks;
export function approvalId(a: Pick<FileApproval, 'ts'>): string;
export function placeWords(note: { place?: NotePlace | null; pin?: number | string } | null | undefined): string;
export function viewKind(path: string | null | undefined): 'image' | 'film' | 'pdf' | 'markdown' | 'deck' | 'page' | 'table' | 'code' | null;
export function opensBigInAGroup(name: string | null | undefined): boolean;
export function otherFilesInLines(lines: unknown[] | null | undefined): Array<{ path: string; by: string | null; at: number; agent?: string }>;
export function shownName(path: string | null | undefined): string;
export function reviewKind(path: string | null | undefined): 'image' | 'film' | 'pdf' | 'markdown' | 'deck' | null;
export function threadFiles(files: ThreadFile[] | null | undefined, numbers?: Record<string, number> | null): FileFamily[];
export function lineAsThread(line: ReadonlyArray<{ key: string; versions: ReadonlyArray<{ n: number; name: string; path: string | null; by: string | null; at: number; agent?: string; here: string[] }> }> | null | undefined): { numbers: Record<string, number>; lines: unknown[] };
export function whereAPressLands(families: FileFamily[] | null | undefined, press?: { path?: string | null; file?: string | null }): { fi: number; vi: number } | null;
export function versionForPath(families: FileFamily[] | null | undefined, path: string | null | undefined): FileVersion | null;
export function stepsThrough(families: FileFamily[], paths: string[] | null | undefined): Array<{ fi: number; vi: number }>;
export function nextStep(families: FileFamily[] | null | undefined, steps: Array<{ fi: number; vi: number }> | null | undefined, at: { fi: number; vi: number } | null, by: number): { fi: number; vi: number } | null;
export function filesInLines(lines: unknown[] | null | undefined): Array<{ path: string; by: string | null; at: number; agent?: string }>;
export function notedFilesInLines(lines: unknown[] | null | undefined): Array<{ path: string; by: string | null; at: number; agent?: string }>;
export function sharedByWords(v: Pick<FileVersion, 'by' | 'agent'>, opts: { me: string | null; nameOf: (id: string) => string }): string;
export function resolvedInWords(v: Pick<FileVersion, 'by' | 'agent' | 'n'>, opts: { me: string | null; nameOf: (id: string) => string }): string;
export function carriedNotes(family: FileFamily | null | undefined, index: number, notes: FileNote[] | null | undefined, opts?: { resolved?: boolean }): Array<FileNote & { from: string }>;
export function whoseIsTheFile(files: ThreadFile[], id: string): string | null;
export function fileNewsFor(item: { artifacts?: FileMarks; runner?: string | null; createdBy?: string | null; people?: readonly string[] | null } | null | undefined, me: string | null | undefined, opts?: { myName?: string | null }): FileNews[];
export function asksByName(text: string | null | undefined, name: string | null | undefined): boolean;
export function fileNewsLine(news: FileNews[] | null | undefined, nameOf: (id: string) => string): string | null;
export function nextVersionName(name: string, count: number): string;
export function addressedTo(text: string | null | undefined, people: ReadonlyArray<{ id: string; name?: string | null }> | null | undefined): string | null;
export function stillWaiting(note: { wait?: boolean; toAgent?: boolean; sent?: boolean } | null | undefined): boolean;
export function noteGoesTo(note: { text?: string; mentions?: readonly string[]; toAgent?: boolean } | null | undefined, people?: ReadonlyArray<{ id: string; name?: string | null }>): { to: 'agent' } | { to: 'person'; person: string } | { to: 'nobody' };
export function notesForTheAgent(marks: FileMarks | null | undefined, version: FileVersion, count: number, opts?: { nameOf?: (id: string | null) => string }): { text: string; ids: string[] };
export const MAX_EDIT_BYTES: number;
export function editedWords(name: string, path: string): string;
export function editClash(family: Pick<FileFamily, 'versions'> | null | undefined, baseN: number, me: string | null, nameOf: (id: string | null) => string): string | null;
/** What to ask before approving version `index`, or null. */
export function approveAsk(family: Pick<FileFamily, 'versions'> | null | undefined, index: number, notes: readonly { file: string; resolved?: boolean }[] | null | undefined): { text: string; newest: FileFamily['versions'][number] | null } | null;
/** `group-seat-picker-v3.png` as `group-seat-picker.png`. */
export function baseName(name: string): string;
/** The key of the family a path belongs to, with \0 as /. */
export function familyKeyOf(path: string): string;
export function familyName(family: Pick<FileFamily, 'versions'> | null | undefined, version: FileFamily['versions'][number] | null | undefined): string;
export function approvalSince(family: Pick<FileFamily, 'versions'> | null | undefined, index: number, approvals: Array<{ file: string; by: string | null }> | null | undefined, nameOf: (id: string | null) => string): string | null;
export function newestOfFamily(path: string, edits: Array<{ path: string }> | null | undefined): string;
export function editedFilesLine(lines: unknown[] | null | undefined): string | null;
export function findQuote(text: string, quote: string): { start: number; end: number } | null;

export type { FileNote };
