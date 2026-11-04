// DRAFT: five first-run designs to choose between, drawn in the preview as
// /welcome?option=1..5&step=1..4. The one picked is wired into the real flow
// and the rest are deleted.
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppleMark, AppMark, Chevron, GoogleMark } from '../ui/icons';
import { Btn, Card, CardRow, CORNER, Devices, Head, Label, Lede, Live, Logo, PAD, Screen, Steps, Tick } from '../ui/Onboarding';
import { RunningMark, T, Wall } from '../ui/parts';
import { color, font } from '../ui/theme';

const go = (step: number) => router.setParams({ step: String(step) });
const LINK = 'agentbox.ac/download';
const mono = { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase' as const, color: color.dim };

/** A choice as a row in a card: its words, a line under them, and the arrow. */
function Choice({ title, detail, first, onPress }: { title: string; detail: string; first?: boolean; onPress?: () => void }) {
  return (
    <CardRow first={first} onPress={onPress} style={{ paddingVertical: 17 }}>
      <View style={{ flex: 1 }}>
        <T style={{ fontSize: 16.5, lineHeight: 22, fontFamily: font.medium }}>{title}</T>
        <T style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 2 }}>{detail}</T>
      </View>
      <View style={{ transform: [{ rotate: '-90deg' }] }}><Chevron size={14} tint={color.faint} /></View>
    </CardRow>
  );
}

function MiniRow({ title, project, when, first, unread, running }: { title: string; project: string; when: string; first?: boolean; unread?: boolean; running?: boolean }) {
  return (
    <CardRow first={first} style={{ paddingVertical: 12, alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 8, paddingTop: 7 }}>{unread && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />}</View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {running && <RunningMark />}
          <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, lineHeight: 20 }}>{title}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
          <T style={mono}>{project}</T><T style={{ fontSize: 11, color: color.faint }}>{when}</T>
        </View>
      </View>
    </CardRow>
  );
}

function InboxPicture() {
  return (
    <Card style={{ backgroundColor: color.card, borderColor: color.lineStrong }}>
      <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Label style={{ color: color.text }}>Needs you  3</Label><Label>In progress  1</Label>
      </View>
      <MiniRow first unread title="Plan the phone app" project="Agentbox" when="6m" />
      <MiniRow running title="Draw the sign-in screen" project="Agentbox" when="2m" />
      <MiniRow unread title="Write the launch script" project="Launch film" when="25m" />
      <MiniRow unread title="Show when limits reset" project="Website" when="52m" />
    </Card>
  );
}

function ReplyPicture() {
  const option = (n: number, words: string, picked?: boolean) => (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: CORNER.small, borderWidth: 1, borderColor: picked ? color.dim : color.line, backgroundColor: picked ? color.picked : 'transparent' }}>
      <T style={{ fontSize: 12.5, color: color.faint, width: 10 }}>{n}</T><T style={{ fontSize: 14.5, color: picked ? color.text : color.dim }}>{words}</T>
    </View>
  );
  return (
    <Card style={{ backgroundColor: color.card, borderColor: color.lineStrong, padding: 16 }}>
      <T style={{ fontSize: 15, lineHeight: 22 }}>The plan is ready and Codex has reviewed it.</T>
      <View style={{ marginTop: 14, gap: 8 }}>{option(1, 'Start building it', true)}{option(2, 'Wait for the Apple account')}</View>
      <View style={{ marginTop: 14, height: 44, borderRadius: CORNER.small, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.field, justifyContent: 'center', paddingHorizontal: 12 }}>
        <T style={{ fontSize: 14.5, color: color.faint }}>Reply</T>
      </View>
    </Card>
  );
}

function AlertPicture() {
  return (
    <Card style={{ backgroundColor: color.card, borderColor: color.lineStrong, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: '#1a1817', alignItems: 'center', justifyContent: 'center' }}><AppMark size={22} /></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T style={{ fontSize: 14.5, fontFamily: font.semibold }}>Agentbox</T><T style={{ fontSize: 12.5, color: color.faint }}>now</T>
        </View>
        <T style={{ fontSize: 14.5, lineHeight: 20, color: color.dim, marginTop: 1 }}>Plan the phone app is ready for you</T>
      </View>
    </Card>
  );
}

function Dots({ on, of }: { on: number; of: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'center', marginBottom: 8 }}>
      {Array.from({ length: of }, (_, i) => <View key={i} style={{ width: i === on ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === on ? color.text : color.lineStrong }} />)}
    </View>
  );
}

function SignIn({ next }: { next: () => void }) {
  return (
    <Screen foot={<>
      <Btn label="Continue with Apple" lead={<AppleMark />} onPress={next} />
      <Btn label="Continue with Google" lead={<GoogleMark />} onPress={next} />
      <Btn kind="quiet" label="Continue with email" onPress={next} />
    </>}>
      <Devices state="connected" />
      <Head style={{ marginTop: 28 }}>Sign in</Head>
      <Lede>Use the same account as Agentbox on your computer.</Lede>
    </Screen>
  );
}

function Waiting({ next }: { next?: () => void }) {
  return (
    <Screen foot={<Btn kind="quiet" label="Use another account" onPress={next} />}>
      <Devices state="waiting" />
      <Head style={{ marginTop: 28 }}>Turn on Phone on your computer</Head>
      <View style={{ marginTop: 22 }}>
        <Steps items={['Open Agentbox on your computer', 'Go to Settings › Phone', <>Sign in as <T style={{ fontFamily: font.medium }}>you@example.com</T></>]} />
      </View>
      <View style={{ marginTop: 22, marginLeft: 2 }}><Live>Waiting for your computer</Live></View>
    </Screen>
  );
}

function LinkCard() {
  return (
    <Card style={{ marginTop: 26 }}>
      <CardRow first>
        <T style={{ flex: 1, fontFamily: font.mono, fontSize: 14.5, color: color.text }}>{LINK}</T>
        <T style={{ fontSize: 14.5, color: color.dim }}>Copy</T>
      </CardRow>
    </Card>
  );
}

/* 1. Ask first: one question decides the path. */
function AskFirst({ step }: { step: number }) {
  if (step === 1) {
    return (
      <Screen>
        <Devices state="connected" />
        <Head style={{ marginTop: 28 }}>Reply to your agents from your phone</Head>
        <Label style={{ marginTop: 34, marginBottom: 10, marginLeft: 2 }}>Is Agentbox on your computer?</Label>
        <Card>
          <Choice first title="Yes, it is set up" detail="Sign in with the same account" onPress={() => go(3)} />
          <Choice title="Not yet" detail="Start there, it takes a few minutes" onPress={() => go(2)} />
        </Card>
      </Screen>
    );
  }
  if (step === 2) {
    return (
      <Screen foot={<><Btn kind="primary" label="Send me the link" /><Btn kind="quiet" label="I have installed it" onPress={() => go(3)} /></>}>
        <Devices state="computer" />
        <Head style={{ marginTop: 28 }}>Start on your computer</Head>
        <Lede>Your agents run there. This app is where you read and reply.</Lede>
        <LinkCard />
      </Screen>
    );
  }
  if (step === 3) return <SignIn next={() => go(4)} />;
  return <Waiting next={() => go(3)} />;
}

/* 2. Three pages that show the app, then the computer. */
function ThreePages({ step }: { step: number }) {
  const pages = [
    { head: 'Every agent\nin one inbox', pic: <InboxPicture /> },
    { head: 'Answer them\nfrom anywhere', pic: <ReplyPicture /> },
    { head: 'Hear when one\nneeds you', pic: <AlertPicture /> },
  ];
  if (step <= 3) {
    const p = pages[step - 1];
    return (
      <Screen top={40} foot={<><Dots on={step - 1} of={3} /><Btn kind="primary" label={step === 3 ? 'Get started' : 'Continue'} onPress={() => go(step + 1)} /></>}>
        <View style={{ height: 360, justifyContent: 'center' }}>{p.pic}</View>
        <Head style={{ marginTop: 36, fontSize: 32, lineHeight: 37 }}>{p.head}</Head>
      </Screen>
    );
  }
  return (
    <Screen>
      <Devices state="computer" />
      <Head style={{ marginTop: 28 }}>Agentbox runs on your computer</Head>
      <Lede>The phone shows the same threads, so set it up there first.</Lede>
      <Card style={{ marginTop: 28 }}>
        <Choice first title="I have it" detail="Sign in with the same account" />
        <Choice title="Not yet" detail={`Send me the link to ${LINK}`} />
      </Card>
    </Screen>
  );
}

/* 3. One checklist that ticks itself as each part is done. */
function Checklist({ step }: { step: number }) {
  const done = step === 1 ? 0 : step === 2 ? 2 : 4;
  const rows: { title: string; detail: string; action?: string; live?: string }[] = [
    { title: 'Get Agentbox on your computer', detail: LINK, action: 'Send link' },
    { title: 'Sign in here', detail: 'With the account your computer uses', action: 'Sign in' },
    { title: 'Turn on Phone on your computer', detail: 'Settings › Phone, then sign in', live: 'Waiting for your computer' },
    { title: 'Turn on alerts', detail: 'When a thread needs you', action: 'Turn on' },
  ];
  return (
    <Screen foot={done === 4 ? <Btn kind="primary" label="Open your inbox" /> : undefined}>
      <Logo />
      <Head style={{ marginTop: 28 }}>{done === 4 ? 'You are all set' : 'Set up Agentbox'}</Head>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 16, marginBottom: 26 }}>
        {rows.map((r, i) => <View key={r.title} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < done ? color.text : i === done ? color.accent : color.lineStrong }} />)}
      </View>
      <Card>
        {rows.map((r, i) => {
          const on = i < done;
          const current = i === done;
          return (
            <CardRow key={r.title} first={i === 0} style={{ paddingVertical: 16, alignItems: current ? 'flex-start' : 'center' }}>
              <Tick on={on} />
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 16, lineHeight: 22, fontFamily: current ? font.medium : font.regular, color: on ? color.faint : color.text }}>{r.title}</T>
                {current && (r.live ? <View style={{ marginTop: 8 }}><Live>{r.live}</Live></View> : <>
                  <T style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 2 }}>{r.detail}</T>
                  <View style={{ alignSelf: 'flex-start', marginTop: 12, height: 36, paddingHorizontal: 14, borderRadius: CORNER.small, justifyContent: 'center', backgroundColor: color.accent }}>
                    <T style={{ fontSize: 14.5, fontFamily: font.medium, color: '#1a1817' }} onPress={() => go(step + 1)}>{r.action}</T>
                  </View>
                </>)}
              </View>
            </CardRow>
          );
        })}
      </Card>
    </Screen>
  );
}

/* 4. The computer signs the phone in with a code. */
function Pair({ step }: { step: number }) {
  if (step === 1) {
    return (
      <Screen foot={<><Btn kind="quiet" label="I don't have Agentbox yet" /><Btn kind="quiet" label="Sign in with email instead" /></>}>
        <Devices state="waiting" height={130} />
        <Head style={{ marginTop: 20 }}>Connect to your computer</Head>
        <Lede>In Agentbox on your computer, open Settings › Phone and type this code.</Lede>
        <View style={{ flexDirection: 'row', gap: 7, marginTop: 26 }}>
          {'K7Q4MX'.split('').map((ch, i) => (
            <View key={i} style={{ flex: 1, height: 60, borderRadius: CORNER.small + 2, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.film, alignItems: 'center', justifyContent: 'center', marginLeft: i === 3 ? 10 : 0 }}>
              <T style={{ fontFamily: font.mono, fontSize: 27, color: color.text }}>{ch}</T>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 22, marginLeft: 2 }}><Live>Waiting for your computer</Live></View>
      </Screen>
    );
  }
  return (
    <Screen foot={<Btn kind="primary" label="Continue" />}>
      <Devices state="connected" height={130} />
      <Head style={{ marginTop: 20 }}>Connected to MacBook Pro</Head>
      <View style={{ marginTop: 26 }}><InboxPicture /></View>
    </Screen>
  );
}

/* 5. The inbox first, with made-up threads, and setup when you want it. */
function TryFirst({ step }: { step: number }) {
  const inset = useSafeAreaInsets();
  if (step > 2) return <SignIn next={() => go(4)} />;
  return (
    <Wall>
      <View style={{ paddingTop: inset.top, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <View style={{ height: 55, justifyContent: 'center', paddingHorizontal: 20 }}><T style={{ fontFamily: font.medium, fontSize: 19 }}>Threads</T></View>
        <View style={{ height: 40, flexDirection: 'row', gap: 22, paddingHorizontal: 20, alignItems: 'center' }}>
          {['Needs you', 'In progress', 'Later', 'Done'].map((t, i) => (
            <View key={t} style={{ height: 32, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: i ? 'transparent' : color.accent }}>
              <T style={{ fontSize: 15, color: i ? color.dim : color.text }}>{t}</T>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 4, opacity: step === 2 ? 0.4 : 1 }}>
        <MiniRow first unread title="Plan the phone app" project="Agentbox" when="6m" />
        <MiniRow running title="Draw the sign-in screen" project="Agentbox" when="2m" />
        <MiniRow unread title="Write the launch script" project="Launch film" when="25m" />
        <MiniRow title="Stuck threads land in Needs you" project="Agentbox" when="14m" />
        <MiniRow title="Show when limits reset" project="Website" when="52m" />
      </View>
      <View style={{ position: 'absolute', left: 8, right: 8, bottom: 8, paddingHorizontal: PAD - 8, paddingTop: 10, paddingBottom: Math.max(16, inset.bottom), borderRadius: 22, backgroundColor: color.pop, borderWidth: 1, borderColor: color.lineStrong, gap: 10 }}>
        <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: color.lineStrong, marginBottom: 10 }} />
        {step === 1 ? <>
          <T style={{ fontFamily: font.medium, fontSize: 21, lineHeight: 26, letterSpacing: -0.4 }}>These threads are made up</T>
          <T style={{ fontSize: 15.5, lineHeight: 22, color: color.dim, marginBottom: 10 }}>Open one and reply to see how it works.</T>
          <Btn kind="primary" label="Set up with my computer" onPress={() => go(2)} />
        </> : <>
          <T style={{ fontFamily: font.medium, fontSize: 21, lineHeight: 26, letterSpacing: -0.4, marginBottom: 6 }}>Is Agentbox on your computer?</T>
          <Card>
            <Choice first title="Yes, it is set up" detail="Sign in with the same account" onPress={() => go(3)} />
            <Choice title="Not yet" detail={`Send me the link to ${LINK}`} />
          </Card>
        </>}
      </View>
    </Wall>
  );
}

/* What every option ends on. */
function Consent() {
  const rows = [
    { title: 'To your computer', detail: 'Or to Agentbox Cloud while it is off' },
    { title: 'To the agent you pick', detail: 'Claude Code by Anthropic or Codex by OpenAI, signed in to your own account' },
    { title: 'Nowhere else', detail: 'Agentbox shares them with no one' },
  ];
  return (
    <Screen foot={<><Btn kind="primary" label="Continue" /><Btn kind="quiet" label="Not now" /></>}>
      <Logo />
      <Head style={{ marginTop: 28 }}>Where your messages go</Head>
      <Card style={{ marginTop: 26 }}>
        {rows.map((r, i) => (
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

function Alerts() {
  return (
    <Screen foot={<><Btn kind="primary" label="Turn on alerts" /><Btn kind="quiet" label="Not now" /></>}>
      <Logo />
      <Head style={{ marginTop: 28 }}>{'Get an alert when\nyou are needed'}</Head>
      <Lede>When a thread finishes or asks you something.</Lede>
      <View style={{ marginTop: 30 }}><AlertPicture /></View>
    </Screen>
  );
}

export default function Welcome() {
  const p = useLocalSearchParams<{ option?: string; step?: string }>();
  const step = Number(p.step) || 1;
  const screens: Record<string, ReactNode> = {
    2: <ThreePages step={step} />, 3: <Checklist step={step} />, 4: <Pair step={step} />, 5: <TryFirst step={step} />,
    consent: <Consent />, alerts: <Alerts />,
  };
  return screens[p.option ?? ''] ?? <AskFirst step={step} />;
}
