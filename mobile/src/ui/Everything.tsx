// Everything else, as the phone layout draws it (team/everything/TeamStrip.tsx,
// everything.css, phone.css): your team as cards, the bar over whichever is lit,
// and its work under them. New teammate is the last card.
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { readTeam } from '../../../renderer/src/phone-team';
import { cardOpens } from '../../../renderer/src/team/everything/whose-board';
import { updatedWords } from '../../../renderer/src/threads/page-rules';
import type { ThreadCard } from '../../../renderer/src/types';
import { cardsDrawn, cardsShown, CARDS_PER_ROW, mateRunsOf, personCardsOf, phoneMembers, teamRunsOf, THREAD_CARDS_SELECT, threadCardOf, type Member } from '../lib/everything';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { useGroups } from '../state/groups';
import { Face } from './Groups';
import { Cross } from './icons';
import { IconButton, Sheet, T } from './parts';
import { LiveMark } from './ThreadParts';
import { TeammateMark } from './Teammates';
import { color, font, size } from './theme';

const message = (err: unknown) => String((err as Error)?.message ?? err);
const CARDS_EVERY_MS = 30_000;

/** A person's initials, an AI teammate's dashed letter, a chat's faces. */
function MemberFace({ m, s }: { m: Member; s: number }) {
  if (m.kind === 'mate') return <TeammateMark t={{ letter: m.letter ?? '', name: m.name }} size={s} />;
  if (m.kind === 'chat') {
    const faces = m.faces ?? [];
    if (!faces.length) return <View style={{ width: s, height: s, borderWidth: 1, borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontFamily: font.mono, fontSize: Math.round(s * 0.3), color: color.dim }}>#</T></View>;
    if (faces.length === 1) return <Face name={faces[0].name} size={s} />;
    const side = Math.round(s * 0.6);
    return (
      <View style={{ width: s, height: s }}>
        <Face name={faces[0].name} size={side} />
        <View style={{ position: 'absolute', right: 0, bottom: 0 }}><Face name={faces[1].name} size={side} /></View>
      </View>
    );
  }
  return <Face name={m.faceName || m.name} size={s} />;
}

const agentsShort = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`;
const small = () => ({ fontFamily: font.mono, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.735, textTransform: 'uppercase' as const, color: color.faint });

function Card({ m, on, pick }: { m: Member; on: boolean; pick: () => void }) {
  const chat = m.kind === 'chat' && !(m.team && m.agents != null);
  return (
    <Pressable onPress={pick} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={m.name}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 14, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 13, borderWidth: 1,
        borderColor: on ? color.faint : chat ? color.lineStrong : color.line, backgroundColor: on || pressed ? color.picked : chat ? 'transparent' : color.fill })}>
      <MemberFace m={m} s={44} />
      <View style={{ gap: 5, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 19 }}>{m.name}</T>
          {m.level != null && <T style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>{m.level}</T>}
        </View>
        {chat ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {m.unread && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.dim }} />}
            <T numberOfLines={1} style={small()}>{m.unread ? 'New messages' : 'Chat'}</T>
          </View>
        ) : m.agents == null ? <T style={small()}> </T> : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <LiveMark still={!m.agents && !m.starting} />
            <T numberOfLines={1} style={small()}>{m.agents ? agentsShort(m.agents) : m.starting ? 'Starting' : 'Not running'}</T>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function AddCard() {
  return (
    <Pressable onPress={() => router.push('/teammate/new')} accessibilityRole="button" accessibilityLabel="New teammate"
      style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 14, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: color.line, backgroundColor: pressed ? color.picked : 'transparent' })}>
      <TeammateMark t={null} size={44} />
      <View style={{ gap: 5 }}>
        <T numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>New teammate</T>
        <T numberOfLines={1} style={small()}>AI teammate</T>
      </View>
    </Pressable>
  );
}

const Bubble = () => (
  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color.dim} strokeWidth={1.6} strokeLinejoin="round"><Path d="M4 5h16v11H9l-5 4z" /></Svg>
);

/** Over the open card's space: whose it is, how many agents, and its chat. */
function Bar({ m, onMessage, tabs }: { m: Member; onMessage?: () => void; tabs?: ReactNode }) {
  return (
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginHorizontal: size.inset, borderBottomWidth: 1, borderBottomColor: color.line }}>
      <MemberFace m={m} s={22} />
      <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>{m.kind === 'me' ? 'Your threads' : m.name}</T>
      {tabs}
      <View style={{ flex: 1 }} />
      {m.kind !== 'me' && m.agents != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LiveMark still={!m.agents && !m.starting} />
          <T style={{ fontSize: 13, color: color.dim }}>{m.agents ? agentsShort(m.agents) : m.starting ? 'Starting' : 'Not running'}</T>
        </View>
      )}
      {onMessage && (
        <Pressable onPress={onMessage} accessibilityRole="button" style={({ pressed }) => ({ height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 11, marginLeft: 4, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent' })}>
          <Bubble />
          <T style={{ fontSize: 13, color: color.dim }}>Message</T>
        </Pressable>
      )}
    </View>
  );
}

const Empty = ({ children }: { children: string }) => <T style={{ marginTop: 22, marginHorizontal: size.inset, fontSize: 14, lineHeight: 20, color: color.faint }}>{children}</T>;
const STATE_WORD: Record<string, string> = { running: 'Working', waiting: 'Waiting', scheduled: 'Later', done: 'Done' };

/** A teammate's shared thread, as a row. It is theirs, so it opens as what they share of it. */
function CardRow({ card, who, first, now, open }: { card: ThreadCard; who?: string; first: boolean; now: number; open: () => void }) {
  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 64, paddingVertical: 14, paddingLeft: size.inset, paddingRight: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {who && <Face name={who} size={20} />}
        <T numberOfLines={2} style={{ flexShrink: 1, fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>{card.title ?? 'A thread'}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <T style={{ fontSize: 11, lineHeight: 20, color: color.dim }}>{STATE_WORD[card.state] ?? card.state}</T>
        {!!card.project && <><T style={{ fontSize: 11, color: color.faint }}>·</T><T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.mono, fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim }}>{card.project}</T></>}
        <T style={{ fontSize: 11, color: color.faint }}>·</T>
        <T style={{ fontSize: 11, lineHeight: 20, color: color.faint }}>{updatedWords(card.updatedAt, now)}</T>
      </View>
    </Pressable>
  );
}

function CardSheet({ card, who, close }: { card: ThreadCard | null; who: string; close: () => void }) {
  return (
    <Sheet open={!!card} close={close}>
      {card && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 6, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <T selectable style={{ flex: 1, fontFamily: font.medium, fontSize: 17, lineHeight: 23 }}>{card.title ?? 'A thread'}</T>
            <IconButton label="Close" width={32} onPress={close}><Cross size={16} /></IconButton>
          </View>
          <T style={{ fontSize: 13, color: color.faint }}>{[who, STATE_WORD[card.state] ?? card.state, card.project].filter(Boolean).join(' · ')}</T>
          {!!card.problem && <T selectable style={{ fontSize: 14, lineHeight: 21, color: color.dim }}>{card.problem}</T>}
          {!!card.progress && <T selectable style={{ fontSize: 14, lineHeight: 21, color: color.dim }}>{card.progress}</T>}
        </View>
      )}
    </Sheet>
  );
}

/** `mine` is your own work, drawn by the page; `row` draws one of your threads as the list does; `mineTabs` sit in your bar. */
export function EverythingPlace({ mine, mineTabs, row, openGroup }: {
  mine: ReactNode; mineTabs?: ReactNode; row: (item: any, first: boolean) => ReactNode; openGroup: (roomId: string) => void;
}) {
  const c = useCloud();
  const g = useGroups();
  const cloud = c.signedIn ? c.cloud : null;
  const meId = cloud?.session()?.user.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [cards, setCards] = useState<ThreadCard[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string | null; email?: string | null }[]>([]);
  const [open, setOpen] = useState<ThreadCard | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  useEffect(() => {
    if (!cloud) return undefined;
    const read = () => {
      cloud.select('thread_cards', THREAD_CARDS_SELECT).then((rows) => { setCards(rows.map(threadCardOf)); setTrouble(null); }, (err) => setTrouble(message(err)));
      readTeam(cloud).then((got) => setPeople(got.team?.people ?? []), () => { /* the team's group still names them */ });
    };
    read();
    const timer = setInterval(read, CARDS_EVERY_MS);
    return () => clearInterval(timer);
  }, [cloud]);
  const mates = c.team?.view.list;
  const members = useMemo(() => phoneMembers({
    meId, rooms: g.state.rooms, messages: g.state.messages as any, teamPeople: people, cards, mates: mates ?? [], items: c.view.items, running: c.view.running, store: appStore,
  }), [meId, g.state.rooms, g.state.messages, people, cards, mates, c.view.items, c.view.running]);
  const member = members.find((m) => m.key === picked) ?? members[0];
  const key = member?.key ?? 'me';
  const teamKey = members.find((m) => m.team)?.key ?? null;
  const nameOf = (personId: string) => members.find((m) => m.key === `person:${personId}`)?.name ?? 'Someone';
  const chatOf = (personId: string) => {
    const r = g.state.rooms.find((x) => x.kind === 'group' && x.wall.filter((w) => !w.me).length === 1 && x.wall.some((w) => w.id === personId));
    return r?.id ?? null;
  };
  const pick = (m: Member) => {
    const opens = cardOpens(m.key, { team: teamKey, shares: (id) => cards.some((x) => x.personId === id && x.visible) || !chatOf(id), hasChat: (id) => !!chatOf(id) });
    if (m.kind === 'chat' && !m.team) { openGroup(m.key.slice('room:'.length)); return; }
    if (m.kind === 'person' && opens === 'messages') { openGroup(chatOf(m.key.slice('person:'.length))!); return; }
    // "Show N more" is for finding someone, so it lasts until a card is picked (CardsArea.tsx).
    setMore(false);
    setPicked(m.key);
  };
  const dayStart = new Date(c.now).setHours(0, 0, 0, 0);
  // New teammate is the last card, while teammates are on.
  const slots = c.team ? [...members, { key: 'new' } as Member] : members;
  const drawn = cardsDrawn(slots, key, more);
  const { line } = cardsShown(slots.length, more);
  const chips: ReactNode[] = drawn.map((m) => (m.key === 'new' ? <AddCard key="new" /> : <Card key={m.key} m={m} on={m.key === key} pick={() => pick(m)} />));
  const rows: ReactNode[][] = [];
  for (let i = 0; i < chips.length; i += CARDS_PER_ROW) rows.push(chips.slice(i, i + CARDS_PER_ROW));

  const onMessage = !member || member.kind === 'me' ? undefined
    : member.kind === 'mate' ? () => router.push({ pathname: '/teammate/[id]', params: { id: member.key.slice('mate:'.length) } })
      : member.team ? () => openGroup(member.key.slice('room:'.length))
        : member.kind === 'person' && chatOf(member.key.slice('person:'.length)) ? () => openGroup(chatOf(member.key.slice('person:'.length))!)
          : undefined;

  let space: ReactNode = mine;
  if (member?.kind === 'mate') {
    const items = mateRunsOf(c.view.items as any[], member.key.slice('mate:'.length), dayStart);
    space = items.length ? <ScrollView style={{ flex: 1 }}>{items.map((i: any, n: number) => row(i, n === 0))}</ScrollView> : <Empty>Nothing on its plate. Message it to hand it something.</Empty>;
  } else if (member?.kind === 'person') {
    const id = member.key.slice('person:'.length);
    const theirs = personCardsOf(cards, id, dayStart);
    space = theirs.length
      ? <ScrollView style={{ flex: 1 }}>{theirs.map((x, n) => <CardRow key={x.threadId} card={x} first={n === 0} now={c.now} open={() => setOpen(x)} />)}</ScrollView>
      : <Empty>{`${member.name.split(' ')[0]} has no threads shared with the team right now.`}</Empty>;
  } else if (member?.team) {
    const runs = teamRunsOf(cards, c.view.items as any[], members.filter((m) => m.kind === 'person').map((m) => m.key.slice('person:'.length)), members.filter((m) => m.kind === 'mate').map((m) => m.key.slice('mate:'.length)), dayStart);
    space = runs.length
      ? <ScrollView style={{ flex: 1 }}>{runs.map((r: any, n: number) => (r.card
        ? <CardRow key={r.card.threadId} card={r.card} who={nameOf(r.card.personId)} first={n === 0} now={c.now} open={() => setOpen(r.card)} />
        : row(r.item, n === 0)))}</ScrollView>
      : <Empty>Nobody on the team is running anything they share right now.</Empty>;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 38, marginTop: 6, marginHorizontal: size.inset, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', color: color.dim }}>Team</T>
        <T style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>{members.length}</T>
      </View>
      <View style={{ paddingHorizontal: size.inset, gap: 10 }}>
        {rows.map((r, i) => <View key={i} style={{ flexDirection: 'row', gap: 10 }}>{r}{r.length < CARDS_PER_ROW && <View style={{ flex: 1 }} />}</View>)}
      </View>
      {line && (
        <Pressable onPress={() => setMore(!more)} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 10, marginLeft: size.inset }}>
          <T style={{ fontSize: 12.5, lineHeight: 18, color: color.faint }}>{line}</T>
        </Pressable>
      )}
      {member && <Bar m={member} onMessage={onMessage} tabs={member.kind === 'me' ? mineTabs : undefined} />}
      {trouble && <T style={{ marginTop: 8, marginHorizontal: size.inset, fontSize: 13, color: color.dim }}>{trouble}</T>}
      <View style={{ flex: 1, marginTop: 4 }}>{space}</View>
      <CardSheet card={open} who={open ? nameOf(open.personId) : ''} close={() => setOpen(null)} />
    </View>
  );
}
