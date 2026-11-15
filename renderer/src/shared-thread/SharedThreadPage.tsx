// A thread's link opened in a browser: the thread for a teammate who can read
// it, and the app, where it opens in full (renderer/src/main.tsx on /t/...).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CloudClient } from '../cloud-rest';
import { TopBar } from '../shared-file/SharedFilePage';
import { SharedSignIn } from '../shared-file/SharedSignIn';
import { commentWhen, initialOf } from '../shared-file/shared-file';
import { openInApp, readSharedThread, whoSaid, type ThreadShown } from './shared-thread';
import { Name } from '../../../shared/product-name.mjs';
import '../components/doc-reading.css';
import '../shared-file/shared-file.css';
import './shared-thread.css';

const MD_PLUGINS = [remarkGfm];
const MD_PARTS = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (/^(https?:|mailto:)/i.test(href ?? '')
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>),
  img: ({ src, alt }: { src?: string; alt?: string }) => (/^https:/.test(src ?? '') ? <img src={src} alt={alt ?? ''} referrerPolicy="no-referrer" /> : <em>{alt || src}</em>),
};

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'signed-out' } | ThreadShown;

export function SharedThreadPage({ owner, id, client, finishing = null }: {
  owner: string; id: string; client: CloudClient; finishing?: Promise<string | null> | null;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [asking, setAsking] = useState(false);
  const [backError, setBackError] = useState<string | null>(null);
  const app = openInApp(owner, id);

  const read = useCallback(async () => {
    if (!client.signedIn()) { setLoad({ state: 'signed-out' }); return; }
    try { setLoad(await readSharedThread(client, owner, id)); } catch { setLoad({ state: 'failed' }); }
  }, [client, owner, id]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const failed = finishing ? await finishing : null;
      if (!live) return;
      if (failed) { setBackError(failed); setAsking(true); }
      await read();
    })();
    return () => { live = false; };
  }, [finishing, read]);

  const openApp = app && <a className="sf-join st-open" href={app}>Open in {Name}</a>;
  let body: ReactNode;
  if (load.state === 'loading') body = <div className="sf-state" aria-busy="true"><span className="sf-dots" aria-label="Loading"><i /><i /><i /></span></div>;
  else if (load.state === 'failed') body = <div className="sf-state" role="alert"><p>This thread did not load.</p><button type="button" className="sf-quiet-btn" onClick={() => { setLoad({ state: 'loading' }); void read(); }}>Try again</button></div>;
  else if (load.state === 'signed-out') body = (
    <div className="sf-state st-ask">
      <p>Sign in to read this thread.</p>
      <button type="button" className="sf-join" onClick={() => setAsking(true)}>Sign in</button>
      {openApp}
    </div>
  );
  else if (load.state === 'hidden') body = (
    <div className="sf-state st-ask">
      <p>This thread is not shared with you.</p>
      {openApp}
    </div>
  );
  else body = (
    <main className="sf-main st-main">
      <div className="sf-head">
        <h1>{load.title}</h1>
        <p>{(load.names[load.owner] || 'A teammate').split(/\s+/)[0]}'s thread{app && <> · <a className="sf-download" href={app}>Open in {Name}</a></>}</p>
      </div>
      <ol className="sf-list st-lines">
        {load.lines.map((l) => {
          const who = whoSaid(l, load.owner, load.names);
          return (
            <li key={l.key} className={`sf-comment${l.agent ? ' is-agent' : ''}`}>
              <span className="sf-face" aria-hidden="true">{initialOf(who)}</span>
              <div className="sf-said">
                <div className="sf-who"><b>{who}</b>{l.comment && <span className="sf-owner">Comment</span>}{l.at > 0 && <time dateTime={new Date(l.at).toISOString()}>{commentWhen(l.at)}</time>}</div>
                <div className="markdown doc-prose"><ReactMarkdown remarkPlugins={MD_PLUGINS} components={MD_PARTS}>{l.text}</ReactMarkdown></div>
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );

  return (
    <div className="sf-page">
      <TopBar count={null} open={false} onComments={() => {}} />
      {body}
      {asking && (
        <SharedSignIn
          client={client} startOn="sign-in" error={backError}
          onNew={() => {}}
          onClose={() => { setAsking(false); setBackError(null); }}
          onSignedIn={() => { setAsking(false); setBackError(null); setLoad({ state: 'loading' }); void read(); }}
        />
      )}
    </div>
  );
}
