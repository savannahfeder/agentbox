// A THREAD IN A CHAT WITH TEAMMATES, IN A PANEL BESIDE THE CHAT (w-920461cbe6).
//
// The pick, in the person's words: "Yeah, definitely agree with the panel
// beside the chat. I think in Slack you can resize this so we might want to
// allow resizing." Drawn first as designs/w-920461cbe6/A-panel-beside-the-chat.png:
// a "Thread" head with a close, the message the thread hangs off, a quiet
// "3 replies" rule, the replies, and a reply box of its own at the foot, on the
// same line as the chat's.
//
// THE MESSAGES ARE DRAWN HERE, NOT BY ../components/Thread.tsx. That component
// owns the chat's scroll (it holds the page at the newest message), and a second
// copy of it in this panel would fight the first for the same box. These are the
// same `.chat-msg` blocks in the same materials, so they read as one chat.
//
// The rules (which replies, the line, the width) are ./chat-threads.ts.
import { useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type SetStateAction } from 'react';
import { Face, TeamContext } from './people';
import { ChatFold } from './ChatFold';
import { MessageActions, Reactions } from './ChatActions';
import { DeleteMessage, MessageEditor } from './MessageMore';
import { messageMore, withEmbeds, wordsOf } from './message-more';
import { AgentAnswers, useChatMentions } from './ChatAgents';
import { useThreadMentions } from '../components/ThreadMentions';
import { withQuote } from './chat-quote';
import { clock } from '../thread-history';
import { holdAtBottom } from '../thread-bottom';
import { THREAD_WIDTH, threadLine } from './chat-threads';
import { holdTheEdge } from './hold-the-edge';
import { FormatBar } from './FormatBar';
import { forgetVoiceDraft, markVoiceSent, sendTurnedBack, type VoiceControl } from './useVoiceRecorder';
import { RichReply, type RichBox } from './RichReply';
import { AttachRow } from '../components/AttachRow';
import { collectFiles, persistAttachments, type PendingAttachment } from '../attachments';
import { draftKey, readDraft, readDraftAttachments, restoreFailedDraft, saveDraft, saveDraftAttachments } from '../drafts';
import type { AgentTurn } from '../types';
import './chat.css';

// Before the frame is drawn in the app; a plain effect where there is no window.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** How far one arrow press moves the edge, for a keyboard. */
const NUDGE = 24;

export function ThreadPanel(props: Parameters<typeof ThreadPanelBody>[0]) {
  return <ThreadPanelBody key={JSON.stringify([props.product, props.id, props.parent.uid ?? props.parent.at])} {...props} />;
}

function ThreadPanelBody({ product, id, people, parent, replies, md, width, reactions, onReact, onEdit, onMarkUnread, onCopied, onHandToAgent, onSend, onClose, onResize }: {
  /** The conversation's project, where a picture sent here is saved. */
  product: string;
  /** The conversation, which the @ menu remembers an agent's last project under. */
  id?: string;
  /** First names of the people in the conversation, offered by the @ menu. */
  people?: string[];
  /** The message the thread hangs off. */
  parent: AgentTurn;
  /** Its replies, oldest first. */
  replies: AgentTurn[];
  md: (text: string) => ReactNode;
  /** The width to draw at, already held inside its limits by the caller. */
  width: number;
  reactions?: Record<string, Record<string, string[]>>;
  onReact?: (uid: string, emoji: string, off: boolean) => void;
  // The rest of what the chat's own messages offer (../components/Thread.tsx).
  onEdit?: (uid: string, change: { text: string } | { gone: true }) => void;
  onMarkUnread?: (at: number) => void;
  onCopied?: () => void;
  onHandToAgent?: () => void;
  /** Send a reply in this thread; false (or a rejection) when it did not go,
   *  or the words as written when starting a mentioned agent changed them. */
  onSend: (text: string) => unknown;
  onClose: () => void;
  /** The width the left edge was dragged to; the caller holds it in its limits. */
  onResize: (width: number) => void;
}) {
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const [draftItem] = useState(() => ({ product, id: `chat-thread:${JSON.stringify([id ?? '', parent.uid ?? parent.at])}` }));
  const [draft, setDraftState] = useState(() => typeof localStorage === 'undefined' ? '' : readDraft(draftItem));
  const [attachments, setAttachmentsState] = useState<PendingAttachment[]>(() => typeof localStorage === 'undefined' ? [] : readDraftAttachments(draftItem));
  const currentDraft = useRef(draft);
  const currentAttachments = useRef(attachments);
  const [tooBig, setTooBig] = useState(0);
  const setDraft = (change: SetStateAction<string>) => {
    const next = typeof change === 'function' ? change(currentDraft.current) : change;
    currentDraft.current = next;
    saveDraft(draftItem, next);
    setDraftState(next);
  };
  const setAttachments = (change: SetStateAction<PendingAttachment[]>) => {
    const next = typeof change === 'function' ? change(currentAttachments.current) : change;
    currentAttachments.current = next;
    setTooBig(saveDraftAttachments(draftItem, next).dropped.length);
    setAttachmentsState(next);
  };
  useEffect(() => {
    const restored = (event: Event) => {
      if ((event as CustomEvent).detail !== draftKey(draftItem)) return;
      currentDraft.current = readDraft(draftItem);
      currentAttachments.current = readDraftAttachments(draftItem);
      setDraftState(currentDraft.current);
      setAttachmentsState(currentAttachments.current);
    };
    window.addEventListener('zero:reply-restored', restored);
    return () => window.removeEventListener('zero:reply-restored', restored);
  }, [draftItem]);
  const filePicker = useRef<HTMLInputElement>(null);
  // Said under the box until the next try, such as the microphone being refused.
  const [notice, setNotice] = useState<string | null>(null);
  const voiceCtl = useRef<VoiceControl | null>(null);
  const voiceKey = `thread:${product}:${parent.uid ?? ''}`;
  const finishing = useRef(false);
  const [recording, setRecording] = useState(false);
  useEffect(() => { setNotice(null); }, [draft]);
  // WHAT YOU SENT AND THE LEDGER DOES NOT HAVE YET, drawn at once and dropped
  // when your own committed copy arrives, so a reply never appears to vanish
  // between Enter and the next read of the row.
  const [sending, setSending] = useState<{ at: number; text: string }[]>([]);
  useEffect(() => {
    setSending((was) => was.filter((s) => !replies.some((r) => (r.by ?? me) === me && r.at >= s.at - 5_000 && (r.text ?? '').trim() === s.text.trim())));
  }, [replies, me]);
  // The message being edited in place, by uid, and the one asking to be deleted.
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => { box.current?.focus(); }, []);

  // THE CHAT BOX'S @ AND # MENUS (Focus.tsx, DockComposer), counting in the
  // words as shown and editing through the editor so formatting round a
  // mention stays.
  const [plain, setPlain] = useState('');
  const setPlainText = (next: string) => (box.current as unknown as RichBox | null)?.rich.setPlain(next);
  const chat = useChatMentions({ on: !!people?.length, where: { product, id: id ?? '' }, people: people ?? [], input: box, text: plain, setText: setPlainText });
  const named = useThreadMentions({ text: plain, setText: setPlainText, input: box, here: id, rise: true });

  // THE PANE MAKES ROOM FOR AS LONG AS THE PANEL IS DRAWN, and no longer. Set
  // from here rather than by whoever opened it, so a thread whose message has
  // left the screen (and so draws nothing) can never leave the chat narrowed
  // beside an empty strip. chat.css reads both.
  useBeforePaint(() => {
    const pane = panel.current?.parentElement;
    if (!pane) return undefined;
    pane.dataset.thread = 'open';
    return () => { delete pane.dataset.thread; };
  }, []);
  useBeforePaint(() => {
    panel.current?.parentElement?.style.setProperty('--chat-thread-w', `${width}px`);
  }, [width]);

  // AT THE NEWEST REPLY, on opening and whenever one arrives, and held there
  // while the box under it grows, as with a voice note added.
  const shown = replies.length + sending.length;
  useBeforePaint(() => holdAtBottom(body.current), [parent.uid, shown]);

  // The words, then a link to each file, the way the chat's box sends them.
  // Send while a note records finishes it and sends it with the words. A send
  // that fails puts everything back in the box rather than dropping it.
  const send = async () => {
    let files = attachments;
    // A second press while the note is being finished is the same send.
    if (finishing.current) return;
    if (voiceCtl.current?.recording()) {
      finishing.current = true;
      const note = await voiceCtl.current.finish().finally(() => { finishing.current = false; });
      if (note) {
        const staged = { name: note.name, dataBase64: note.dataBase64, image: false, draftId: note.draftId };
        setAttachments((a) => (a.some((x) => x.draftId === note.draftId) ? a : [...a, staged]));
        files = [...files, staged];
      }
    }
    const words = draft.trim();
    if (!words && !files.length) return;
    // An agent with no project does not go out; the line under the box says why.
    if (chat.block) { setNotice(chat.block); return; }
    const putBack = (why: string) => {
      restoreFailedDraft(draftItem, words, files);
      setNotice(`Not sent: ${why} Your message is still in the box.`);
    };
    setDraft('');
    setAttachments([]);
    let linked: string;
    try {
      linked = await persistAttachments(product, files);
    } catch (err) {
      putBack(String((err as Error)?.message ?? err));
      return;
    }
    const text = [words, linked].filter(Boolean).join('\n\n');
    if (!text) return;
    const said = named.encode(chat.encode(text));
    markVoiceSent(voiceKey, files.map((a) => a.draftId));
    const at = Date.now();
    setSending((was) => [...was, { at, text: said }]);
    const went = await Promise.resolve(onSend(said)).then((r) => r, () => false);
    if (went !== false) {
      // Starting an agent writes its task into the words, and the copy on
      // screen has to match the one written or it never leaves.
      if (typeof went === 'string' && went !== said) setSending((was) => was.map((s) => (s.at === at ? { ...s, text: went } : s)));
      return;
    }
    setSending((was) => was.filter((s) => s.at !== at));
    await sendTurnedBack(voiceKey, files.map((a) => a.draftId));
    putBack('the reply could not be saved.');
  };
  const ready = !!draft.trim() || attachments.length > 0 || recording;
  const yours = (e: AgentTurn) => !!me && (e.by ?? me) === me;
  // Reply quotes into this box: a reply to a reply would be a thread in a thread.
  const quote = (e: AgentTurn) => { setDraft((was) => withQuote(was, wordsOf(e.text ?? ''))); box.current?.focus(); };
  // True when the key was taken, so the editor does not also act on it.
  const onKey = (e: globalThis.KeyboardEvent) => {
    // An open @ or # menu takes Enter as a pick, as in the chat's own box.
    const k = e as unknown as KeyboardEvent<HTMLTextAreaElement>;
    if (chat.keyDown(k) || named.keyDown(k)) return true;
    // ↑ in an empty box edits your newest message here, as it does in the chat.
    if (e.key === 'ArrowUp' && onEdit && !plain.trim() && !attachments.length) {
      const last = [...replies].reverse().concat(parent).find((r) => r.uid && !r.deleted && yours(r));
      if (last?.uid) { e.preventDefault(); setEditing(last.uid); return true; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); return true; }
    // Escape leaves the thread, and goes no further: the page behind it would
    // otherwise take the same key as "leave this conversation". Not while a
    // note is being recorded, which one stray key would otherwise cut short.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!voiceCtl.current?.recording()) onClose(); return true; }
    return false;
  };

  // THE LEFT EDGE DRAGS, like Slack's. The panel's right edge is the pane's, so
  // the width is the distance from the pointer to it. Letting go is
  // ./hold-the-edge.ts, which also lets go if the panel closes mid-drag.
  const letGo = useRef<(() => void) | null>(null);
  useEffect(() => () => letGo.current?.(), []);
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const right = panel.current?.getBoundingClientRect().right;
    if (right == null) return;
    e.preventDefault();
    letGo.current?.();
    letGo.current = holdTheEdge({
      grip: e.currentTarget, win: window, body: document.body, pointerId: e.pointerId,
      onMove: (x) => onResize(right - x),
    });
  };
  const nudge = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onResize(width + NUDGE); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onResize(width - NUDGE); }
  };

  // EACH MESSAGE CARRIES WHAT A CHAT MESSAGE CARRIES (w-2b2832bc6d), less the
  // three quick emoji, which a panel this narrow has no room for.
  const said = (e: AgentTurn, pending = false, newest = false) => {
    const by = e.by ?? me;
    const mine = yours(e);
    const person = by ? team?.byId.get(by) ?? null : null;
    const uid = e.uid;
    return (
      <div key={`${uid ?? 'p'}-${e.at}`} className="thread-block is-msg">
        <div className={`msg chat-msg${pending ? ' sending' : ''}`}>
          <div className="chat-gutter"><Face person={person} me={mine} size="lg" /></div>
          <div className="msg-head">
            <span className="msg-who">{mine ? 'You' : person?.name ?? 'A teammate'}</span>
            <span className="msg-when">{clock(e.at)}</span>
            {e.edited && <span className="msg-edited" title="Edited">edited</span>}
          </div>
          {uid && editing === uid && onEdit
            ? <MessageEditor text={wordsOf(e.text ?? '')}
              onSave={(text) => { setEditing(null); onEdit(uid, { text: withEmbeds(e.text ?? '', text) }); }}
              onCancel={() => setEditing(null)}
              onEmpty={() => { setEditing(null); setDeleting(uid); }} />
            : e.deleted
              ? <div className="msg-body msg-deleted">{e.text}</div>
              : <ChatFold lines newest={newest}>{md(e.text ?? '')}</ChatFold>}
          {uid && (
            <Reactions on={reactions?.[uid]} me={me} onReact={(emoji, off) => onReact?.(uid, emoji, off)} />
          )}
          {uid && onReact && !e.deleted && editing !== uid && (
            <MessageActions
              quick={false}
              onReact={(emoji) => onReact(uid, emoji, (reactions?.[uid]?.[emoji] ?? []).includes(me ?? ''))}
              onQuote={() => quote(e)}
              onHandToAgent={onHandToAgent}
              more={messageMore({
                mine,
                text: e.text ?? '',
                onEdit: onEdit ? () => setEditing(uid) : undefined,
                onDelete: onEdit ? () => setDeleting(uid) : undefined,
                onMarkUnread: onMarkUnread ? () => onMarkUnread(e.at) : undefined,
                onCopied,
              })}
            />
          )}
          {uid && deleting === uid && onEdit && (
            <DeleteMessage onClose={() => setDeleting(null)} onDelete={() => onEdit(uid, { gone: true })} />
          )}
        </div>
        <AgentAnswers text={e.text ?? ''} md={md} newest={newest} />
      </div>
    );
  };

  return (
    <aside className="chat-thread-panel" ref={panel} style={{ width }} aria-label="Thread">
      <div
        className="chat-thread-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize thread"
        aria-valuemin={THREAD_WIDTH.min}
        aria-valuemax={THREAD_WIDTH.max}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={drag}
        onKeyDown={nudge}
        onDoubleClick={() => onResize(THREAD_WIDTH.start)}
        title="Drag to resize. Double-click to reset."
      />
      <div className="chat-thread-head">
        <span className="chat-thread-title">Thread</span>
        <button type="button" className="chat-thread-close" aria-label="Close thread" title="Close thread" onClick={onClose}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </div>
      <div className="chat-thread-body" ref={body}><div className="chat-thread-msgs">
        {said(parent, false, shown === 0)}
        {(replies.length > 0 || sending.length > 0) && (
          <div className="chat-day chat-thread-count">{threadLine([...replies, ...sending.map((s) => ({ at: s.at, who: 'you' as const, text: s.text }))]).count}</div>
        )}
        {replies.map((r, k) => said(r, false, k === shown - 1))}
        {sending.map((s, k) => said({ at: s.at, who: 'you', text: s.text }, true, replies.length + k === shown - 1))}
      </div></div>
      <div className="chat-thread-foot">
        <div
          className="chat-thread-box"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const dropped = await collectFiles(e.dataTransfer.files);
            if (dropped.length) setAttachments((a) => [...a, ...dropped]);
          }}
        >
          {/* THE CHAT'S OWN BOX, NARROWER (w-140ac855b1, 2026-10-13). Their
              words on a one-line box with Send beside the words: "there's
              still not enough space to write your message... The send button
              should also be in the bottom-right corner... our approach should
              be rather similar to that of other input fields in our
              application." So: room for three lines that grows, what is
              attached under the words, then the chat's formatting bar on the
              left of a footer and Send at its right, which is the chat's reply
              box and Slack's thread box both. */}
          {chat.menu}
          {chat.card}
          {named.menu}
          {/* THE SAME EDITOR AS THE CHAT'S OWN BOX (w-0d55a2b160): ⌘B bolds,
              pasted rich text keeps its bold. Return sends here, as it did. */}
          <RichReply
            className="chat-thread-input"
            boxRef={box}
            value={draft}
            onChange={setDraft}
            onPlain={setPlain}
            placeholder="Reply in thread…"
            label="Reply in thread"
            mentions={[
              ...chat.mentions.map((m) => ({ start: m.start, end: m.end, loose: !m.project })),
              ...named.mentions.map((m) => ({ start: m.start, end: m.end, loose: false })),
            ]}
            onKeyDown={onKey}
            onFiles={async (files) => {
              const got = await collectFiles(files);
              if (got.length) setAttachments((a) => [...a, ...got]);
            }}
            onCaret={(b) => { chat.track(b as unknown as HTMLTextAreaElement); named.track(b as unknown as HTMLTextAreaElement); }}
            onClick={(b) => chat.click(b as unknown as HTMLTextAreaElement)}
          />
          <AttachRow attachments={attachments} onRemove={(i) => { forgetVoiceDraft(attachments[i]?.draftId); setAttachments((x) => x.filter((_, j) => j !== i)); }} />
          {tooBig > 0 && <div className="compose-note" role="alert">{tooBig === 1
            ? 'One pasted image is too big to save. Closing the box loses it.'
            : `${tooBig} pasted images are too big to save. Closing the box loses them.`}</div>}
          {notice
            ? <div className="compose-note" role="alert">{notice}</div>
            : chat.block && <div className="compose-note">{chat.block}</div>}
          <input
            ref={filePicker}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={async (e) => {
              const picked = await collectFiles(e.target.files ?? []);
              if (picked.length) setAttachments((a) => [...a, ...picked]);
              e.target.value = '';
            }}
          />
          <div className="chat-thread-bar">
            <FormatBar box={box} onChange={setDraft} onAttach={() => filePicker.current?.click()}
              onVoice={(note) => setAttachments((a) => (a.some((x) => x.draftId === note.draftId)
                ? a : [...a, { name: note.name, dataBase64: note.dataBase64, image: false, draftId: note.draftId }]))}
              onNotice={setNotice} voiceKey={voiceKey} voice={voiceCtl} onRecording={setRecording} />
            <button type="button" className="dock-send" disabled={!ready} onClick={() => void send()} title="Send · ↵">Send <kbd>↵</kbd></button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * THE LINE UNDER A MESSAGE WITH REPLIES, which opens its thread. `fresh` is how
 * many replies came after your own newest word in a thread you are in
 * (w-920461cbe6): the line then says "2 new replies" and stands out, so a thread
 * waiting on you is not one more quiet line in a busy chat.
 */
export function ThreadLine({ replies, open, onOpen, fresh = 0 }: { replies: AgentTurn[]; open: boolean; onOpen: () => void; fresh?: number }) {
  const team = useContext(TeamContext);
  const line = threadLine(replies);
  return (
    <button type="button" className={`chat-thread-line${fresh ? ' fresh' : ''}${open ? ' open' : ''}`} onClick={onOpen} aria-expanded={open}>
      <span className="chat-thread-faces" aria-hidden="true">
        {line.faces.map((id) => <Face key={id} person={team?.byId.get(id) ?? null} me={id === team?.me} />)}
      </span>
      <span className="chat-thread-n">{fresh ? `${fresh} new ${fresh === 1 ? 'reply' : 'replies'}` : line.count}</span>
      <span className="chat-thread-last">{line.last}</span>
    </button>
  );
}
