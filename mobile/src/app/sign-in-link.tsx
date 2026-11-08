// Email me a sign-in link, from the sign-in screen: the way in for an account
// with no password, which is most of them, made with Google on the computer.
// The email's link opens the app signed in (app/signed-in.tsx). Opened with an
// email already typed, it sends straight away, since the button said so.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { router } from '../lib/router';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { googleReturn } from '../lib/google-return';
import { useCloud } from '../state/cloud';
import { Field } from '../ui/Field';
import { Btn, Head, Lede, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color } from '../ui/theme';

const toSignIn = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));
const toNoAccount = () => router.push('/no-account');

export default function SignInLink() {
  const c = useCloud();
  const p = useLocalSearchParams<{ email?: string; said?: string }>();
  const [step, setStep] = useState<'ask' | 'sent'>('ask');
  const [email, setEmail] = useState(p.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(p.said ?? null);
  const [noAccount, setNoAccount] = useState(false);
  const send = async () => {
    if (busy || !c.cloud || !email.trim()) return;
    setBusy(true); setError(null); setNoAccount(false);
    try { await c.cloud.askSignInLink(email, googleReturn); setStep('sent'); } catch (err: any) {
      setError(String(err?.message ?? '') || 'That did not work. Try again.');
      setNoAccount(err?.code === 'no_account');
      setStep('ask');
    } finally { setBusy(false); }
  };
  const sentOnOpen = useRef(false);
  useEffect(() => {
    if (sentOnOpen.current || p.said || !p.email?.trim() || !c.cloud) return;
    sentOnOpen.current = true;
    void send();
  }, [c.cloud]);

  const foot = step === 'ask'
    ? <Btn kind="primary" label={busy ? 'Sending…' : 'Email me a link'} disabled={!email.trim() || busy} onPress={send} />
    : <Btn label={busy ? 'Sending…' : 'Send it again'} disabled={busy} onPress={send} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top={24} back={toSignIn} foot={foot}>
        <Head style={{ marginTop: 28 }}>{step === 'ask' ? 'Sign in with a link' : 'Check your email'}</Head>
        <Lede>{step === 'ask' ? 'We will email you a link that signs you in.' : `We sent a link to ${email.trim()}. Open it on this phone.`}</Lede>
        {step === 'ask' && (
          <View style={{ marginTop: 28 }}>
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" autoFocus={!email}
              returnKeyType="send" onSubmitEditing={() => { void send(); }} />
          </View>
        )}
        {error && <T accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 16 }}>{error}</T>}
        {noAccount && (
          <T style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 6 }}>
            {'New to Agentbox? '}
            <T onPress={toNoAccount} accessibilityRole="link" style={{ fontSize: 14, color: color.text, textDecorationLine: 'underline', textDecorationColor: color.lineStrong }}>Make your account on your computer</T>
          </T>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
