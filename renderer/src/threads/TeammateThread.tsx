// A TEAMMATE'S SHARED THREAD, the whole window: its name and what it waits on
// at the top, then the conversation as its owner sees it (drawn by the owner's
// own Thread from the lines their copy published) with a box for a comment,
// and beside it what it is about, its files and its properties. Read-only.
import { useCallback, useContext, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { ConnectionLink } from '../connections/ConnectionsPlace';
import { connectionLinkOf } from '../connections/connections-shown';
import remarkGfm from 'remark-gfm';
import { api } from '../api';
import { marksOf, reviewKind } from '../../../shared/artifact-marks.mjs';
import { ArtifactView, type ArtifactOpen } from '../components/ArtifactView';
import { MAX_EDIT_BYTES } from '../../../shared/artifact-marks.mjs';
import { ArtifactImg, ArtifactLink, ArtifactMedia } from '../components/Focus';
import { Thread } from '../components/Thread';
import { FileMarkOpener } from '../components/FileMarkLine';
import { docKind } from '../doc-pane';
import { itemThread } from '../item-thread';
import { mentionKind } from '../mentions';
import { artifactUrlTransform, isMediaPath } from '../remark-artifact-paths';
import { firstName, Face, TeamContext } from '../team/people';
import { FollowContext } from '../team/following';
import type { LedgerLine } from '../thread-history';
import type { AgentEvent, FileMarkLink, FileMarks, Person, ThreadCard } from '../types';
import { MessagePerson, TeammateCard, TeammateStanding } from './Summary';
import { earlierWords, filesOnThread, notSharedWords } from './teammate-thread';
import { canContinue } from './continue-thread';

const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
const COPY = /^attachments\//;

interface Work { shared: boolean; lines: LedgerLine[]; earlier: number; product: string | null; dir: string | null }

export function TeammateThread({ card, person, now, syncedAt, openAt, onOpenDoc, onNotice, backLabel, onBack, onMessage, onContinue }: {
  card: ThreadCard; person: Person | null; now: number;
  /** Carry it on in a thread of your own. */
  onContinue?: () => void;
  /** Where the back button goes: Threads, or the group it was opened from. */
  backLabel: string;
  onBack: () => void;
  onMessage: () => void;
  /** Open this file at this comment, from a row in Needs you. */
  openAt?: ArtifactOpen | null;
  /** The sync that last ran, which is when there can be anything new to read. */
  syncedAt: number | null;
  /** Open a copied file in the side pane. */
  onOpenDoc: (product: string, src: string) => void;
  onNotice: (text: string) => void;
}) {
  const [work, setWork] = useState<Work | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reread, setReread] = useState(0);
  const { personId, threadId } = card;
  const team = useContext(TeamContext);
  const following = useContext(FollowContext);
  const followed = !!following?.is(card);

  useEffect(() => { setWork(null); setDraft(''); }, [personId, threadId]);
  useEffect(() => {
    let live = true;
    api.teamThreadWork({ personId, threadId }).then((w) => { if (live) setWork(w as Work); });
    return () => { live = false; };
  }, [personId, threadId, syncedAt, reread]);

  const product = work?.product ?? '';
  const dir = work?.dir ?? '';
  // The pane draws pages, documents and pictures. A film plays where it is, and
  // pressing its name or a deck's hands the copy to the app that reads it.
  const open = useCallback((src?: string) => {
    if (!src || !product) return;
    if (reviewKind(src)) setBig({ path: src, at: Date.now() });
    else if (docKind(src)) onOpenDoc(product, src);
    else void api.openArtifactExternally({ product, src }).then((r) => { if (!r.ok) onNotice(r.error ?? `${src} could not be opened.`); });
  }, [product, onOpenDoc, onNotice]);
  const md = useMemo(() => {
    const roots = dir ? [dir] : [];
    const components = {
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        const connection = connectionLinkOf(href);
        if (connection) return <ConnectionLink id={connection.id}>{children}</ConnectionLink>;
        if (!href || !COPY.test(href)) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        const label = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : undefined;
        if (PICTURE.test(href)) return <ArtifactImg key={href} src={href} alt={label} roots={roots} onOpen={open} />;
        if (isMediaPath(href)) return <ArtifactMedia key={href} src={href} label={label} roots={roots} onOpen={open} />;
        return <ArtifactLink kind={mentionKind(href)} product={product} src={href} onOpen={() => open(href)}>{children}</ArtifactLink>;
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => <ArtifactImg key={src} src={src} alt={alt} roots={roots} onOpen={open} />,
    };
    return (text: string) => <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={artifactUrlTransform}>{text}</ReactMarkdown>;
  }, [product, dir, open]);

  const built = useMemo(() => itemThread(work?.lines ?? [], [], null, { whole: true }), [work?.lines]);
  // Their copy sends messages, not its bookkeeping; what is drawn is what was said.
  const events = built.events.filter((e: AgentEvent) => e.kind !== 'work' && e.kind !== 'run');

  // Their copy publishes its marks with its messages; everyone's come together here.
  const marks = useMemo(() => marksOf((work?.lines ?? [])
    .filter((l) => l.patch?.artifact)
    .map((l) => ({ ...(l.patch!.artifact as object), by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }))) as FileMarks, [work?.lines]);
  const [big, setBig] = useState<ArtifactOpen | null>(null);
  useEffect(() => { setBig(openAt ? { ...openAt, at: Date.now() } : null); }, [openAt, personId, threadId]);
  const people = useMemo(() => (team ? [...team.byId.values()].filter((p) => !card.people?.length || card.people.includes(p.id) || p.id === personId) : []), [team, card.people, personId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const out = await api.teamComment({ personId, threadId, text });
    setSending(false);
    if (!out?.ok) { onNotice(out?.error ?? 'That comment did not send.'); return; }
    setDraft('');
    setReread((n) => n + 1);
    following?.follow(card);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };
  const owner = firstName(person) || 'Someone';
  const openMark = useCallback((link: FileMarkLink) => setBig({ file: link.file, note: link.id, at: Date.now() }), []);
  const files = useMemo(() => filesOnThread(work?.lines ?? [], marks.notes).map((f) => ({
    ...f, open: () => (reviewKind(f.src) ? setBig({ path: f.src, at: Date.now() }) : open(f.src)),
  })), [work?.lines, marks, open]);

  return (
    <div className="tp-page">
      {big && product && (
        <ArtifactView product={product} threadName={card.title ?? 'Shared thread'} lines={work?.lines ?? []} marks={marks}
          me={team?.me ?? null} people={people} open={big} ownerOfRow={personId}
          write={async (mark) => {
            const out = await api.teamMarkFile({ personId, threadId, mark });
            setReread((n) => n + 1);
            return { ok: !!out?.ok, error: out?.error };
          }}
          onNewVersion={async (_name, text, _path, id) => {
            if (new TextEncoder().encode(text).length > MAX_EDIT_BYTES) return 'This document is too long to edit from here.';
            const out = await api.teamMarkFile({ personId, threadId, mark: { do: 'edit', file: id, text } });
            setReread((n) => n + 1);
            return out?.ok ? null : out?.error ?? 'That did not save.';
          }}
          editGoes={`Sent to ${owner}.`}
          onClose={() => setBig(null)} />
      )}
      <div className="tp-bar">
        <button type="button" className="th-back" onClick={onBack}><span aria-hidden="true">←</span>{backLabel}</button>
        <div className="tp-acts">
          {following && card.state !== 'done' && <button type="button" className={`th-follow${followed ? ' on' : ''}`} aria-pressed={followed}
            onClick={() => (followed ? following.unfollow(card) : following.follow(card))}>
            {followed ? 'You will be told when it is done' : 'Tell me when it is done'}
          </button>}
          {onContinue && canContinue(work, card, team?.me ?? null) && (
            <button type="button" className="th-follow" onClick={onContinue}
              title={`Start a thread of your own with ${owner}'s conversation and files.`}>
              Continue it yourself
            </button>
          )}
          <MessagePerson person={person} onMessage={onMessage} />
        </div>
      </div>
      <header className="tp-top">
        <p className="tp-whose"><Face person={person} />{owner}'s thread{card.project ? ` in ${card.project}` : ''}</p>
        {card.title && <h1 className="th-card-title">{card.title}</h1>}
        {card.visible && <TeammateStanding card={card} person={person} now={now} />}
      </header>
      <div className="tp-grid">
        <section className="th-work" aria-label="The conversation">
          {work && !work.shared && <p className="th-work-note">{notSharedWords(owner)}</p>}
          {work && work.earlier > 0 && <p className="th-work-note">{earlierWords(work.earlier, owner)}</p>}
          <FileMarkOpener.Provider value={openMark}>
            {events.length > 0 && <Thread events={events} name={`${owner}'s agent`} landOn={threadId} onWhole={() => {}} md={md} />}
          </FileMarkOpener.Provider>
          {built.outcome && (
            <div className="appendix appendix-foot">
              <div className="appendix-label">{built.outcome.field === 'result' ? 'Result' : 'Latest checkpoint'}</div>
              {md(built.outcome.text)}
            </div>
          )}
          <form className="th-comment" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <div className="tp-comment-box">
              <Face person={team?.me ? team.byId.get(team.me) : null} me />
              <textarea value={draft} rows={2} placeholder={`Comment to ${owner}`} aria-label={`Comment to ${owner}`}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
              <button type="submit" disabled={!draft.trim() || sending}>Comment</button>
            </div>
          </form>
        </section>
        <aside className="tp-side" aria-label="About this thread">
          <TeammateCard card={card} person={person} files={files} />
        </aside>
      </div>
    </div>
  );
}
