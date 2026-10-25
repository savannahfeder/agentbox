// Before your first message: where your words go, and a yes (App Review
// guideline 5.1.2(i)). Asked once; Settings › General turns it off again.
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloud } from '../state/cloud';
import { T, Wall } from '../ui/parts';
import { color, font, size } from '../ui/theme';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function AiNotice() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const answer = (yes: boolean) => { c.answerNotice(yes); leave(); };
  const para = { fontSize: 15, lineHeight: 23, color: color.dim, marginTop: 14 };
  return (
    <Wall>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: inset.top + 48, paddingHorizontal: size.inset + 8, paddingBottom: 24 }}>
        <T style={{ fontFamily: font.medium, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}>Where your messages go</T>
        <T style={para}>What you write here goes to your computer, or to Agentbox Cloud when your computer is off. Either one hands it to the coding agent you choose for the thread.</T>
        <T style={para}>That agent is Claude Code, made by Anthropic, or Codex, made by OpenAI, signed in to your own account with them. Your words, the files you attach and the thread they belong to go to that company under its terms.</T>
        <T style={para}>Nothing goes to them from this phone directly, and Agentbox sends your messages nowhere else. You can turn this off in Settings, under General.</T>
      </ScrollView>
      <View style={{ paddingHorizontal: size.inset + 8, paddingBottom: Math.max(16, inset.bottom) + 8, gap: 10 }}>
        <Pressable onPress={() => answer(true)} accessibilityRole="button"
          style={({ pressed }) => ({ height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: color.text, opacity: pressed ? 0.85 : 1 })}>
          <T style={{ fontSize: 16, fontFamily: font.semibold, color: color.bg }}>Continue</T>
        </Pressable>
        <Pressable onPress={() => answer(false)} accessibilityRole="button"
          style={({ pressed }) => ({ height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.fill : 'transparent' })}>
          <T style={{ fontSize: 16, color: color.dim }}>Not now</T>
        </Pressable>
      </View>
    </Wall>
  );
}
