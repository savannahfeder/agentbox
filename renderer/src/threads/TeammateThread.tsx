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
import type { AgentEvent, AgentSaid, FileElsewhere, FileLine, FileMarkLink, FileMarks, Person, ThreadCard, WorkItem } from '../types';
import { AskBar } from '../team/AskBar';
import { DoneTrail, MessagePerson, TeammateCard, TeammateStanding, ThreadCrumb } from './Summary';
import { doneSteps } from '../../../shared/thread-cards.mts';
import { earlierWords, filesOnThread, notSharedWords, notesOnFile } from './teammate-thread';
import { canContinue } from './continue-thread';
import { readDraft, saveDraft } from '../drafts';
import { QueueAnswer, QueueSummary } from '../components/OneThingAtATime';
import { OptionsOffer } from '../components/OptionsOffer';
import { parseOptions, stripOptionsSection } from '../format';

const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
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
  const helpingNow = ask?.ask?.kind === 'help';
  const events = built.events.filter((e: AgentEvent) => e.kind !== 'work' && e.kind !== 'run')
    .map((e: AgentEvent) => (helpingNow && 'says' in e && e.says === 'comment' && (e as { by?: string }).by === team?.me ? { ...e, says: 'to-agent' as const } : e));

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
  // Asked onto it, you land where the ask and the box to write in are, once per thread.
  const pageEl = useRef<HTMLDivElement>(null);
  const landed = useRef<string | null>(null);
  useEffect(() => {
    if (!ask || !work || landed.current === threadId) return;
    landed.current = threadId;
    const pane = pageEl.current?.querySelector('.focus-scroll');
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [ask, work, threadId]);
  useEffect(() => { setBig(openAt ? { ...openAt, at: Date.now() } : null); }, [openAt, personId, threadId]);
  const people = useMemo(() => (team ? [...team.byId.values()].filter((p) => !card.people?.length || card.people.includes(p.id) || p.id === personId) : []), [team, card.people, personId]);

  const send = async (said?: string) => {
    const text = (said ?? draft).trim();
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
  const tried = card.visible ? doneSteps(card.progress) : [];
  const helping = ask?.ask?.kind === 'help';
  const pickRef = useRef<HTMLButtonElement>(null);
  const openMark = useCallback((link: FileMarkLink) => setBig({ file: link.file, note: link.id, at: Date.now() }), []);
  const files = useMemo(() => filesOnThread(work?.lines ?? [], marks.notes).map((f) => ({
    ...f, open: () => open(f.src),
  })), [work?.lines, marks, open]);

  const acts = (
    <div className="tp-acts">
      {following && card.state !== 'done' && <button type="button" className={`th-follow${followed ? ' on' : ''}`} aria-pressed={followed}
        onClick={() => (followed ? following.unfollow(card) : following.follow(card))}>
        {followed ? 'You will be told when it is done' : 'Tell me when it is done'}
      </button>}
      {onContinue && !ask && canContinue(work, card, team?.me ?? null) && (
        <button type="button" className="th-follow" onClick={onContinue}
          title={`Start a thread of your own with ${owner}'s conversation and files.`}>
          Continue it yourself
        </button>
      )}
      <MessagePerson person={person} onMessage={onMessage} />
      <button type="button" className={`th-follow tp-about${about ? ' on' : ''}`} aria-pressed={about} onClick={() => setAbout(!about)}>About</button>
    </div>
  );

  // Drawn as a thread of your own: its name, what came before folded, the newest answer, and the reply box at the foot.
  const said = events.filter((e): e is AgentSaid => !e.kind);
  const lastIt = !built.outcome ? [...said].reverse().find((e) => e.who === 'it') ?? null : null;
  const newest = built.outcome ? { at: built.outcome.at, text: built.outcome.text } : lastIt ? { at: lastIt.at, text: lastIt.text } : null;
  const before = lastIt ? events.filter((e: AgentEvent) => e !== lastIt) : events;
  const [earlierOpen, setEarlierOpen] = useState(false);
  useEffect(() => { setEarlierOpen(false); }, [personId, threadId]);
  const earlierCount = before.filter((e: AgentEvent) => !e.kind).length;
  // Asked to help, the step's options are the owner's picker on your reply box; a pick sends it with what you typed.
  // Once anyone has spoken after them, or you picked one, they are answered, as on a thread of your own.
  const [pickedFor, setPickedFor] = useState<number | null>(null);
  const answered = !newest || pickedFor === newest.at || said.some((e) => e.at > newest.at && e.who !== 'it');
  const options = helping && newest && !answered ? parseOptions(newest.text) : [];
  const pick = (n: number) => {
    const o = options.find((x) => x.n === n);
    if (!o || !newest) return;
    setPickedFor(newest.at);
    const choice = o.text.replace(/\s*\(recommended\)\s*$/i, '');
    void send(draft.trim() ? `${choice}\n\n${draft.trim()}` : choice);
  };
  // 1-9 pick, as the numbers on the rows say, unless a box has the keys.
  useEffect(() => {
    if (!options.length) return undefined;
    const keys = (e: globalThis.KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
      if (/^[1-9]$/.test(e.key) && options.some((o) => o.n === Number(e.key))) { e.preventDefault(); pick(Number(e.key)); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });
  const title = card.title || `${owner}'s thread`;
  const box = helping ? `Write to ${owner}'s agent` : `Reply to ${owner}`;

  return (
    <div className="focus-pane tp-thread" ref={pageEl}>
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
      {headerTarget ? createPortal(<ThreadCrumb from={backLabel} name={title} onBack={onBack} />, headerTarget) : (
        <div className="tp-bar">
          <button type="button" className="th-back" onClick={onBack}><span aria-hidden="true">←</span>{backLabel}</button>
          {acts}
        </div>
      )}
      {headerTarget && cornerTarget && createPortal(acts, cornerTarget)}
      <div className="focus-scroll" data-thread-id={threadId}>
        <div className="focus">
          <div className="focus-body markdown agent-thread" aria-label="The conversation">
            <QueueSummary title={title} context={card.problem && card.problem !== card.title ? card.problem : null} earlier={earlierCount} open={earlierOpen} onToggle={() => setEarlierOpen((o) => !o)} />
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
            {tried.length > 0 && <section className="tp-tried" aria-label={`What ${owner}'s agent already tried`}>
              <h2>What {owner}'s agent already tried</h2>
              <DoneTrail steps={tried} />
            </section>}
            {work && !work.shared && <p className="th-work-note">{notSharedWords(owner)}</p>}
            {earlierOpen && work && work.earlier > 0 && <p className="th-work-note">{earlierWords(work.earlier, owner)}</p>}
            {earlierOpen && before.length > 0 && <FileMarkOpener.Provider value={openMark}>
              <Thread events={before} name={`${owner}'s agent`} landOn={threadId} onWhole={() => {}} md={md} />
            </FileMarkOpener.Provider>}
            {newest && <QueueAnswer text={options.length ? stripOptionsSection(newest.text) : newest.text} md={md} name={title} />}
            {/* The ask is the newest thing said here, so it comes last, as a message. */}
            {ask && onHandBack && <AskBar key={`${ask.product}/${ask.id}`} task={ask} owner={person} onHandBack={onHandBack} onOpenChange={(src) => onOpenDoc(ask.product, src)} />}
          </div>
        </div>
      </div>
      {about && <aside className="tp-side" aria-label="About this thread">
        <TeammateCard card={card} person={person} files={files} done={!tried.length} />
      </aside>}
      <div className="focus-dock">
        <div className="focus-dock-inner">
          {/* On the reply box, as on a thread of your own; out of the form, whose button styles would square its rows. */}
          {options.length > 0 && <div className="one-choices">
            <OptionsOffer bare ask="" askAll="" options={options} peekOption={null} askPeek={false}
              selectedOption={null} selRef={pickRef} onPick={pick}
              onOptionEnter={() => {}} onAskEnter={() => {}} setPeek={() => {}} setAskPeek={() => {}} />
          </div>}
          <div className="dock-card">
            <form className="tp-dock-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <textarea className="dock-input" value={draft} rows={1} placeholder={box} aria-label={box}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
              <div className="compose-sentence dock-bar">
                <span className="compose-clauses"><span className="dim">{helping ? `Goes to ${owner}'s agent.` : `Goes to ${owner}.`}</span></span>
                <span className="dock-send-pair solo">
                  <button type="submit" className="dock-send" disabled={!draft.trim() || sending}>Send <kbd>↵</kbd></button>
                </span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
