// A TEAMMATE'S SHARED THREAD, the whole window: its name and what it waits on
// at the top, then the conversation as its owner sees it (drawn by the owner's
// own Thread from the lines their copy published) with a box for a comment,
// and beside it what it is about, its files and its properties. Read-only.
import { useCallback, useContext, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode, useRef } from 'react';
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
import type { AgentEvent, AgentSaid, FileElsewhere, FileLine, FileMarkLink, FileMarks, Person, ThreadCard } from '../types';
import { ThreadCrumb } from './Summary';
import { QueueAnswer, QueueSummary } from '../components/OneThingAtATime';
import { createPortal } from 'react-dom';
import { earlierWords, notSharedWords, notesOnFile } from './teammate-thread';
import { canContinue } from './continue-thread';
import { SendBack, reviewAskedOf, reviewAskWords } from './SendBack';
import { answersTheStep, stepLine } from '../../../shared/thread-ask.mts';
import { parseOptions, stripOptionsSection } from '../format';
import { OptionsOffer } from '../components/OptionsOffer';
import { revealLine } from '../reveal-line';

const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
const COPY = /^attachments\//;

interface Work { shared: boolean; lines: LedgerLine[]; earlier: number; product: string | null; dir: string | null }

/** A press on an option picks it; a second press on the picked one sends, as the owner's picker does. */
export function helperPress(picked: number | null, n: number): { picked: number; send: boolean } {
  return { picked: n, send: picked === n };
}

/** The one send: the picked option, then why, in the helper's words. */
export function helperAnswer(options: readonly { n: number; text: string }[], picked: number | null, draft: string): string {
  const o = picked === null ? null : options.find((x) => x.n === picked);
  return o ? optionWithNote(o.text.replace(/\s*\(recommended\)\s*$/i, ''), draft) : draft.trim();
}

/** A pressed option, with whatever was typed in the box under it. */
export const optionWithNote = (option: string, draft: string): string => (draft.trim() ? `${option}\n\n${draft.trim()}` : option);

/** The options the agent's newest words offer, for a helper to press; none once anyone spoke after them. */
export function optionsToAnswer({ events, outcome }: { events: readonly AgentEvent[]; outcome?: { at: number; text: string } | null }) {
  const said = events.filter((e): e is AgentSaid => !e.kind);
  const last = said[said.length - 1];
  if (outcome && (!last || outcome.at >= last.at)) return parseOptions(outcome.text);
  return last?.who === 'it' ? parseOptions(last.text) : [];
}

export function TeammateThread({ card, person, syncedAt, openAt, step = null, onOpenDoc, onNotice, backLabel, onBack, onMessage, onContinue, headerTarget = null, cornerTarget = null }: {
  card: ThreadCard; person: Person | null; now: number;
  /** The window's bar, where its crumb goes, and its corner, where its buttons go. */
  headerTarget?: HTMLElement | null;
  cornerTarget?: HTMLElement | null;
  /** Carry it on in a thread of your own. */
  onContinue?: () => void;
  /** Where the back button goes: Threads, or the group it was opened from. */
  backLabel: string;
  onBack: () => void;
  onMessage: () => void;
  /** Open this file at this comment, from a row in Needs you. */
  openAt?: ArtifactOpen | null;
  /** When the message a link was sent about was written: the page lands on it. */
  step?: number | null;
  /** The sync that last ran, which is when there can be anything new to read. */
  syncedAt: number | null;
  /** Open a copied file in the side pane. */
  /** `notes`: how many the file has here, for the mark beside the chat. */
  onOpenDoc: (product: string, src: string, notes?: number) => void;
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

  // What is typed survives opening one of the thread's files and coming back.
  const draftKey = `teammate-draft:${personId}:${threadId}`;
  useEffect(() => { setWork(null); setDraft(sessionStorage.getItem(draftKey) ?? ''); }, [personId, threadId]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = (text: string) => {
    setDraft(text);
    try { if (text) sessionStorage.setItem(draftKey, text); else sessionStorage.removeItem(draftKey); } catch { /* kept for this page only */ }
  };
  useEffect(() => {
    let live = true;
    api.teamThreadWork({ personId, threadId }).then((w) => { if (live) setWork(w as Work); });
    return () => { live = false; };
  }, [personId, threadId, syncedAt, reread]);

  const product = work?.product ?? '';
  const dir = work?.dir ?? '';
  // The notes are read below; a ref keeps `open` steady for the markdown it is memoized into.
  const notesHere = useRef<{ file: string }[]>([]);
  const beside = useCallback((src: string) => onOpenDoc(product, src, notesOnFile(work?.lines ?? [], notesHere.current, src)), [product, onOpenDoc, work?.lines]);
  const open = useCallback((src?: string) => {
    if (!src || !product) return;
    // Beside the chat a teammate's copy is read-only, so a document or table opens big, where it is edited live.
    const goes = opensBigInAGroup(src) ? 'full' : whereAFileOpens(src);
    if (goes === 'full') setBig({ path: src, at: Date.now() });
    else if (goes === 'beside' || docKind(src)) beside(src);
    else void api.openArtifactExternally({ product, src }).then((r) => { if (!r.ok) onNotice(r.error ?? `${src} could not be opened.`); });
  }, [product, beside, onNotice]);
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
  // The newest answer is drawn under the conversation, not in it, and is a step too.
  const stepAt = step ? stepLine([...events, ...(built.outcome ? [{ at: built.outcome.at }] : [])], step) : null;
  // The newest answer is already on screen under the title; only an earlier step is scrolled to.
  useEffect(() => (stepAt && stepAt !== newestLine ? revealLine(stepAt) : undefined), [stepAt, personId, threadId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => { setBig(openAt ? { ...openAt, at: Date.now() } : null); }, [openAt, personId, threadId]);
  const people = useMemo(() => (team ? [...team.byId.values()].filter((p) => !card.people?.length || card.people.includes(p.id) || p.id === personId) : []), [team, card.people, personId]);

  const send = async (said?: string) => {
    const text = (said ?? helperAnswer(options, picked, draft)).trim();
    if (!text || sending) return;
    setSending(true);
    const out = await api.teamComment({ personId, threadId, text, ...(answering ? { answers: true } : {}) });
    setSending(false);
    if (!out?.ok) { onNotice(out?.error ?? 'That comment did not send.'); return; }
    write('');
    setPicked(null);
    // Their copy starts the agent on it at its next sync (main/team/thread-share.mts).
    if (answering) { onNotice(`Sent to ${owner}'s agent`); setAnsweredStep(true); setAnsweringKept(false); }
    setReread((n) => n + 1);
    following?.follow(card);
  };
  // Asked to review it, the reply box sends a verdict; what it said stands until their copy clears the wait.
  const review = reviewAskedOf(card, team?.me ?? null);
  const [sentBack, setSentBack] = useState<string | null>(null);
  useEffect(() => { setSentBack(null); }, [personId, threadId]);
  const reviewing = !!review && !sentBack;
  const sendBack = async (text: string, said: string) => {
    const out = await api.teamComment({ personId, threadId, text });
    if (!out?.ok) { onNotice(out?.error ?? 'That did not send.'); return false; }
    setSentBack(said);
    setReread((n) => n + 1);
    return true;
  };
  const myOpenNotes = marks.notes.filter((n) => n.by === team?.me && !n.resolved).length;
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };
  const owner = firstName(person) || 'Someone';
  // Asked to help with a step, what they write answers it on the owner's agent.
  const helping = answersTheStep(card, team?.me ?? null);
  const options = helping ? optionsToAnswer({ events, outcome: built.outcome }) : [];
  // Once asked, the box stays an answer until it sends, whatever arrives meanwhile.
  const [answeringKept, setAnsweringKept] = useState(false);
  useEffect(() => { setAnsweringKept(false); setPicked(null); }, [personId, threadId]);
  useEffect(() => { if (helping) setAnsweringKept(true); }, [helping]);
  const answering = helping || answeringKept;
  const [picked, setPicked] = useState<number | null>(null);
  const box = answering ? 'What should the agent do next?' : `Reply to ${owner}`;
  const replyBox = useRef<HTMLTextAreaElement>(null);
  // Until their copy takes the answer up, the header says it went rather than the wait it ended.
  const [answeredStep, setAnsweredStep] = useState(false);
  useEffect(() => { setAnsweredStep(false); }, [personId, threadId]);
  const sentToAgent = answeredStep && !helping && card.state !== 'running' && card.state !== 'done';
  const pickOption = (n: number) => {
    const press = helperPress(picked, n);
    setPicked(press.picked);
    if (press.send) void send(helperAnswer(options, press.picked, draft));
    else replyBox.current?.focus();
  };
  const pickRef = useRef<HTMLButtonElement>(null);
  // 1-9 picks, as on the owner's own page, unless a box has the keys.
  useEffect(() => {
    if (!options.length) return undefined;
    const keys = (e: globalThis.KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
      if (/^[1-9]$/.test(e.key) && options.some((o) => o.n === Number(e.key))) { e.preventDefault(); pickOption(Number(e.key)); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });
  const openMark = useCallback((link: FileMarkLink) => setBig({ file: link.file, note: link.id, at: Date.now() }), []);

  // The page reads as one of your own: the newest answer is its headline, and what came before folds above it.
  const said = events.filter((e): e is AgentSaid => !e.kind);
  const lastIt = !built.outcome ? [...said].reverse().find((e) => e.who === 'it') ?? null : null;
  const newest = built.outcome ? { at: built.outcome.at, text: built.outcome.text } : lastIt ? { at: lastIt.at, text: lastIt.text } : null;
  const newestLine = lastIt?.uid ?? (newest ? `at-${newest.at}` : null);
  const before = lastIt ? events.filter((e: AgentEvent) => e !== lastIt) : events;
  const [earlierOpen, setEarlierOpen] = useState(false);
  useEffect(() => { setEarlierOpen(false); }, [personId, threadId]);
  const earlierCount = before.filter((e: AgentEvent) => !e.kind).length;
  const askNote = card.blockedBy?.find((b) => b.want === 'help' && b.note)?.note ?? '';
  const askWords = helping ? `asked you to help with this step` : sentToAgent ? `Sent to ${owner}'s agent` : reviewing ? 'asked you to review and send back' : review ? sentBack : null;
  const me = team?.me ? team.byId.get(team.me) ?? null : null;
  const title = card.title || 'Untitled thread';

  return (
    <div className="focus-pane tp-thread">
      {headerTarget && createPortal(<ThreadCrumb from={backLabel} name={title} onBack={onBack} />, headerTarget)}
      {cornerTarget && createPortal(
        <span className="ts-top tp-corner">
          {following && card.state !== 'done' && <button type="button" className={`ts-done${followed ? ' on' : ''}`} aria-pressed={followed}
            onClick={() => (followed ? following.unfollow(card) : following.follow(card))}>
            {followed ? 'You will be told when it is done' : 'Tell me when it is done'}
          </button>}
          {onContinue && !reviewing && !helping && canContinue(work, card, team?.me ?? null) && (
            <button type="button" className="ts-done" onClick={onContinue} title={`Start a thread of your own with ${owner}'s conversation and files.`}>Continue it yourself</button>
          )}
          <button type="button" className="ts-done" onClick={onMessage}><Face person={person} size={18} />Message {owner}</button>
        </span>, cornerTarget)}
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
      <div className="focus-scroll" data-thread-id={threadId}>
        <div className="focus">
          <div className="focus-body markdown agent-thread">
            <QueueSummary title={title} context={card.problem && card.problem !== card.title ? card.problem : null}earlier={earlierCount} open={earlierOpen} onToggle={() => setEarlierOpen((o) => !o)} />
            {work && !work.shared && <p className="th-work-note">{notSharedWords(owner)}</p>}
            {work && work.earlier > 0 && earlierOpen && <p className="th-work-note">{earlierWords(work.earlier, owner)}</p>}
            {earlierOpen && before.length > 0 && (
              <FileMarkOpener.Provider value={openMark}>
                <Thread events={before} name={`${owner}'s agent`} landOn={threadId} onWhole={() => {}} md={md} />
              </FileMarkOpener.Provider>
            )}
            {askWords && (
              <div className="tp-ask">
                {/* The ask is theirs and signed; once you have answered, the line says what you did. */}
                {helping || reviewing
                  ? <div className="one-by"><Face person={person} /><span>{owner}</span><em>{askWords}</em></div>
                  : <div className="one-by"><Face person={me} me /><em>{askWords}</em></div>}
                {helping && askNote && <p className="tp-ask-note">{askNote}</p>}
                {reviewing && review.note && <p className="tp-ask-note">{review.note}</p>}
              </div>
            )}
            {newest && (
              <div data-line={`at-${newest.at}`}>
                <QueueAnswer text={options.length ? stripOptionsSection(newest.text) : newest.text} md={md} name={title} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="focus-dock">
        <div className="focus-dock-inner">
          {/* On the reply box, as on a thread of your own; out of the form, whose button styles would square its rows. */}
          {options.length > 0 && !reviewing && <div className="one-choices">
            <OptionsOffer bare ask="" askAll="" options={options} peekOption={null} askPeek={false}
              selectedOption={picked} selRef={pickRef} onPick={pickOption}
              onOptionEnter={() => {}} onAskEnter={() => {}} setPeek={() => {}} setAskPeek={() => {}} />
          </div>}
          <div className="dock-card">
            {reviewing ? (
              <SendBack owner={owner} note={review.note} notes={myOpenNotes} face={<Face person={me} me />} onSend={sendBack} />
            ) : <form className="tp-dock-form"onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <textarea ref={replyBox} className="dock-input" value={draft} rows={1} placeholder={box} aria-label={box}
                onChange={(e) => write(e.target.value)} onKeyDown={onKey} />
              <div className="compose-sentence dock-bar">
                <span className="compose-clauses"><span className="dim">{answering ? `Goes to ${owner}'s agent.` : `Goes to ${owner}.`}</span></span>
                <span className="dock-send-pair solo">
                  <button type="submit" className="dock-send" disabled={!helperAnswer(options, picked, draft) || sending}>Send <kbd>↵</kbd></button>
                </span>
              </div>
            </form>}
          </div>
        </div>
      </div>
    </div>
  );
}
