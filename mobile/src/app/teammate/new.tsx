// A new AI teammate, as the desktop's New teammate page asks for one
// (renderer/src/teammates/TeammatesPage.tsx `NewTeammate`): its greeting with
// the starters to tap, or your own words, and the project it works in. Your
// computer makes it, and it sets itself up by asking you in its chat.
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { splitSlug } from '../../../../renderer/src/phone-rows';
import { GREETING, starterAsks } from '../../../../shared/teammates.mjs';
import { dayOf } from '../../../../renderer/src/teammates/chat-lines';
import { projectNow } from '../../lib/compose';
import { screenGate } from '../../lib/thread-gate';
import { appStore } from '../../platform/persist';
import { useCloud } from '../../state/cloud';
import { Back } from '../../ui/icons';
import { IconButton, Pickable, Sheet, SheetHead, SheetRow, T, TopBar, Wall } from '../../ui/parts';
import { Chips, DayRule, MateComposer, TeammateMark } from '../../ui/Teammates';
import { color, font, size } from '../../ui/theme';

const message = (err: unknown) => String((err as Error)?.message ?? err);

export default function NewTeammate() {
  const c = useCloud();
  const gate = screenGate(c);
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;

  const team = c.team;
  // A teammate works on the computer that keeps your teammates, in one of its projects.
  const projects = team ? c.view.products.filter((p) => splitSlug(p.slug)?.device === team.device) : [];
  const product = projects.find((p) => p.slug === picked)?.slug ?? projectNow(projects, null, appStore) ?? projects[0]?.slug ?? null;
  const where = projects.find((p) => p.slug === product) ?? null;
  const asks = starterAsks(team?.view.list ?? []);

  const make = async (value: { starter?: string; text?: string }) => {
    const project = where ? splitSlug(where.slug)?.project : null;
    if (busy || !project) return false;
    setBusy(true); setError(null);
    try {
      await c.askTeammate('describe', { ...value, product: project });
      c.say('Your new teammate is on its way. It asks you what it needs in Chats.');
      back();
      return true;
    } catch (err) { setError(message(err)); return false; } finally { setBusy(false); }
  };

  return (
    <Wall>
      <TopBar left={<IconButton label="Back" onPress={back}><Back size={18} /></IconButton>} title="New teammate" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: size.inset, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <DayRule label={dayOf(c.now, c.now)} />
          <View style={{ flexDirection: 'row', gap: 12, paddingTop: 16 }}>
            <TeammateMark t={null} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontFamily: font.semibold, fontSize: 14.5, lineHeight: 20, marginBottom: 2 }}>New teammate</T>
              <T style={{ fontSize: 15.5, lineHeight: 22.5 }}>{GREETING}</T>
              {asks.length > 0 && <Chips options={asks.map((a) => a.ask)} on={null} disabled={busy || !where} tap={(o) => void make({ starter: asks.find((a) => a.ask === o)!.starter })} />}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, paddingLeft: 44 }}>
            <T style={{ fontSize: 14, color: color.faint }}>Works in</T>
            {projects.length > 1
              ? <Pickable style={{ fontSize: 14, color: color.dim }} onPress={() => setSheet(true)}>{where?.name ?? 'Pick a project'}</Pickable>
              : <T style={{ fontSize: 14, color: color.dim }}>{where?.name ?? 'No project on your phone yet'}</T>}
          </View>
          {!team && <T style={{ marginTop: 18, fontSize: 14, lineHeight: 21, color: color.dim }}>Your computer has not sent your teammates yet. Turn on AI teammates there, in Settings, Alpha features.</T>}
          {error && <T style={{ marginTop: 14, fontSize: 13, color: color.dim }}>{error}</T>}
        </ScrollView>
        <MateComposer placeholder="Answer your new teammate" send={(text) => make({ text })} />
      </KeyboardAvoidingView>
      <Sheet open={sheet} close={() => setSheet(false)}>
        <SheetHead>Works in</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} on={p.slug === product} onPress={() => { setPicked(p.slug); setSheet(false); }} />)}
      </Sheet>
    </Wall>
  );
}
