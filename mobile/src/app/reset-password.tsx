// Forgot password, from the sign-in screen. The email's link opens the app
// (app/signed-in.tsx), signed in, on the last step: the new password.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { googleReturn } from '../lib/google-return';
import { useCloud } from '../state/cloud';
import { Field } from '../ui/Field';
import { Btn, Head, Lede, Screen } from '../ui/Onboarding';
import { T } from '../ui/parts';
import { color } from '../ui/theme';

const toSignIn = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));

export default function ResetPassword() {
  const c = useCloud();
  const p = useLocalSearchParams<{ email?: string; step?: string; said?: string }>();
  const [step, setStep] = useState<'ask' | 'sent' | 'new'>(p.step === 'new' ? 'new' : 'ask');
  const [email, setEmail] = useState(p.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(p.said ?? null);
  const attempt = (fn: () => Promise<void>) => async () => {
    if (busy || !c.cloud) return;
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError(String((err as Error)?.message ?? '') || 'That did not work. Try again.'); } finally { setBusy(false); }
  };
  const ask = attempt(async () => { await c.cloud!.askPasswordReset(email, googleReturn); setStep('sent'); });
  const save = attempt(async () => { await c.cloud!.setPassword(password); router.replace('/'); });
  // The new password needs the sign-in the link brought; without it, ask again.
  const at = step === 'new' && !c.signedIn ? 'ask' : step;

  const foot = at === 'ask' ? <Btn kind="primary" label={busy ? 'Sending…' : 'Email me a link'} disabled={!email.trim() || busy} onPress={ask} />
    : at === 'sent' ? <Btn label={busy ? 'Sending…' : 'Send it again'} disabled={busy} onPress={ask} />
      : <Btn kind="primary" label={busy ? 'Saving…' : 'Save password'} disabled={!password || busy} onPress={save} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top={24} back={at === 'new' ? undefined : toSignIn} foot={foot}>
        <Head style={{ marginTop: 28 }}>{at === 'ask' ? 'Reset your password' : at === 'sent' ? 'Check your email' : 'Choose a new password'}</Head>
        <Lede>{at === 'ask' ? 'We will email you a link to open on this phone.'
          : at === 'sent' ? `We sent a link to ${email.trim()}. Open it on this phone.`
            : 'You will stay signed in with it.'}</Lede>
        {at !== 'sent' && (
          <View style={{ marginTop: 28 }}>
            {at === 'ask'
              ? <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" autoFocus={!email}
                  returnKeyType="send" onSubmitEditing={() => { if (email.trim()) void ask(); }} />
              : <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" autoFocus
                  returnKeyType="done" onSubmitEditing={() => { if (password) void save(); }} />}
          </View>
        )}
        {error && <T accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, color: color.dim, marginTop: 16 }}>{error}</T>}
      </Screen>
    </KeyboardAvoidingView>
  );
}
