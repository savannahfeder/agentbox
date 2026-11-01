// A room's chat panel (round 23): the room's name (which switches chats), an
// invite button and the arrows that open it full page. Messages read top
// down: a short chat starts at the top, and once it is full the newest sits by
// the box you type in. Replies open in the panel; the wall stays put.
//
// Every message carries what a direct chat's does: reactions, the bar on
// pointing with its more menu (edit, copy, mark unread, delete), an edited
// mark, and voice notes and files. The box is the direct chat's too.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Room, RoomMessage } from '../../types';
import { chatLayout } from '../chat-layout';
import { MessageActions, Reactions } from '../ChatActions';
import { DeleteMessage, MessageEditor } from '../MessageMore';
import { messageMore, withEmbeds, wordsOf } from '../message-more';
import { FormatBar } from '../FormatBar';
import { RichReply, type RichBox } from '../RichReply';
import { VoiceNote } from '../VoiceNote';
import { voiceNoteOf } from '../voice-note';
import { forgetVoiceDraft, markVoiceSent, sendTurnedBack, type VoiceControl } from '../useVoiceRecorder';
import { AttachRow } from '../../components/AttachRow';
import { collectFiles, isImageName, type PendingAttachment } from '../../attachments';
import { pictureUrl } from '../../picture';
import { holdAtBottom } from '../../thread-bottom';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { cardName, chatWidth, clockOf, mentionsIn, readChatWidth, writeChatWidth } from './room-rules';
import { drawnRoots, holdsRead, mentionMarkdown, myNewest, newLineAt, quickOnBar, roomReader, storedName, wordsLeftAfterSend } from './room-chat-rules';

export type ChatPerson = { id: string; name: string; avatarUrl: string | null; me: boolean };

/** What a room's chat asks of the rooms around it. Each answers null, or why it did not happen. */
export type RoomChatCalls = {
  onSend: (body: string, opts: { inReplyTo: string | null; mentions: string[] }) => Promise<string | null>;
  onRead: () => void;
  onReact?: (messageId: string, emoji: string, on: boolean) => void;
  onEdit?: (messageId: string, body: string, mentions: string[]) => Promise<string | null>;
  onDelete?: (messageId: string) => void;
  /** Mark the room unread from this message on. */
  onMarkUnread?: (at: number) => void;
  /** Store a file in the room under this name. */
  onPutFile?: (name: string, dataBase64: string) => Promise<string | null>;
  /** A file stored in the room, as bytes, or null when it is not there. */
  loadFile?: (name: string) => Promise<Blob | null>;
  onNotice?: (text: string) => void;
};

export function RoomChat({ room, messages, people, meId, now, onInvite, onExpand, onSwitch, switchOpen, full = false, head, hang = false, ...calls }: {
  room: Room; messages: RoomMessage[]; people: ChatPerson[]; meId: string | null; now: number;
  onInvite?: () => void; onExpand?: () => void;
  onSwitch?: (anchor: DOMRect) => void; switchOpen?: boolean;
  /** Drawn on the messages page, at full width, with its own header. */
  full?: boolean; head?: ReactNode;
  /** Faces at 32, hung beside the words, as a chat that is the whole page draws them. */
  hang?: boolean;
} & RoomChatCalls) {
  const { onSend, onRead, onReact, onEdit, onDelete, onMarkUnread, onNotice } = calls;
  const [thread, setThread] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [width, setWidth] = useState(readChatWidth);
  // The pointer is captured, so a fast drag that leaves the edge keeps going.
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const chat = e.currentTarget.parentElement;
    const space = chat?.parentElement?.clientWidth;
    if (e.button !== 0 || !chat || !space) return;
    e.preventDefault();
    const grip = e.currentTarget, from = e.clientX, start = chat.getBoundingClientRect().width;
    let last = start;
    grip.setPointerCapture(e.pointerId); chat.classList.add('dragging');
    const move = (m: PointerEvent) => { last = chatWidth(start + from - m.clientX, space); setWidth(last); };
    const up = () => {
      chat.classList.remove('dragging'); if (last !== start) writeChatWidth(last);
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  };
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const roots = drawnRoots(messages);
  const replies = useMemo(() => {
    const out = new Map<string, RoomMessage[]>();
    for (const m of messages) if (m.inReplyTo && !m.deleted) out.set(m.inReplyTo, [...(out.get(m.inReplyTo) ?? []), m]);
    return out;
  }, [messages]);
  const root = thread ? messages.find((m) => m.id === thread) ?? null : null;
  const shown = root ? [root, ...(replies.get(root.id) ?? [])] : roots;
  const names = people.map((p) => p.name);
  const others = people.filter((p) => !p.me);

  // WHERE YOU HAD READ TO WHEN YOU OPENED IT, held while you read, so the New
  // line stays put as the room is marked read under you.
  const [readFrom, setReadFrom] = useState<number | null>(room.readAt ?? null);
  useEffect(() => { setReadFrom(room.readAt ?? null); setThread(null); setEditing(null); }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const newAt = root ? null : newLineAt(messages, readFrom, meId);

  // Reading the room is staying on it with the window in front (roomReader),
  // except just after you marked it unread, which holds until you leave it.
  const held = useRef(false);
  const wasMarked = useRef(!!room.markedUnread);
  useEffect(() => { held.current = false; wasMarked.current = !!room.markedUnread; }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Marked unread from anywhere (the list's menu too) while it is open holds
  // it the same way; opening a room that was already marked reads it.
  useEffect(() => {
    const marked = !!room.markedUnread;
    if (marked && !wasMarked.current) setReadFrom(room.readAt ?? null);
    held.current = holdsRead(held.current, wasMarked.current, marked);
    wasMarked.current = marked;
  }, [room.markedUnread, room.readAt]);
  const latestRead = useRef(onRead);
  latestRead.current = onRead;
  const reader = useRef<ReturnType<typeof roomReader> | null>(null);
  useEffect(() => {
    const r = roomReader({
      read: () => latestRead.current(),
      canRead: () => !held.current && document.visibilityState === 'visible' && document.hasFocus(),
    });
    reader.current = r;
    r.open();
    window.addEventListener('focus', r.open);
    window.addEventListener('blur', r.away);
    return () => { r.close(); window.removeEventListener('focus', r.open); window.removeEventListener('blur', r.away); };
  }, [room.id]);
  useEffect(() => { reader.current?.arrived(); }, [messages.length]);
  const markUnread = onMarkUnread ? (at: number) => { held.current = true; setReadFrom(at - 1); onMarkUnread(at); } : undefined;

  const who = (id: string | null) => (id ? byId.get(id) : undefined);
  const nameOf = (id: string | null) => { const p = who(id); return p ? cardName(p) : 'Someone'; };
  const listRef = useStick([room.id, thread]);
  const slots = chatLayout(shown.map((m) => ({ at: m.at, by: m.by ?? '' })), now);
  const myNames = useMemo(() => {
    const name = people.find((p) => p.me)?.name;
    if (!name) return [];
    const first = (n: string) => n.split(/\s+/)[0].toLowerCase();
    const mine = first(name);
    return people.filter((p) => first(p.name) === mine).length === 1 ? [name, name.split(/\s+/)[0]] : [name];
  }, [people]);
  const body = (m: RoomMessage) => (
    <RoomMarkdown text={m.body} names={names} loadFile={calls.loadFile} roomId={room.id} mine={m.by === meId}
      me={meId && m.by !== meId && m.mentions.includes(meId) ? myNames : NOBODY} />
  );

  return <div className={full ? `rm-full${hang ? ' hang' : ''}` : 'rm-chat'} style={full || width == null ? undefined : { '--rm-chat-w': `${width}px` } as CSSProperties}>
    {!full && <div className="rm-chat-grip" role="separator" aria-orientation="vertical" aria-label="Drag to widen the chat"
      title="Drag to widen. Double-click to reset." onPointerDown={drag} onDoubleClick={() => { setWidth(null); writeChatWidth(null); }} />}
    {head ?? <div className="rm-chat-head">
      {root
        ? <><button type="button" className="rm-switch" onClick={() => setThread(null)}>{I.back()}<span>Thread</span></button>
          <span className="rm-label" style={{ marginLeft: 'auto', marginRight: 4 }}>{(replies.get(root.id)?.length ?? 0)} {(replies.get(root.id)?.length ?? 0) === 1 ? 'reply' : 'replies'}</span></>
        : <button type="button" className={`rm-switch${switchOpen ? ' open' : ''}`} onClick={(e) => onSwitch?.(e.currentTarget.getBoundingClientRect())}>
          {room.kind === 'group'
            ? <><span className="rm-faces">{others.slice(0, 3).map((p) => <RoomFace key={p.id} name={p.name} url={p.avatarUrl} size={18} />)}</span>
              <span>{others.map((p) => p.name).join(', ') || room.name}</span></>
            : <>{I.hash(15)}<span>{room.name}</span></>}
          {onSwitch && I.down()}
        </button>}
      {!root && onInvite && room.kind !== 'group' && <button type="button" className="ic" title={`Invite people to ${room.name}`} aria-label={`Invite people to ${room.name}`} onClick={onInvite}>{I.invite(14)}</button>}
      {onExpand && <button type="button" className="ic" title="Open full page" aria-label="Open full page" onClick={onExpand}>{I.expand()}</button>}
    </div>}
    <div className="rm-chat-list" ref={listRef}><div className="rm-chat-msgs">
      {shown.map((m, i) => {
        const slot = slots[i];
        const mine = m.by === meId;
        const reps = !root ? replies.get(m.id) ?? [] : [];
        const p = who(m.by);
        const headed = slot.head || (root && i === 0) || m.id === newAt;
        return <div key={m.id}>
          {slot.day && <div className="rm-day"><span className="rm-label">{slot.day}</span></div>}
          {m.id === newAt && <div className="rm-new" role="separator"><span>New</span></div>}
          <div className={`rm-cm${headed ? '' : ' cont'}${root && i === 0 ? ' root' : ''}`}>
            {headed && <div className="h">
              <RoomFace name={p?.name ?? '?'} url={p?.avatarUrl} size={hang ? 32 : 16} />
              <span>{nameOf(m.by)}</span><em>{clockOf(m.at)}</em>
              {m.editedAt && !m.deleted && <em className="rm-edited">edited</em>}
            </div>}
            {editing === m.id && onEdit
              ? <MessageEditor text={wordsOf(m.body)}
                onCancel={() => setEditing(null)}
                onEmpty={() => { setEditing(null); setDeleting(m.id); }}
                onSave={(text) => {
                  setEditing(null);
                  const next = withEmbeds(m.body, text);
                  void onEdit(m.id, next, mentionsIn(next, others)).then((err) => { if (err) onNotice?.(err); });
                }} />
              : m.deleted
                ? <div className="tx rm-gone">This message was deleted.</div>
                : <div className="tx">{body(m)}</div>}
            {!headed && m.editedAt && !m.deleted && editing !== m.id && <em className="rm-edited">edited</em>}
            {!m.deleted && onReact && <Reactions on={m.reactions} me={meId} onReact={(emoji, off) => onReact(m.id, emoji, !off)} />}
            {reps.length > 0 && <button type="button" className="rep" onClick={() => setThread(m.id)}>
              {[...new Set(reps.map((r) => r.by))].slice(0, 3).map((id) => <RoomFace key={id ?? 'x'} name={who(id)?.name ?? '?'} url={who(id)?.avatarUrl} size={13} />)}
              <span style={{ marginLeft: 5 }}>{reps.length} {reps.length === 1 ? 'reply' : 'replies'}</span>
            </button>}
            {!m.deleted && editing !== m.id && onReact && <MessageActions
              onReact={(emoji) => onReact(m.id, emoji, !(m.reactions?.[emoji] ?? []).includes(meId ?? ''))}
              quick={quickOnBar({ full, thread: !!root })}
              {...(!root ? { onQuote: () => setThread(m.id), replyLabel: 'Reply in thread' } : {})}
              more={messageMore({
                mine,
                text: m.body,
                onEdit: onEdit ? () => setEditing(m.id) : undefined,
                onDelete: onDelete ? () => setDeleting(m.id) : undefined,
                onMarkUnread: markUnread && !m.inReplyTo ? () => markUnread(m.at) : undefined,
                onCopied: () => onNotice?.('Copied'),
              })} />}
            {deleting === m.id && onDelete && <DeleteMessage onClose={() => setDeleting(null)} onDelete={() => { if (thread === m.id) setThread(null); onDelete(m.id); }} />}
          </div>
        </div>;
      })}
    </div></div>
    <Composer key={`${room.id}:${thread ?? ''}`} roomId={room.id} threadId={thread} people={others}
      placeholder={root ? `Reply to ${nameOf(root.by)}` : `Message ${room.kind === 'group' ? others.map((p) => p.name.split(' ')[0]).join(', ') || room.name : room.name}`}
      onPutFile={calls.onPutFile} onNotice={onNotice}
      onEditLast={() => { const mine = myNewest(messages, meId, root?.id ?? null); if (mine) setEditing(mine.id); }}
      onSend={(body) => onSend(body, { inReplyTo: root?.id ?? null, mentions: mentionsIn(body, others) })} />
  </div>;
}

// Room files arrive as bytes and are drawn from an address made for them once.
const pictures = new Map<string, Promise<string | null>>();

function RoomPicture({ roomId, name, alt, loadFile }: { roomId: string; name: string; alt: string; loadFile?: (name: string) => Promise<Blob | null> }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!loadFile) { setSrc(null); return; }
    const key = `${roomId}:${name}`;
    let live = true;
    let got = pictures.get(key);
    if (!got) { got = loadFile(name).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null); pictures.set(key, got); }
    void got.then((url) => { if (live) setSrc(url); });
    return () => { live = false; };
  }, [roomId, name, loadFile]);
  if (src === undefined) return <span className="inline-image arriving" aria-hidden="true" />;
  if (!src) return <span className="rm-file">{alt || name}</span>;
  return <img className="inline-image" src={src} alt={alt} />;
}

/** A room message as markdown: @names marked, voice notes and pictures drawn, other files named. */
const MARKDOWN_PLUGINS = [remarkGfm];
const NOBODY: readonly string[] = [];
const storedIn = (href: string) => /^attachments\/([A-Za-z0-9][\w.-]{0,159})$/.exec(href)?.[1] ?? null;

function RoomMarkdown({ text, names, loadFile, roomId, mine, me }: {
  text: string; names: string[]; roomId: string; mine: boolean; loadFile?: (name: string) => Promise<Blob | null>;
  /** What you answer to, when this message names you. */
  me: readonly string[];
}) {
  // The same parts on every draw: new ones would remount each voice note in
  // the chat, so none could finish loading. The file is fetched through a ref
  // for the same reason.
  const load = useRef(loadFile);
  load.current = loadFile;
  const components = useMemo(() => {
    const fetchFile = (name: string) => load.current?.(name) ?? Promise.resolve(null);
    return {
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        if (href === '#mention') return <b className="rm-at">{children}</b>;
        if (href === '#mention-me') return <b className="rm-at me">{children}</b>;
        const name = href ? storedIn(href) : null;
        const note = name ? voiceNoteOf(name) : null;
        if (name && note) return <VoiceNote id={`room:${roomId}:${name}`} ms={note.ms} mine={mine} load={() => fetchFile(name)} />;
        if (name) return <span className="rm-file">{children}</span>;
        return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        const name = src ? storedIn(src) : null;
        return name ? <RoomPicture roomId={roomId} name={name} alt={alt ?? ''} loadFile={fetchFile} /> : null;
      },
    };
  }, [roomId, mine]);
  return <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={components}>{mentionMarkdown(text, names, me)}</ReactMarkdown>;
}

// Keeps the newest message in view while you are at the bottom, and leaves
// you where you are when you have scrolled up to read. The hold follows the
// list's own height too, which shrinks when a voice note or a long draft
// grows the box under it.
function useStick(deps: unknown[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => el.classList.toggle('more-above', el.scrollTop > 4);
    on();
    el.addEventListener('scroll', on);
    return () => el.removeEventListener('scroll', on);
  }, []);
  useLayoutEffect(() => holdAtBottom(ref.current), deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

// What you are writing in each room, kept while you go and look at another.
const drafts = new Map<string, string>();

// A file dragged in arrives as a path on this Mac rather than as bytes.
async function base64Of(a: PendingAttachment): Promise<string | null> {
  if (a.dataBase64) return a.dataBase64;
  if (!a.srcPath) return null;
  const r = await fetch(pictureUrl(a.srcPath)).catch(() => null);
  if (!r?.ok) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// A file in the box is given the name it will be stored under once, here.
const staged = (a: PendingAttachment): PendingAttachment => (a.storedAs ? a : { ...a, storedAs: storedName(a.name) });

function Composer({ roomId, threadId, placeholder, people, onSend, onPutFile, onNotice, onEditLast }: {
  roomId: string; threadId: string | null; placeholder: string; people: ChatPerson[];
  onSend: (body: string) => Promise<string | null>;
  onPutFile?: (name: string, dataBase64: string) => Promise<string | null>;
  onNotice?: (text: string) => void;
  onEditLast: () => void;
}) {
  const draftKey = `${roomId}:${placeholder}`;
  const [text, setText] = useState(() => drafts.get(draftKey) ?? '');
  const [plain, setPlain] = useState('');
  const [caret, setCaret] = useState(0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(0);
  const ref = useRef<RichBox | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  useEffect(() => { drafts.set(draftKey, text); }, [draftKey, text]);
  // "@" then letters at the caret opens the people in the room.
  const at = /(^|\s)@([\p{L}.]*)$/u.exec(plain.slice(0, caret));
  const matches = at ? people.filter((p) => p.name.toLowerCase().startsWith(at[2].toLowerCase())).slice(0, 6) : [];
  const choose = (p: ChatPerson) => {
    const box = ref.current;
    if (!box) return;
    const before = plain.slice(0, caret).replace(/@([\p{L}.]*)$/u, `@${p.name} `);
    box.rich.setPlain(before + plain.slice(caret));
    setPick(0);
    requestAnimationFrame(() => { box.focus(); box.setSelectionRange(before.length, before.length); });
  };
  const voiceCtl = useRef<VoiceControl | null>(null);
  const voiceKey = `room:${roomId}:${threadId ?? ''}`;
  const sendingNow = useRef(false);
  const [recording, setRecording] = useState(false);
  // A send that failed, so it can be tried again, and is when the connection comes back.
  const [failed, setFailed] = useState(false);
  const ready = !!text.trim() || attachments.length > 0 || recording;
  // EVERYTHING STAYS IN THE BOX UNTIL THE ROOM HAS IT. Each file keeps the
  // name it was given when it went into the box, so a second try puts the
  // same file rather than another copy, and a file the room already has
  // counts as sent.
  const send = async () => {
    // Held in a ref as well, so two presses in one moment are one send.
    if (!ready || busy || sendingNow.current) return;
    sendingNow.current = true;
    setBusy(true);
    setError(null);
    let files = attachments;
    const typed = text;
    let marked = false;
    try {
      if (voiceCtl.current?.recording()) {
        const note = await voiceCtl.current.finish();
        if (note) {
          const one = staged({ name: note.name, dataBase64: note.dataBase64, image: false, draftId: note.draftId });
          files = [...files, one];
          setAttachments((a) => (a.some((x) => x.draftId === one.draftId) ? a : [...a, one]));
        }
      }
      const words = typed.trim();
      if (!words && !files.length) return;
      // On its way out: a box opened again meanwhile does not offer it back.
      markVoiceSent(voiceKey, files.map((a) => a.draftId));
      marked = true;
      const links: string[] = [];
      for (const a of files) {
        if (!onPutFile) throw new Error('Files cannot be sent in this room yet');
        const data = await base64Of(a);
        if (!data) throw new Error(`${a.name} could not be read`);
        const name = a.storedAs ?? storedName(a.name);
        const err = await onPutFile(name, data);
        if (err) throw new Error(err);
        links.push(a.image ? `![${a.name}](attachments/${name})` : `[${a.name}](attachments/${name})`);
      }
      const body = [words, links.join('\n')].filter(Boolean).join('\n\n');
      const err = await onSend(body);
      if (err) throw new Error(err);
      for (const a of files) forgetVoiceDraft(a.draftId);
      // Only what went out leaves the box: a note recorded while it was sending stays.
      setText((now) => wordsLeftAfterSend(now, typed));
      setAttachments((now) => now.filter((a) => !files.some((f) => f === a || (f.draftId && f.draftId === a.draftId))));
      setFailed(false);
      failedWith.current = null;
      drafts.delete(draftKey);
    } catch (e) {
      if (marked) void sendTurnedBack(voiceKey, files.map((a) => a.draftId));
      setFailed(true);
      failedWith.current = { text: typed, count: files.length };
      setError(`Not sent: ${String((e as Error)?.message ?? e).replace(/\.$/, '')}. Your message is still in the box.`);
    } finally {
      sendingNow.current = false;
      setBusy(false);
    }
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  // BACK ONLINE, TRIED AGAIN, but only the message that failed: a box changed
  // since is the person's to send.
  const failedWith = useRef<{ text: string; count: number } | null>(null);
  const boxNow = useRef({ text, count: attachments.length });
  boxNow.current = { text, count: attachments.length };
  useEffect(() => {
    if (!failed) return undefined;
    const back = () => {
      const was = failedWith.current;
      if (was && was.text === boxNow.current.text && was.count === boxNow.current.count) void sendRef.current();
    };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [failed]);
  const add = (got: PendingAttachment[]) => {
    if (!got.length) return;
    setAttachments((a) => [...a, ...got.filter((g) => !g.draftId || !a.some((x) => x.draftId === g.draftId)).map(staged)]);
  };
  return <>
    {matches.length > 0 && <div className="rm-picker rm-pop rm-menu" style={{ position: 'absolute' }}>
      {matches.map((p, i) => <button type="button" key={p.id} className={`row${i === pick ? ' on' : ''}`} onMouseDown={(e) => { e.preventDefault(); choose(p); }}>
        <RoomFace name={p.name} url={p.avatarUrl} size={18} /><span>{p.name}</span></button>)}
    </div>}
    {error && <div className="rm-chat-err" role="alert">{error}
      {failed && !busy && <button type="button" className="rm-retry" onClick={() => void send()}>Try again</button>}</div>}
    <div className="rm-compose">
      <RichReply className="rm-compose-input" boxRef={ref} value={text} onChange={setText} onPlain={setPlain}
        placeholder={placeholder} label={placeholder}
        onCaret={(box) => setCaret(box.selectionStart)}
        onFiles={async (files) => add(await collectFiles(files))}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setPick((n) => (n + 1) % matches.length); return true; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setPick((n) => (n + matches.length - 1) % matches.length); return true; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[pick] ?? matches[0]); return true; }
          }
          if (e.key === 'ArrowUp' && !plain.trim() && !attachments.length) { e.preventDefault(); onEditLast(); return true; }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); return true; }
          if (e.key === 'Escape') { ref.current?.blur(); return true; }
          return false;
        }} />
      <AttachRow attachments={attachments} onRemove={(i) => { forgetVoiceDraft(attachments[i]?.draftId); setAttachments((x) => x.filter((_, j) => j !== i)); }} />
      <input ref={filePicker} type="file" multiple style={{ display: 'none' }}
        onChange={async (e) => { add(await collectFiles(e.target.files ?? [])); e.target.value = ''; }} />
      <div className="rm-compose-bar">
        <FormatBar box={ref as unknown as { current: HTMLTextAreaElement | null }} onChange={setText}
          onAttach={onPutFile ? () => filePicker.current?.click() : undefined}
          onVoice={onPutFile ? (note) => add([{ name: note.name, dataBase64: note.dataBase64, image: isImageName(note.name), draftId: note.draftId }]) : undefined}
          onNotice={setError} voiceKey={voiceKey} voice={voiceCtl} onRecording={setRecording} />
        <button type="button" className="dock-send" disabled={!ready || busy} onClick={() => void send()} title="Send · ↵">
          {busy ? 'Sending…' : <>Send <kbd>↵</kbd></>}
        </button>
      </div>
    </div>
  </>;
}
