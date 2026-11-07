// THE FILES PLACE: one page per project, and one for every file you can see.
// Each file is one tile however many threads it went to; opening it is the big
// view with every comment from every copy, and the places it was sent in.
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { fitMenu } from '../keep-in-window';
import { ago } from '../format';
import { firstName, TeamContext } from '../team/people';
import { ArtifactView, NO_MARKS } from '../components/ArtifactView';
import { FileCover } from '../components/FileCover';
import { SearchIcon } from '../components/SearchIcon';
import type { LedgerLine } from '../thread-history';
import type { DragEvent } from 'react';
import type { FileFolder, FileFolderAct, FileKind, FileSentIn, FilesPlaceList, FilesPlaceView, PlacedFile } from '../types';
import { apartScratch, changedBy, crumbsTo, docBlocks, filesBelow, filesInPlace, filesShown, foldersInPlace, foldersMatching, KIND_ONE, KIND_PLURAL, kindsIn, missingWords, needsReview, scratchLine, shownName, sortFiles, versionWord, type FileSort } from './files-shown';
import './files-place.css';

const NONE: FilesPlaceList = { files: [], projects: [], folders: [] };
const NO_FOLDERS: FileFolder[] = [];

const readers = new Set<() => void>();
/** A change made here shows at once, not after the store's next word. */
const readAgain = () => { for (const read of readers) read(); };
// A pass over every file takes seconds on a big store; a visit starts from the last one.
let lastList: FilesPlaceList | null = null;

/** Every file, read again whenever the store says something changed. */
export function useFilesList(on: boolean) {
  const [list, setList] = useState<FilesPlaceList | null>(() => lastList);
  useEffect(() => {
    if (!on) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => { void api.filesPlace().then((l) => { lastList = l; if (live) setList(l); }); };
    read();
    readers.add(read);
    // A burst of changes reads once.
    const off = api.onChanged(() => { if (timer) clearTimeout(timer); timer = setTimeout(read, 400); });
    return () => { live = false; readers.delete(read); if (timer) clearTimeout(timer); off?.(); };
  }, [on]);
  return list;
}

function DocFace({ file }: { file: PlacedFile }) {
  const [blocks, setBlocks] = useState<{ kind: 'h1' | 'h2' | 'p' | 'li'; text: string }[]>([]);
  useEffect(() => {
    let live = true;
    if (!file.opened) return;
    void api.readDoc({ product: file.sentIn[0]?.product ?? '', src: file.opened }).then((r) => {
      if (live && r.ok) setBlocks(docBlocks(r.text ?? ''));
    });
    return () => { live = false; };
  }, [file.opened, file.blank]);
  return <div className="fp-doc" aria-hidden="true">
    {blocks.map((b, i) => (b.kind === 'h1' ? <strong key={i}>{b.text}</strong>
      : b.kind === 'h2' ? <b key={i}>{b.text}</b>
        : b.kind === 'li' ? <span key={i} className="fp-doc-li">{b.text}</span>
          : <p key={i}>{b.text}</p>))}
  </div>;
}

/** A page's own top, or a script's first lines: the file itself rather than a word for its kind. */
function PageFace({ file }: { file: PlacedFile }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void api.readDoc({ product: file.sentIn[0]?.product ?? '', src: file.opened ?? '' }).then((r) => { if (live && r.ok) setText(r.text ?? ''); });
    return () => { live = false; };
  }, [file.opened]);
  // Sandboxed with nothing allowed: a tile runs none of a page's scripts.
  return text === null ? null : <iframe className="fp-page-face" srcDoc={text} title="" tabIndex={-1} sandbox="" />;
}

function CodeFace({ file }: { file: PlacedFile }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let live = true;
    void api.readDoc({ product: file.sentIn[0]?.product ?? '', src: file.opened ?? '' }).then((r) => { if (live && r.ok) setText((r.text ?? '').split('\n').slice(0, 12).join('\n')); });
    return () => { live = false; };
  }, [file.opened]);
  return <pre className="fp-code-face" aria-hidden="true">{text}</pre>;
}

function Face({ file, whose }: { file: PlacedFile; whose: string | null }) {
  const [size, setSize] = useState('');
  const [broken, setBroken] = useState(false);
  // Says what is true rather than a bare kind on an empty tile.
  if (!file.opened || broken) return <div className="fp-face-empty">{whose ? `On ${whose}'s computer` : 'Not on this computer yet'}</div>;
  if (file.kind === 'page') return <PageFace file={file} />;
  if (file.kind === 'code' || file.kind === 'table') return <CodeFace file={file} />;
  if (file.kind === 'markdown') return <DocFace file={file} />;
  if (file.kind === 'film') return <><FileCover kind="film" opened={file.opened} onSize={setSize} />{size && <span className="fp-length">{size}</span>}</>;
  if (file.kind === 'image' || file.kind === 'pdf' || file.kind === 'deck') return <FileCover kind={file.kind} opened={file.opened} onSize={setSize} onBroken={() => setBroken(true)} />;
  return <div className="fp-face-empty">{file.kind ? KIND_ONE[file.kind] : 'File'}</div>;
}

const DRAGGED = 'application/x-agentbox-file';

/** A dragged file lands on whatever carries these. */
function dropsFile(onFile: (key: string) => void, setOver?: (on: boolean) => void) {
  return {
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAGGED)) { e.preventDefault(); setOver?.(true); } },
    onDragLeave: () => setOver?.(false),
    onDrop: (e: DragEvent) => {
      setOver?.(false);
      const key = e.dataTransfer.getData(DRAGGED);
      if (key) { e.preventDefault(); onFile(key); }
    },
  };
}

function useClosesOutside(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

function NameBox({ placeholder, start = '', onDone, onCancel }: { placeholder: string; start?: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(start);
  return <input className="fp-name-box" autoFocus value={name} placeholder={placeholder} aria-label={placeholder} maxLength={120}
    onFocus={(e) => e.currentTarget.select()}
    onChange={(e) => setName(e.target.value)}
    onClick={(e) => e.stopPropagation()}
    onBlur={() => { if (name.trim() && name.trim() !== start) onDone(name.trim()); else onCancel(); }}
    onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); if (name.trim() && name.trim() !== start) onDone(name.trim()); else onCancel(); }
      if (e.key === 'Escape') onCancel();
    }} />;
}

// The menu's most height and a little: under this it opens upward, or the window cuts it off.
const MENU_ROOM = 300;

/** A file's menu, or a group's: where it can go in its project. */
function MoveMenu({ file, name, keys, folders, act, onNewFolder }: {
  file: PlacedFile; name?: string; keys?: string[]; folders: FileFolder[]; act: (p: FileFolderAct) => void; onNewFolder: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [query, setQuery] = useState('');
  const [up, setUp] = useState(false);
  const box = useClosesOutside(open, () => { setOpen(false); setNaming(false); setQuery(''); });
  useLayoutEffect(() => {
    const menu = box.current?.querySelector<HTMLElement>(':scope > .fp-menu');
    // The page's own foot, above the window's: the page clips what runs past it.
    if (menu) fitMenu(menu, menu.closest('.fp-page')?.getBoundingClientRect().bottom ?? window.innerHeight);
  }, [open, naming]);
  const here = folders.filter((f) => f.project.toLowerCase() === (file.project ?? '').toLowerCase());
  const tops = here.filter((f) => !f.parent);
  const move = (folder: string | null) => { setOpen(false); setQuery(''); for (const key of keys ?? [file.key]) act({ do: 'move', key, folder }); };
  const item = (f: FileFolder, sub: boolean) => <button type="button" key={f.id} role="menuitem" className={`fp-menu-item${sub ? ' is-sub' : ''}`} disabled={!keys && file.folder === f.id} onClick={() => move(f.id)}>
    <FolderGlyph />{f.name}
  </button>;
  const found = foldersMatching(here, query);
  return <div className={`fp-more-box${open ? ' is-open' : ''}`} ref={box}>
    <button type="button" className="fp-more" aria-label={`Move ${name ?? file.name}`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { setUp(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < MENU_ROOM); setOpen(!open); }}><MoreGlyph /></button>
    {open && <div className={`fp-menu${up ? ' is-up' : ''}`} role="menu">
      <div className="fp-menu-head">Move to</div>
      {here.length > 3 && <input className="fp-menu-find" autoFocus value={query} placeholder="Find a folder" aria-label="Find a folder" onChange={(e) => setQuery(e.target.value)} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && found.length === 1) move(found[0].id); }} />}
      <div className="fp-menu-list">
      {!query && (keys || file.folder) && <button type="button" role="menuitem" className="fp-menu-item" onClick={() => move(null)}>Top of {file.project}</button>}
      {query
        ? found.map((f) => item(f, false))
        : tops.flatMap((t) => [item(t, false), ...here.filter((f) => f.parent === t.id).map((f) => item(f, true))])}
      {query && !found.length && <div className="fp-menu-none">No folder called that</div>}
      </div>
      {naming
        ? <div className="fp-menu-new"><NameBox placeholder="Folder name" onCancel={() => setNaming(false)} onDone={(name) => { setOpen(false); setNaming(false); onNewFolder(name); }} /></div>
        : <button type="button" role="menuitem" className="fp-menu-item" onClick={() => setNaming(true)}>New folder</button>}
    </div>}
  </div>;
}

type Making = 'document' | 'table' | 'folder' | 'upload';
const MAKING_IN: Record<Making, string> = { document: 'New document in', table: 'New table in', folder: 'New folder in', upload: 'Add files to' };

/** "New", in the page's header where Threads has New thread: here, or from every file in a project you pick. */
function NewMenu({ project, projects, canDocument, canFolder, onPick }: {
  project: string | null; projects: string[]; canDocument: boolean; canFolder: boolean; onPick: (what: Making, project: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<Making | null>(null);
  const box = useClosesOutside(open, () => { setOpen(false); setWhat(null); });
  const pick = (w: Making, p: string) => { setOpen(false); setWhat(null); onPick(w, p); };
  const choose = (w: Making) => {
    if (project) pick(w, project);
    else if (projects.length === 1) pick(w, projects[0]);
    else setWhat(w);
  };
  if ((!project && !projects.length) || (!canDocument && !canFolder)) return null;
  const toggle = () => { setOpen(!open); setWhat(null); };
  return <div className="fp-new-box" ref={box}>
    <button type="button" className="th-new" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><PlusGlyph />New</button>
    {open && <div className="fp-menu" role="menu">
      {what
        ? <>
          <div className="fp-menu-head">{MAKING_IN[what]}</div>
          <div className="fp-menu-list">{projects.map((p) => <button type="button" key={p} role="menuitem" className="fp-menu-item" onClick={() => pick(what, p)}>{p}</button>)}</div>
        </>
        : <>
          {canDocument && <button type="button" role="menuitem" className="fp-menu-item" onClick={() => choose('document')}><DocGlyph />Document</button>}
          {canDocument && <button type="button" role="menuitem" className="fp-menu-item" onClick={() => choose('table')}><TableGlyph />Table</button>}
          {canFolder && <button type="button" role="menuitem" className="fp-menu-item" onClick={() => choose('folder')}><FolderGlyph />Folder</button>}
          {canDocument && <button type="button" role="menuitem" className="fp-menu-item" onClick={() => choose('upload')}><UploadGlyph />Upload from computer</button>}
        </>}
    </div>}
  </div>;
}

/** An element the window's header draws for this page, once it is there. */
function useSlot(id: string) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById(id)); }, [id]);
  return el;
}

function Tile({ file, list, now, me, nameOf, onOpen, folders, act, onNewFolder }: {
  file: PlacedFile; list: boolean; now: number; me: string | null; nameOf: (id: string) => string; onOpen: () => void;
  folders: FileFolder[]; act: (p: FileFolderAct) => void; onNewFolder: (file: PlacedFile, name: string) => void;
}) {
  const v = versionWord(file);
  const approved = file.approvedBy.length > 0;
  const words = [v, changedBy(file, { me, nameOf }), file.at ? ago(file.at, now) : null].filter(Boolean).join('  ·  ');
  const marks = <>
    {file.open > 0 && <span className="fp-open" title={`${file.open} open ${file.open === 1 ? 'comment' : 'comments'}`}><CommentGlyph />{file.open}</span>}
    {approved && <span className="fp-approved" title={`Approved by ${file.approvedBy.map((id) => (id === me ? 'you' : nameOf(id ?? ''))).join(', ')}`}><i aria-hidden="true" />Approved</span>}
    {!approved && file.changedSinceApproval && <span className="fp-open">Changed since approved</span>}
  </>;
  const name = shownName(file);
  const whose = !file.opened && file.by && file.by !== me ? nameOf(file.by) : null;
  return <div className={list ? 'fp-line' : 'fp-tile'} draggable={!!file.project} onDragStart={(e) => { e.dataTransfer.setData(DRAGGED, file.key); e.dataTransfer.effectAllowed = 'move'; }}>
    <button type="button" className="fp-open-file" onClick={onOpen} aria-label={`Open ${file.name}`} title={name === file.name ? undefined : file.name}>
      {list
        ? <>
          <span className={`fp-face fp-thumb fp-face-${file.kind ?? 'file'}`}>{file.kind === 'image' || file.kind === 'film' ? <Face file={file} whose={whose} /> : <span className="fp-thumb-word">{file.kind === 'markdown' ? 'DOC' : file.kind === 'pdf' ? 'PDF' : file.kind === 'deck' ? 'DECK' : file.kind === 'page' ? 'PAGE' : file.kind === 'code' ? 'CODE' : file.kind === 'table' ? 'TABLE' : 'FILE'}</span>}</span>
          <span className="fp-name">{name}</span>
          <span className="fp-line-marks">{marks}</span>
          <span className="fp-meta-words">{words}</span>
        </>
        : <>
          <span className={`fp-face fp-face-${file.kind ?? 'file'}`}><Face file={file} whose={whose} /></span>
          <span className="fp-name">{name}</span>
          <span className="fp-meta"><span className="fp-meta-words">{words}</span>{marks}</span>
        </>}
    </button>
    {file.project && <MoveMenu file={file} folders={folders} act={act} onNewFolder={(n) => onNewFolder(file, n)} />}
  </div>;
}

function FolderCard({ folder, count, onOpen, onDropFile, onRename }: {
  folder: Pick<FileFolder, 'name'>; count: number; onOpen: () => void; onDropFile?: (key: string) => void; onRename?: (name: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const words = count === 1 ? '1 file' : `${count} files`;
  return <div className={`fp-folder${over ? ' is-over' : ''}`} {...(onDropFile ? dropsFile(onDropFile, setOver) : {})}>
    {renaming
      ? <div className="fp-folder-open"><FolderGlyph /><span className="fp-folder-words"><NameBox placeholder="Folder name" start={folder.name} onCancel={() => setRenaming(false)} onDone={(n) => { setRenaming(false); onRename?.(n); }} /></span></div>
      : <button type="button" className="fp-folder-open" onClick={onOpen} aria-label={`Open ${folder.name}`}>
        <FolderGlyph />
        <span className="fp-folder-words"><span className="fp-folder-name">{folder.name}</span><span className="fp-folder-count">{words}</span></span>
      </button>}
    {onRename && !renaming && <button type="button" className="fp-rename" aria-label={`Rename ${folder.name}`} title="Rename" onClick={() => setRenaming(true)}><PenGlyph /></button>}
  </div>;
}

const FolderGlyph = () => <svg className="fp-folder-glyph" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M2 4.6c0-.6.5-1.1 1.1-1.1h2.7c.3 0 .6.1.8.3l1 1h5.3c.6 0 1.1.5 1.1 1.1v6c0 .6-.5 1.1-1.1 1.1H3.1c-.6 0-1.1-.5-1.1-1.1z" strokeLinejoin="round" /></svg>;
const TableGlyph = () => <svg className="fp-folder-glyph" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1" /><path d="M2.5 6.4h11M2.5 9.7h11M6.2 6.4V13" /></svg>;
const UploadGlyph = () => <svg className="fp-folder-glyph" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 10.5V3M5 6l3-3 3 3M3 10.5v2h10v-2" /></svg>;
const PlusGlyph = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
const DocGlyph = () => <svg className="fp-folder-glyph" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M4 2.5h5l3 3v8H4z M9 2.5v3h3 M6 8.5h4 M6 10.8h4" strokeLinejoin="round" strokeLinecap="round" /></svg>;
const MoreGlyph = () => <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="12.5" cy="8" r="1.2" /></svg>;
const PenGlyph = () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M3 13l.7-2.8 7-7a1.2 1.2 0 0 1 1.7 0l.4.4a1.2 1.2 0 0 1 0 1.7l-7 7z" strokeLinejoin="round" /></svg>;
const GridGlyph = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><rect x="2.5" y="2.5" width="4.4" height="4.4" rx="1.1" /><rect x="9.1" y="2.5" width="4.4" height="4.4" rx="1.1" /><rect x="2.5" y="9.1" width="4.4" height="4.4" rx="1.1" /><rect x="9.1" y="9.1" width="4.4" height="4.4" rx="1.1" /></svg>;
const ListGlyph = () => <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10" strokeLinecap="round" /></svg>;

const CommentGlyph = () => <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" /></svg>;

/** The file opened big, with every place it went to under it. */
function OpenFile({ fileKey, typing = false, onClose, onPlace, onNotice }: {
  fileKey: string; typing?: boolean; onClose: () => void; onPlace: (p: FileSentIn) => void; onNotice: (words: string) => void;
}) {
  const team = useContext(TeamContext);
  const [view, setView] = useState<FilesPlaceView | null>(null);
  const [opened] = useState(() => ({ at: Date.now() }));
  useEffect(() => {
    let live = true;
    const read = () => { void api.filesPlaceOpen({ key: fileKey }).then((v) => { if (live) setView(v); }); };
    read();
    const off = api.onChanged(read);
    return () => { live = false; off?.(); };
  }, [fileKey]);
  const product = view?.sentIn[0]?.product ?? '';
  const editsTo = view?.editsTo ?? null;
  const below = !!view?.sentIn.length && <footer className="fp-sent">
    <span className="fp-sent-label">Sent in</span>
    {view.sentIn.map((p) => <button type="button" key={`${p.kind}/${p.product ?? p.ownerId}/${p.id ?? p.threadId}`} className="fp-sent-place" onClick={() => onPlace(p)}>
      <PlaceGlyph kind={p.kind} />{p.title}
    </button>)}
  </footer>;
  return <ArtifactView
    product={product}
    threadName="Files"
    shareThread={view?.sentIn.find((p) => p.kind === 'thread' && p.product === product && p.id)?.id ?? undefined}
    lines={(view?.lines ?? []) as LedgerLine[]}
    marks={view?.marks ?? NO_MARKS}
    me={team?.me ?? null}
    people={team ? [...team.byId.values()] : []}
    open={opened}
    ownerOfRow={null}
    write={(mark) => api.filesPlaceMark({ key: fileKey, mark })}
    onNewVersion={editsTo ? async (_name, text) => {
      const out = await api.filesPlaceEdit({ key: fileKey, text });
      if (!out.ok) return out.error ?? 'That did not save.';
      // The page shows the new words as Done returns, not a moment after.
      const fresh = await api.filesPlaceOpen({ key: fileKey });
      if (fresh) setView(fresh);
      return null;
    } : undefined}
    missingSays={(by) => missingWords(by && by !== team?.me && team?.byId.get(by) ? firstName(team.byId.get(by)!) : null)}
    editGoes={editsTo?.kind === 'shared' ? `Sent to ${team?.byId.get(editsTo.ownerId ?? '') ? firstName(team.byId.get(editsTo.ownerId!)!) : 'whoever made it'}.` : undefined}
    onOutside={(src) => { void api.openArtifactExternally({ product, src }).then((r) => { if (!r.ok) onNotice(r.error || 'That file could not be opened.'); }); }}
    onClose={onClose}
    below={below}
    typing={typing}
  />;
}

const PlaceGlyph = ({ kind }: { kind: FileSentIn['kind'] }) => (kind === 'chat'
  ? <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" /></svg>
  : <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" strokeLinecap="round" /></svg>);

export function FilesPlace({ project, onProject, now, onPlace, onNotice }: {
  /** The project's page, or null for every file. */
  project: string | null;
  onProject: (project: string | null) => void;
  now: number;
  onPlace: (p: FileSentIn) => void;
  onNotice: (words: string) => void;
}) {
  const team = useContext(TeamContext);
  const list = useFilesList(true) ?? null;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<FileKind | null>(null);
  const [review, setReview] = useState(false);
  const [sort, setSort] = useState<FileSort>('recent');
  const [asList, setAsList] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [madeKey, setMadeKey] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ what: Making; project: string } | null>(null);
  const box = useRef<HTMLInputElement | null>(null);
  const all = list ?? NONE;
  const folders = all.folders ?? NO_FOLDERS;
  const folder = folders.some((f) => f.id === folderId) ? folderId : null;
  const place = { project, folder };
  // Picking a project from every file opens its page with the name box already there.
  useEffect(() => { setFolderId(null); setNaming((n) => (n && n.project === project ? n : null)); }, [project]);
  const mine = all.mine ?? [];
  const isMine = (p: string | null) => !!p && mine.some((m) => m.toLowerCase() === p.toLowerCase());
  const makeFile = (kind: 'document' | 'table', name: string) => {
    setNaming(null);
    if (!project) return;
    void api.filesPlaceNew({ project, name, kind, folder }).then((r) => {
      if (r.ok && r.key) { setMadeKey(r.key); setOpenKey(r.key); readAgain(); } else onNotice(r.error || `That ${kind} could not be made.`);
    });
  };
  const upload = (into: string, inFolder: string | null) => {
    void api.filesPlaceUpload({ project: into, folder: inFolder }).then((r) => {
      if (!r.ok) { onNotice(r.error || 'Those files could not be added.'); return; }
      readAgain();
      const left = r.refused ?? [];
      if (left.length) onNotice(`${left.join(', ')} ${left.length === 1 ? 'is a kind' : 'are kinds'} Files cannot show, so ${left.length === 1 ? 'it was' : 'they were'} not added.`);
    });
  };
  const below = useMemo(() => filesBelow(all.files, folders, place), [all.files, folders, project, folder]); // eslint-disable-line react-hooks/exhaustive-deps
  const here = useMemo(() => filesInPlace(all.files, folders, place), [all.files, folders, project, folder]); // eslint-disable-line react-hooks/exhaustive-deps
  const looking = !!query || !!kind || review;
  const kinds = kindsIn(below);
  const reviewing = below.filter(needsReview).length;
  useEffect(() => { if (kind && !kinds.includes(kind)) setKind(null); }, [kinds.join(), kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // Looking for something goes through every folder under here; only browsing stays in the one place.
  const found = looking ? filesShown(below, { query, kind, folders }).filter((f) => !review || needsReview(f)) : here;
  // A search finds a check picture like any file; otherwise they wait under one line.
  const { files: unsorted, scratch } = query ? { files: found, scratch: [] } : apartScratch(found);
  const shown = sortFiles(unsorted, sort);
  const [scratchOpen, setScratchOpen] = useState(false);
  const nameOf = (id: string) => firstName(team?.byId.get(id) ?? null) || 'A teammate';
  const act = (p: FileFolderAct) => api.filesPlaceFolder(p).then((r) => { if (!r.ok) onNotice(r.error || 'That could not be done.'); else readAgain(); return r; });
  const move = (key: string, to: string | null) => { void act({ do: 'move', key, folder: to }); };
  const countIn = (id: string) => filesBelow(all.files, folders, { project, folder: id }).length;
  const crumbs = crumbsTo(folders, place);
  const cards = looking ? [] : foldersInPlace(folders, place);
  const projectCards = looking || project ? [] : all.projects;
  // Folders go one level deep.
  const canNest = !folders.find((f) => f.id === folder)?.parent;
  const tile = (f: PlacedFile) => <Tile key={f.key} file={f} list={asList} now={now} me={team?.me ?? null} nameOf={nameOf} onOpen={() => setOpenKey(f.key)} folders={folders} act={(p) => { void act(p); }}
    onNewFolder={(file, name) => { void act({ do: 'make', project: file.project ?? '', name }).then((r) => { if (r.ok && r.folder) move(file.key, r.folder); }); }} />;
  const empty = looking ? 'No file matches.'
    : folder ? 'Nothing in this folder yet.'
      : project ? `No files in ${project} yet.` : 'Nothing in Files yet.';
  const pick = (what: Making, p: string) => {
    if (p !== project) onProject(p);
    if (what === 'upload') upload(p, p === project ? folder : null);
    else setNaming({ what, project: p });
  };
  const headSlot = useSlot('fp-head-slot');

  return <div className="fp-page">
    {headSlot && createPortal(<NewMenu project={project} projects={mine} canDocument={project ? isMine(project) : true} canFolder={project ? canNest : true} onPick={pick} />, headSlot)}
    <div className="fp-bar">
      <nav className="fp-crumbs" aria-label="Where you are">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const go = () => { if (c.project !== project) onProject(c.project); setFolderId(c.folder); };
          return <span key={`${c.project}/${c.folder}`} className="fp-crumb-box">
            {i > 0 && <span className="fp-crumb-gap" aria-hidden="true">/</span>}
            <button type="button" className={`fp-crumb${last ? ' is-on' : ''}`} aria-current={last ? 'page' : undefined} onClick={go}
              {...(c.project && !last ? dropsFile((key) => move(key, c.folder)) : {})}>{c.name}</button>
          </span>;
        })}
      </nav>
      <label className="fp-find">
        <SearchIcon />
        <input ref={box} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" aria-label="Search files"
          onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); } }} />
      </label>
    </div>
    <div className="fp-tools">
      <div className="fp-kinds" role="group" aria-label="Show">
        {kinds.length > 1 && <>
          <button type="button" className={`fp-kind${kind === null && !review ? ' is-on' : ''}`} aria-pressed={kind === null && !review} onClick={() => { setKind(null); setReview(false); }}>All</button>
          {kinds.map((k) => <button type="button" key={k} className={`fp-kind${kind === k ? ' is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>{KIND_PLURAL[k]}</button>)}
        </>}
        {(reviewing > 0 || review) && <button type="button" className={`fp-kind${review ? ' is-on' : ''}`} aria-pressed={review} onClick={() => setReview(!review)}>Needs review</button>}
      </div>
      <div className="fp-views">
        <div className="fp-switch" role="group" aria-label="Sort">
          <button type="button" className={`fp-kind${sort === 'recent' ? ' is-on' : ''}`} aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>Recent</button>
          <button type="button" className={`fp-kind${sort === 'name' ? ' is-on' : ''}`} aria-pressed={sort === 'name'} onClick={() => setSort('name')}>Name</button>
        </div>
        <div className="fp-switch" role="group" aria-label="View">
          <button type="button" className={`fp-kind fp-view-icon${asList ? '' : ' is-on'}`} aria-pressed={!asList} aria-label="Grid" title="Grid" onClick={() => setAsList(false)}><GridGlyph /></button>
          <button type="button" className={`fp-kind fp-view-icon${asList ? ' is-on' : ''}`} aria-pressed={asList} aria-label="List" title="List" onClick={() => setAsList(true)}><ListGlyph /></button>
        </div>
      </div>
    </div>
    {(cards.length > 0 || projectCards.length > 0 || naming?.what === 'folder') && <div className="fp-folders">
      {projectCards.map((p) => <FolderCard key={p} folder={{ name: p }} count={filesBelow(all.files, folders, { project: p, folder: null }).length} onOpen={() => onProject(p)} />)}
      {cards.map((f) => <FolderCard key={f.id} folder={f} count={countIn(f.id)} onOpen={() => setFolderId(f.id)}
        onDropFile={(key) => move(key, f.id)} onRename={(name) => { void act({ do: 'rename', id: f.id, name }); }} />)}
      {naming?.what === 'folder' && project && <div className="fp-folder is-new"><div className="fp-folder-open"><FolderGlyph /><span className="fp-folder-words"><NameBox placeholder="Folder name" onCancel={() => setNaming(null)} onDone={(name) => { setNaming(null); void act({ do: 'make', project, name, parent: folder }); }} /></span></div></div>}
    </div>}
    {list && !shown.length && !scratch.length && !cards.length && !projectCards.length && !naming && <p className="fp-empty">{empty}</p>}
    <div className={asList ? 'fp-lines' : 'fp-grid'}>
      {(naming?.what === 'document' || naming?.what === 'table') && project && <div className={asList ? 'fp-line is-new' : 'fp-tile is-new'}>
        <div className="fp-open-file">
          <span className={`fp-face fp-face-${naming.what === 'table' ? 'table' : 'markdown'}${asList ? ' fp-thumb' : ''}`}>{asList ? <span className="fp-thumb-word">{naming.what === 'table' ? 'TABLE' : 'DOC'}</span> : naming.what === 'table' ? <TableGlyph /> : <DocGlyph />}</span>
          <span className="fp-name"><NameBox placeholder={naming.what === 'table' ? 'Table name' : 'Document name'} onCancel={() => setNaming(null)} onDone={(name) => makeFile(naming.what === 'table' ? 'table' : 'document', name)} /></span>
        </div>
      </div>}
      {shown.map(tile)}
    </div>
    {scratch.length > 0 && <div className="fp-scratch-row">
      <button type="button" className="fp-scratch" aria-expanded={scratchOpen} onClick={() => setScratchOpen(!scratchOpen)}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={scratchOpen ? 'M4 10l4-4 4 4' : 'M6 4l4 4-4 4'} /></svg>
        {scratchLine(scratch.length)}
      </button>
      {scratch[0].project && <MoveMenu file={scratch[0]} name={scratchLine(scratch.length)} keys={scratch.map((f) => f.key)} folders={folders} act={(p) => { void act(p); }}
        onNewFolder={(name) => { void act({ do: 'make', project: scratch[0].project ?? '', name }).then((r) => { if (r.ok && r.folder) for (const f of scratch) move(f.key, r.folder); }); }} />}
    </div>}
    {scratchOpen && scratch.length > 0 && <div className={`${asList ? 'fp-lines' : 'fp-grid'} fp-grid-scratch`}>
      {scratch.map(tile)}
    </div>}
    {openKey && <OpenFile key={openKey} fileKey={openKey} typing={openKey === madeKey} onClose={() => { setOpenKey(null); setMadeKey(null); readAgain(); }} onNotice={onNotice}
      onPlace={(p) => { setOpenKey(null); onPlace(p); }} />}
  </div>;
}
