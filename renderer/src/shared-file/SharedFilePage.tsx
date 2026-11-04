// The page anyone with a shared file's link lands on: the file, its comments,
// and the way to an account (renderer/src/main.tsx draws it on /f/<token>).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppMark } from '../components/AppMark';
import { PdfPages } from '../components/PdfPages';
import type { CloudClient } from '../cloud-rest';
import {
  commentWhen, fileBytes, initialOf, postComment, readComments, readSharedFile, removeComment, saidOf, sharedLine,
  type FileComment, type Rpc, type SharedFile, type Shown,
} from './shared-file';
import { SharedSignIn } from './SharedSignIn';
import '../components/doc-reading.css';
import '../components/file-views.css';
import './shared-file.css';

export const SITE = 'https://agentbox.ac';
export const DOWNLOAD = 'https://agentbox.ac/download';
// Whoever made their account from this page, for the one line offering the Mac app.
const NEW_HERE = 'agentbox-new-here';

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
  const [backError, setBackError] = useState<string | null>(null);
  const anyone: Rpc = useCallback((name, args) => client.rpc(name, args, { anyone: true }), [client]);
  const asMe: Rpc = useCallback((name, args) => client.rpc(name, args), [client]);

  const readAll = useCallback(async () => {
    try {
      const [shown, said] = await Promise.all([readSharedFile(anyone, token), readComments(anyone, token)]);
      setLoad(shown);
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
    const tick = () => { if (document.visibilityState === 'visible') void readComments(anyone, token).then(setComments, () => {}); };
    const t = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [anyone, token]);

  const file = load.state === 'file' ? load.file : null;
  useEffect(() => { document.title = file ? `${file.name} · Agentbox` : 'Agentbox'; }, [file?.name]);

  const signedInNow = async () => {
    setAsking(null);
    setBackError(null);
    setSignedIn(client.signedIn());
    await readAll();
  };

  let body: ReactNode;
  if (load.state === 'loading') body = <div className="sf-state" aria-busy="true"><span className="sf-dots" aria-label="Loading"><i /><i /><i /></span></div>;
  else if (load.state === 'failed') body = <div className="sf-state" role="alert"><p>This file did not load.</p><button type="button" className="sf-quiet-btn" onClick={() => { setLoad({ state: 'loading' }); void readAll(); }}>Try again</button></div>;
  else if (load.state === 'stopped') body = <div className="sf-state"><p>This link was stopped.</p></div>;
  else if (load.state === 'unknown') body = <div className="sf-state"><p>This link does not work.</p></div>;
  else {
    body = (
      <main className={`sf-main is-${load.file.kind}`}>
        <div className="sf-head">
          <h1>{load.file.name}</h1>
          <p>{sharedLine(load.file)}</p>
        </div>
        <div className="sf-split">
          <section className="sf-file" aria-label={load.file.name}><FileBody token={token} file={load.file} /></section>
          <Comments
            file={load.file} comments={comments} signedIn={signedIn}
            onAsk={() => setAsking('sign-up')}
            post={async (words) => { await postComment(asMe, token, words); setComments(await readComments(anyone, token)); }}
            remove={async (id) => { await removeComment(asMe, id); setComments(await readComments(anyone, token)); }}
          />
        </div>
      </main>
    );
  }

  return (
    <div className="sf-page">
      <header className="sf-bar">
        <a className="sf-brand" href={SITE}><AppMark size={14} />agentbox</a>
        <nav className="sf-bar-links">
          <a href={SITE}>Get Agentbox</a>
          {!signedIn && load.state !== 'loading' && <button type="button" onClick={() => setAsking('sign-in')}>Sign in</button>}
        </nav>
      </header>
      {body}
      {asking && (
        <SharedSignIn
          client={client} startOn={asking} error={backError}
          onNew={() => { try { sessionStorage.setItem(NEW_HERE, '1'); } catch { /* private mode */ } }}
          onClose={() => { setAsking(null); setBackError(null); }}
          onSignedIn={signedInNow}
        />
      )}
    </div>
  );
}

export function FileBody({ token, file }: { token: string; file: SharedFile }) {
  const url = useMemo(() => (file.kind === 'image' ? URL.createObjectURL(new Blob([fileBytes(file) as BlobPart], { type: file.type })) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pdf = useCallback(async () => fileBytes(file), [file]);
  if (file.kind === 'markdown') {
    return <div className="sf-doc"><div className="markdown doc-prose"><ReactMarkdown remarkPlugins={MD_PLUGINS} components={MD_PARTS}>{file.body}</ReactMarkdown></div></div>;
  }
  if (file.kind === 'image') return <div className="sf-image"><img src={url ?? undefined} alt={file.name} /></div>;
  if (file.kind === 'pdf') return <div className="sf-pdf"><PdfPages load={pdf} name={file.name} /></div>;
  // No allow-same-origin: this page holds the viewer's sign-in, and the page shared runs its own scripts.
  return <iframe className="sf-frame" title={file.name} src={`/f/${token}/raw?v=${file.version}`}
    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" referrerPolicy="no-referrer" />;
}

export function Comments({ file, comments, signedIn, onAsk, post, remove }: {
  file: SharedFile; comments: FileComment[] | null; signedIn: boolean; onAsk: () => void;
  post: (words: string) => Promise<void>; remove: (id: string) => Promise<void>;
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
  const take = async (id: string) => {
    setError(null);
    try { await remove(id); } catch (err) { setError(saidOf(err)); }
  };

  return (
    <aside className="sf-comments" aria-label="Comments">
      <h2>Comments{comments?.length ? <span>{comments.length}</span> : null}</h2>
      {comments && comments.length > 0 && (
        <ol className="sf-list">
          {comments.map((c) => (
            <li key={c.id} className="sf-comment">
              <span className="sf-face" aria-hidden="true">{c.byAvatar ? <img src={c.byAvatar} alt="" referrerPolicy="no-referrer" /> : initialOf(c.byName)}</span>
              <div className="sf-said">
                <div className="sf-who">
                  <b>{c.byName}</b>
                  {c.byOwner && <span className="sf-owner">Owner</span>}
                  <time dateTime={new Date(c.createdAt).toISOString()}>{commentWhen(c.createdAt)}</time>
                  {signedIn && (c.mine || file.mine) && <button type="button" className="sf-remove" onClick={() => void take(c.id)}>Remove</button>}
                </div>
                <p>{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {signedIn ? (
        <form className="sf-write" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <textarea ref={box} value={words} rows={3} maxLength={4000} placeholder="Add a comment" aria-label="Add a comment"
            onChange={(e) => { setWords(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
          <button type="submit" className="sf-send" disabled={!words.trim() || busy}>{busy ? 'Sending…' : 'Comment'}</button>
        </form>
      ) : (
        <button type="button" className="sf-join" onClick={onAsk}>Create an account to comment</button>
      )}
      {error && <p className="sf-error" role="alert">{error}</p>}
      {offer && <p className="sf-offer">Agentbox runs your own agents. <a href={DOWNLOAD}>Get it for Mac</a></p>}
    </aside>
  );
}
