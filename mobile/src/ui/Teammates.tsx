// Your AI teammates on the phone, drawn as the desktop's Chats draws them
// (renderer/src/teammates/ChatsColumn.tsx): the dashed letter, the primary
// first, a dot on the ones waiting on you, and your groups under them.
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Room, Teammate } from '../../../renderer/src/types';
import { updatedWords } from '../../../renderer/src/threads/page-rules';
import { groupName, groupsInOrder } from '../lib/groups';
import { asideOf, matesInOrder, nowLine, waitsOnYou } from '../lib/teammates';
import { useCloud } from '../state/cloud';
import { useGroups } from '../state/groups';
import { Face } from './Groups';
import { Gear } from './icons';
import { IconButton, T, TopBar } from './parts';
import { color, font, size } from './theme';

/** A teammate's mark: its letter in a dashed square, with a dot when it waits on you (TeammatesRail.tsx). */
export function TeammateMark({ t, size: s = 20, waiting = false }: { t: Pick<Teammate, 'letter' | 'name'> | null; size?: number; waiting?: boolean }) {
  return (
    <View style={{ width: s, height: s, borderWidth: 1, borderStyle: 'dashed', borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontFamily: font.mono, fontSize: Math.max(9.5, Math.round(s * 0.36 * 2) / 2), color: t ? color.dim : color.faint }}>{t ? t.letter || t.name.slice(0, 1) : '+'}</T>
      {waiting && <View style={{ position: 'absolute', top: -4, right: -4, width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent }} />}
    </View>
  );
}

/** Your own face in a chat: your initials as Groups knows your name, else a person drawn in the tile. */
export function YouFace({ size: s = 32 }: { size?: number }) {
  const g = useGroups();
  const name = g.state.rooms.flatMap((r) => r.wall).find((w) => w.me)?.name;
  if (name) return <Face name={name} size={s} />;
  return (
    <View style={{ width: s, height: s, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.film, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s * 0.5} height={s * 0.5} viewBox="0 0 24 24" fill="none" stroke={color.dim} strokeWidth={1.6} strokeLinecap="round"><Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><Path d="M4.5 20c.9-3.6 3.8-5.5 7.5-5.5s6.6 1.9 7.5 5.5" /></Svg>
    </View>
  );
}

/** Auto's mark in To: the agent's dashed square with a fork in it (AutoFace.tsx). */
export function AutoMark({ size: s = 20 }: { size?: number }) {
  return (
    <View style={{ width: s, height: s, borderWidth: 1, borderStyle: 'dashed', borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s * 0.62} height={s * 0.62} viewBox="0 0 24 24" fill="none" stroke={color.dim} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M5 12h6" /><Path d="M11 12c3 0 4-5 8-5" /><Path d="M11 12c3 0 4 5 8 5" /><Path d="M16 4.5 19 7l-3 2.5" /><Path d="M16 14.5 19 17l-3 2.5" />
      </Svg>
    </View>
  );
}

const Head = ({ title, count }: { title: string; count: number }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: size.inset, paddingTop: 18, paddingBottom: 4 }}>
    <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', color: color.faint }}>{title}</T>
    <T style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>{count}</T>
  </View>
);

function ChatRow({ lead, name, aside, line, need, first, onPress, label }: { lead: ReactNode; name: string; aside?: string; line?: string; need?: boolean; first: boolean; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ minHeight: 64, paddingVertical: 12, paddingLeft: size.inset, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>{name}</T>
          {aside ? <T style={{ fontSize: 12.5, color: color.faint }}>{aside}</T> : null}
        </View>
        {line ? <T numberOfLines={1} style={{ fontSize: 13, lineHeight: 19, color: color.dim, marginTop: 2 }}>{line}</T> : null}
      </View>
      {need && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent }} />}
    </Pressable>
  );
}

/** A day's label across the chat, a line either side (teammates.css `.rm-day`). */
export function DayRule({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 6 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
      <T style={{ fontSize: 12, color: color.faint }}>{label}</T>
      <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
    </View>
  );
}

/** Answers to tap under a question (`.tq-chip`); the picked one lit. */
export function Chips({ options, on, disabled, tap }: { options: string[]; on: string | null; disabled?: boolean; tap?: (o: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {options.map((o) => (
        <Pressable key={o} disabled={disabled || !tap} onPress={() => tap?.(o)} accessibilityRole="button" accessibilityState={{ selected: on === o }}
          style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, paddingVertical: 7, justifyContent: 'center', borderWidth: 1,
            borderColor: on === o ? color.accent : color.lineStrong, backgroundColor: on === o ? 'rgba(238, 96, 24, 0.12)' : pressed ? color.picked : color.fill })}>
          <T style={{ fontSize: 14, lineHeight: 19, color: on === o ? color.text : color.dim }}>{o}</T>
        </Pressable>
      ))}
    </View>
  );
}

const SendGlyph = ({ tint }: { tint: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 19V5" /><Path d="m6 11 6-6 6 6" /></Svg>
);

/** The chat box at the foot, the one Groups uses. `send` answers whether the words went. */
export function MateComposer({ placeholder, send, above }: { placeholder: string; send: (text: string) => Promise<boolean>; above?: ReactNode }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const words = text.trim();
    if (!words || busy) return;
    setBusy(true);
    const ok = await send(words);
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
      {above}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderColor: text ? color.lineStrong : color.line, backgroundColor: color.field }}>
        <TextInput value={text} onChangeText={setText} multiline placeholder={placeholder} placeholderTextColor={color.faint} editable={!busy}
          style={[{ flex: 1, minHeight: 42, maxHeight: 140, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 15.5, lineHeight: 22, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
        {!!text.trim() && <IconButton label="Send" onPress={() => void go()}><SendGlyph tint={color.accent} /></IconButton>}
      </View>
    </View>
  );
}

/** How many of your teammates wait on you, for the Chats tab's count. */
export function teammatesWaiting(c: ReturnType<typeof useCloud>): number {
  const team = c.team;
  return team ? team.view.list.filter((t) => waitsOnYou(t, team.view)).length : 0;
}

/** The Chats tab: your AI teammates, then your groups. `tabs` are the inbox's, drawn under the bar. */
export function ChatsPlace({ tabs, openGroup }: { tabs: ReactNode; openGroup: (id: string) => void }) {
  const c = useCloud();
  const g = useGroups();
  const team = c.team;
  const mates = team ? matesInOrder(team.view.list) : [];
  const rooms: Room[] = g.on ? groupsInOrder(g.state.rooms) : [];
  return (
    <>
      <TopBar title="Chats" right={<IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>} below={tabs} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {team && <Head title="AI teammates" count={mates.length} />}
        {mates.map((t, i) => (
          <ChatRow key={t.id} first={i === 0} lead={<TeammateMark t={t} size={32} />} name={t.name} aside={t.primary && !t.paused && t.status !== 'draft' ? 'Primary' : undefined}
            line={team ? nowLine(t, team.view, c.now) : undefined} need={!!team && waitsOnYou(t, team.view)} label={t.name}
            onPress={() => router.push({ pathname: '/teammate/[id]', params: { id: t.id } })} />
        ))}
        {team && <ChatRow first={mates.length === 0} lead={<TeammateMark t={null} size={32} />} name="New teammate" onPress={() => router.push('/teammate/new')} />}
        {!!team?.view.trouble && <T style={{ paddingHorizontal: size.inset, paddingTop: 10, fontSize: 13, lineHeight: 19, color: color.dim }}>{team.view.trouble}</T>}
        {g.on && (
          <>
            <Head title="Groups" count={rooms.length} />
            {rooms.length === 0 && <T style={{ paddingHorizontal: size.inset, paddingTop: 6, fontSize: 14, lineHeight: 21, color: color.faint }}>You are not in any groups yet.</T>}
            {rooms.map((r, i) => (
              <ChatRow key={r.id} first={i === 0} lead={r.kind === 'group' ? <Face name={groupName(r)} size={32} /> : <View style={{ width: 32, alignItems: 'center' }}><T style={{ fontFamily: font.mono, fontSize: 17, color: color.faint }}>#</T></View>}
                name={groupName(r)} line={r.unread > 0 ? 'New messages' : updatedWords(r.lastAt, c.now)} need={r.unread > 0} onPress={() => openGroup(r.id)} />
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}
