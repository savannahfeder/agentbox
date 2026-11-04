// DRAFT: five first-run designs to choose between, drawn in the preview as
// /welcome?option=1..5&step=1..4. The one picked is wired into the real flow
// and the rest are deleted.
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppleMark, AppMark, GoogleMark } from '../ui/icons';
import { Btn, Head, Lede, Logo, PAD, Screen, Status, Steps, Strong, TickBox } from '../ui/Onboarding';
import { RunningMark, T, Wall } from '../ui/parts';
import { color, font } from '../ui/theme';

const go = (step: number) => router.setParams({ step: String(step) });
const LINK = 'agentbox.ac/download';

const mono = { fontFamily: font.mono, fontSize: 11, lineHeight: 20, letterSpacing: 0.55, textTransform: 'uppercase' as const, color: color.dim };

/** A thread row as the inbox draws it, smaller. */
function MiniRow({ title, project, when, first, unread, running }: { title: string; project: string; when: string; first?: boolean; unread?: boolean; running?: boolean }) {
  return (
    <View style={{ paddingVertical: 13, paddingLeft: 18, paddingRight: 12 }}>
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      {unread && <View style={{ position: 'absolute', left: 4, top: 21, width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {running && <RunningMark />}
        <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, lineHeight: 20 }}>{title}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
        <T style={mono}>{project}</T><T style={{ fontSize: 11, color: color.faint }}>·</T><T style={{ fontSize: 11, color: color.faint }}>{when}</T>
      </View>
    </View>
  );
}

const Frame = ({ children, style }: { children: ReactNode; style?: object }) => (
  <View style={[{ borderWidth: 1, borderColor: color.line, backgroundColor: color.fill }, style]}>{children}</View>
);

function InboxPicture() {
  return (
    <Frame>
      <MiniRow first unread title="Plan the phone app" project="Agentbox" when="6m" />
      <MiniRow running title="Draw the sign-in screen" project="Agentbox" when="2m" />
      <MiniRow unread title="Write the launch script" project="Launch film" when="25m" />
      <MiniRow title="Show when limits reset" project="Website" when="52m" />
    </Frame>
  );
}

function ReplyPicture() {
  return (
    <Frame style={{ padding: 16 }}>
      <T style={{ fontSize: 14, lineHeight: 21, color: color.dim }}>The plan is ready and Codex has reviewed it.</T>
      <View style={{ marginTop: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: color.lineStrong }}>
          <T style={{ fontSize: 13, color: color.faint, width: 10 }}>1</T><T style={{ fontSize: 14 }}>Start building it</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: color.line }}>
          <T style={{ fontSize: 13, color: color.faint, width: 10 }}>2</T><T style={{ fontSize: 14, color: color.dim }}>Wait for the Apple account</T>
        </View>
      </View>
      <View style={{ marginTop: 14, height: 40, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.field, justifyContent: 'center', paddingHorizontal: 11 }}>
        <T style={{ fontSize: 14, color: color.faint }}>Reply</T>
      </View>
    </Frame>
  );
}

function AlertPicture() {
  return (
    <Frame style={{ padding: 14, flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 34, height: 34, backgroundColor: color.sunk, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.line }}><AppMark size={20} /></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T style={{ fontSize: 14, fontFamily: font.medium }}>Agentbox</T><T style={{ fontSize: 12, color: color.faint }}>now</T>
        </View>
        <T style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 2 }}>Plan the phone app is ready for you.</T>
      </View>
    </Frame>
  );
}

function Dots({ on, of }: { on: number; of: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, alignSelf: 'center' }}>
      {Array.from({ length: of }, (_, i) => <View key={i} style={{ width: i === on ? 16 : 6, height: 6, backgroundColor: i === on ? color.text : color.lineStrong }} />)}
    </View>
  );
}

/** Sign in, in the first run's language. Email opens under the two providers. */
function SignInScreen({ head, next, back }: { head: string; next: () => void; back?: ReactNode }) {
  return (
    <Screen foot={<>
      <Btn label="Continue with Apple" lead={<AppleMark />} onPress={next} />
      <Btn label="Continue with Google" lead={<GoogleMark />} onPress={next} />
      <Btn quiet label="Continue with email" onPress={next} />
    </>}>
      <Logo />
      <Head style={{ marginTop: 36 }}>{head}</Head>
      {back}
    </Screen>
  );
}

function WaitScreen({ next }: { next: () => void }) {
  return (
    <Screen foot={<Btn quiet label="Use another account" onPress={next} />}>
      <Logo />
      <Head style={{ marginTop: 36 }}>Turn on Phone on your computer</Head>
      <Steps style={{ marginTop: 20 }} items={['Open Agentbox on your computer.', <>In Settings › Phone, sign in as <Strong>you@example.com</Strong>.</>]} />
      <View style={{ marginTop: 32 }}><Status>Waiting for your computer</Status></View>
    </Screen>
  );
}

function SendLink({ quiet }: { quiet?: boolean }) {
  return <Btn quiet={quiet} label="Send me the link" />;
}

/* 1. Ask first: one question decides the path. */
function AskFirst({ step }: { step: number }) {
  if (step === 1) {
    return (
      <Screen top={140} foot={<><Btn label="Yes, sign in" onPress={() => go(3)} /><Btn label="Not yet" onPress={() => go(2)} /></>}>
        <Logo size={56} />
        <Head big style={{ marginTop: 40 }}>Reply to your agents from your phone</Head>
        <Lede style={{ marginTop: 18 }}>Is Agentbox set up on your computer?</Lede>
      </Screen>
    );
  }
  if (step === 2) {
    return (
      <Screen foot={<><SendLink /><Btn quiet label="I have it now" onPress={() => go(3)} /></>}>
        <Logo />
        <Head style={{ marginTop: 36 }}>Start on your computer</Head>
        <Lede>Your agents run on your Mac or Linux computer. This app is where you read and reply.</Lede>
        <T style={{ fontFamily: font.mono, fontSize: 14, color: color.text, marginTop: 28 }}>{LINK}</T>
      </Screen>
    );
  }
  if (step === 3) return <SignInScreen head="Sign in with the account your computer uses" next={() => go(4)} />;
  return <WaitScreen next={() => go(3)} />;
}

/* 2. Three pages that show the app, then setup. */
function ThreePages({ step }: { step: number }) {
  const pages = [
    { head: 'All your agents in one inbox', pic: <InboxPicture /> },
    { head: 'Answer them from anywhere', pic: <ReplyPicture /> },
    { head: 'Know when you are needed', pic: <AlertPicture /> },
  ];
  if (step <= 3) {
    const p = pages[step - 1];
    return (
      <Screen top={56} foot={<><Dots on={step - 1} of={3} /><Btn label={step === 3 ? 'Get started' : 'Next'} onPress={() => go(step + 1)} /></>}>
        <View style={{ height: 330, justifyContent: 'center' }}>{p.pic}</View>
        <Head big style={{ marginTop: 44 }}>{p.head}</Head>
      </Screen>
    );
  }
  return (
    <Screen foot={<><Btn label="I have it, sign in" /><SendLink /></>}>
      <Logo />
      <Head style={{ marginTop: 36 }}>Agentbox runs on your computer</Head>
      <Lede>Set it up there first. This app shows the same threads.</Lede>
      <T style={{ fontFamily: font.mono, fontSize: 14, color: color.text, marginTop: 28 }}>{LINK}</T>
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
    <Screen foot={done === 4 ? <Btn label="Open your inbox" /> : undefined}>
      <Logo />
      <Head style={{ marginTop: 36 }}>{done === 4 ? 'You are set up' : 'Set up Agentbox'}</Head>
      <T style={{ ...mono, color: color.faint, marginTop: 10 }}>{`${done} of 4 done`}</T>
      <View style={{ marginTop: 28 }}>
        {rows.map((r, i) => {
          const on = i < done;
          const current = i === done;
          return (
            <View key={r.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderTopWidth: i ? 1 : 0, borderTopColor: color.rowLine }}>
              <TickBox on={on} />
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 16, lineHeight: 21, color: on ? color.faint : color.text }}>{r.title}</T>
                {!on && (current && r.live ? <View style={{ marginTop: 6 }}><Status>{r.live}</Status></View>
                  : <T style={{ fontSize: 13.5, lineHeight: 19, color: color.faint, marginTop: 2 }}>{r.detail}</T>)}
              </View>
              {!on && current && !r.live && (
                <View style={{ height: 32, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.film }}>
                  <T style={{ fontSize: 14 }} onPress={() => go(step + 1)}>{r.action}</T>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

/* 4. The computer signs the phone in with a code. */
function Pair({ step }: { step: number }) {
  if (step === 1) {
    return (
      <Screen foot={<><SendLink quiet /><Btn quiet label="Sign in with email instead" /></>}>
        <Logo />
        <Head style={{ marginTop: 36 }}>Connect to your computer</Head>
        <Steps style={{ marginTop: 20 }} items={['Open Agentbox on your computer.', 'In Settings › Phone, choose Connect a phone.', 'Type this code there.']} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 30 }}>
          {'K7Q4MX'.split('').map((ch, i) => (
            <View key={i} style={{ flex: 1, height: 56, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.field, alignItems: 'center', justifyContent: 'center', marginLeft: i === 3 ? 10 : 0 }}>
              <T style={{ fontFamily: font.mono, fontSize: 26, color: color.text }}>{ch}</T>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 28 }}><Status>Waiting for your computer</Status></View>
      </Screen>
    );
  }
  return (
    <Screen foot={<Btn label="Continue" />}>
      <Logo />
      <Head style={{ marginTop: 36 }}>Connected to MacBook Pro</Head>
      <View style={{ marginTop: 28 }}><InboxPicture /></View>
    </Screen>
  );
}

/* 5. The inbox first, with made-up threads, and setup when you want it. */
function TryFirst({ step }: { step: number }) {
  const inset = useSafeAreaInsets();
  if (step === 1 || step === 2) {
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
        <View style={{ opacity: step === 2 ? 0.35 : 1 }}>
          <MiniRow first unread title="Plan the phone app" project="Agentbox" when="6m" />
          <MiniRow running title="Draw the sign-in screen" project="Agentbox" when="2m" />
          <MiniRow unread title="Write the launch script" project="Launch film" when="25m" />
          <MiniRow title="Stuck threads land in Needs you" project="Agentbox" when="14m" />
          <MiniRow title="Show when limits reset" project="Website" when="52m" />
        </View>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: PAD, paddingTop: 22, paddingBottom: Math.max(16, inset.bottom) + 8, backgroundColor: color.pop, borderTopWidth: 1, borderTopColor: color.lineStrong, gap: 10 }}>
          {step === 1 ? <>
            <T style={{ fontFamily: font.medium, fontSize: 19, lineHeight: 24 }}>These threads are made up</T>
            <T style={{ fontSize: 15, lineHeight: 22, color: color.dim, marginBottom: 8 }}>Open one and reply to see how it works.</T>
            <Btn label="Set up with my computer" onPress={() => go(2)} />
          </> : <>
            <T style={{ fontFamily: font.medium, fontSize: 19, lineHeight: 24, marginBottom: 8 }}>Is Agentbox on your computer?</T>
            <Btn label="Yes, sign in" onPress={() => go(3)} />
            <Btn label="Not yet, send me the link" />
          </>}
        </View>
      </Wall>
    );
  }
  return <SignInScreen head="Sign in with the account your computer uses" next={() => go(4)} />;
}

/* What every option ends on. */
function Consent() {
  const rows = [
    { title: 'To your computer', detail: 'Or to Agentbox Cloud while it is off.' },
    { title: 'To the agent you pick', detail: 'Claude Code by Anthropic or Codex by OpenAI, signed in to your own account.' },
    { title: 'Nowhere else', detail: 'Agentbox sends your messages to no one else.' },
  ];
  return (
    <Screen foot={<><Btn label="Continue" /><Btn quiet label="Not now" /></>}>
      <Logo />
      <Head style={{ marginTop: 36 }}>Where your messages go</Head>
      <View style={{ marginTop: 24 }}>
        {rows.map((r, i) => (
          <View key={r.title} style={{ paddingVertical: 16, borderTopWidth: i ? 1 : 0, borderTopColor: color.rowLine }}>
            <T style={{ fontSize: 16, lineHeight: 21 }}>{r.title}</T>
            <T style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 3 }}>{r.detail}</T>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function Alerts() {
  return (
    <Screen foot={<><Btn label="Turn on alerts" /><Btn quiet label="Not now" /></>}>
      <Logo />
      <Head style={{ marginTop: 36 }}>Know when you are needed</Head>
      <View style={{ marginTop: 32 }}><AlertPicture /></View>
    </Screen>
  );
}

export default function Welcome() {
  const p = useLocalSearchParams<{ option?: string; step?: string }>();
  const step = Number(p.step) || 1;
  switch (p.option) {
    case '2': return <ThreePages step={step} />;
    case '3': return <Checklist step={step} />;
    case '4': return <Pair step={step} />;
    case '5': return <TryFirst step={step} />;
    case 'consent': return <Consent />;
    case 'alerts': return <Alerts />;
    default: return <AskFirst step={step} />;
  }
}

export const _unused = Text;
