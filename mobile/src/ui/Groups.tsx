// The Groups tab: the group open last, its chat filling the page with faces
// beside the words and a box to type in at the foot. Its name over the chat
// switches group; People sits at the bar's right. A reply opens its thread,
// as on the desktop (renderer/src/team/rooms/RoomChat.tsx).
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Room, RoomMessage } from '../../../renderer/src/types';
import { Name } from '../../../shared/product-name.mjs';
import { cardName, initialsOf, markMentions, mentionsIn } from '../../../renderer/src/team/rooms/room-rules';
import { clockOf } from '../../../renderer/src/teammates/chat-lines';
import { newLineAt, READ_AFTER_MS, replyBoxWords } from '../../../renderer/src/team/rooms/room-chat-rules';
import { updatedWords } from '../../../renderer/src/threads/page-rules';
import { bodyParts, chatRoots, dayWords, groupName, groupsInOrder, groupToOpen, onWords, peopleInOrder, pictureType, repliesTo, startsRun } from '../lib/groups';
import { chatDraft, chatDraftKey, chatFiles, keepChatDraft, keepChatFiles } from '../lib/chat-drafts';
import { reportAboutMessage, shownMessages } from '../lib/chat-safety';
import { withPicked } from '../lib/attach';
import { router } from '../lib/router';
import type { Picked } from '../platform/pick';
import { filtered } from '../platform/word-filter';
import { useCloud } from '../state/cloud';
import { useGroups } from '../state/groups';
import { AttachSheet, Attached } from './Attach';
import { Markdown } from './Markdown';
import { Back, Caret, Clip, FileMark } from './icons';
import { footRoom, IconButton, RunningMark, Sheet, SheetHead, SheetRow, T, TopBar } from './parts';
import { color, corner, font, size } from './theme';

/** A round face: two letters in mono on one grey ground for everyone (renderer/src/team/people.tsx). */
export function Face({ name, size: s }: { name: string; size: number }) {
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.film, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontFamily: font.mono, fontSize: Math.max(8, Math.round(s * 0.28 * 2) / 2), letterSpacing: 0.5, color: color.dim }}>{initialsOf(name)}</T>
    </View>
  );
}

const PeopleGlyph = ({ tint = color.dim }: { tint?: string }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.5} strokeLinecap="round">
    <Circle cx={9} cy={8.5} r={3.25} /><Path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><Path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8" /><Path d="M17.5 14.4c1.8.6 3 2.2 3.5 4.6" />
  </Svg>
);
const SendGlyph = ({ tint }: { tint: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 19V5" /><Path d="m6 11 6-6 6 6" /></Svg>
);

/** A named group wears a #, a chat the face of who it is with. */
function GroupMark({ room }: { room: Room }) {
  if (room.kind === 'group') return <Face name={groupName(room)} size={22} />;
  return <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontFamily: font.mono, fontSize: 15, color: color.faint }}>#</T></View>;
}

const pictures = new Map<string, Promise<string | null>>();

// A picture or file takes the press from its message, so it passes a hold back for the message's menu.
const HoldMessage = createContext<(() => void) | null>(null);

/** A picture a message carries, fetched once for each group and name (RoomChat.tsx `RoomPicture`). */
function RoomPicture({ roomId, name, alt }: { roomId: string; name: string; alt: string }) {
  const g = useGroups();
  const c = useCloud();
  const hold = useContext(HoldMessage);
  const [data, setData] = useState<string | null | undefined>(undefined);
  const [shape, setShape] = useState(4 / 3);
  const uri = data ? `data:${pictureType(name)};base64,${data}` : null;
  useEffect(() => {
    let live = true;
    const key = `${roomId}/${name}`;
    let got = pictures.get(key);
    if (!got) { got = g.fileOf(roomId, name).catch(() => null); pictures.set(key, got); }
    void got.then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [roomId, name, g.fileOf]);
  useEffect(() => { if (uri) Image.getSize(uri, (w, h) => { if (w && h) setShape(w / h); }, () => {}); }, [uri]);
  if (data === null) return <T style={{ fontSize: 13.5, lineHeight: 20, color: color.faint }}>{alt || 'A picture that is not here any more'}</T>;
  return (
    <Pressable onPress={() => void openRoomFile(g.fileOf, c.say, roomId, name)} onLongPress={hold ?? undefined} delayLongPress={350} accessibilityRole="button" accessibilityLabel={`Open ${alt || name}`}
      style={{ width: '100%', maxWidth: 280, aspectRatio: shape, marginVertical: 6, backgroundColor: color.film }}>
      {!!uri && <Image source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />}
    </Pressable>
  );
}

/** A file a message carries, to the phone's own share sheet, or a new tab in the preview. */
async function openRoomFile(fileOf: (roomId: string, name: string) => Promise<string | null>, say: (line: string) => void, roomId: string, name: string) {
  try {
    const data = await fileOf(roomId, name);
    if (!data) { say('That file is not here any more.'); return; }
    if (Platform.OS === 'web') { window.open(`data:application/octet-stream;base64,${data}`, '_blank'); return; }
    const copy = new File(Paths.cache, name);
    if (copy.exists) copy.delete();
    copy.create();
    copy.write(Uint8Array.from(atob(data), (x) => x.charCodeAt(0)));
    await Share.share({ url: copy.uri });
  } catch (err) { say(String((err as Error)?.message ?? err)); }
}

function RoomFile({ roomId, name, label }: { roomId: string; name: string; label: string }) {
  const g = useGroups();
  const c = useCloud();
  const hold = useContext(HoldMessage);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    await openRoomFile(g.fileOf, c.say, roomId, name);
    setBusy(false);
  };
  return (
    <Pressable onPress={() => void open()} onLongPress={hold ?? undefined} delayLongPress={350} disabled={busy} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, height: 34, paddingHorizontal: 11, borderWidth: 1, borderRadius: corner.small, borderColor: color.line, backgroundColor: pressed ? color.picked : color.fill, opacity: busy ? 0.6 : 1 })}>
      <FileMark size={14} />
      <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13.5, color: color.dim }}>{label}</T>
    </Pressable>
  );
}

// The desktop's first emoji (renderer/src/team/ChatActions.tsx `CHAT_EMOJI`), which loads the window's styles and cannot come here.
const CHAT_EMOJI = ['👍', '🙏', '👀', '✅', '🎉', '❤️'];

// Bold, code, a list or a quote: drawn as the desktop draws it, else as plain words with their mentions.
const FORMATTED = /(\*\*|__|`|^\s*[-*] |^\s*\d+\. |^\s*> |^#{1,3} )/m;

function Body({ text, names, roomId }: { text: string; names: string[]; roomId: string }) {
  return (
    <>
      {bodyParts(text).map((part, k) => (part.kind === 'picture' ? <RoomPicture key={k} roomId={roomId} name={part.name} alt={part.alt} />
        : part.kind === 'file' ? <RoomFile key={k} roomId={roomId} name={part.name} label={part.label} />
          : FORMATTED.test(part.text) ? <Markdown key={k} text={part.text} />
            : (
              <T key={k} selectable style={{ fontSize: 15.5, lineHeight: 22.5 }}>
                {markMentions(part.text, names).map((p, i) => (p.mention ? <T key={i} style={{ fontSize: 15.5, lineHeight: 22.5, color: color.accent }}>{p.text}</T> : p.text))}
              </T>
            )))}
    </>
  );
}

/** Each emoji on a message and how many, yours outlined; a press puts yours on or takes it off (ChatActions.tsx `Reactions`). */
function Reactions({ m, me, nameOf, onToggle }: { m: RoomMessage; me: string | null; nameOf: (id: string | null) => string; onToggle: (emoji: string, on: boolean) => void }) {
  const list = Object.entries(m.reactions ?? {}).filter(([, who]) => who.length > 0);
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {list.map(([emoji, who]) => {
        const mine = !!me && who.includes(me);
        return (
          <Pressable key={emoji} onPress={() => onToggle(emoji, !mine)} accessibilityRole="button" accessibilityState={{ selected: mine }}
            accessibilityLabel={`${emoji} ${who.map(nameOf).join(', ')}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 8, borderWidth: 1, borderRadius: corner.small, borderColor: mine ? color.lineStrong : color.line, backgroundColor: pressed || mine ? color.picked : color.fill })}>
            <T style={{ fontSize: 13, lineHeight: 17 }}>{emoji}</T>
            <T style={{ fontFamily: font.mono, fontSize: 11.5, color: mine ? color.text : color.dim }}>{who.length}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Message({ m, run, nameOf, faceOf, names, replies, onThread, onPress, roomId, me, onReact }: {
  m: RoomMessage; run: boolean; nameOf: (id: string | null) => string; faceOf: (id: string | null) => string; names: string[]; replies: number; onThread?: () => void; onPress: () => void; roomId: string;
  me: string | null; onReact: (emoji: string, on: boolean) => void;
}) {
  const who = nameOf(m.by);
  const words = m.by && m.by !== me ? filtered(m.body) : m.body;
  return (
    <HoldMessage.Provider value={m.deleted ? null : onPress}>
    <Pressable onLongPress={m.deleted ? undefined : onPress} delayLongPress={350} style={{ flexDirection: 'row', gap: 12, paddingTop: run ? 14 : 3 }}>
      {/* Your own face carries your initials, as People draws it, not the word "You". */}
      <View style={{ width: 32 }}>{run && <Face name={faceOf(m.by)} size={32} />}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {run && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 1 }}>
            <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium, fontSize: 14.5, lineHeight: 20 }}>{who}</T>
            <T style={{ fontSize: 12, color: color.faint }}>{clockOf(m.at)}</T>
          </View>
        )}
        {m.deleted ? <T style={{ fontSize: 14.5, lineHeight: 22, color: color.faint }}>This message was deleted.</T> : <Body text={words} names={names} roomId={roomId} />}
        {!m.deleted && !!m.editedAt && <T style={{ fontSize: 12, color: color.faint, marginTop: 1 }}>edited</T>}
        {!m.deleted && <Reactions m={m} me={me} nameOf={nameOf} onToggle={onReact} />}
        {replies > 0 && onThread && (
          <Pressable onPress={onThread} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <T style={{ fontSize: 13, color: color.dim, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{replies} {replies === 1 ? 'reply' : 'replies'}</T>
          </Pressable>
        )}
      </View>
    </Pressable>
    </HoldMessage.Provider>
  );
}

function Rule({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 20, paddingBottom: 2 }}>
      <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', color: accent ? color.dim : color.faint }}>{label}</T>
      {accent && <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(238, 96, 24, 0.35)' }} />}
    </View>
  );
}

function PeopleSheet({ room, open, close, blocked, unblock }: { room: Room; open: boolean; close: () => void; blocked: ReadonlySet<string>; unblock: (id: string) => void }) {
  const people = peopleInOrder(room.wall);
  const working = people.filter((c) => c.agents).length;
  return (
    <Sheet open={open} close={close}>
      <SheetHead>{`People · ${working} of ${room.members} working`}</SheetHead>
      {people.map((c) => (
        <View key={c.id} style={{ minHeight: 60, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Face name={c.name} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
              <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 15.5, lineHeight: 21 }}>{cardName(c)}</T>
            </View>
            {!!onWords(c) && <T numberOfLines={1} style={{ fontSize: 13, lineHeight: 19, color: c.agents ? color.dim : color.faint }}>{onWords(c)}</T>}
          </View>
          {blocked.has(c.id) ? (
            <Pressable onPress={() => unblock(c.id)} accessibilityRole="button" accessibilityLabel={`Unblock ${cardName(c)}`}
              style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent' })}>
              <T style={{ fontSize: 13, color: color.dim }}>Unblock</T>
            </Pressable>
          ) : c.agents ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <RunningMark />
              <T style={{ fontSize: 12.5, color: color.dim }}>{c.agents} {c.agents === 1 ? 'agent' : 'agents'}</T>
            </View>
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}

function Switcher({ rooms, current, open, close, pick, now, onNew }: { rooms: Room[]; current: string; open: boolean; close: () => void; pick: (id: string) => void; now: number; onNew: () => void }) {
  return (
    <Sheet open={open} close={close}>
      <SheetHead>Groups</SheetHead>
      {groupsInOrder(rooms).map((r) => (
        <SheetRow key={r.id} label={groupName(r)} on={r.id === current} lead={<GroupMark room={r} />}
          aside={r.unread > 0 && r.id !== current ? 'New' : updatedWords(r.lastAt, now)} onPress={() => { pick(r.id); close(); }} />
      ))}
      <SheetRow label="New chat" lead={<View style={{ width: 22, alignItems: 'center' }}><T style={{ fontSize: 18, lineHeight: 20, color: color.dim }}>+</T></View>} onPress={() => { close(); onNew(); }} />
    </Sheet>
  );
}

/** What you can do to one message: react, reply, and to your own edit or delete; to someone else's, report it or block them. */
function MessageSheet({ m, me, who, open, close, onReact, onThread, onEdit, onDelete, onReport, onBlock }: {
  m: RoomMessage | null; me: string | null; who: string; open: boolean; close: () => void;
  onReact: (emoji: string) => void; onThread?: () => void; onEdit: () => void; onDelete: () => void; onReport: () => void; onBlock: () => void;
}) {
  const [asking, setAsking] = useState<'delete' | 'block' | null>(null);
  useEffect(() => { if (!open) setAsking(null); }, [open]);
  if (!m) return null;
  const mine = !!me && m.by === me;
  const done = (fn: () => void) => () => { close(); fn(); };
  if (asking) {
    return (
      <Sheet open={open} close={close}>
        <SheetHead>{asking === 'delete' ? 'Delete this message for everyone?' : `Block ${who}?`}</SheetHead>
        {asking === 'block' && <T style={{ paddingHorizontal: 14, paddingBottom: 10, fontSize: 14, lineHeight: 20, color: color.dim }}>{`You will not see their messages on this phone, and ${Name} is told.`}</T>}
        <SheetRow label={asking === 'delete' ? 'Delete' : 'Block'} onPress={done(asking === 'delete' ? onDelete : onBlock)} />
        <SheetRow label="Cancel" onPress={() => setAsking(null)} />
      </Sheet>
    );
  }
  return (
    <Sheet open={open} close={close}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 }}>
        {CHAT_EMOJI.map((e) => {
          const on = !!me && !!m.reactions?.[e]?.includes(me);
          return (
            <Pressable key={e} onPress={done(() => onReact(e))} accessibilityRole="button" accessibilityLabel={`React ${e}`} accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: on ? color.lineStrong : color.line, backgroundColor: pressed || on ? color.picked : color.fill })}>
              <T style={{ fontSize: 21, lineHeight: 26 }}>{e}</T>
            </Pressable>
          );
        })}
      </View>
      {onThread && <SheetRow label="Reply in thread" onPress={done(onThread)} />}
      {mine ? <>
        <SheetRow label="Edit" onPress={done(onEdit)} />
        <SheetRow label="Delete" onPress={() => setAsking('delete')} />
      </> : <>
        <SheetRow label="Report message" onPress={done(onReport)} />
        {m.by && <SheetRow label={`Block ${who}`} onPress={() => setAsking('block')} />}
      </>}
    </Sheet>
  );
}

/** The rules, agreed once on this phone before the first chat opens (App Review 1.2). */
export function ChatRules({ onAgree }: { onAgree: () => void }) {
  const site = Constants.expoConfig?.extra?.cloud?.phoneSite?.replace(/\/+$/, '');
  return (
    <View style={{ paddingHorizontal: 32, gap: 14 }}>
      <T style={{ fontFamily: font.medium, fontSize: 18, lineHeight: 23 }}>Chat rules</T>
      <T style={{ fontSize: 15, lineHeight: 22, color: color.dim }}>Nothing abusive, hateful, threatening or explicit. Hold any message to report it or block the person who wrote it. We read reports within 24 hours and remove what breaks the rules, and whoever posted it.</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 4 }}>
        <Pressable onPress={onAgree} accessibilityRole="button"
          style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : color.fill })}>
          <T style={{ fontFamily: font.semibold, fontSize: 14.5 }}>I agree</T>
        </Pressable>
        {site ? <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${site}/terms`)} accessibilityRole="link" hitSlop={8}>
          <T style={{ fontSize: 14, color: color.dim, textDecorationLine: 'underline' }}>Terms</T>
        </Pressable> : null}
      </View>
    </View>
  );
}

/** A chat with one teammate, or a group of several, as on the desktop: only ever people on your team. */
export function NewChatSheet({ open, close, mates, start }: { open: boolean; close: () => void; mates: { id: string; name: string }[]; start: (people: string[], name: string) => Promise<string | null> }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => { if (!open) { setPicked([]); setName(''); setWhy(null); } }, [open]);
  const go = async () => {
    setBusy(true); setWhy(null);
    const err = await start(picked, name);
    setBusy(false);
    if (err) setWhy(err); else close();
  };
  return (
    <Sheet open={open} close={close}>
      <SheetHead>New chat</SheetHead>
      {mates.length === 0 && <T style={{ paddingHorizontal: 14, paddingBottom: 12, fontSize: 14, lineHeight: 20, color: color.dim }}>Nobody else is on your team yet.</T>}
      {mates.map((p) => {
        const on = picked.includes(p.id);
        return <SheetRow key={p.id} label={p.name} on={on} lead={<Face name={p.name} size={26} />} aside={on ? '✓' : undefined}
          onPress={() => setPicked((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))} />;
      })}
      {picked.length > 1 && (
        <TextInput value={name} onChangeText={setName} placeholder="Name the group" placeholderTextColor={color.faint} maxLength={80}
          style={[{ marginHorizontal: 14, marginTop: 8, height: 42, paddingHorizontal: 12, borderWidth: 1, borderRadius: corner.small, borderColor: color.line, backgroundColor: color.field, fontFamily: font.regular, fontSize: 15.5, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      )}
      {why && <T style={{ paddingHorizontal: 14, paddingTop: 8, fontSize: 13, color: color.dim }}>{why}</T>}
      {picked.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
          <Pressable onPress={() => void go()} disabled={busy} accessibilityRole="button"
            style={({ pressed }) => ({ height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : color.fill, opacity: busy ? 0.6 : 1 })}>
            <T style={{ fontFamily: font.semibold, fontSize: 15 }}>{busy ? 'Starting…' : picked.length === 1 ? 'Start chat' : 'Start group'}</T>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

function ChatRulesPage({ back, tabs, agree }: { back?: ReactNode; tabs?: ReactNode; agree: () => void }) {
  return <>
    <TopBar left={back} title="Groups" below={tabs} />
    <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}><ChatRules onAgree={agree} /></View>
  </>;
}

/** `tabs` are the inbox's tabs, drawn under the bar as the inbox draws them; opened from Chats, `onBack` goes back to it instead. */
export function GroupsPlace({ tabs, onBack }: { tabs?: ReactNode; onBack?: () => void } = {}) {
  const c = useCloud();
  const g = useGroups();
  const rooms = g.state.rooms;
  const room = groupToOpen(rooms, g.last);
  const [sheet, setSheet] = useState<'groups' | 'people' | 'new' | 'attach' | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const draftKey = chatDraftKey(room?.id ?? '', thread);
  const [text, setShown] = useState(() => chatDraft(draftKey));
  const [files, setFilesShown] = useState<Picked[]>(() => chatFiles(draftKey));
  useEffect(() => { setShown(chatDraft(draftKey)); setFilesShown(chatFiles(draftKey)); }, [draftKey]);
  const setText = (t: string) => { setShown(t); keepChatDraft(draftKey, t); };
  const setFiles = (next: (f: Picked[]) => Picked[]) => {
    const kept = next(chatFiles(draftKey));
    keepChatFiles(draftKey, kept);
    setFilesShown(kept);
  };
  const [failed, setFailed] = useState<string | null>(null);
  const [acting, setActing] = useState<RoomMessage | null>(null);
  const [editing, setEditing] = useState<RoomMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [earlier, setEarlier] = useState<'idle' | 'busy' | 'none'>('idle');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const inset = useSafeAreaInsets();

  useEffect(() => { g.setWatching(true); return () => g.setWatching(false); }, [g.setWatching]);
  useEffect(() => { if (room && room.id !== g.last) g.setLast(room.id); }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setThread(null); setFailed(null); setEditing(null); setEarlier('idle'); }, [room?.id]);
  // Where you had read to when the group opened, so the New line stays put while you read.
  const [readFrom, setReadFrom] = useState<{ id: string; at: number } | null>(null);
  useEffect(() => { if (room && readFrom?.id !== room.id) setReadFrom({ id: room.id, at: room.readAt ?? 0 }); }, [room?.id, room?.readAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read once the chat has been in front for a moment, not on the way past.
  const unread = room?.unread ?? 0;
  useEffect(() => {
    if (!room || unread === 0) return;
    const t = setTimeout(() => { if (AppState.currentState === 'active') g.markRead(room.id); }, READ_AFTER_MS);
    return () => clearTimeout(t);
  }, [room?.id, unread, g.markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const held = room ? g.state.messages[room.id] ?? [] : [];
  const messages = useMemo(() => shownMessages(held, { blocked: g.blocked, reported: g.reported, me: g.meId }), [held, g.blocked, g.reported, g.meId]);
  const people = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of room?.people ?? []) out.set(p.id, p.name);
    for (const w of room?.wall ?? []) out.set(w.id, w.name);
    return out;
  }, [room]);
  const nameOf = (id: string | null) => (id && id === g.meId ? 'You' : (id && people.get(id)) || 'Someone');
  const faceOf = (id: string | null) => (id && people.get(id)) || nameOf(id);
  const names = [...people.values()].filter(Boolean);

  const back = onBack ? <IconButton label="Back to Chats" onPress={onBack}><Back size={18} /></IconButton> : undefined;
  const startChat = async (picked: string[], name: string) => {
    const out = await g.act('create', { people: picked, name: filtered(name), kind: 'group' });
    if (!out.error && typeof out.value === 'string') g.setLast(out.value);
    return out.error;
  };
  const newChat = <NewChatSheet open={sheet === 'new'} close={() => setSheet(null)} mates={g.mates} start={startChat} />;
  if (!g.agreed) return <ChatRulesPage back={back} tabs={tabs} agree={g.agree} />;
  if (!g.state.ready) {
    return <>
      <TopBar left={back} title="Groups" below={tabs} />
      <View style={{ flex: 1 }}>{g.state.error && <T style={{ padding: size.inset, fontSize: 14, color: color.dim }}>{g.state.error}</T>}</View>
    </>;
  }
  if (!room) {
    return <>
      <TopBar left={back} title="Groups" below={tabs} />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 }}>
        <T style={{ fontFamily: font.medium, fontSize: 18, lineHeight: 23, marginBottom: 16 }}>You are not in any groups yet.</T>
        <Pressable onPress={() => setSheet('new')} accessibilityRole="button"
          style={({ pressed }) => ({ alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : color.fill })}>
          <T style={{ fontFamily: font.semibold, fontSize: 14.5 }}>New chat</T>
        </Pressable>
      </View>
      {newChat}
    </>;
  }

  const root = thread ? messages.find((m) => m.id === thread) ?? null : null;
  const shown = root ? [root, ...repliesTo(messages, root.id)] : chatRoots(messages);
  const newAt = root ? null : newLineAt(messages, readFrom?.id === room.id ? readFrom.at : room.readAt, g.meId);

  const mentionList = (body: string) => mentionsIn(body, [...people].map(([id, name]) => ({ id, name })));
  const send = async () => {
    const typed = text;
    const words = filtered(text.trim());
    if ((!words && !files.length) || sending) return;
    setFailed(null);
    if (editing) {
      const out = await g.act('edit', room.id, editing.id, words, { mentions: mentionList(words) });
      if (out.error) { setFailed(out.error); return; }
      setEditing(null); setShown(chatDraft(draftKey)); setFilesShown(chatFiles(draftKey));
      return;
    }
    setSending(true);
    const sent = files.length ? await g.sendFiles(room.id, files) : { links: [], error: null };
    if (sent.error) { setSending(false); setFailed(sent.error); return; }
    const body = [words, ...sent.links].filter(Boolean).join(words && sent.links.length ? '\n\n' : '\n');
    setText(''); setFiles(() => []);
    const why = await g.send(room.id, body, root?.id ?? null, mentionList(words));
    setSending(false);
    if (why) { setText(typed); setFailed(why); }
  };
  const react = (m: RoomMessage, emoji: string, on: boolean) => { void g.act('react', room.id, m.id, emoji, on).then((o) => { if (o.error) c.say(o.error); }); };
  const reactOnce = (m: RoomMessage, emoji: string) => react(m, emoji, !(g.meId && m.reactions?.[emoji]?.includes(g.meId)));
  const report = (m: RoomMessage) => {
    const about = reportAboutMessage({ message: m, roomName: groupName(room), byName: nameOf(m.by) });
    router.push({ pathname: '/settings/feedback', params: { report: about.ref, title: about.title, answer: about.answer ?? '', kind: 'message' } });
  };
  const block = (m: RoomMessage) => {
    if (!m.by) return;
    g.block(m.by, true);
    void c.sendFeedback(`Blocked in a chat: ${nameOf(m.by)} (${m.by}) in ${groupName(room)} (${room.id}), from message ${m.id}.`, []).catch(() => {});
    c.say(`${nameOf(m.by)} is blocked on this phone.`);
  };
  const showEarlier = async () => {
    setEarlier('busy');
    const out = await g.act('older', room.id);
    setEarlier(out.error || out.value === 0 ? 'none' : 'idle');
  };
  const canWrite = !!text.trim() || files.length > 0;

  const title = (
    <Pressable onPress={() => setSheet('groups')} accessibilityRole="button" accessibilityLabel="Switch group" hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%' }}>
      <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium, fontSize: 19, lineHeight: 23, letterSpacing: -0.19 }}>{root ? 'Thread' : groupName(room)}</T>
      {!root && <Caret size={13} tint={color.dim} />}
      {!root && g.unread - (room.unread > 0 ? 1 : 0) > 0 && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />}
    </Pressable>
  );

  return (
    <>
      <TopBar left={root ? <IconButton label="Back to the chat" onPress={() => setThread(null)}><Back size={18} /></IconButton> : back} title={title}
        right={<IconButton label="People" onPress={() => setSheet('people')}><PeopleGlyph /></IconButton>} below={root ? undefined : tabs} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: size.inset, paddingBottom: 16 }} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {!root && held.length >= 200 && earlier !== 'none' && (
            <Pressable onPress={() => void showEarlier()} disabled={earlier === 'busy'} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', paddingTop: 16 }}>
              <T style={{ fontSize: 13, color: color.dim, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{earlier === 'busy' ? 'Loading…' : 'Show earlier messages'}</T>
            </Pressable>
          )}
          {shown.length === 0 && <T style={{ paddingTop: 24, fontSize: 14.5, lineHeight: 21, color: color.faint }}>Nothing said here yet.</T>}
          {shown.map((m, i) => {
            const day = i === 0 || new Date(shown[i - 1].at).toDateString() !== new Date(m.at).toDateString();
            const isNew = m.id === newAt;
            return (
              <View key={m.id}>
                {isNew ? <Rule label="New" accent /> : day && !root ? <Rule label={dayWords(m.at, c.now)} /> : null}
                <Message m={m} roomId={room.id} run={startsRun(shown, i) || isNew || (!!root && i === 1)} nameOf={nameOf} faceOf={faceOf} names={names}
                  replies={root ? 0 : repliesTo(messages, m.id).length} onThread={root ? undefined : () => setThread(m.id)} onPress={() => setActing(m)}
                  me={g.meId} onReact={(emoji, on) => react(m, emoji, on)} />
              </View>
            );
          })}
        </ScrollView>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 + footRoom(inset) }}>
          {failed && <T style={{ fontSize: 13, color: color.dim, paddingHorizontal: 4, paddingBottom: 6 }}>{failed}</T>}
          {editing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 }}>
              <T style={{ flex: 1, fontSize: 13, color: color.dim }}>Editing your message</T>
              <Pressable onPress={() => { setEditing(null); setShown(chatDraft(draftKey)); setFilesShown(chatFiles(draftKey)); setFailed(null); }} accessibilityRole="button" hitSlop={8}><T style={{ fontSize: 13, color: color.dim, textDecorationLine: 'underline' }}>Cancel</T></Pressable>
            </View>
          )}
          {files.length > 0 && <View style={{ paddingBottom: 8 }}><Attached files={files} drop={(i) => setFiles((f) => f.filter((_, n) => n !== i))} /></View>}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: corner.small, borderColor: canWrite ? color.lineStrong : color.line, backgroundColor: color.field }}>
            {!editing && <IconButton label="Attach a photo or file" onPress={() => setSheet('attach')}><Clip size={17} /></IconButton>}
            <TextInput value={text} onChangeText={editing ? setShown : setText} multiline {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})} placeholder={root ? replyBoxWords(root, g.meId, nameOf) : `Message ${groupName(room)}`} placeholderTextColor={color.faint}
              style={[{ flex: 1, minHeight: 42, maxHeight: 140, paddingTop: 10, paddingBottom: 10, paddingLeft: editing ? 14 : 2, paddingRight: 14, fontFamily: font.regular, fontSize: 15.5, lineHeight: 22, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
            {canWrite && <IconButton label={editing ? 'Save' : 'Send'} onPress={() => void send()}><SendGlyph tint={sending ? color.faint : color.accent} /></IconButton>}
          </View>
        </View>
      </KeyboardAvoidingView>
      <Switcher rooms={rooms} current={room.id} open={sheet === 'groups'} close={() => setSheet(null)} pick={g.setLast} now={c.now} onNew={() => setSheet('new')} />
      <PeopleSheet room={room} open={sheet === 'people'} close={() => setSheet(null)} blocked={g.blocked} unblock={(id) => g.block(id, false)} />
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => setFiles((f) => withPicked(f, more))} fail={setFailed} />
      <MessageSheet m={acting} me={g.meId} who={acting ? nameOf(acting.by) : ''} open={!!acting} close={() => setActing(null)}
        onReact={(e) => acting && reactOnce(acting, e)} onThread={root || !acting ? undefined : () => setThread(acting.id)}
        onEdit={() => { if (acting) { setEditing(acting); setShown(acting.body); setFilesShown([]); } }}
        onDelete={() => { if (acting) void g.act('deleteMessage', room.id, acting.id).then((o) => { if (o.error) c.say(o.error); }); }}
        onReport={() => acting && report(acting)} onBlock={() => acting && block(acting)} />
      {newChat}
    </>
  );
}
