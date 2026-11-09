// WHERE A FILE SITS: folders by project, and each file's folder by its identity
// (its project and its family of versions), so a new version stays put.
//
// A log rather than a state file, because the app and an agent's store tools are
// two processes that both write it, and an appended line cannot lose the other's.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { familyOfName } from './artifact-marks.mts';

const LOG = 'file-folders.jsonl';
export const FOLDER_NAME_MOST = 120;

export interface FolderOp { op: 'folder'; id: string; project: string; name: string; parent?: string | null; by?: string | null; at: number }
export interface PlaceOp { op: 'place'; key: string; project?: string | null; family?: string; folder: string | null; by?: string | null; at: number }
export type FolderLogOp = FolderOp | PlaceOp;

export interface FileFolder { id: string; project: string; name: string; parent: string | null; at: number }

export interface FolderShelf {
  folders: FileFolder[];
  canon: (id: string) => string;
  places: Map<string, PlaceOp>;
  placeOf(key: string): string | null;
}

export const projectKey = (name: string | null | undefined): string => String(name ?? '').trim().toLowerCase();
export const fileKeyIn = (project: string | null | undefined, name: string | null | undefined): string => `${projectKey(project)}\0${familyOfName(name)}`;
export const newFolderId = (): string => crypto.randomUUID();
export const cleanFolderName = (name: string | null | undefined): string => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, FOLDER_NAME_MOST);
const nameKey = (name: string | null | undefined): string => cleanFolderName(name).toLowerCase();

export function readFolderLog(dir: string): FolderLogOp[] {
  let text = '';
  try { text = fs.readFileSync(path.join(dir, LOG), 'utf8'); } catch { return []; }
  const out: FolderLogOp[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* a line cut short by a crash */ }
  }
  return out;
}

export function writeFolderLog<T extends FolderLogOp>(dir: string, op: T): T {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, LOG), `${JSON.stringify(op)}\n`);
  return op;
}

/**
 * Lines to what they add up to, newest word winning. Two people who each made
 * "Launch" apart have one folder: the older id, which every place of either follows.
 */
export function foldFolders(ops: readonly FolderLogOp[]): FolderShelf {
  const rows = new Map<string, FileFolder & { first: number }>();
  const places = new Map<string, PlaceOp>();
  for (const op of ops) {
    if (op.op === 'folder') {
      const was = rows.get(op.id);
      if (!was || was.at <= op.at) rows.set(op.id, { id: op.id, project: op.project, name: op.name, parent: op.parent ?? null, at: op.at, first: Math.min(was?.first ?? op.at, op.at) });
    } else if (op.op === 'place') {
      const was = places.get(op.key);
      if (!was || was.at <= op.at) places.set(op.key, op);
    }
  }
  const alias = new Map<string | null, string>();
  const seen = new Map<string, string>();
  for (const f of [...rows.values()].sort((a, b) => a.first - b.first || a.id.localeCompare(b.id))) {
    const parent = alias.get(f.parent) ?? f.parent;
    const k = `${projectKey(f.project)}\0${parent ?? ''}\0${nameKey(f.name)}`;
    if (seen.has(k)) alias.set(f.id, seen.get(k)!);
    else seen.set(k, f.id);
  }
  const canon = (id: string): string => alias.get(id) ?? id;
  const folders = [...rows.values()].filter((f) => !alias.has(f.id))
    .map(({ first: _first, ...f }): FileFolder => ({ ...f, parent: f.parent ? canon(f.parent) : null }));
  const shown = new Set(folders.map((f) => f.id));
  return {
    folders,
    canon,
    places,
    /** The folder a file sits in, or null: a folder this person cannot read is no place. */
    placeOf(key: string): string | null {
      const id = places.get(key)?.folder;
      return id && shown.has(canon(id)) ? canon(id) : null;
    },
  };
}

/** What a run is told about Files. Folders there are not folders on disk, and every failure so far came from mixing them up. */
export function filesFoldersBrief(
  view: { me?: unknown; folders?: ReadonlyArray<{ folder: string; project: string; files?: readonly unknown[] | null }> | null } | null | undefined,
  project: string,
): string | null {
  if (!view?.me) return null;
  const here = (view.folders ?? []).filter((f) => projectKey(f.project) === projectKey(project));
  const list = here.map((f) => `${f.folder} (${f.files?.length ?? 0} files)`).join(', ');
  return [
    `Files is where this team keeps its files, and it has its own folders, which are not folders on disk. ${list ? `${project}'s folders: ${list}.` : `${project} has no folders yet.`}`,
    'When someone names a folder they mean one of these, unless they say it is in the code. To save a document into one, pass folder to write_document. To put any other file in one, code, a page or a table included, use team_file. A folder may be in another project: name it as they did, such as Company > Launch. To see everything in one, use team_read with folder: a directory of the same name on disk holds something else.',
    'Say a file is in a folder only after the tool\'s answer names that folder. If it did not, say where the file really is.',
  ].join(' ');
}

// "Company > Launch", "Company/Launch", "Launch in Company", "Launch inside Company".
const WITH_ROOT = [/^(.+?)\s*(?:>|\/)\s*(.+)$/, /^(.+?)\s+(?:inside|in)\s+(.+)$/i];

/** The root and folder a person's words name, when one of the words is a project's name. */
function splitRoot(clean: string, roots: readonly string[]): { root: string | null | undefined; name: string } {
  const isRoot = (s: string): string | undefined => roots.find((r) => projectKey(r) === projectKey(s));
  const [before, after] = [WITH_ROOT[0].exec(clean), WITH_ROOT[1].exec(clean)];
  if (before && isRoot(before[1])) return { root: isRoot(before[1]), name: cleanFolderName(before[2]) };
  if (after && isRoot(after[2])) return { root: isRoot(after[2]), name: cleanFolderName(after[1]) };
  return { root: null, name: clean };
}

/**
 * A folder by name, or a line that makes one: the one way an agent names a
 * place. The project the words name comes first, then the thread's own
 * project, then whichever project has a folder of that name; one is made, in
 * the named project or else the thread's, only when none has it.
 */
export function folderNamed({ project, name, known = [], roots = [], dir, by = null, now = Date.now(), anywhere = true }: {
  project: string;
  name: string;
  known?: ReadonlyArray<Pick<FileFolder, 'id' | 'project' | 'name' | 'parent'>>;
  roots?: readonly string[];
  dir: string;
  by?: string | null;
  now?: number;
  anywhere?: boolean;
}): { id: string; name: string; project: string } {
  const asked = cleanFolderName(name);
  if (!asked) throw new Error('name a folder');
  const all = [...foldFolders(readFolderLog(dir)).folders, ...known].filter((f) => !f.parent);
  const { root, name: clean } = anywhere ? splitRoot(asked, [project, ...roots, ...all.map((f) => f.project)].filter(Boolean)) : { root: null, name: asked };
  if (!clean) throw new Error('name a folder');
  const named = all.filter((f) => nameKey(f.name) === nameKey(clean));
  const inRoot = (r: string) => named.find((f) => projectKey(f.project) === projectKey(r));
  const hit = root ? inRoot(root) : inRoot(project) ?? (anywhere ? named[0] : undefined);
  if (hit) return { id: hit.id, name: hit.name, project: hit.project };
  const made: FolderOp = { op: 'folder', id: newFolderId(), project: root ?? project, name: clean, parent: null, by, at: now };
  writeFolderLog(dir, made);
  return { id: made.id, name: clean, project: made.project };
}
