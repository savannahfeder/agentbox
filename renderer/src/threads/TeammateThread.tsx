// A TEAMMATE'S SHARED THREAD, drawn as a thread of your own: its crumb in the
// window's header, Message and the ⋯ menu in the corner, then its name, whose
// it is and where it stands, its summary, the newest answer with what came
// before folded, and the reply box at the foot. The conversation is the
// owner's own Thread, drawn from the lines their copy published.
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageMarkdown } from '../components/MessageMarkdown';
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
import { MessagePerson, TeammateStanding, TeammateSummary, ThreadCrumb } from './Summary';
import { ThreadMenu } from './ThreadMenu';
import { aroundTheAnswer, askEndedWords, earlierWords, endWasInView, filesOnThread, notSharedWords, notesOnFile, shownOnTheirThread } from './teammate-thread';
import { HAND_BACK_EVENT, type AskVerdict } from '../thread-commands';
import { canContinue } from './continue-thread';
import { readDraft, saveDraft } from '../drafts';
import { agoWords } from './summary-rules';
import { applyDockHeight } from '../dock-height';
import { foldedReply } from '../folded-reply';
import { keyInTheReplyBox, sendKeyFor } from '../reply-keys';
import { SendGlyph } from '../components/reply-glyphs';
import { QueueAnswer } from '../components/OneThingAtATime';
import { OptionsOffer } from '../components/OptionsOffer';
import { parseOptions, stripOptionsSection } from '../format';

const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
const COPY = /^attachments\//;
const THREAD_PLUGINS = [remarkGfm];

interface Work { shared: boolean; lines: LedgerLine[]; earlier: number; product: string | null; dir: string | null }

/** What R on a teammate's thread sends (App.tsx): its reply box opens. */
export const TEAMMATE_REPLY = 'zero:teammate-reply';

/** The corner: Message, in the box a thread of your own wears there, and the rest behind its ⋯ (ThreadMenu). */
export function TeammateCorner({ person, followed, onFollow, onContinue, onMessage }: {
  person: Person | null;
  followed: boolean; onFollow: (() => void) | null;
  onContinue: (() => void) | null;
  onMessage: () => void;
}) {
  return (
    <span className="ts-top tp-acts">
      <MessagePerson person={person} onMessage={onMessage} />
      <ThreadMenu following={onFollow ? followed : null} onFollow={onFollow ?? undefined} onContinue={onContinue} />
    </span>
  );
}

/**
 * The box under a teammate's thread is your own thread's reply box: the pill,
 * which shows your unsent words and opens on R or a click, and the card it
 * opens into, which grows as you write and says who gets it beside Send.
 */
export function CommentBox({ owner, helping, draft, setDraft, sending, onSend, open, onOpen, onFold }: {
  owner: string;
  /** You were asked to help: the words go to the owner's agent. */
  helping: boolean;
  draft: string; setDraft: (text: string) => void;
  sending: boolean; onSend: () => void;
  open: boolean; onOpen: () => void; onFold: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { applyDockHeight(field.current); });
  // Focused when you open it, not when the page opens with it open (asked to help), where 1-9 pick an option.
  const drawn = useRef(false);
  useEffect(() => {
    if (open && drawn.current) field.current?.focus();
    drawn.current = true;
  }, [open]);
  const box = helping ? `Write to ${owner}'s agent` : `Reply to ${owner}`;
  if (!open) {
    const said = foldedReply(draft);
    return (
      <div className="dock-card tp-compose">
        <button type="button" className={`dock-pill${said.draft ? ' dock-pill-kept' : ''}`} onClick={onOpen}>
          <span className="dock-pill-text">{said.draft ? said.text : `${box}…`}</span>
          <span className="dock-pill-key"><kbd>R</kbd></span>
        </button>
      </div>
    );
  }
  return (
    <form className="dock-card tp-compose tp-dock-form" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
      <textarea ref={field} className="dock-input" value={draft} placeholder={box} aria-label={box}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          const pressed = keyInTheReplyBox({ toPeople: true, key: e.key, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey, composing: e.nativeEvent.isComposing });
          if (pressed === 'send') { e.preventDefault(); onSend(); return; }
          // As in the reply box: Escape folds an empty box and only leaves one with words in it.
          if (e.key === 'Escape') { e.stopPropagation(); if (draft.trim()) field.current?.blur(); else onFold(); }
        }} />
      <div className="compose-sentence dock-bar">
        <span className="compose-clauses"><span className="dim">{helping ? `Goes to ${owner}'s agent.` : `Goes to ${owner}.`}</span></span>
        <span className="dock-send-pair solo">
          <button type="submit" className="dock-send" disabled={!draft.trim() || sending} title={`Send · ${sendKeyFor(true)}`}>
            {sending ? 'Sending…' : <>Send <kbd>{sendKeyFor(true)}</kbd></>}<SendGlyph />
          </button>
        </span>
      </div>
    </form>
  );
}

export function TeammateThread({ card, person, now, syncedAt, openAt, onOpenDoc, onNotice, backLabel, onBack, onMessage, onContinue, ask = null, helpedAt, onHandBack, handedToYou = null, onOpenTask, headerTarget = null, cornerTarget = null }: {
  card: ThreadCard; person: Person | null; now: number;
  /** The window's header, where an opened thread's crumb and buttons go. */
  headerTarget?: HTMLElement | null;
  cornerTarget?: HTMLElement | null;
  /** Their open ask of you on this thread: help puts your words to their agent. */
  ask?: WorkItem | null;
  /** Whether a help ask on you, open or handed back, covered words you wrote at this time. */
  helpedAt?: (at: number) => boolean;
  onHandBack?: (verdict: 'done' | 'yes' | 'changes', words: string) => Promise<boolean>;
  /** The task this thread became when its owner handed it to you, which the page links to. */
  handedToYou?: WorkItem | null;
  onOpenTask?: (task: WorkItem) => void;
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
  const { personId, threadId } = card;
  // Kept in the draft store, so a page drawn again from nothing still has what you were writing.
  const draftAt = useMemo(() => ({ product: `teammate:${personId}`, id: threadId }), [personId, threadId]);
  const [draft, setDraftHere] = useState(() => readDraft(draftAt));
  const setDraft = (text: string) => { setDraftHere(text); saveDraft(draftAt, text); };
  const [boxOpen, setBoxOpen] = useState(false);
  const team = useContext(TeamContext);
  const following = useContext(FollowContext);
  const followed = !!following?.is(card);

  useEffect(() => { setWork(null); setDraftHere(readDraft(draftAt)); setBoxOpen(false); }, [draftAt]);
  useEffect(() => {
    const open = () => setBoxOpen(true);
    window.addEventListener(TEAMMATE_REPLY, open);
    return () => window.removeEventListener(TEAMMATE_REPLY, open);
  }, []);
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
    return (text: string) => <MessageMarkdown remarkPlugins={THREAD_PLUGINS} components={components} urlTransform={artifactUrlTransform}>{text}</MessageMarkdown>;
  }, [product, dir]);

  const built = useMemo(() => itemThread(work?.lines ?? [], [], null, { whole: true }), [work?.lines]);
  // Their copy sends messages, not its bookkeeping; what is drawn is what was said.
  const helpingNow = ask?.ask?.kind === 'help';
  const events = shownOnTheirThread(built.events.filter((e: AgentEvent) => e.kind !== 'work' && e.kind !== 'run'), { me: team?.me ?? null, helping: helpedAt ?? helpingNow, owner: firstName(person) || '' });

  // An ask that ends while the page is open is said on the page, unless you handed it back yourself.
  const lastAsk = useRef<WorkItem | null>(null);
  const handedBack = useRef(false);
  const [ended, setEnded] = useState<{ note: string } | null>(null);
  const askKey = ask ? `${ask.product}/${ask.id}` : null;
  useEffect(() => { lastAsk.current = null; setEnded(null); }, [personId, threadId]);
  useEffect(() => {
    const was = lastAsk.current;
    lastAsk.current = ask;
    if (ask) { handedBack.current = false; setEnded(null); return; }
    if (was && !handedBack.current) setEnded({ note: String(was.ask?.note ?? '').trim() });
  }, [askKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const handBack = useCallback(async (verdict: AskVerdict, words: string) => {
    if (!onHandBack) return false;
    handedBack.current = true;
    const ok = await onHandBack(verdict, words);
    if (!ok) handedBack.current = false;
    return ok;
  }, [onHandBack]);
  // The command bar's answers (thread-commands.ts); changes need words, which the ask's own box takes.
  useEffect(() => {
    if (!ask || !onHandBack) return undefined;
    const press = (e: Event) => {
      const verdict = (e as CustomEvent<AskVerdict>).detail;
      if (verdict === 'changes') { onNotice('Write what to change in the box under the ask, then send it.'); return; }
      void handBack(verdict, '');
    };
    window.addEventListener(HAND_BACK_EVENT, press);
    return () => window.removeEventListener(HAND_BACK_EVENT, press);
  }, [ask, onHandBack, handBack, onNotice]);

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
  // Read to its end, the end stays in view while the box under it opens and grows.
  const scrollEl = useRef<HTMLDivElement>(null);
  const dockEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroll = scrollEl.current;
    const dock = dockEl.current;
    if (!scroll || !dock || typeof ResizeObserver === 'undefined') return undefined;
    let was = dock.offsetHeight;
    const grew = new ResizeObserver(() => {
      const by = dock.offsetHeight - was;
      was = dock.offsetHeight;
      if (endWasInView(scroll, by)) scroll.scrollTop = scroll.scrollHeight;
    });
    grew.observe(dock);
    return () => grew.disconnect();
  }, []);
  // Asked onto it, you land where the ask and the box to write in are, once per thread.
  const landed = useRef<string | null>(null);
  useEffect(() => {
    if (!ask || !work || landed.current === threadId) return;
    landed.current = threadId;
    const pane = scrollEl.current;
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
    setBoxOpen(false);
    setReread((n) => n + 1);
    following?.follow(card);
  };
  const owner = firstName(person) || 'Someone';
  const helping = ask?.ask?.kind === 'help';
  const pickRef = useRef<HTMLButtonElement>(null);
  const openMark = useCallback((link: FileMarkLink) => setBig({ file: link.file, note: link.id, at: Date.now() }), []);
  const files = useMemo(() => filesOnThread(work?.lines ?? [], marks.notes).map((f) => ({
    ...f, open: () => open(f.src),
  })), [work?.lines, marks, open]);

  const acts = (
    <TeammateCorner person={person} onMessage={onMessage}
      followed={followed} onFollow={following && card.state !== 'done' && !ask ? () => (followed ? following.unfollow(card) : following.follow(card)) : null}
      onContinue={onContinue && !ask && canContinue(work, card, team?.me ?? null) ? onContinue : null} />

  );

  // Drawn as a thread of your own: its name, what came before folded, the newest answer, and the reply box at the foot.
  const said = events.filter((e): e is AgentSaid => !e.kind);
  const lastIt = !built.outcome ? [...said].reverse().find((e) => e.who === 'it') ?? null : null;
  const newest = built.outcome ? { at: built.outcome.at, text: built.outcome.text } : lastIt ? { at: lastIt.at, text: lastIt.text } : null;
  const { before, after } = aroundTheAnswer(events, lastIt, newest?.at ?? null);
  // The ask is drawn where it came in, so what you said since it came sits under it.
  const askAt = ask && onHandBack ? ask.createdAt ?? 0 : null;
  const underAnswer = askAt == null ? after : after.filter((e: AgentEvent) => e.at <= askAt);
  const underAsk = askAt == null ? [] : after.filter((e: AgentEvent) => e.at > askAt);
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

  return (
    <div className="focus-pane tp-thread">
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
      <div className="focus-scroll" data-thread-id={threadId} ref={scrollEl}>
        <div className="focus">
          <div className="focus-body markdown agent-thread" aria-label="The conversation">
            {/* Its name, whose it is, where it stands and its summary, read first, before what was said. */}
            <div className="one-sum">
              <h2 className="one-title">{title}</h2>
              <p className="tp-whose">
                <span className="tp-mark"><Face person={person} /></span>
                <span className="tp-words">{owner}'s thread{card.project ? ` in ${card.project}` : ''}</span>
                {card.visible && <span className="tp-ago">Updated {agoWords(card.updatedAt, now)}</span>}
              </p>
              {/* While you were asked in, the ask at the end says where it stands, not "waiting on" its owner. */}
              {card.visible && !ask && <TeammateStanding card={card} person={person} />}
              <TeammateSummary card={card} owner={owner} files={files} />
            </div>
            {work && !work.shared && <p className="th-work-note">{notSharedWords(owner)}</p>}
            {earlierCount > 0 && <div className="one-head">
              <button type="button" className="one-earlier" onClick={() => setEarlierOpen((o) => !o)}>
                {earlierOpen ? 'Hide earlier messages' : `Show ${earlierCount} earlier ${earlierCount === 1 ? 'message' : 'messages'}`}
              </button>
            </div>}
            {earlierOpen && work && work.earlier > 0 && <p className="th-work-note">{earlierWords(work.earlier, owner)}</p>}
            {earlierOpen && before.length > 0 && <FileMarkOpener.Provider value={openMark}>
              <Thread events={before} name={`${owner}'s agent`} landOn={threadId} onWhole={() => {}} md={md} />
            </FileMarkOpener.Provider>}
            {newest && <QueueAnswer text={options.length ? stripOptionsSection(newest.text) : newest.text} md={md} name={title} />}
            {underAnswer.length > 0 && <FileMarkOpener.Provider value={openMark}>
              <Thread events={underAnswer} name={`${owner}'s agent`} landOn={`${threadId}:after`} onWhole={() => {}} md={md} />
            </FileMarkOpener.Provider>}
            {ask && onHandBack && <AskBar key={`${ask.product}/${ask.id}`} task={ask} owner={person} onHandBack={handBack} onOpenChange={(src) => onOpenDoc(ask.product, src)} />}
            {underAsk.length > 0 && <FileMarkOpener.Provider value={openMark}>
              <Thread events={underAsk} name={`${owner}'s agent`} landOn={`${threadId}:after-ask`} onWhole={() => {}} md={md} />
            </FileMarkOpener.Provider>}
            {(handedToYou || (ended && !ask)) && <p className="th-work-note tp-ask-ended">
              {askEndedWords(firstName(person) || 'Someone', !!handedToYou)}
              {/* The ask's own words leave with it, so what was asked stays said here. */}
              {!handedToYou && ended?.note && <q className="tp-ask-was">{ended.note.length > 160 ? `${ended.note.slice(0, 160)}…` : ended.note}</q>}
              {handedToYou && onOpenTask && <button type="button" onClick={() => onOpenTask(handedToYou)}>Open your task</button>}
            </p>}
          </div>
        </div>
      </div>
      <div className="focus-dock" ref={dockEl}>
        <div className="focus-dock-inner">
          {/* On the reply box, as on a thread of your own; out of the form, whose button styles would square its rows. */}
          {options.length > 0 && <div className="one-choices">
            <OptionsOffer bare ask="" askAll="" options={options} peekOption={null} askPeek={false}
              selectedOption={null} selRef={pickRef} onPick={pick}
              onOptionEnter={() => {}} onAskEnter={() => {}} setPeek={() => {}} setAskPeek={() => {}} />
          </div>}
          {/* Asked to help, the box to write to the agent stays open. */}
          <CommentBox owner={owner} helping={helping} draft={draft} setDraft={setDraft} sending={sending} onSend={() => void send()}
            open={boxOpen || helping} onOpen={() => setBoxOpen(true)} onFold={() => setBoxOpen(false)} />
        </div>
      </div>
    </div>
  );
}
