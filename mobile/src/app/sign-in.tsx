// Sign in, the first of the first run's four steps. Accounts are made on the
// computer, so this signs in and never makes one. Sign in with Apple sits
// beside Google on an iPhone (guideline 4.8).
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { appleAvailable, appleSignIn, googleSignIn } from '../platform/sign-in';
import { useCloud } from '../state/cloud';
import { AppleMark, AppMark, GoogleMark } from '../ui/icons';
import { Bars, Btn, CORNER, Head, Label, Lede, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color, font } from '../ui/theme';

function Field({ label, secureTextEntry, ...rest }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Label style={{ marginLeft: 2 }}>{label}</Label>
      <View style={{ justifyContent: 'center' }}>
        <TextInput placeholderTextColor={color.faint} autoCapitalize="none" autoCorrect={false} {...rest} secureTextEntry={secureTextEntry && !shown}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[{ height: 48, paddingLeft: 14, paddingRight: secureTextEntry ? 64 : 14, borderRadius: CORNER.small, borderWidth: 1, borderColor: focused ? color.accent : color.lineStrong, backgroundColor: color.field, fontFamily: font.regular, fontSize: 16, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
        {secureTextEntry && (
          <Pressable onPress={() => setShown(!shown)} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={6}
            style={{ position: 'absolute', right: 0, height: 48, paddingHorizontal: 14, justifyContent: 'center' }}>
            <T style={{ fontSize: 14, color: color.dim }}>{shown ? 'Hide' : 'Show'}</T>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function SignIn() {
  const c = useCloud();
  const [apple, setApple] = useState(false);
  const [byEmail, setByEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void appleAvailable().then(setApple); }, []);
  if (c.signedIn) return <Redirect href="/" />;

  const run = (which: string, how: () => Promise<unknown>) => async () => {
    if (!c.cloud) return;
    setBusy(which); setError(null);
    try { await c.signedInWith(how); } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') setError(String(err?.message ?? '') || 'That did not work. Try again.');
    } finally { setBusy(null); }
  };
  const canSubmit = !!email.trim() && !!password && !busy && !!c.cloud;
  const back = () => (byEmail ? setByEmail(false) : router.canGoBack() ? router.back() : router.replace('/welcome'));

  const foot = byEmail ? (
    <Btn kind="primary" label={busy === 'email' ? 'Signing in…' : 'Sign in'} disabled={!canSubmit}
      onPress={run('email', () => c.cloud!.signInWithPassword(email.trim(), password))} />
  ) : (
    <>
      {(apple || c.preview) && <Btn label={busy === 'apple' ? 'Signing in…' : 'Continue with Apple'} lead={<AppleMark />} disabled={!!busy} onPress={run('apple', () => appleSignIn(c.cloud!))} />}
      <Btn label={busy === 'google' ? 'Signing in…' : 'Continue with Google'} lead={<GoogleMark />} disabled={!!busy} onPress={run('google', () => googleSignIn(c.cloud!))} />
      <Btn kind="quiet" label="Continue with email" onPress={() => { setByEmail(true); setError(null); }} />
      <T style={{ fontSize: 13.5, lineHeight: 19, color: color.faint, textAlign: 'center', marginTop: 4 }}>No account yet? Make one in Agentbox on your computer.</T>
    </>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top={64} back={back} foot={foot}>
        <Bars at="account" />
        <AppMark size={36} />
        <Head style={{ marginTop: 28 }}>Sign in</Head>
        <Lede>Use the account you made in Agentbox on your computer.</Lede>
        {!c.cloud && !c.preview && <Lede>This build was made without the cloud's address, so it cannot sign in.</Lede>}
        {byEmail && (
          <View style={{ gap: 16, marginTop: 28 }}>
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" autoFocus />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="password" />
          </View>
        )}
        {error && <T accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 18 }}>{error}</T>}
      </Screen>
    </KeyboardAvoidingView>
  );
}
