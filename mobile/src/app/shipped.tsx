// What shipped this week, as the desktop's team list draws it (team/TeamLists.tsx
// `ShippedList`): each thread, whose it is, and the day. Reached from Search and
// the team's card in Everything else.
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { readTeam } from '../../../renderer/src/phone-team';
import type { ThreadCard } from '../../../renderer/src/types';
import { router } from '../lib/router';
import { phoneShipped, shippedCardOf, shippedCardsQuery, shippedName, shippedWords, type ShippedCardRow, type ShippedRow } from '../lib/shipped';
import { screenGate } from '../lib/thread-gate';
import { useCloud } from '../state/cloud';
import { CardSheet } from '../ui/Everything';
import { Back } from '../ui/icons';
import { Waiting } from '../ui/LogoOrbit';
import { IconButton, T, TopBar, Wall } from '../ui/parts';
import { color, size } from '../ui/theme';

const message = (err: unknown) => String((err as Error)?.message ?? err);

export default function Shipped() {
  const c = useCloud();
  const gate = screenGate(c);
  const cloud = c.signedIn ? c.cloud : null;
  const me = cloud?.session()?.user.id ?? null;
  const [cards, setCards] = useState<ThreadCard[] | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string | null; email?: string | null }[]>([]);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [open, setOpen] = useState<ThreadCard | null>(null);
  useEffect(() => {
    if (!cloud) return;
    cloud.select('thread_cards', shippedCardsQuery(Date.now())).then((rows) => { setCards((rows as ShippedCardRow[]).map(shippedCardOf)); setTrouble(null); }, (err) => setTrouble(message(err)));
    readTeam(cloud).then((got) => setPeople(got.team?.people ?? []), () => { /* a card still says Someone */ });
  }, [cloud]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;

  const rows = cards ? phoneShipped({ cards, me, now: c.now }) : [];
  // Your own opens as your thread when this phone has it; a teammate's as what they share of it.
  const openRow = (r: ShippedRow) => {
    const mine = r.ownerId === me ? c.view.items.find((i) => i.id === r.card?.threadId) : null;
    if (mine) router.push({ pathname: '/thread/[product]/[id]', params: { product: mine.product, id: mine.id } });
    else if (r.card) setOpen(r.card);
  };
  const small = { fontSize: 11, lineHeight: 20, color: color.faint };
  return (
    <Wall>
      <TopBar left={<IconButton label="Back" onPress={back}><Back size={18} /></IconButton>} title="Shipped this week" />
      {trouble && <T style={{ marginTop: 8, marginHorizontal: size.inset, fontSize: 13, color: color.dim }}>{trouble}</T>}
      {cards === null ? (trouble ? null : <Waiting list />) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item: r, index }) => (
            <Pressable onPress={() => openRow(r)} accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 64, paddingVertical: 14, paddingLeft: size.inset, paddingRight: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
              {index > 0 && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
              <T numberOfLines={2} style={{ fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>{r.title}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <T style={{ ...small, color: color.dim }}>{shippedName(r.ownerId, me, people)}</T>
                <T style={small}>·</T>
                <T style={small}>{shippedWords(r.at, c.now)}</T>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<T style={{ paddingHorizontal: size.inset, paddingTop: 28, fontSize: 15, lineHeight: 23, color: color.dim }}>Nothing has shipped this week.</T>}
        />
      )}
      <CardSheet card={open} who={open ? shippedName(open.personId, me, people) : ''} close={() => setOpen(null)} />
    </Wall>
  );
}
