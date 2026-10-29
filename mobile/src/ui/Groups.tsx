// The Groups tab: the group open last, its chat filling the page with faces
// beside the words and a box to type in at the foot. Its name over the chat
// switches group; People sits at the bar's right. A reply opens its thread,
// as on the desktop (renderer/src/team/rooms/RoomChat.tsx).
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Room, RoomMessage } from '../../../renderer/src/types';
import { Name } from '../../../shared/product-name.mjs';
import { cardName, clockOf, initialsOf, markMentions, mentionsIn } from '../../../renderer/src/team/rooms/room-rules';
import { newLineAt, READ_AFTER_MS } from '../../../renderer/src/team/rooms/room-chat-rules';
import { updatedWords } from '../../../renderer/src/threads/page-rules';
import { chatRoots, dayWords, groupName, groupsInOrder, groupToOpen, onWords, peopleInOrder, repliesTo, startsRun } from '../lib/groups';
import { useCloud } from '../state/cloud';
import { useGroups } from '../state/groups';
import { Back, Caret } from './icons';
import { IconButton, RunningMark, Sheet, SheetHead, SheetRow, T, TopBar } from './parts';
import { color, font, size } from './theme';

/** A square face: the photo, or two letters in mono on one grey tile for everyone (RoomFace.tsx). */
export function Face({ name, size: s }: { name: string; size: number }) {
  return (
    <View style={{ width: s, height: s, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.film, alignItems: 'center', justifyContent: 'center' }}>
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

function Body({ text, names }: { text: string; names: string[] }) {
  return (
    <T style={{ fontSize: 15.5, lineHeight: 22.5 }}>
      {markMentions(text, names).map((p, i) => (p.mention ? <T key={i} style={{ fontSize: 15.5, lineHeight: 22.5, color: color.accent }}>{p.text}</T> : p.text))}
    </T>
  );
}

function Message({ m, run, nameOf, faceOf, names, replies, onThread }: {
  m: RoomMessage; run: boolean; nameOf: (id: string | null) => string; faceOf: (id: string | null) => string; names: string[]; replies: number; onThread?: () => void;
}) {
  const who = nameOf(m.by);
  return (
    <Pressable onLongPress={onThread} delayLongPress={350} style={{ flexDirection: 'row', gap: 12, paddingTop: run ? 14 : 3 }}>
      {/* Your own face carries your initials, as People draws it, not the word "You". */}
      <View style={{ width: 32 }}>{run && <Face name={faceOf(m.by)} size={32} />}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {run && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 1 }}>
            <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium, fontSize: 14.5, lineHeight: 20 }}>{who}</T>
            <T style={{ fontSize: 12, color: color.faint }}>{clockOf(m.at)}</T>
          </View>
        )}
        {m.deleted ? <T style={{ fontSize: 14.5, lineHeight: 22, color: color.faint }}>This message was deleted.</T> : <Body text={m.body} names={names} />}
        {replies > 0 && onThread && (
          <Pressable onPress={onThread} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <T style={{ fontSize: 13, color: color.dim, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{replies} {replies === 1 ? 'reply' : 'replies'}</T>
          </Pressable>
        )}
      </View>
    </Pressable>
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

function PeopleSheet({ room, open, close }: { room: Room; open: boolean; close: () => void }) {
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
              {c.level != null && <T style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>{c.level}</T>}
            </View>
            <T numberOfLines={1} style={{ fontSize: 13, lineHeight: 19, color: c.agents ? color.dim : color.faint }}>{onWords(c)}</T>
          </View>
          {c.agents ? (
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

function Switcher({ rooms, current, open, close, pick, now }: { rooms: Room[]; current: string; open: boolean; close: () => void; pick: (id: string) => void; now: number }) {
  return (
    <Sheet open={open} close={close}>
      <SheetHead>Groups</SheetHead>
      {groupsInOrder(rooms).map((r) => (
        <SheetRow key={r.id} label={groupName(r)} on={r.id === current} lead={<GroupMark room={r} />}
          aside={r.unread > 0 && r.id !== current ? 'New' : updatedWords(r.lastAt, now)} onPress={() => { pick(r.id); close(); }} />
      ))}
    </Sheet>
  );
}

/** `tabs` are the inbox's tabs, drawn under the bar as the inbox draws them. */
export function GroupsPlace({ tabs }: { tabs?: ReactNode } = {}) {
  const c = useCloud();
  const g = useGroups();
  const rooms = g.state.rooms;
  const room = groupToOpen(rooms, g.last);
  const [sheet, setSheet] = useState<'groups' | 'people' | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => { g.setWatching(true); return () => g.setWatching(false); }, [g.setWatching]);
  useEffect(() => { if (room && room.id !== g.last) g.setLast(room.id); }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setThread(null); setFailed(null); }, [room?.id]);
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

  const messages = room ? g.state.messages[room.id] ?? [] : [];
  const people = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of room?.people ?? []) out.set(p.id, p.name);
    for (const w of room?.wall ?? []) out.set(w.id, w.name);
    return out;
  }, [room]);
  const nameOf = (id: string | null) => (id && id === g.meId ? 'You' : (id && people.get(id)) || 'Someone');
  const faceOf = (id: string | null) => (id && people.get(id)) || nameOf(id);
  const names = [...people.values()].filter(Boolean);

  if (!g.state.ready) {
    return <>
      <TopBar title="Groups" below={tabs} />
      <View style={{ flex: 1 }}>{g.state.error && <T style={{ padding: size.inset, fontSize: 14, color: color.dim }}>{g.state.error}</T>}</View>
    </>;
  }
  if (!room) {
    return <>
      <TopBar title="Groups" below={tabs} />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 }}>
        <T style={{ fontFamily: font.medium, fontSize: 18, lineHeight: 23, marginBottom: 8 }}>You are not in any groups yet.</T>
        <T style={{ fontSize: 14, lineHeight: 21, color: color.dim }}>{`Start one or find one to join in ${Name} on your computer. It shows up here.`}</T>
      </View>
    </>;
  }

  const root = thread ? messages.find((m) => m.id === thread) ?? null : null;
  const shown = root ? [root, ...repliesTo(messages, root.id)] : chatRoots(messages);
  const newAt = root ? null : newLineAt(messages, readFrom?.id === room.id ? readFrom.at : room.readAt, g.meId);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    setFailed(null);
    const why = await g.send(room.id, body, root?.id ?? null, mentionsIn(body, [...people].map(([id, name]) => ({ id, name }))));
    if (why) { setText(body); setFailed(why); }
  };

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
      <TopBar left={root ? <IconButton label="Back to the chat" onPress={() => setThread(null)}><Back size={18} /></IconButton> : undefined} title={title}
        right={<IconButton label="People" onPress={() => setSheet('people')}><PeopleGlyph /></IconButton>} below={root ? undefined : tabs} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: size.inset, paddingBottom: 16 }} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {shown.length === 0 && <T style={{ paddingTop: 24, fontSize: 14.5, lineHeight: 21, color: color.faint }}>Nothing said here yet.</T>}
          {shown.map((m, i) => {
            const day = i === 0 || new Date(shown[i - 1].at).toDateString() !== new Date(m.at).toDateString();
            const isNew = m.id === newAt;
            return (
              <View key={m.id}>
                {isNew ? <Rule label="New" accent /> : day && !root ? <Rule label={dayWords(m.at, c.now)} /> : null}
                <Message m={m} run={startsRun(shown, i) || isNew || (!!root && i === 1)} nameOf={nameOf} faceOf={faceOf} names={names}
                  replies={root ? 0 : repliesTo(messages, m.id).length} onThread={root ? undefined : () => setThread(m.id)} />
              </View>
            );
          })}
        </ScrollView>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
          {failed && <T style={{ fontSize: 13, color: color.dim, paddingHorizontal: 4, paddingBottom: 6 }}>{failed}</T>}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderColor: text ? color.lineStrong : color.line, backgroundColor: color.field }}>
            <TextInput value={text} onChangeText={setText} multiline placeholder={root ? 'Reply in thread' : `Message ${groupName(room)}`} placeholderTextColor={color.faint}
              style={[{ flex: 1, minHeight: 42, maxHeight: 140, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 15.5, lineHeight: 22, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
            {!!text.trim() && <IconButton label="Send" onPress={() => void send()}><SendGlyph tint={color.accent} /></IconButton>}
          </View>
        </View>
      </KeyboardAvoidingView>
      <Switcher rooms={rooms} current={room.id} open={sheet === 'groups'} close={() => setSheet(null)} pick={g.setLast} now={c.now} />
      <PeopleSheet room={room} open={sheet === 'people'} close={() => setSheet(null)} />
    </>
  );
}
