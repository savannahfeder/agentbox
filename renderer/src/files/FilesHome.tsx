// FILES' HOME: a project's folders as sections of tiles, Pinned first, and what
// nobody filed after them. The tiles, the icons and the type are their own; menus
// and the opened file are Files' (FilesPlace hands them in).
import { useEffect, useRef, useState, type DragEvent, type MutableRefObject, type ReactNode } from 'react';
import { api } from '../api';
import { SearchIcon } from '../components/SearchIcon';
import type { FileFolder, PlacedFile } from '../types';
import { changedBy } from './files-shown';
import { docTop, FILE_DRAG, glyphFor, pinChangedLately, SHOWN_AT_FIRST, tileLine, tileName, whenWords, type DocTop, type Glyph, type Home } from './files-home';
import './files-home.css';

type DropHandlers = { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void };
export interface ProjectShelf { name: string; kept: number; loose: number; at: number | null }

interface Shared {
  me: string | null;
  nameOf: (id: string) => string;
  now: number;
  onOpen: (key: string) => void;
  /** The file's Move menu, or nothing where it cannot move. */
  tileMenu: (f: PlacedFile) => ReactNode;
}

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

const GlyphMark = ({ glyph }: { glyph: Glyph | 'folder' }) => <span className="fh-glyph" aria-hidden="true">
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{GLYPHS[glyph]}</svg>
</span>;

/** True from when the element comes within a screen of the page's view. */
function useNear<T extends Element>(): [MutableRefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const watch = new IntersectionObserver((seen) => { if (seen.some((s) => s.isIntersecting)) setNear(true); }, { root: el.closest('.fp-page'), rootMargin: '100% 0px' });
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

function Tile({ file, folder, me, nameOf, now, onOpen, tileMenu }: Shared & { file: PlacedFile; folder: FileFolder | null }) {
  const [ref, near] = useNear<HTMLDivElement>();
  const doc = useDocTop(file, near);
  const name = tileName(file, doc.title);
  const who = changedBy(file, { me, nameOf });
  const line = file.kind === 'markdown' ? doc.line : tileLine(file);
  return <div ref={ref} className="fh-tile" draggable={!!file.project} onDragStart={(e) => { e.dataTransfer.setData(FILE_DRAG, file.key); e.dataTransfer.effectAllowed = 'move'; }}>
    <button type="button" className="fh-open" onClick={() => onOpen(file.key)} aria-label={`Open ${name}`} title={name === file.name ? undefined : file.name}>
      <GlyphMark glyph={glyphFor(file, folder?.name ?? null)} />
      <span className="fh-name"><span>{name}</span>{folder && pinChangedLately(folder, file, now) && <i className="fh-dot" title="Changed this week" />}</span>
      <span className="fh-line">{line}</span>
      <span className="fh-meta">{whenWords(file.at, now)} · {who === 'You' ? 'you' : who}</span>
    </button>
    {tileMenu(file)}
  </div>;
}

function Section({ head, files, folder, dropOn, empty, ...shared }: Shared & {
  head: ReactNode; files: PlacedFile[]; folder: FileFolder | null; empty?: string;
  dropOn?: (setOver: (on: boolean) => void) => DropHandlers;
}) {
  const [all, setAll] = useState(false);
  const [over, setOver] = useState(false);
  const shown = all ? files : files.slice(0, SHOWN_AT_FIRST);
  return <section className={`fh-sec${over ? ' is-over' : ''}`} {...(dropOn ? dropOn(setOver) : {})}>
    <div className="fh-head">{head}</div>
    {files.length ? <div className="fh-grid">{shown.map((f) => <Tile key={f.key} file={f} folder={folder} {...shared} />)}</div> : empty && <p className="fh-none">{empty}</p>}
    {files.length > SHOWN_AT_FIRST && <button type="button" className="fh-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${files.length}`}</button>}
  </section>;
}

const Count = ({ n }: { n: number }) => <span className="fh-count">{n}</span>;

const andJoined = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export function FilesHome({ title, home, projects, found, query, onQuery, findRef, newMenu, naming, loaded, folderHead, dropOn, onProject, onEverything, ...shared }: Shared & {
  title: string;
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
  folderHead: (folder: FileFolder, count: number) => ReactNode;
  dropOn: (folder: string | null, setOver: (on: boolean) => void) => DropHandlers;
  onProject: (name: string) => void;
  onEverything: () => void;
}) {
  const nothing = loaded && home && !home.kept.length && !home.loose.length && !home.empty.length;
  return <div className="fh">
    <div className="fh-top">
      <h1>{title}</h1>
      <label className="fp-find fh-find">
        <SearchIcon />
        <input ref={findRef} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search files" aria-label="Search files"
          onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); onQuery(''); } }} />
        <kbd className="fh-key">/</kbd>
      </label>
      {newMenu}
    </div>
    {found ? <Section head={<><b>{found.length ? 'Matches' : 'No file matches'}</b>{found.length > 0 && <Count n={found.length} />}</>} files={found} folder={null} {...shared} />
      : home ? <>
        {naming && <section className="fh-sec"><div className="fh-head">{naming}</div></section>}
        {home.kept.map((s) => <Section key={s.folder.id} head={folderHead(s.folder, s.files.length)} files={s.files} folder={s.folder}
          dropOn={(setOver) => dropOn(s.folder.id, setOver)} {...shared} />)}
        {home.empty.length > 0 && <p className="fh-empty">{andJoined(home.empty.map((f) => f.name))} {home.empty.length === 1 ? 'is' : 'are'} empty.</p>}
        {home.loose.length > 0 && <Section head={<><b>Not in a folder</b><Count n={home.loose.length} /></>} files={home.loose} folder={null}
          dropOn={(setOver) => dropOn(null, setOver)} {...shared} />}
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
