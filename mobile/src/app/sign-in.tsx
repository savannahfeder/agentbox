// Sign in, the first screen and the first of the four steps. Nearly everyone
// has an account from the computer already, so it opens on email and password,
// with Google under them on Android and an emailed sign-in link on the iPhone,
// for the accounts Google made, which have no password. Accounts are made on the computer: Sign
// up, and a sign-in that fails, point there. Only ways the computer also signs
// in with, so no account made here is one the computer cannot open.
import { Redirect } from 'expo-router';
import { router } from '../lib/router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { googleSignIn } from '../platform/sign-in';
import { useCloud } from '../state/cloud';
import { AppMark, GoogleMark } from '../ui/icons';
import { Field } from '../ui/Field';
import { Bars, Btn, Head, Label, Lede, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color, font } from '../ui/theme';

const toNoAccount = () => router.push('/no-account');
// On an iPhone, Google would need a second sign-in that hides your email
// beside it (App Review 4.8); its own accounts alone need none.
const GOOGLE = Platform.OS === 'android';

export default function SignIn() {
  const c = useCloud();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An email sign-in that failed may be someone with no account yet.
  const [failed, setFailed] = useState(false);
  if (c.signedIn) return <Redirect href="/" />;

  const run = (which: string, how: () => Promise<unknown>) => async () => {
    if (!c.cloud) return;
    setBusy(which); setError(null); setFailed(false);
    try { await c.signedInWith(how); } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      setError(String(err?.message ?? '') || 'That did not work. Try again.');
      setFailed(which === 'email');
    } finally { setBusy(null); }
  };
  const canSubmit = !!email.trim() && !!password && !busy && !!c.cloud;
  const signIn = run('email', () => c.cloud!.signInWithPassword(email.trim(), password));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top={24} foot={<>
        <Btn kind="primary" label={busy === 'email' ? 'Signing in…' : 'Sign in'} disabled={!canSubmit} onPress={signIn} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
          <Label>or</Label>
          <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
        </View>
        {GOOGLE
          ? <Btn label={busy === 'google' ? 'Signing in…' : 'Continue with Google'} lead={<GoogleMark />} disabled={!!busy} onPress={run('google', () => googleSignIn(c.cloud!))} />
          : <Btn label="Email me a sign-in link" disabled={!!busy} onPress={() => router.push({ pathname: '/sign-in-link', params: { email: email.trim() } })} />}
        <T style={{ fontSize: 14, lineHeight: 20, color: color.faint, textAlign: 'center', marginTop: 6 }}>
          {'No account? '}
          <T onPress={toNoAccount} accessibilityRole="link" style={{ fontSize: 14, color: color.text, textDecorationLine: 'underline', textDecorationColor: color.lineStrong }}>Sign up</T>
        </T>
      </>}>
        <Bars at="account" />
        <AppMark size={36} />
        <Head style={{ marginTop: 28 }}>Sign in</Head>
        <Lede>Use the account from Agentbox on your computer.</Lede>
        {!c.cloud && !c.preview && <Lede>This build was made without the cloud's address, so it cannot sign in.</Lede>}
        <View style={{ gap: 16, marginTop: 28 }}>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="password"
            returnKeyType="go" onSubmitEditing={() => { if (canSubmit) void signIn(); }} />
        </View>
        <T onPress={() => router.push({ pathname: '/reset-password', params: { email: email.trim() } })} accessibilityRole="link" suppressHighlighting
          style={{ alignSelf: 'flex-end', fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 12, paddingVertical: 4 }}>Forgot password?</T>
        {error && <T accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 16 }}>{error}</T>}
        {failed && (
          <T style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 6 }}>
            {'New to Agentbox? '}
            <T onPress={toNoAccount} accessibilityRole="link" style={{ fontSize: 14, color: color.text, textDecorationLine: 'underline', textDecorationColor: color.lineStrong }}>Make your account on your computer</T>
          </T>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
