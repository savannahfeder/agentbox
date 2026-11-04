// The first screen on a phone nobody has signed in to. The phone follows a
// computer, so it asks about the computer first; someone without Agentbox
// there is sent to set it up and make their account on it.
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { useCloud } from '../state/cloud';
import { Chevron } from '../ui/icons';
import { Btn, Card, CardRow, Devices, Head, Label, Lede, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color, font } from '../ui/theme';

const DOWNLOAD = 'https://agentbox.ac/download';

function Choice({ title, detail, first, onPress }: { title: string; detail: string; first?: boolean; onPress: () => void }) {
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

const sendLink = () => { void Share.share({ message: DOWNLOAD, url: DOWNLOAD }).catch(() => {}); };

export default function Welcome() {
  const c = useCloud();
  const [notYet, setNotYet] = useState(false);
  if (c.signedIn) return <Redirect href="/" />;
  const signIn = () => router.push('/sign-in');

  if (notYet) {
    return (
      <Screen back={() => setNotYet(false)} foot={<><Btn kind="primary" label="Send me the link" onPress={sendLink} /><Btn kind="quiet" label="I have an account" onPress={signIn} /></>}>
        <Devices state="computer" />
        <Head style={{ marginTop: 28 }}>Start on your computer</Head>
        <Lede>Download Agentbox there and make your account. Then sign in here with it.</Lede>
        <Card style={{ marginTop: 26 }}>
          <CardRow first onPress={sendLink}>
            <T style={{ flex: 1, fontFamily: font.mono, fontSize: 14.5 }}>agentbox.ac/download</T>
            <T style={{ fontSize: 14.5, color: color.dim }}>Share</T>
          </CardRow>
        </Card>
      </Screen>
    );
  }
  return (
    <Screen>
      <Devices state="connected" />
      <Head style={{ marginTop: 28 }}>Reply to your agents from your phone</Head>
      <Label style={{ marginTop: 34, marginBottom: 10, marginLeft: 2 }}>Is Agentbox on your computer?</Label>
      <Card>
        <Choice first title="Yes, it is set up" detail="Sign in with the same account" onPress={signIn} />
        <Choice title="Not yet" detail="Start there, then come back" onPress={() => setNotYet(true)} />
      </Card>
    </Screen>
  );
}
