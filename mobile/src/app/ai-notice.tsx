// Before your first message: where your words go, and a yes (App Review
// guideline 5.1.2(i)). Asked once, as the first run's third step, or by a
// send after a no; Settings › General turns it off again.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useCloud } from '../state/cloud';
import { Bars, Btn, Card, CardRow, Head, leaveSetup, Logo, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color, font } from '../ui/theme';

const ROWS = [
  { title: 'To your computer', detail: 'Or Agentbox Cloud when your computer is off, if you have set it up' },
  { title: 'To the agent you pick', detail: 'Claude Code by Anthropic or Codex by OpenAI, signed in to your own account' },
  { title: 'Nowhere else', detail: 'Agentbox shares them with no one' },
];

export default function AiNotice() {
  const c = useCloud();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const answer = (yes: boolean) => { c.answerNotice(yes); leaveSetup(); };
  // Swiped away unanswered, a send waiting on it would say "Sending…" for ever.
  const leave = useRef(c.leaveNotice);
  leave.current = c.leaveNotice;
  useEffect(() => () => leave.current(), []);
  return (
    <Screen top={first ? 24 : 72} foot={<><Btn kind="primary" label="Allow and continue" onPress={() => answer(true)} /><Btn kind="quiet" label="Not now, I'll just read" onPress={() => answer(false)} /></>}>
      {first ? <Bars at="messages" /> : null}
      <Logo />
      <Head style={{ marginTop: 28 }}>Where your messages go</Head>
      <Card style={{ marginTop: 26 }}>
        {ROWS.map((r, i) => (
          <CardRow key={r.title} first={i === 0} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontSize: 16, lineHeight: 22, fontFamily: font.medium }}>{r.title}</T>
              <T style={{ fontSize: 14.5, lineHeight: 21, color: color.dim, marginTop: 2 }}>{r.detail}</T>
            </View>
          </CardRow>
        ))}
      </Card>
    </Screen>
  );
}
