// Reached from Sign up, or from a sign-in that failed. Accounts are made on the
// computer, where the agents run, so this sends you there.
import { router } from 'expo-router';
import { Share } from 'react-native';
import { Btn, Card, CardRow, Devices, Head, Lede, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color, font } from '../ui/theme';

const DOWNLOAD = 'https://agentbox.ac/download';
const sendLink = () => { void Share.share({ message: DOWNLOAD, url: DOWNLOAD }).catch(() => {}); };
const back = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));

export default function NoAccount() {
  return (
    <Screen back={back} foot={<><Btn kind="primary" label="Send me the link" onPress={sendLink} /><Btn kind="quiet" label="Back to sign in" onPress={back} /></>}>
      <Devices state="computer" />
      <Head style={{ marginTop: 28 }}>{'Make your account\non your computer'}</Head>
      <Lede>Download Agentbox there and sign up. Then sign in here with the same account.</Lede>
      <Card style={{ marginTop: 26 }}>
        <CardRow first onPress={sendLink}>
          <T style={{ flex: 1, fontFamily: font.mono, fontSize: 14.5 }}>agentbox.ac/download</T>
          <T style={{ fontSize: 14.5, color: color.dim }}>Share</T>
        </CardRow>
      </Card>
    </Screen>
  );
}
