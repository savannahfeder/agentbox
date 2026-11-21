// A TEAMMATE'S SHARED THREAD, laid out as an opened thread of your own: its
// crumb and buttons in the window's header, then in the same reading column its
// name and what it waits on, the conversation as its owner sees it (drawn by
// the owner's own Thread from the lines their copy published) and a box for a
// comment. About puts what it is about, its files and its properties beside it.
import { useCallback, useContext, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { ConnectionLink } from '../connections/ConnectionsPlace';
import { connectionLinkOf } from '../connections/connections-shown';
import remarkGfm from 'remark-gfm';
import { api } from '../api';
import { filesInLines, lineAsThread, marksOf, opensBigInAGroup, otherFilesInLines, threadFiles } from '../../../shared/artifact-marks.mts';
import { whereAFileOpens } from '../artifact-layout';
import { ArtifactView, type ArtifactOpen } from '../components/ArtifactView';
import { markGoesTo, withElsewhere } from '../components/ThreadArtifacts';
import { MAX_EDIT_BYTES } from '../../../shared/artifact-marks.mts';
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
import type { AgentEvent, FileElsewhere, FileLine, FileMarkLink, FileMarks, Person, ThreadCard, WorkItem } from '../types';
import { AskBar } from '../team/AskBar';
import { DoneTrail, MessagePerson, TeammateCard, TeammateStanding, ThreadCrumb } from './Summary';
import { doneSteps } from '../../../shared/thread-cards.mts';
import { earlierWords, filesOnThread, notSharedWords, notesOnFile, shownOnTheirThread } from './teammate-thread';
import { canContinue } from './continue-thread';
import { readDraft, saveDraft } from '../drafts';

const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
const glyph = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const BellGlyph = () => glyph(<><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5h4" /></>);
const InfoGlyph = () => glyph(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><path d="M12 7.6h.01" strokeWidth="2" /></>);
const OnwardGlyph = () => glyph(<><path d="M5 6v5a3 3 0 0 0 3 3h11" /><path d="m15 10 4 4-4 4" /></>);
const COPY = /^attachments\//;

interface Work { shared: boolean; lines: LedgerLine[]; earlier: number; product: string | null; dir: string | null }

export function TeammateThread({ card, person, now, syncedAt, openAt, onOpenDoc, onNotice, backLabel, onBack, onMessage, onContinue, ask = null, onHandBack, headerTarget = null, cornerTarget = null }: {
  card: ThreadCard; person: Person | null; now: number;
  /** The window's header, where an opened thread's crumb and buttons go. */
  headerTarget?: HTMLElement | null;
  cornerTarget?: HTMLElement | null;
  /** Their open ask of you on this thread: help puts your words to their agent. */
  ask?: WorkItem | null;
  onHandBack?: (verdict: 'done' | 'yes' | 'changes', words: string) => Promise<boolean>;
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
  /** `notes`: how many the file has here, for the mark beside the chat. */
  onOpenDoc: (product: string, src: string, notes?: number) => void;
  onNotice: (text: string) => void;
}) {
  const [work, setWork] = useState<Work | null>(null);
  const [sending, setSending] = useState(false);
  const [reread, setReread] = useState(0);
  // What it is about, its files and its properties, beside the thread when asked for.
  const [about, setAbout] = useState(false);
  const { personId, threadId } = card;
  // Kept in the draft store, so a page drawn again from nothing still has what you were writing.
  const draftAt = useMemo(() => ({ product: `teammate:${personId}`, id: threadId }), [personId, threadId]);
  const [draft, setDraftHere] = useState(() => readDraft(draftAt));
  const setDraft = (text: string) => { setDraftHere(text); saveDraft(draftAt, text); };
  const team = useContext(TeamContext);
  const following = useContext(FollowContext);
  const followed = !!following?.is(card);

  useEffect(() => { setWork(null); setDraftHere(readDraft(draftAt)); }, [draftAt]);
  useEffect(() => {
    let live = true;
    api.teamThreadWork({ personId, threadId }).then((w) => { if (live) setWork(w as Work); });
    return () => { live = false; };
  }, [personId, threadId, syncedAt, reread]);

  const product = work?.product ?? '';
  const dir = work?.dir ?? '';
  // What changes on every sync is read through refs, so `open` and the markdown it is
  // memoized into stay the same and the links are not thrown away and drawn again.
  const notesHere = useRef<{ file: string }[]>([]);
  const linesHere = useRef<LedgerLine[]>([]);
  linesHere.current = work?.lines ?? [];
  const calls = useRef({ onOpenDoc, onNotice });
  calls.current = { onOpenDoc, onNotice };
  const beside = useCallback((src: string) => calls.current.onOpenDoc(product, src, notesOnFile(linesHere.current, notesHere.current, src)), [product]);
  const open = useCallback((src?: string) => {
    if (!src || !product) return;
    // Beside the chat a teammate's copy is read-only, so a document or table opens big, where it is edited live.
    const goes = opensBigInAGroup(src) ? 'full' : whereAFileOpens(src);
    if (goes === 'full') setBig({ path: src, at: Date.now() });
    else if (goes === 'beside' || docKind(src)) beside(src);
    else void api.openArtifactExternally({ product, src }).then((r) => { if (!r.ok) calls.current.onNotice(r.error ?? `${src} could not be opened.`); });
  }, [product, beside]);
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
  }, [product, dir]);

  const built = useMemo(() => itemThread(work?.lines ?? [], [], null, { whole: true }), [work?.lines]);
  // Their copy sends messages, not its bookkeeping; what is drawn is what was said.
  const events = shownOnTheirThread(built.events.filter((e: AgentEvent) => e.kind !== 'work' && e.kind !== 'run'), { me: team?.me ?? null, helping: ask?.ask?.kind === 'help' });

  // Their copy publishes its marks with its messages; everyone's come together here.
  const own = useMemo(() => marksOf((work?.lines ?? [])
    .filter((l) => l.patch?.artifact)
    .map((l) => ({ ...(l.patch!.artifact as object), by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }))) as FileMarks, [work?.lines]);
  // The file in Files these copies belong to: what was said on its other copies, and its version numbers.
  const copies = useMemo(() => {
    const lines = work?.lines ?? [];
    return threadFiles([...filesInLines(lines), ...otherFilesInLines(lines)]).flatMap((f) => f.versions.map((v) => ({ path: v.path, file: v.id })));
  }, [work?.lines]);
  const copiesKey = JSON.stringify(copies);
  const [elsewhere, setElsewhere] = useState<FileElsewhere[]>([]);
  const [line, setLine] = useState<FileLine[]>([]);
  useEffect(() => {
    if (!product) return undefined;
    let live = true;
    const read = () => {
      if (copies.length) void api.fileElsewhere({ product, id: threadId, copies }).then((all) => { if (live) setElsewhere(all); });
      void api.fileLine({ product, id: threadId }).then((all) => { if (live) setLine(all); });
    };
    read();
    // A burst of changes asks once.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = api.onChanged(() => { if (timer) clearTimeout(timer); timer = setTimeout(read, 1000); });
    return () => { live = false; if (timer) clearTimeout(timer); off?.(); };
  }, [product, threadId, copiesKey]);
  const marks = useMemo(() => withElsewhere(own, elsewhere), [own, elsewhere]);
  notesHere.current = marks.notes;
  const numbered = useMemo(() => lineAsThread(line), [line]);
  const viewLines = useMemo(() => (numbered.lines.length ? [...(work?.lines ?? []), ...numbered.lines as LedgerLine[]] : work?.lines ?? []), [work?.lines, numbered]);
  const [big, setBig] = useState<ArtifactOpen | null>(null);
  // Asked onto it, you land where the ask and the box to write in are, once per thread,
  // unless the page is short enough that the end is already in reach from the title.
  const pageEl = useRef<HTMLDivElement>(null);
  const landed = useRef<string | null>(null);
  useEffect(() => {
    if (!ask || !work || landed.current === threadId) return;
    landed.current = threadId;
    const pane = pageEl.current?.closest('.th-pane');
    if (pane) pane.scrollTop = pane.scrollHeight > pane.clientHeight * 1.5 ? pane.scrollHeight : 0;
  }, [ask, work, threadId]);
  useEffect(() => { setBig(openAt ? { ...openAt, at: Date.now() } : null); }, [openAt, personId, threadId]);
  const people = useMemo(() => (team ? [...team.byId.values()].filter((p) => !card.people?.length || card.people.includes(p.id) || p.id === personId) : []), [team, card.people, personId]);

  // An open review on you is answered from the box below, not commented on.
  const reviewing = ask?.ask?.kind === 'review' && !!onHandBack;
  const [handing, setHanding] = useState(false);
  const handBack = async (verdict: 'done' | 'yes' | 'changes') => {
    if (!onHandBack || handing) return;
    setHanding(true);
    const ok = await onHandBack(verdict, draft.trim());
    setHanding(false);
    if (ok) setDraft('');
  };
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
    // A review's Enter is a new line: which verdict it meant is not the key's to guess.
    if (reviewing) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };
  const owner = firstName(person) || 'Someone';
  const tried = card.visible ? doneSteps(card.progress) : [];
  const helping = ask?.ask?.kind === 'help';
  const openMark = useCallback((link: FileMarkLink) => setBig({ file: link.file, note: link.id, at: Date.now() }), []);
  const files = useMemo(() => filesOnThread(work?.lines ?? [], marks.notes).map((f) => ({
    ...f, open: () => open(f.src),
  })), [work?.lines, marks, open]);

  const acts = (
    <div className="tp-acts">
      {following && card.state !== 'done' && !ask && <button type="button" className={`th-follow${followed ? ' on' : ''}`} aria-pressed={followed}
        onClick={() => (followed ? following.unfollow(card) : following.follow(card))}>
        <BellGlyph />{followed ? 'You will be told when it is done' : 'Tell me when it is done'}
      </button>}
      {onContinue && !ask && canContinue(work, card, team?.me ?? null) && (
        <button type="button" className="th-follow" onClick={onContinue}
          title={`Start a thread of your own with ${owner}'s conversation and files.`}>
          <OnwardGlyph />Continue it yourself
        </button>
      )}
      <MessagePerson person={person} onMessage={onMessage} />
      <button type="button" className={`th-follow tp-about${about ? ' on' : ''}`} aria-pressed={about} onClick={() => setAbout(!about)}><InfoGlyph />About</button>
    </div>
  );

  return (
    <div className="tp-page" ref={pageEl}>
      {big && product && (
        <ArtifactView product={product} project={card.project ?? null} draftsAcross={`teammate:${personId}:${threadId}`} lines={viewLines} numbers={numbered.numbers} marks={marks}
          me={team?.me ?? null} people={people} open={big} ownerOfRow={personId}
          write={async (mark) => {
            const key = markGoesTo(mark, elsewhere);
            if (key) return api.filesPlaceMark({ key, mark });
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
          onBeside={(path) => { setBig(null); beside(path); }}
          onClose={() => setBig(null)} />
      )}
      {headerTarget ? createPortal(<ThreadCrumb from={backLabel} name={card.title || `${owner}'s thread`} onBack={onBack} />, headerTarget) : (
        <div className="tp-bar">
          <button type="button" className="th-back" onClick={onBack}><span aria-hidden="true">←</span>{backLabel}</button>
          {acts}
        </div>
      )}
      {headerTarget && cornerTarget && createPortal(acts, cornerTarget)}
      <div className={`tp-grid${about ? ' tp-with-about' : ''}`}>
        <section className="th-work tp-col" aria-label="The conversation">
          <header className="tp-top">
            {card.title && <h1 className="th-card-title">{card.title}</h1>}
            <p className="tp-whose"><Face person={person} />{owner}'s thread{card.project ? ` in ${card.project}` : ''}</p>
            {files.length > 0 && <ul className="tp-files" aria-label="Files on this thread">
              {files.map((f) => <li key={f.src}>
                <button type="button" onClick={f.open} title={`Open ${f.name}`}>
                  <span className="ts-tk-ext" aria-hidden="true">{(f.name.includes('.') ? f.name.split('.').pop() ?? '' : 'file').slice(0, 4)}</span>
                  <span className="ts-tk-fname">{f.name}</span>
                  {f.notes > 0 && <span className="ts-tk-notes">{f.notes === 1 ? '1 note' : `${f.notes} notes`}</span>}
                </button>
              </li>)}
            </ul>}
            {/* While you were asked in, the ask at the end says where it stands, not "waiting on" its owner. */}
            {card.visible && !ask && <TeammateStanding card={card} person={person} now={now} />}
          </header>
          {tried.length > 0 && <section className="tp-tried" aria-label={`What ${owner}'s agent already tried`}>
            <h2>What {owner}'s agent already tried</h2>
            <DoneTrail steps={tried} />
          </section>}
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
          {/* The ask is the newest thing said here, so it comes last, as a message. */}
          {ask && onHandBack && <AskBar key={`${ask.product}/${ask.id}`} task={ask} owner={person} onHandBack={onHandBack} answeredBelow onOpenChange={(src) => onOpenDoc(ask.product, src)} />}
          <form className="th-comment" onSubmit={(e) => { e.preventDefault(); if (!reviewing) void send(); }}>
            <div className="tp-comment-box">
              <Face person={team?.me ? team.byId.get(team.me) : null} me />
              {reviewing
                ? <textarea value={draft} rows={2} placeholder={`Your review for ${owner}`} aria-label={`Your review for ${owner}`}
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
                : helping
                  ? <textarea value={draft} rows={2} placeholder={`Write to ${owner}'s agent`} aria-label={`Write to ${owner}'s agent`}
                    onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
                  : <textarea value={draft} rows={2} placeholder={`Comment to ${owner}`} aria-label={`Comment to ${owner}`}
                    onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />}
              {reviewing
                ? <span className="tp-answer">
                  <button type="button" disabled={handing} onClick={() => { void handBack('yes'); }}>Looks good</button>
                  <button type="button" disabled={!draft.trim() || handing} onClick={() => { void handBack('changes'); }}>Send changes to {owner}</button>
                </span>
                : helping
                  ? <span className="tp-answer">
                    <button type="submit" disabled={!draft.trim() || sending}>Send to the agent</button>
                    {onHandBack && <button type="button" disabled={handing} onClick={() => { void handBack('done'); }}>Hand back to {owner}</button>}
                  </span>
                  : <button type="submit" disabled={!draft.trim() || sending}>Send to {owner}</button>}
            </div>
          </form>
        </section>
        {about && <aside className="tp-side" aria-label="About this thread">
          <TeammateCard card={card} person={person} files={files} done={!tried.length} />
        </aside>}
      </div>
    </div>
  );
}
