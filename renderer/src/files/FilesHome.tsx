// FILES' HOME: a project's folders as sections of tiles, Pinned first, and what
// nobody filed after them; and each folder's own page. The tiles, icons, menus
// and type are its own; the opened file is Files' (FilesPlace hands it in).
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { SearchIcon } from '../components/SearchIcon';
import { pictureUrl } from '../picture';
import type { FileFolder, PlacedFile } from '../types';
import { changedBy } from './files-shown';
import { docTop, FILE_DRAG, GLYPH_NAMES, glyphFor, markOf, NOT_IN_A_FOLDER, pinChangedLately, SHOWN_AT_FIRST, tileLine, tileName, whenWords, type Crumb, type DocTop, type Glyph, type Home } from './files-home';
import './files-home.css';

type DropHandlers = { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void };
export interface ProjectShelf { name: string; kept: number; loose: number; at: number | null }

/** What a person can do to a file or a folder from Files' home. */
export interface HomeActs {
  move: (key: string, folder: string | null) => void;
  moveToNew: (key: string, name: string) => void;
  rename: (file: PlacedFile, name: string) => void;
  icon: (file: PlacedFile, icon: string) => void;
  /** Absent for a file Files cannot move to the Trash. */
  trash: (file: PlacedFile) => void;
  renameFolder: (folder: FileFolder, name: string) => void;
  removeFolder: (folder: FileFolder) => void;
}

interface Shared {
  me: string | null;
  nameOf: (id: string) => string;
  now: number;
  onOpen: (key: string) => void;
  /** The project's folders, for Move to. */
  folders: FileFolder[];
  acts: HomeActs;
}

/** A page's place: the project's home, a folder's own page, or its files in no folder. */
export type HomePage = { kind: 'home' } | { kind: 'folder'; folder: FileFolder; files: PlacedFile[] } | { kind: 'loose'; files: PlacedFile[] };

const GLYPHS: Record<Glyph | 'folder', ReactNode> = {
  page: <><path d="M6.5 3.5h7l4 4v13h-11z" /><path d="M13.5 3.5v4h4M9 12.5h6M9 16h4" /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M9.5 9.5v10" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17.5l4.8-4.5 3.4 3 2.6-2.1 5.2 4.6" /></>,
  film: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M10.2 9.4l4.6 2.6-4.6 2.6z" /></>,
  window: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9h17" /></>,
  slides: <><rect x="3.5" y="4.5" width="17" height="11" rx="2" /><path d="M12 15.5v4M8.5 19.5h7" /></>,
  code: <path d="M9 7.5l-4.5 4.5L9 16.5M15 7.5l4.5 4.5-4.5 4.5" />,
  tag: <><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.3 6.3a1.4 1.4 0 0 1-2 0z" /><circle cx="8.2" cy="8.2" r="1.4" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="M15.6 8.4l-2.2 5-5 2.2 2.2-5z" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.4 2.8-5.3 5.5-5.3s4.9 1.9 5.5 5.3M15.4 5.6a3 3 0 0 1 0 5.8M17.2 14.4c1.8.6 2.9 2.4 3.3 5.1" /></>,
  phone: <path d="M8.4 4.2l1.8 3.7-1.7 1.4a10 10 0 0 0 5.9 5.9l1.4-1.7 3.7 1.8-.8 3a1.3 1.3 0 0 1-1.3 1A14.8 14.8 0 0 1 4 6.4a1.3 1.3 0 0 1 1-1.3z" />,
  cloud: <path d="M7.2 18.5h10a4 4 0 0 0 .5-8 5.8 5.8 0 0 0-11.1 1.4 3.3 3.3 0 0 0 .6 6.6z" />,
  binoculars: <><circle cx="7" cy="15.5" r="3.6" /><circle cx="17" cy="15.5" r="3.6" /><path d="M10.6 15.2h2.8M5.2 12.4L7.2 5h2.6l.8 7M18.8 12.4L16.8 5h-2.6l-.8 7" /></>,
  chart: <><path d="M4 19.5h16M5.5 15.5l4-4.5 3.2 2.7 5.3-6.2" /><path d="M14.5 7.5H18V11" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-.9 1.6-2-.4-1.4.5-2.6 2-2.6h1.6a3.3 3.3 0 0 0 3.3-3.4C20.3 7.6 16.6 3.5 12 3.5z" /><circle cx="7.8" cy="11" r="1.1" /><circle cx="10.4" cy="7.5" r="1.1" /><circle cx="14.8" cy="7.6" r="1.1" /></>,
  chat: <><path d="M4 5.5h16v10.5h-7.5L8 19.8V16H4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  box: <><path d="M12 3.5l8 4v9l-8 4-8-4v-9z" /><path d="M4 7.5l8 4 8-4M12 11.5v9" /></>,
  book: <><path d="M3.5 6c2.8-1.4 5.7-1.4 8.5.4 2.8-1.8 5.7-1.8 8.5-.4v12c-2.8-1.4-5.7-1.4-8.5.4-2.8-1.8-5.7-1.8-8.5-.4z" /><path d="M12 6.4v12" /></>,
  shield: <path d="M12 3.5l7 3v5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9v-5z" />,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>,
  layers: <><path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" /><path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" /></>,
  mobile: <><rect x="7" y="2.8" width="10" height="18.4" rx="2.2" /><path d="M10.8 17.8h2.4" /></>,
  folder: <path d="M3.5 7c0-.8.7-1.5 1.5-1.5h4l1.6 1.8h8.4c.8 0 1.5.7 1.5 1.5v8.7c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5z" />,
};

const GlyphIcon = ({ glyph, size = 20 }: { glyph: Glyph | 'folder'; size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
  strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPHS[glyph]}</svg>;
const GlyphMark = ({ glyph }: { glyph: Glyph | 'folder' }) => <span className="fh-glyph" aria-hidden="true"><GlyphIcon glyph={glyph} /></span>;
const Chevron = () => <svg className="fh-chev" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5l4.5 4.5L6 12.5" /></svg>;
const Dots = () => <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="12.5" cy="8" r="1.2" /></svg>;

/** True from when the element comes within a screen of the page's view. */
function useNear<T extends Element>(): [MutableRefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const watch = new IntersectionObserver((seen) => { if (seen.some((s) => s.isIntersecting)) setNear(true); }, { rootMargin: '100% 0px' });
    watch.observe(el);
    return () => watch.disconnect();
  }, [near]);
  return [ref, near];
}

/** A document's title and first sentence, read once it is near. */
function useDocTop(file: PlacedFile, near: boolean): DocTop {
  const [top, setTop] = useState<DocTop>({ title: null, line: null });
  useEffect(() => {
    if (!near || file.kind !== 'markdown' || !file.opened) return;
    let live = true;
    void api.readDoc({ product: file.sentIn[0]?.product ?? '', src: file.opened }).then((r) => { if (live && r.ok) setTop(docTop(r.text ?? '')); });
    return () => { live = false; };
  }, [near, file.opened, file.versions, file.bytes]);
  return top;
}

/** Where a menu opens: under its button, or at the pointer for a right click. */
type At = { x: number; y: number };
const atButton = (el: Element): At => { const r = el.getBoundingClientRect(); return { x: r.right, y: r.bottom + 6 }; };

/** A menu over the page, kept inside the window, closed by a click outside or Escape. */
function Menu({ at, onClose, children, wide = false }: { at: At; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<At>(at);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(at.x - width, window.innerWidth - width - 8)), y: Math.max(8, at.y + height > window.innerHeight - 8 ? at.y - height - 12 : at.y) });
  }, [at.x, at.y, children]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, [onClose]);
  return createPortal(<div ref={box} className={`fh-menu${wide ? ' is-wide' : ''}`} role="menu" style={{ left: pos.x, top: pos.y }}>{children}</div>, document.body);
}

const Item = ({ onPick, children, on = false }: { onPick: () => void; children: ReactNode; on?: boolean }) =>
  <button type="button" role="menuitem" className={`fh-item${on ? ' is-on' : ''}`} onClick={onPick}>{children}</button>;

function NameInput({ start, placeholder, onDone, onCancel }: { start: string; placeholder: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(start);
  const done = () => { const n = name.trim(); if (n && n !== start) onDone(n); else onCancel(); };
  return <input className="fh-name-box" autoFocus value={name} placeholder={placeholder} aria-label={placeholder} maxLength={120}
    onFocus={(e) => e.currentTarget.select()} onChange={(e) => setName(e.target.value)} onBlur={done} onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') onCancel(); }} />;
}

/** A file's menu: open it, name it, give it an icon, file it, or move it to the Trash. */
function TileMenu({ file, at, folders, acts, onOpen, onRename, onClose }: { file: PlacedFile; at: At; folders: FileFolder[]; acts: HomeActs; onOpen: () => void; onRename: () => void; onClose: () => void }) {
  const [step, setStep] = useState<'menu' | 'icon' | 'move' | 'new'>('menu');
  const pick = (fn: () => void) => () => { onClose(); fn(); };
  const auto = glyphFor({ ...file, icon: undefined });
  const tops = folders.filter((f) => !f.parent);
  const canTrash = file.trashable !== false;
  if (step === 'icon') return <Menu at={at} onClose={onClose} wide>
    <div className="fh-menu-head">Icon</div>
    <div className="fh-icons">
      {GLYPH_NAMES.map((g) => <button type="button" key={g} className={`fh-icon-pick${file.icon === g ? ' is-on' : ''}`} aria-label={g} title={g} onClick={pick(() => acts.icon(file, g))}><GlyphIcon glyph={g} size={18} /></button>)}
    </div>
    <div className="fh-menu-gap" role="separator" />
    <Item onPick={pick(() => acts.icon(file, ''))} on={!file.icon}><GlyphIcon glyph={markOf({ ...file, icon: undefined }) === 'picture' ? 'image' : auto} size={15} />Automatic</Item>
  </Menu>;
  if (step === 'move' || step === 'new') return <Menu at={at} onClose={onClose}>
    <div className="fh-menu-head">Move to</div>
    <div className="fh-menu-list">
      {tops.flatMap((t) => [t, ...folders.filter((f) => f.parent === t.id)]).map((f) => <Item key={f.id} on={file.folder === f.id} onPick={pick(() => acts.move(file.key, f.id))}>
        <span className={f.parent ? 'fh-sub' : undefined}><GlyphIcon glyph="folder" size={15} /></span>{f.name}</Item>)}
      {file.folder && <Item onPick={pick(() => acts.move(file.key, null))}><GlyphIcon glyph="page" size={15} />Not in a folder</Item>}
    </div>
    <div className="fh-menu-gap" role="separator" />
    {step === 'new'
      ? <div className="fh-menu-new"><NameInput start="" placeholder="Folder name" onCancel={() => setStep('move')} onDone={(n) => { onClose(); acts.moveToNew(file.key, n); }} /></div>
      : <Item onPick={() => setStep('new')}>New folder…</Item>}
  </Menu>;
  return <Menu at={at} onClose={onClose}>
    <Item onPick={pick(onOpen)}>Open</Item>
    <Item onPick={pick(onRename)}>Rename</Item>
    <Item onPick={() => setStep('icon')}>Change icon…</Item>
    {file.project && <Item onPick={() => setStep('move')}>Move to…</Item>}
    {canTrash && <><div className="fh-menu-gap" role="separator" /><Item onPick={pick(() => acts.trash(file))}>Move to the Trash</Item></>}
  </Menu>;
}

function Tile({ file, folder, me, nameOf, now, onOpen, folders, acts }: Shared & { file: PlacedFile; folder: FileFolder | null }) {
  const [ref, near] = useNear<HTMLDivElement>();
  const doc = useDocTop(file, near);
  const [menu, setMenu] = useState<At | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [broken, setBroken] = useState(false);
  const name = tileName(file, doc.title);
  const who = changedBy(file, { me, nameOf });
  const line = file.kind === 'markdown' ? doc.line : tileLine(file);
  const picture = markOf(file) === 'picture' && !broken;
  const inside = <>
    {picture ? <span className="fh-thumb">{near && <img src={pictureUrl(file.opened!)} alt="" draggable={false} onError={() => setBroken(true)} />}</span>
      : <GlyphMark glyph={glyphFor(file, folder?.name ?? null, doc.title)} />}
    <span className="fh-name">{renaming ? <NameInput start={name} placeholder="Name" onCancel={() => setRenaming(false)} onDone={(n) => { setRenaming(false); acts.rename(file, n); }} />
      : <span>{name}</span>}{folder && pinChangedLately(folder, file, now) && <i className="fh-dot" title="Changed this week" />}</span>
    <span className="fh-line">{line}</span>
    <span className="fh-meta">{whenWords(file.at, now)} · {who === 'You' ? 'you' : who}</span>
  </>;
  const openMenu = (e: ReactMouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX + 4, y: e.clientY + 4 }); };
  return <div ref={ref} className={`fh-tile${menu ? ' is-open' : ''}`} draggable={!!file.project && !renaming} onContextMenu={openMenu}
    onDragStart={(e) => { e.dataTransfer.setData(FILE_DRAG, file.key); e.dataTransfer.effectAllowed = 'move'; }}>
    {renaming ? <div className="fh-open">{inside}</div>
      : <button type="button" className="fh-open" onClick={() => onOpen(file.key)} aria-label={`Open ${name}`} title={name === file.name ? undefined : file.name}>{inside}</button>}
    {!renaming && <button type="button" className="fh-more-btn" aria-label={`More for ${name}`} aria-haspopup="menu" aria-expanded={!!menu}
      onClick={(e) => { e.stopPropagation(); setMenu(menu ? null : atButton(e.currentTarget)); }}><Dots /></button>}
    {menu && <TileMenu file={file} at={menu} folders={folders} acts={acts} onOpen={() => onOpen(file.key)} onRename={() => setRenaming(true)} onClose={() => setMenu(null)} />}
  </div>;
}

/** A folder's name that opens its page, its count, and its menu. */
function FolderHead({ folder, count, onFolder, acts, big = false }: { folder: FileFolder; count: number | null; onFolder: (id: string) => void; acts: HomeActs; big?: boolean }) {
  const [menu, setMenu] = useState<At | null>(null);
  const [renaming, setRenaming] = useState(false);
  const menuButton = <button type="button" className={`fh-more-btn is-inline${menu ? ' is-open' : ''}`} aria-label={`More for ${folder.name}`} aria-haspopup="menu" aria-expanded={!!menu}
    onClick={(e) => setMenu(menu ? null : atButton(e.currentTarget))}><Dots /></button>;
  const menuBox = menu && <Menu at={menu} onClose={() => setMenu(null)}>
    <Item onPick={() => { setMenu(null); setRenaming(true); }}>Rename</Item>
    <div className="fh-menu-gap" role="separator" />
    <Item onPick={() => { setMenu(null); acts.removeFolder(folder); }}>Delete folder</Item>
  </Menu>;
  const name = renaming ? <NameInput start={folder.name} placeholder="Folder name" onCancel={() => setRenaming(false)} onDone={(n) => { setRenaming(false); acts.renameFolder(folder, n); }} /> : null;
  if (big) return <><h1>{name ?? folder.name}</h1>{!renaming && menuButton}{menuBox}</>;
  return <>{name ?? <button type="button" className="fh-link" onClick={() => onFolder(folder.id)}>{folder.name}<Chevron /></button>}
    {count != null && <span className="fh-count">{count}</span>}{!renaming && menuButton}{menuBox}</>;
}

function Grid({ files, folder, limit, ...shared }: Shared & { files: PlacedFile[]; folder: FileFolder | null; limit: number }) {
  return <div className="fh-grid">{files.slice(0, limit).map((f) => <Tile key={f.key} file={f} folder={folder} {...shared} />)}</div>;
}

function Section({ head, files, folder, more, dropOn, ...shared }: Shared & {
  head: ReactNode; files: PlacedFile[]; folder: FileFolder | null; more: () => void;
  dropOn?: (setOver: (on: boolean) => void) => DropHandlers;
}) {
  const [over, setOver] = useState(false);
  return <section className={`fh-sec${over ? ' is-over' : ''}`} {...(dropOn ? dropOn(setOver) : {})}>
    <div className="fh-head">{head}</div>
    <Grid files={files} folder={folder} limit={SHOWN_AT_FIRST} {...shared} />
    {files.length > SHOWN_AT_FIRST && <button type="button" className="fh-more" onClick={more}>See all {files.length}</button>}
  </section>;
}

/** A folder's page, or the page of files in no folder: every file, a screenful at a time. */
function Shelf({ files, folder, dropOn, ...shared }: Shared & { files: PlacedFile[]; folder: FileFolder | null; dropOn: (setOver: (on: boolean) => void) => DropHandlers }) {
  const [limit, setLimit] = useState(60);
  const [over, setOver] = useState(false);
  return <section className={`fh-sec fh-shelf${over ? ' is-over' : ''}`} {...dropOn(setOver)}>
    {files.length ? <Grid files={files} folder={folder} limit={limit} {...shared} /> : <p className="fh-none">Nothing in this folder yet.</p>}
    {files.length > limit && <button type="button" className="fh-more" onClick={() => setLimit(limit + 60)}>Show more</button>}
  </section>;
}

const andJoined = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export function FilesHome({ title, crumbs, onCrumb, page, home, projects, found, query, onQuery, findRef, newMenu, naming, loaded, dropOn, onFolder, onProject, onEverything, ...shared }: Shared & {
  title: string;
  crumbs: Crumb[];
  onCrumb: (c: Crumb) => void;
  page: HomePage;
  /** A project's home; null on All files, which shows `projects`. */
  home: Home | null;
  projects?: ProjectShelf[];
  /** What the search box leaves, while it has words in it. */
  found: PlacedFile[] | null;
  query: string;
  onQuery: (q: string) => void;
  findRef: MutableRefObject<HTMLInputElement | null>;
  newMenu: ReactNode;
  /** The name box for a folder being made. */
  naming: ReactNode;
  loaded: boolean;
  dropOn: (folder: string | null, setOver: (on: boolean) => void) => DropHandlers;
  onFolder: (id: string) => void;
  onProject: (name: string) => void;
  onEverything: () => void;
}) {
  const nothing = loaded && home && !home.kept.length && !home.loose.length && !home.empty.length;
  const heading = page.kind === 'folder' ? <FolderHead folder={page.folder} count={null} onFolder={onFolder} acts={shared.acts} big /> : <h1>{page.kind === 'loose' ? 'Not in a folder' : title}</h1>;
  return <div className="fh">
    {crumbs.length > 0 && <nav className="fh-crumbs" aria-label="Where you are">
      {crumbs.map((c) => <span key={`${c.project}/${c.folder}`} className="fh-crumb-box">
        <button type="button" className="fh-crumb" onClick={() => onCrumb(c)} {...(c.project ? dropOn(c.folder, () => {}) : {})}>{c.name}</button><Chevron />
      </span>)}
    </nav>}
    <div className="fh-top">
      <div className="fh-title">{heading}</div>
      <label className="fp-find fh-find">
        <SearchIcon />
        <input ref={findRef} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search files" aria-label="Search files"
          onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); onQuery(''); } }} />
        <kbd className="fh-key">/</kbd>
      </label>
      {newMenu}
    </div>
    {found ? <section className="fh-sec"><div className="fh-head"><b>{found.length ? 'Matches' : 'No file matches'}</b>{found.length > 0 && <span className="fh-count">{found.length}</span>}</div>
      <Grid files={found} folder={null} limit={60} {...shared} /></section>
      : page.kind === 'folder' ? <Shelf files={page.files} folder={page.folder} dropOn={(setOver) => dropOn(page.folder.id, setOver)} {...shared} />
        : page.kind === 'loose' ? <Shelf files={page.files} folder={null} dropOn={(setOver) => dropOn(null, setOver)} {...shared} />
          : home ? <>
            {naming && <section className="fh-sec"><div className="fh-head">{naming}</div></section>}
            {home.kept.map((s) => <Section key={s.folder.id} head={<FolderHead folder={s.folder} count={s.files.length} onFolder={onFolder} acts={shared.acts} />}
              files={s.files} folder={s.folder} more={() => onFolder(s.folder.id)} dropOn={(setOver) => dropOn(s.folder.id, setOver)} {...shared} />)}
            {home.empty.length > 0 && <p className="fh-empty">{andJoined(home.empty.map((f) => f.name))} {home.empty.length === 1 ? 'is' : 'are'} empty.</p>}
            {home.loose.length > 0 && <Section head={<><button type="button" className="fh-link" onClick={() => onFolder(NOT_IN_A_FOLDER)}>Not in a folder<Chevron /></button><span className="fh-count">{home.loose.length}</span></>}
              files={home.loose} folder={null} more={() => onFolder(NOT_IN_A_FOLDER)} dropOn={(setOver) => dropOn(null, setOver)} {...shared} />}
            {nothing && <p className="fh-empty">Nothing in {title} yet.</p>}
            {loaded && !nothing && <button type="button" className="fh-every" onClick={onEverything}>Every file, with sizes and the Trash</button>}
          </>
            : <section className="fh-sec">
              {loaded && !projects?.length && <p className="fh-empty">Nothing in Files yet.</p>}
              <div className="fh-grid">{projects?.map((p) => <div key={p.name} className="fh-tile">
                <button type="button" className="fh-open" onClick={() => onProject(p.name)} aria-label={`Open ${p.name}`}>
                  <GlyphMark glyph="folder" />
                  <span className="fh-name"><span>{p.name}</span></span>
                  <span className="fh-line">{!p.kept ? 'Nothing kept yet' : p.kept === 1 ? '1 file kept' : `${p.kept} files kept`}{p.loose ? `, ${p.loose} not in a folder` : ''}</span>
                  <span className="fh-meta">{p.at ? whenWords(p.at, shared.now) : ''}</span>
                </button>
              </div>)}</div>
            </section>}
  </div>;
}
