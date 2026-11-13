// The page anyone with a shared file's link lands on: the file, its comments,
// and the way to an account (renderer/src/main.tsx draws it on /f/<token>).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppMark } from '../components/AppMark';
import { PdfPages } from '../components/PdfPages';
import type { CloudClient } from '../cloud-rest';
import {
  commentWhen, fileBytes, filmOf, initialOf, isTable, mayComment, mayEdit, mayLookBack, postComment, readFilm, readComments, readHistory, readSharedFile,
  readVersion, removeComment, restoreVersion, saidOf, saveEdit, sharedLine, titleOf, versionLine, versionWhen,
  type FileComment, type LinkVersion, type Rpc, type SharedFile, type Shown,
} from './shared-file';
import { SharedSignIn, type SignInFor } from './SharedSignIn';
import { LinkEditor } from './LinkEditor';
import { TableView } from '../components/TableView';
import { FilmPlayer } from '../components/FilmPlayer';
import { PinMarks, spotIn } from '../components/PinMarks';
import { draftWords, filmMarks, filmPins, picturePins, pinNumbers, placeLabel, placeToSend, quoteOf, type FileKindHere } from './link-notes';
import type { NotePlace } from '../../../shared/artifact-marks.mts';
import { Name } from '../../../shared/product-name.mjs';
import { JOIN_SCHEME } from '../../../shared/room-links.mts';
import '../components/doc-reading.css';
import '../components/file-views.css';
import './shared-file.css';

export const SITE = 'https://agentbox.ac';
export const DOWNLOAD = 'https://agentbox.ac/download';
export const WHAT_AGENTBOX_IS = `${Name} is an inbox for your Claude Code and Codex agents.`;
// Whoever made their account from this page, for the one line offering the Mac app.
const NEW_HERE = 'agentbox-new-here';
const SIGNING_IN_FOR = 'agentbox-signing-in-for';

const MD_PLUGINS = [remarkGfm];
const MD_PARTS = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (/^(https?:|mailto:)/i.test(href ?? '')
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>),
  img: ({ src, alt }: { src?: string; alt?: string }) => (/^https:/.test(src ?? '') ? <img src={src} alt={alt ?? ''} referrerPolicy="no-referrer" /> : <em>{alt || src}</em>),
};

type Load = { state: 'loading' } | { state: 'failed' } | Shown;

export function SharedFilePage({ token, client, finishing = null }: {
  token: string;
  client: CloudClient;
  /** A sign-in coming back to this page (Google's code or an email's link), finished before the first read. */
  finishing?: Promise<string | null> | null;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [comments, setComments] = useState<FileComment[] | null>(null);
  const [signedIn, setSignedIn] = useState(client.signedIn());
  const [asking, setAsking] = useState<null | 'sign-in' | 'sign-up'>(null);
  const [askingFor, setAskingFor] = useState<SignInFor>('comment');
  const ask = (how: 'sign-in' | 'sign-up', why: SignInFor) => {
    setAskingFor(why);
    setAsking(how);
    // Google's sign-in leaves the page, and coming back should land where it was asked for.
    try { sessionStorage.setItem(SIGNING_IN_FOR, why); } catch { /* private mode */ }
  };
  const [backError, setBackError] = useState<string | null>(null);
  const anyone: Rpc = useCallback((name, args) => client.rpc(name, args, { anyone: true }), [client]);
  const asMe: Rpc = useCallback((name, args) => client.rpc(name, args), [client]);
  const piece = useCallback((name: string) => client.fileBytes('link-files', name), [client]);

  // What this page last saved or took in, so a newer copy is told apart from its own save coming back.
  const held = useRef<{ rev: number; body: string } | null>(null);
  const saving = useRef(false);
  const readAll = useCallback(async () => {
    try {
      const [shown, said] = await Promise.all([readSharedFile(anyone, token), readComments(anyone, token)]);
      if (shown.state === 'file' && held.current && (saving.current || shown.file.rev <= held.current.rev)) {
        // Mid-save, or nothing newer: what is on screen stays, so the editor is not reset under the typing.
        const mine = held.current;
        setLoad({ state: 'file', file: { ...shown.file, body: mine.body, rev: mine.rev } });
      } else {
        if (shown.state === 'file') held.current = { rev: shown.file.rev, body: shown.file.body };
        setLoad(shown);
      }
      setComments(said);
    } catch {
      setLoad((was) => (was.state === 'loading' || was.state === 'failed' ? { state: 'failed' } : was));
    }
    setSignedIn(client.signedIn());
  }, [anyone, client, token]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const failed = finishing ? await finishing : null;
      if (!live) return;
      if (failed) { setBackError(failed); setAsking('sign-in'); }
      await readAll();
    })();
    return () => { live = false; };
  }, [finishing, readAll]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void readComments(anyone, token).then(setComments, () => {});
      // A link stopped while the page sat open stops showing the file.
      void anyone('file_link_stopped', { tok: token }).then((stopped) => { if (stopped === true) setLoad({ state: 'stopped' }); }, () => {});
    };
    // Back on the tab, the file is read again too: the owner may have updated it meanwhile.
    const back = () => { if (document.visibilityState === 'visible') void readAll(); };
    const t = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', back);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [anyone, token, readAll]);

  const file = load.state === 'file' ? load.file : null;
  const title = file ? titleOf(file).title : null;
  useEffect(() => { document.title = title ? `${title} · ${Name}` : Name; }, [title]);

  // An editor sees the others' edits soon after they are made.
  const editing = !!file && signedIn && mayEdit(file);
  useEffect(() => {
    if (!editing) return undefined;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible' && !saving.current) void readAll(); }, 8_000);
    return () => window.clearInterval(t);
  }, [editing, readAll]);

  // Saves one copy at a time; words typed during a save go up after it.
  const [saved, setSaved] = useState<null | 'saving' | 'saved' | { error: string }>(null);
  const next = useRef<string | null>(null);
  const save = useCallback(async (whole: string) => {
    next.current = whole;
    if (saving.current) return;
    saving.current = true;
    setSaved('saving');
    while (next.current !== null) {
      const words = next.current;
      next.current = null;
      const from = held.current;
      if (!from || words === from.body) continue;
      try {
        const out = await saveEdit(asMe, async () => {
          const s = await readSharedFile(anyone, token);
          return s.state === 'file' ? s.file : null;
        }, token, words, from);
        held.current = { rev: out.rev, body: out.body };
        if (out.merged) setLoad((was) => (was.state === 'file' ? { state: 'file', file: { ...was.file, body: out.body, rev: out.rev } } : was));
      } catch (err) {
        next.current ??= words;
        saving.current = false;
        setSaved({ error: saidOf(err) });
        return;
      }
    }
    saving.current = false;
    setSaved('saved');
  }, [anyone, asMe, token]);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [peek, setPeek] = useState<{ version: LinkVersion; body: string } | null>(null);
  const openComments = (on: boolean) => { setCommentsOpen(on); if (on) { setHistoryOpen(false); setPeek(null); } };
  const openHistory = (on: boolean) => { setHistoryOpen(on); if (on) setCommentsOpen(false); else setPeek(null); };
  const kind: FileKindHere = !file ? 'other' : file.kind === 'video' ? 'film' : file.kind === 'image' ? 'picture' : file.kind === 'markdown' && !isTable(file) ? 'words' : 'other';
  const [chosen, setChosen] = useState<string | null>(null);
  const [draft, setDraft] = useState<NotePlace | null>(null);
  const [wholeFilm, setWholeFilm] = useState(false);
  const [filmNow, setFilmNow] = useState(0);
  const [seek, setSeek] = useState<{ s: number; at: number } | null>(null);
  const [hold, setHold] = useState(0);
  const sendTo = placeToSend(kind, draft, filmNow, wholeFilm);
  const numbers = useMemo(() => pinNumbers(comments ?? []), [comments]);
  const pick = (id: string) => {
    const c = comments?.find((x) => x.id === id);
    if (!c) return;
    setChosen(id === chosen ? null : id);
    openComments(true);
    if (c.place?.kind === 'time') setSeek({ s: c.place.s, at: Date.now() });
  };
  const pointAt = (place: NotePlace | null) => { setDraft(place); setWholeFilm(false); setChosen(null); if (place) openComments(true); };
  const notes: Notes = { comments: comments ?? [], chosen, draft, next: String(numbers.size + 1), seek, hold, onTime: setFilmNow, onPlace: pointAt, onPick: pick };
  // Signing in to comment comes back to the comments; to open or edit, back to the file.
  const signedInNow = async () => {
    setAsking(null);
    setBackError(null);
    setSignedIn(client.signedIn());
    if (askingFor === 'comment') openComments(true);
    await readAll();
  };
  useEffect(() => {
    if (!finishing) return;
    void finishing.then((failed) => {
      let why: string | null = null;
      try { why = sessionStorage.getItem(SIGNING_IN_FOR); sessionStorage.removeItem(SIGNING_IN_FOR); } catch { /* private mode */ }
      // Only a sign-in made to comment opens the comments; a visit already signed in lands on the file.
      if (!failed && client.signedIn() && why === 'comment') setCommentsOpen(true);
    });
  }, [finishing, client]);
  useEffect(() => {
    if (!commentsOpen && !historyOpen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !asking) { setCommentsOpen(false); setHistoryOpen(false); setPeek(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [commentsOpen, historyOpen, asking]);

  const signOut = () => { client.signOut(); setSignedIn(false); held.current = null; void readAll(); };
  const restore = async (v: LinkVersion) => {
    if (!file) return;
    await restoreVersion(asMe, token, v.id, held.current?.rev ?? file.rev);
    held.current = null;
    setPeek(null);
    await readAll();
  };

  let body: ReactNode;
  if (load.state === 'loading') body = <div className="sf-state" aria-busy="true"><span className="sf-dots" aria-label="Loading"><i /><i /><i /></span></div>;
  else if (load.state === 'failed') body = <div className="sf-state" role="alert"><p>This file did not load.</p><button type="button" className="sf-quiet-btn" onClick={() => { setLoad({ state: 'loading' }); void readAll(); }}>Try again</button></div>;
  else if (load.state === 'stopped') body = <div className="sf-state"><p>This link was stopped. Ask whoever sent it for a new one.</p></div>;
  else if (load.state === 'unknown') body = <div className="sf-state"><p>This link does not work. Check it with whoever sent it.</p></div>;
  else if (load.state === 'sign-in') {
    body = (
      <div className="sf-state">
        <p>This file is only for the people it was shared with. Sign in to open it.</p>
        <button type="button" className="sf-quiet-btn" onClick={() => ask('sign-in', 'open')}>Sign in</button>
      </div>
    );
  } else if (load.state === 'no-access') {
    body = (
      <div className="sf-state">
        <p>This file is only for the people it was shared with.<br />Ask whoever sent it to add {client.email() ?? 'you'}.</p>
        <button type="button" className="sf-quiet-btn" onClick={() => { signOut(); ask('sign-in', 'open'); }}>Use another account</button>
      </div>
    );
  } else {
    body = (
      <FilePage
        token={token} file={load.file} piece={piece} notes={peek ? undefined : notes}
        edit={editing && !peek ? { save, saved } : null}
        peek={peek ? { ...peek, restore: () => restore(peek.version), back: () => setPeek(null) } : null}
      />
    );
  }

  const panelOpen = commentsOpen || historyOpen;
  return (
    <div className={`sf-page${panelOpen ? ' has-panel' : ''}`}>
      <TopBar
        count={file && mayComment(file) ? comments?.length ?? 0 : null} open={commentsOpen} onComments={() => openComments(!commentsOpen)}
        openIn={file && !file.mine ? `${JOIN_SCHEME}://f/${token}` : null}
        history={file && signedIn && mayLookBack(file) ? { open: historyOpen, onToggle: () => openHistory(!historyOpen) } : null}
        signInToEdit={file && !signedIn && mayEdit(file) ? () => ask('sign-in', 'edit') : null}
      />
      {body}
      {commentsOpen && (
        <aside className="sf-panel" aria-label="Comments">
          <PanelHead title="Comments" count={comments?.length ?? 0} onClose={() => setCommentsOpen(false)} />
          {file && (
            <Comments
              file={file} comments={comments} signedIn={signedIn}
              onAsk={(how) => ask(how, 'comment')}
              placeOf={(c) => placeLabel(c, numbers)} chosen={chosen} onPick={pick}
              where={draftWords(kind, sendTo)} canClear={!!sendTo} onClear={() => { if (draft) setDraft(null); else setWholeFilm(true); }}
              onWriting={() => setHold((n) => n + 1)}
              post={async (words) => {
                await postComment(asMe, token, words, sendTo);
                setDraft(null); setWholeFilm(false);
                setComments(await readComments(anyone, token));
              }}
              remove={async (id) => { await removeComment(asMe, id); setComments(await readComments(anyone, token)); }}
            />
          )}
          {signedIn && (
            <p className="sf-me">
              <span title={client.email() ?? undefined}>{client.email()}</span>
              <button type="button" onClick={signOut}>Sign out</button>
            </p>
          )}
        </aside>
      )}
      {historyOpen && file && (
        <aside className="sf-panel" aria-label="History">
          <PanelHead title="History" onClose={() => openHistory(false)} />
          <History
            token={token} rev={file.rev} rpc={asMe} picked={peek?.version.id ?? null}
            onPick={async (v) => {
              if (v.current) { setPeek(null); return; }
              const words = await readVersion(asMe, token, v.id);
              if (words !== null) setPeek({ version: v, body: words });
            }}
          />
        </aside>
      )}
      {asking && (
        <SharedSignIn
          client={client} startOn={asking} error={backError} purpose={askingFor}
          onNew={() => { try { sessionStorage.setItem(NEW_HERE, '1'); } catch { /* private mode */ } }}
          onClose={() => { setAsking(null); setBackError(null); }}
          onSignedIn={signedInNow}
        />
      )}
    </div>
  );
}

/** The mark, the comments and the way to the app. `count` null: there is no file to comment on. */
/** `openIn`: the app's own link to this file, which brings it into the viewer's Agentbox (main/bring-shared-file.mts). */
/** `history`: the way to the file's versions, for its editors. `signInToEdit`: an editor's link opened signed out. */
export function TopBar({ count, open, onComments, openIn = null, history = null, signInToEdit = null }: {
  count: number | null; open: boolean; onComments: () => void; openIn?: string | null;
  history?: { open: boolean; onToggle: () => void } | null; signInToEdit?: (() => void) | null;
}) {
  return (
    <header className="sf-bar">
      <a className="sf-brand" href={SITE}><AppMark size={14} />agentbox</a>
      <nav className="sf-bar-links">
        {signInToEdit && <button type="button" onClick={signInToEdit}>Edit</button>}
        {history && <button type="button" className={history.open ? 'is-on' : ''} aria-pressed={history.open} onClick={history.onToggle}>History</button>}
        {count !== null && (
          <button type="button" className={`sf-talk${open ? ' is-on' : ''}`} aria-pressed={open} onClick={onComments}>
            {count === 0 ? 'Comment' : count === 1 ? '1 comment' : `${count} comments`}
          </button>
        )}
        {openIn && <a href={openIn}>Open in {Name}</a>}
        <a href={SITE}>Get {Name}</a>
      </nav>
    </header>
  );
}

function PanelHead({ title, count = 0, onClose }: { title: string; count?: number; onClose: () => void }) {
  return (
    <div className="sf-panel-head">
      <h2>{title}{count ? <span>{count}</span> : null}</h2>
      <button type="button" className="sf-panel-close" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </div>
  );
}

/** The file's versions, newest first. Picking one shows it in place of the file. */
function History({ token, rev, rpc, picked, onPick }: { token: string; rev: number; rpc: Rpc; picked: string | null; onPick: (v: LinkVersion) => Promise<void> }) {
  const [list, setList] = useState<LinkVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    readHistory(rpc, token).then((l) => { if (live) { setList(l); setError(null); } }, (err) => { if (live) setError(saidOf(err)); });
    return () => { live = false; };
  }, [rpc, token, rev]);
  const now = Date.now();
  return (
    <div className="sf-history">
      {list === null && !error && <span className="sf-dots" aria-label="Loading"><i /><i /><i /></span>}
      {list && (
        <ol className="sf-versions">
          {list.map((v) => {
            const on = picked ? picked === v.id : v.current;
            return (
              <li key={v.id}>
                <button type="button" className={`sf-version${on ? ' is-on' : ''}`} aria-current={on || undefined}
                  onClick={() => { setError(null); onPick(v).catch((err) => setError(saidOf(err))); }}>
                  <b>{versionWhen(v.at, now)}</b>
                  <span>{versionLine(v)}</span>
                  {v.current && <em>Current version</em>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className="sf-error" role="alert">{error}</p>}
    </div>
  );
}

type Piece = (name: string) => Promise<Uint8Array | null>;
type EditHands = { save: (whole: string) => void; saved: null | 'saving' | 'saved' | { error: string } };
type Peek = { version: LinkVersion; body: string; restore: () => Promise<void>; back: () => void };

/** The comments as the file draws them, and how a click on the file points one at a place. */
interface Notes {
  comments: FileComment[];
  chosen: string | null;
  draft: NotePlace | null;
  /** The number the pin being placed will have. */
  next: string;
  seek: { s: number; at: number } | null;
  hold: number;
  onTime: (s: number) => void;
  onPlace: (place: NotePlace | null) => void;
  onPick: (id: string) => void;
}

/** The file on its own: its title, who shared it, and the file. */
export function FilePage({ token, file, piece, notes, edit = null, peek = null }: { token: string; file: SharedFile; piece?: Piece; notes?: Notes; edit?: EditHands | null; peek?: Peek | null }) {
  const table = isTable(file);
  const kept = table || file.kind === 'image' || file.kind === 'pdf' || file.kind === 'video';
  // An earlier copy of a page is framed from its words, as the site's /raw holds only the current one.
  const shown = peek ? { ...file, body: peek.body, anyone: false } : file;
  const saved = edit?.saved;
  return (
    <main className={`sf-main is-${table ? 'table' : file.kind}`}>
      {peek && <PeekBar peek={peek} />}
      <div className="sf-head">
        <h1>{titleOf(shown).title}</h1>
        <p>
          {sharedLine(file)}
          {kept && !peek && (openToAnyone(file) || file.kind !== 'video') && <> · <Download token={token} file={file} /></>}
          {saved && <> · <span className={typeof saved === 'object' ? 'sf-unsaved' : undefined} role="status">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : `Not saved. ${saved.error}`}</span></>}
        </p>
      </div>
      <section className="sf-file" aria-label={file.name}><FileBody token={token} file={shown} piece={piece} notes={peek ? undefined : notes} edit={peek ? null : edit} /></section>
    </main>
  );
}

function PeekBar({ peek }: { peek: Peek }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="sf-peek" role="region" aria-label="An earlier version">
      <p><b>{versionWhen(peek.version.at)}</b> · {versionLine(peek.version)}</p>
      <div className="sf-peek-acts">
        <button type="button" className="sf-quiet-btn" disabled={busy} onClick={peek.back}>Back to the current one</button>
        <button type="button" className="sf-send" disabled={busy} onClick={() => {
          setBusy(true); setError(null);
          peek.restore().catch((err) => { setError(saidOf(err)); setBusy(false); });
        }}>{busy ? 'Restoring…' : 'Restore this version'}</button>
      </div>
      {error && <p className="sf-error" role="alert">{error}</p>}
    </div>
  );
}

const openToAnyone = (file: Pick<SharedFile, 'anyone'>) => file.anyone !== false;

/** From the site's own address when anyone may read it; otherwise from the copy this page already holds. */
function Download({ token, file }: { token: string; file: SharedFile }) {
  const local = useMemo(() => {
    if (openToAnyone(file) || file.kind === 'video') return null;
    try {
      const data = file.kind === 'image' || file.kind === 'pdf' ? fileBytes(file) : file.body;
      return URL.createObjectURL(new Blob([data as BlobPart], { type: file.type || 'application/octet-stream' }));
    } catch { return null; }
  }, [file]);
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);
  if (!openToAnyone(file) && !local) return null;
  return <a className="sf-download" href={local ?? `/f/${token}/raw`} download={file.name}>Download</a>;
}

/** A film, its pieces read in order and played once they are all here. */
function FilmBody({ token, file, piece, notes }: { token: string; file: SharedFile; piece?: Piece; notes?: Notes }) {
  const [url, setUrl] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const film = filmOf(file);
    if (!film || !piece) { setFailed(true); return; }
    let live = true;
    let made: string | null = null;
    setUrl(null); setDone(0); setFailed(false);
    readFilm(piece, token, film, (d) => { if (live) setDone(d); }).then((parts) => {
      if (!live) return;
      if (!parts) { setFailed(true); return; }
      made = URL.createObjectURL(new Blob(parts as BlobPart[], { type: file.type || 'video/mp4' }));
      setUrl(made);
    }, () => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [token, file.body, file.type, piece]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return <div className="sf-state"><p>This film did not load.</p></div>;
  if (!url) return <div className="sf-video is-loading" aria-busy="true" aria-label="Loading"><i style={{ width: `${Math.round(done * 100)}%` }} /></div>;
  const spot = notes?.draft?.kind === 'time' && typeof notes.draft.x === 'number' && typeof notes.draft.y === 'number' ? { x: notes.draft.x, y: notes.draft.y, label: notes.next } : null;
  return <div className="sf-video">
    <FilmPlayer url={url} name={file.name} wide
      marks={notes ? filmMarks(notes.comments, notes.chosen) : []} pins={notes ? filmPins(notes.comments, notes.chosen) : []} draft={spot}
      seek={notes?.seek ?? null} hold={notes?.hold} onMark={notes?.onPick} onTime={notes?.onTime}
      onSpot={notes ? ({ s, x, y }) => notes.onPlace({ kind: 'time', s: Math.round(s * 10) / 10, x, y }) : undefined} />
  </div>;
}

// A page framed from the copy this page holds has no headers of its own, so it carries the same rules the site's /raw sends.
const FRAMED_PAGE_RULES = `<meta http-equiv="Content-Security-Policy" content="default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; form-action 'none'">`;

/** Every text range in `root` that reads `quote`, across the elements it runs over. */
function rangesOf(root: HTMLElement, quote: string): Range[] {
  const nodes: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n as Text);
  // The page's text with each run of space as one, and where each of its letters came from.
  let flat = '';
  const from: [Text, number][] = [];
  for (const node of nodes) {
    for (let i = 0; i < node.data.length; i++) {
      const space = /\s/.test(node.data[i]);
      if (space && flat.endsWith(' ')) continue;
      flat += space ? ' ' : node.data[i];
      from.push([node, i]);
    }
  }
  const out: Range[] = [];
  for (let at = flat.indexOf(quote); at >= 0 && out.length < 20; at = flat.indexOf(quote, at + quote.length)) {
    const r = document.createRange();
    const [a, ai] = from[at];
    const [b, bi] = from[at + quote.length - 1];
    r.setStart(a, ai);
    r.setEnd(b, bi + 1);
    out.push(r);
  }
  return out;
}

type Highlights = { set(name: string, h: unknown): void; delete(name: string): void };
declare const Highlight: { new (...ranges: Range[]): unknown } | undefined;

/** A document, the words its comments quote marked in it, and words picked here are what the next comment is about. */
function DocBody({ body, notes }: { body: string; notes?: Notes }) {
  const box = useRef<HTMLDivElement | null>(null);
  const quotes = (notes?.comments ?? []).flatMap((c) => (c.place?.kind === 'quote' ? [{ id: c.id, text: c.place.text }] : []));
  const lit = notes?.draft?.kind === 'quote' ? notes.draft.text : quotes.find((q) => q.id === notes?.chosen)?.text ?? null;
  const key = JSON.stringify([quotes.map((q) => q.text), lit]);
  useEffect(() => {
    const marks = (globalThis.CSS as unknown as { highlights?: Highlights } | undefined)?.highlights;
    const root = box.current;
    if (!marks || typeof Highlight === 'undefined' || !root) return undefined;
    marks.set('sf-quoted', new Highlight(...quotes.flatMap((q) => rangesOf(root, q.text))));
    marks.set('sf-quoted-on', new Highlight(...(lit ? rangesOf(root, lit) : [])));
    return () => { marks.delete('sf-quoted'); marks.delete('sf-quoted-on'); };
  }, [key, body]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = () => { const q = quoteOf(window.getSelection()?.toString() ?? ''); if (q) notes?.onPlace(q); };
  return <div ref={box} className="sf-doc" onMouseUp={notes ? picked : undefined} onKeyUp={notes ? picked : undefined}>
    <div className="markdown doc-prose"><ReactMarkdown remarkPlugins={MD_PLUGINS} components={MD_PARTS}>{body}</ReactMarkdown></div>
  </div>;
}

/** A picture, its comments' pins on it, and a click on it pins the next one. */
function PictureBody({ url, name, notes, onBroken }: { url: string | null; name: string; notes?: Notes; onBroken: () => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  const draft = notes?.draft?.kind === 'pin' ? { x: notes.draft.x, y: notes.draft.y } : null;
  return <div className="sf-image">
    <div ref={box} className={`sf-pinbox${notes ? ' can-pin' : ''}`} onClick={notes ? (e) => { if (!(e.target as HTMLElement).closest('.av-pin')) notes.onPlace({ kind: 'pin', ...spotIn(e.currentTarget, e) }); } : undefined}>
      <img src={url ?? undefined} alt={name} onError={onBroken} />
      {notes && <PinMarks pins={picturePins(notes.comments, notes.chosen)} draft={draft} draftLabel={notes.next} size={size} onPick={notes.onPick} />}
    </div>
  </div>;
}

export function FileBody({ token, file, piece, notes, edit = null }: { token: string; file: SharedFile; piece?: Piece; notes?: Notes; edit?: EditHands | null }) {
  const bytes = useMemo(() => {
    if (file.kind !== 'image' && file.kind !== 'pdf') return null;
    try { return fileBytes(file); } catch { return null; }
  }, [file]);
  const url = useMemo(() => (file.kind === 'image' && bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.type })) : null), [file, bytes]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const [unreadable, setUnreadable] = useState(false);
  const pdf = useCallback(async () => bytes ?? new Uint8Array(), [bytes]);
  if (file.kind === 'video') return <FilmBody token={token} file={file} piece={piece} notes={notes} />;
  if (isTable(file)) {
    const onSave = edit ? async (text: string) => { edit.save(text); return { ok: true }; } : undefined;
    return <div className="sf-table"><TableView text={file.body} path={file.name} mode="full" storeKey={`link:${token}`} onSave={onSave} /></div>;
  }
  if (file.kind === 'markdown') {
    const { body } = titleOf(file);
    if (edit) {
      // The title stays as the page heads it; the editor holds what is under it.
      const head = file.body.slice(0, file.body.length - body.length);
      return <div className="sf-doc"><LinkEditor text={body} label={file.name} onWords={(md) => edit.save(head + md)} /></div>;
    }
    return <DocBody body={body} notes={notes} />;
  }
  if ((file.kind === 'image' || file.kind === 'pdf') && (!bytes || unreadable)) return <div className="sf-state"><p>This file did not load.</p></div>;
  if (file.kind === 'image') return <PictureBody url={url} name={file.name} notes={notes} onBroken={() => setUnreadable(true)} />;
  if (file.kind === 'pdf') return <div className="sf-pdf"><PdfPages load={pdf} name={file.name} /></div>;
  // No allow-same-origin: this page holds the viewer's sign-in, and the page shared runs its own scripts.
  // Only signed in can read a link kept to the people added, which the site's /raw is not.
  return <iframe className="sf-frame" title={file.name}
    {...(openToAnyone(file) ? { src: `/f/${token}/raw?at=${file.updatedAt}` } : { srcDoc: FRAMED_PAGE_RULES + file.body })}
    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" referrerPolicy="no-referrer" />;
}

export function Comments({ file, comments, signedIn, onAsk, post, remove, placeOf = () => null, chosen = null, onPick, where = null, canClear = false, onClear, onWriting }: {
  file: SharedFile; comments: FileComment[] | null; signedIn: boolean; onAsk: (how: 'sign-in' | 'sign-up') => void;
  post: (words: string) => Promise<void>; remove: (id: string) => Promise<void>;
  /** Where a comment points, in the app's words; null on the whole file. */
  placeOf?: (c: FileComment) => string | null;
  chosen?: string | null;
  onPick?: (id: string) => void;
  /** Where the comment being written goes, or how to point it at a place. */
  where?: string | null;
  canClear?: boolean;
  onClear?: () => void;
  /** Typing has begun, so a playing film stops on the moment it is about. */
  onWriting?: () => void;
}) {
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState(false);
  const box = useRef<HTMLTextAreaElement | null>(null);
  // Straight into the box after signing in here, not on every visit.
  const wasIn = useRef(signedIn);
  useEffect(() => { if (signedIn && !wasIn.current) box.current?.focus({ preventScroll: true }); wasIn.current = signedIn; }, [signedIn]);

  const send = async () => {
    const said = words.trim();
    if (!said || busy) return;
    setBusy(true); setError(null);
    try {
      await post(said);
      setWords('');
      try { if (sessionStorage.getItem(NEW_HERE)) { sessionStorage.removeItem(NEW_HERE); setOffer(true); } } catch { /* private mode */ }
    } catch (err) { setError(saidOf(err)); }
    setBusy(false);
  };
  // Remove asks once more on the same spot, since a comment taken back is gone.
  const [removing, setRemoving] = useState<string | null>(null);
  const take = async (id: string) => {
    if (removing !== id) { setRemoving(id); return; }
    setRemoving(null); setError(null);
    try { await remove(id); } catch (err) { setError(saidOf(err)); }
  };
  const left = 4000 - words.length;

  return (
    <div className="sf-comments">
      {comments && comments.length > 0 && (
        <ol className="sf-list">
          {comments.map((c) => {
            const placed = placeOf(c);
            const quoted = c.place?.kind === 'quote';
            return (
            <li key={c.id} className={`sf-comment${chosen === c.id ? ' is-on' : ''}`}>
              <span className="sf-face" aria-hidden="true">{c.byAvatar ? <img src={c.byAvatar} alt="" referrerPolicy="no-referrer" /> : initialOf(c.byName)}</span>
              <div className="sf-said">
                <div className="sf-who">
                  <b>{c.byName}</b>
                  {c.byOwner && <span className="sf-owner">Owner</span>}
                  {placed && !quoted && <button type="button" className="sf-at" onClick={() => onPick?.(c.id)}>{/^\d/.test(placed) ? `at ${placed}` : placed}</button>}
                  <time dateTime={new Date(c.createdAt).toISOString()}>{commentWhen(c.createdAt)}</time>
                  {signedIn && (c.mine || file.mine) && (
                    <button type="button" className={`sf-remove${removing === c.id ? ' is-asking' : ''}`} onBlur={() => setRemoving(null)} onClick={() => void take(c.id)}>
                      {removing === c.id ? 'Remove it?' : 'Remove'}
                    </button>
                  )}
                </div>
                {quoted && <button type="button" className="sf-quote" onClick={() => onPick?.(c.id)}>{placed}</button>}
                <p>{c.body}</p>
              </div>
            </li>
            );
          })}
        </ol>
      )}
      {signedIn ? (
        <form className="sf-write" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {where && (
            <p className={`sf-where${canClear ? ' is-set' : ''}`}>
              <span>{where}</span>
              {canClear && <button type="button" aria-label="Comment on the whole file" title="Comment on the whole file" onClick={onClear}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6" /></svg>
              </button>}
            </p>
          )}
          <textarea ref={box} value={words} rows={3} placeholder="Add a comment" aria-label="Add a comment"
            onFocus={onWriting}
            onChange={(e) => { setWords(e.target.value); setError(null); if (!words) onWriting?.(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
          <div className="sf-write-row">
            {left < 400 && <span className={`sf-left${left < 0 ? ' is-over' : ''}`}>{left < 0 ? `${-left} over 4000` : `${left} left`}</span>}
            <button type="submit" className="sf-send" disabled={!words.trim() || busy || left < 0}>{busy ? 'Sending…' : 'Comment'}</button>
          </div>
        </form>
      ) : (
        <>
          <button type="button" className="sf-join" onClick={() => onAsk('sign-up')}>Create an account to comment</button>
          <p className="sf-have">Have an account? <button type="button" onClick={() => onAsk('sign-in')}>Sign in</button></p>
        </>
      )}
      {error && <p className="sf-error" role="alert">{error}</p>}
      {offer && <p className="sf-offer">{WHAT_AGENTBOX_IS} <a href={DOWNLOAD}>Get {Name}</a></p>}
    </div>
  );
}
