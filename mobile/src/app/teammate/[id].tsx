// Your chat with one AI teammate, as the desktop's teammate page draws it
// (renderer/src/teammates/TeammatesPage.tsx `ChatColumn`): what it said and
// did, its questions with answers to tap, the threads it sent you, and a box
// to write to it. What you send goes to your computer, which wakes it.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { answersMessage } from '../../../../renderer/src/teammates/chat-lines';
import type { TeamChatLine, TeamRunLine } from '../../../../renderer/src/types';
import { screenGate } from '../../lib/thread-gate';
import { actWords, asideOf, chatRows, clockOf, openQuestions, runningThread, type ChatRow, type PhoneTeam } from '../../lib/teammates';
import { useCloud } from '../../state/cloud';
import { Back, More } from '../../ui/icons';
import { Markdown } from '../../ui/Markdown';
import { IconButton, RunningMark, Sheet, SheetHead, T, TopBar, Wall } from '../../ui/parts';
import { Chips, DayRule, MateComposer, TeammateMark, YouFace } from '../../ui/Teammates';
import { color, font, size } from '../../ui/theme';
import { phoneSlug } from '../../../../renderer/src/phone-rows';

const REFUSED = '#e28f82';
const message = (err: unknown) => String((err as Error)?.message ?? err);
const openThread = (at: { product: string; id: string }) => router.push({ pathname: '/thread/[product]/[id]', params: at });

/** An activity line: its verb faint, what it names open-able, its time. */
function Act({ verb, text, onOpen, when, status, children }: { verb: string; text: string; onOpen?: () => void; when: number; status?: string | null; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 10, paddingLeft: 44 }}>
      <T style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: color.faint }}>
        {verb ? <T style={{ fontSize: 13.5, color: color.faint }}>{`${verb} `}</T> : null}
        {onOpen ? <T onPress={onOpen} suppressHighlighting style={{ fontSize: 13.5, color: color.dim, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{text}</T>
          : <T style={{ fontSize: 13.5, color: color.dim }}>{text}</T>}
        {status ? <T style={{ fontSize: 12.5, color: color.faint }}>{`  ${status}`}</T> : null}
      </T>
      {children}
      <T style={{ fontSize: 12, lineHeight: 20, color: color.faint }}>{clockOf(when)}</T>
    </View>
  );
}

/** Threads it sent you one after another, as rows that open them (`SentCard`). */
function Sent({ runs, team, items }: { runs: TeamRunLine[]; team: PhoneTeam; items: any[] }) {
  return (
    <View style={{ marginTop: 14, marginLeft: 44, borderWidth: 1, borderColor: color.line, backgroundColor: color.fill }}>
      <T style={{ paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7, fontSize: 12.5, color: color.faint, borderBottomWidth: 1, borderBottomColor: color.line }}>{`Sent you · ${clockOf(runs[0].ts)}`}</T>
      {runs.map((r, i) => {
        const product = phoneSlug(team.device, r.product);
        const item = items.find((x) => x.id === r.item && x.product === product);
        return (
          <Pressable key={r.id} onPress={() => openThread({ product, id: r.item })} accessibilityRole="button"
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: color.rowLine, backgroundColor: pressed ? color.picked : 'transparent' })}>
            <T numberOfLines={2} style={{ fontSize: 15, lineHeight: 20 }}>{r.said || item?.title || r.title}</T>
            {(r.waiting || r.answered) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
                {r.waiting && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />}
                <T style={{ fontSize: 12.5, color: r.waiting ? color.dim : color.faint }}>{r.waiting ? 'Waiting on you' : 'Answered'}</T>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TeammateChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCloud();
  const gate = screenGate(c);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [about, setAbout] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchTeam = c.watchTeam;
  useEffect(() => watchTeam(), [watchTeam]);
  useEffect(() => { setPicks({}); setError(null); }, [id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;

  const team = c.team;
  const t = team?.view.list.find((x) => x.id === id) ?? null;
  if (!team || !t) {
    return (
      <Wall>
        <TopBar left={<IconButton label="Back" onPress={back}><Back size={18} /></IconButton>} title="Teammate" />
        <T style={{ padding: size.inset, fontSize: 15, lineHeight: 22, color: color.dim }}>
          {team ? 'This teammate is not on your computer any more.' : 'Your computer has not sent your teammates yet. They show up here within a minute of it opening.'}
        </T>
      </Wall>
    );
  }

  const rows = chatRows(team.view, t.id, c.teamPending, c.now);
  const open = openQuestions(team.view, t.id, c.teamPending);
  const many = open.length > 1;
  const running = runningThread(t, team);

  const post = async (value: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try { await c.askTeammate('post', value); return true; } catch (err) { setError(message(err)); return false; } finally { setBusy(false); }
  };
  const sendAnswers = async (chosen: Record<string, string>) => {
    const m = answersMessage(open, chosen);
    if (!m.text) return;
    if (await post({ text: m.text, to: [t.id], answers: m.answers })) setPicks({});
  };
  const tap = (q: TeamChatLine, o: string) => {
    if (!many) { void sendAnswers({ [q.id]: o }); return; }
    setPicks((all) => ({ ...all, [q.id]: all[q.id] === o ? '' : o }));
  };
  const answered = open.filter((q) => picks[q.id]).length;

  const draw = (r: ChatRow) => {
    if (r.kind === 'day') return <DayRule key={r.key} label={r.label} />;
    if (r.kind === 'saved') return <Act key={r.key} verb="Saved" text="to its instructions" when={r.ts} />;
    if (r.kind === 'answered') return <Act key={r.key} verb="You answered" text={r.count === 1 ? 'its question' : `${r.count} questions`} when={r.ts} />;
    if (r.kind === 'sent') return <Sent key={r.key} runs={r.runs} team={team} items={c.view.items} />;
    if (r.kind === 'act') {
      const w = actWords(r.e, team, t);
      return (
        <Act key={r.key} verb={w.verb} text={w.text} when={r.e.ts} status={w.status} onOpen={w.open ? () => openThread(w.open!) : undefined}>
          {w.goAhead && (
            <Pressable onPress={() => void c.askTeammate('goAhead', w.goAhead!).then(() => c.say('Going ahead'), (err) => setError(message(err)))} accessibilityRole="button"
              style={({ pressed }) => ({ height: 26, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : color.fill })}>
              <T style={{ fontSize: 13, color: color.text }}>Go ahead</T>
            </Pressable>
          )}
        </Act>
      );
    }
    const m = r.m;
    const asking = !r.mine && open.some((q) => q.id === m.id);
    return (
      <View key={r.key} style={{ flexDirection: 'row', gap: 12, paddingTop: r.lead ? 16 : 6 }}>
        <View style={{ width: 32 }}>{r.lead && (r.mine ? <YouFace /> : <TeammateMark t={t} size={32} />)}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {r.lead && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <T style={{ fontFamily: font.semibold, fontSize: 14.5, lineHeight: 20 }}>{r.mine ? (m.via ? 'Your thread' : 'You') : t.name}</T>
              <T style={{ fontSize: 12, color: color.faint }}>{clockOf(m.ts)}</T>
            </View>
          )}
          {r.mine ? <T selectable style={{ fontSize: 15.5, lineHeight: 22.5, color: r.waiting || r.refused ? color.dim : color.text }}>{m.text}</T>
            : <Markdown text={m.text ?? ''} />}
          {r.waiting && <T style={{ fontSize: 12.5, marginTop: 3, color: color.faint }}>Waiting for your computer</T>}
          {r.refused && <T style={{ fontSize: 12.5, marginTop: 3, color: REFUSED }}>{`Not sent, ${r.refused}`}</T>}
          {!r.mine && !!m.options?.length && (asking
            ? <Chips options={m.options} on={picks[m.id] || null} disabled={busy} tap={(o) => tap(m, o)} />
            : r.answered && m.options.includes(r.answered.trim()) ? <Chips options={[r.answered.trim()]} on={r.answered.trim()} /> : null)}
        </View>
      </View>
    );
  };

  const name = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <TeammateMark t={t} size={24} />
      <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium, fontSize: 19, lineHeight: 23, letterSpacing: -0.19 }}>{t.name}</T>
      <T style={{ fontSize: 14, color: color.faint }}>{asideOf(t)}</T>
    </View>
  );
  return (
    <Wall>
      <TopBar left={<IconButton label="Back" onPress={back}><Back size={18} /></IconButton>} title={name}
        right={<IconButton label={`About ${t.name}`} onPress={() => setAbout(true)}><More /></IconButton>} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: size.inset, paddingBottom: 16 }} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {rows.length ? rows.map(draw) : <T style={{ paddingTop: 24, fontSize: 14.5, lineHeight: 21, color: color.faint }}>{`Nothing yet. Say hello to ${t.name}.`}</T>}
          {running && (
            <Pressable onPress={() => openThread(running)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, paddingLeft: 44 }}>
              <RunningMark />
              <T style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: color.faint }}>
                {`${t.name} is on `}<T style={{ fontSize: 13.5, color: color.dim, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{t.now && t.now !== 'Waiting on you' && t.now !== 'Paused' ? t.now : 'its next run'}</T>
              </T>
            </Pressable>
          )}
        </ScrollView>
        {error && <T style={{ paddingHorizontal: size.inset, paddingTop: 6, fontSize: 13, color: color.dim }}>{error}</T>}
        <MateComposer placeholder={t.status === 'draft' ? `Answer ${t.name === 'New teammate' ? 'your new teammate' : t.name}` : `Message ${t.name}`}
          send={(text) => post({ text, to: [t.id] })}
          above={many ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8 }}>
              <Pressable disabled={!answered || busy} onPress={() => void sendAnswers(picks)} accessibilityRole="button"
                style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: color.accent, opacity: !answered || busy ? 0.45 : pressed ? 0.85 : 1 })}>
                <T style={{ fontSize: 15, fontFamily: font.medium, color: '#fff' }}>Send answers</T>
              </Pressable>
              {answered < open.length && <T style={{ fontSize: 13, color: color.faint }}>{`${answered} of ${open.length} answered`}</T>}
            </View>
          ) : undefined} />
      </KeyboardAvoidingView>
      <Sheet open={about} close={() => setAbout(false)}>
        <SheetHead>{t.name}</SheetHead>
        {[
          ['Job', t.job],
          ['On its own', (t.duties ?? []).map((d) => `${d.what} · ${d.when}`).join('\n') || t.worksLabel],
          ['Works in', c.view.products.find((p) => p.slug === phoneSlug(team.device, t.product))?.name ?? t.product],
          ['Runs on', [t.engine === 'codex' ? 'Codex' : 'Claude Code', t.model].filter(Boolean).join(' · ')],
          ['This week', `${t.runsThisWeek} ${t.runsThisWeek === 1 ? 'run' : 'runs'}`],
        ].filter(([, v]) => v).map(([k, v]) => (
          <View key={k} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
            <T style={{ fontSize: 12.5, color: color.faint, marginBottom: 2 }}>{k}</T>
            <T selectable style={{ fontSize: 15, lineHeight: 21, color: color.dim }}>{v}</T>
          </View>
        ))}
        <T style={{ paddingHorizontal: 14, paddingTop: 8, fontSize: 12.5, lineHeight: 18, color: color.faint }}>Change its job, pause it or make it primary on your computer.</T>
      </Sheet>
    </Wall>
  );
}
