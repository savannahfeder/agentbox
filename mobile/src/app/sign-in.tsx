// Sign in, as the phone site draws it (renderer/src/team/SignInPage.tsx), with
// Sign in with Apple beside Google on an iPhone (guideline 4.8) in the same
// button, which Apple's guidelines allow for a custom one.
import Constants from 'expo-constants';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Name } from '../../../shared/product-name.mjs';
import { appleAvailable, appleSignIn, googleSignIn } from '../platform/sign-in';
import { useCloud } from '../state/cloud';
import { AppleMark, AppMark, GoogleMark } from '../ui/icons';
import { T, Wall } from '../ui/parts';
import { color, font } from '../ui/theme';

// Where a new account's email link lands: the phone website, which signs you in there.
const phoneSite: string | undefined = Constants.expoConfig?.extra?.cloud?.phoneSite ?? undefined;

type Mode = 'sign-in' | 'sign-up' | 'check-email';
const smallCaps = { fontFamily: font.mono, fontSize: 10.5, letterSpacing: 0.84, textTransform: 'uppercase' as const, get color() { return color.faint; } };

function Field({ label, secureTextEntry, ...rest }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  // A password can be shown, as the web app's sign-in offers (team/SignInPage.tsx).
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T style={smallCaps}>{label}</T>
      <View style={{ justifyContent: 'center' }}>
        <TextInput placeholderTextColor={color.faint} autoCapitalize="none" autoCorrect={false} {...rest} secureTextEntry={secureTextEntry && !shown}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[{ height: 38, paddingLeft: 11, paddingRight: secureTextEntry ? 60 : 11, borderWidth: 1, borderColor: focused ? color.accent : color.lineStrong, backgroundColor: color.field, fontFamily: font.regular, fontSize: 14, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
        {secureTextEntry && (
          <Pressable onPress={() => setShown(!shown)} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={6}
            style={{ position: 'absolute', right: 0, height: 38, paddingHorizontal: 11, justifyContent: 'center' }}>
            <T style={{ fontSize: 12.5, color: color.dim }}>{shown ? 'Hide' : 'Show'}</T>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Provider({ mark, label, onPress, disabled }: { mark: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.fill : 'transparent', opacity: disabled ? 0.5 : 1 })}>
      {mark}
      <T style={{ fontSize: 14 }}>{label}</T>
    </Pressable>
  );
}

export default function SignIn() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const [apple, setApple] = useState(false);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
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
  const signUp = async () => {
    const out = await c.cloud!.signUp(name.trim(), email.trim(), password, phoneSite);
    if (out.confirm) { setMode('check-email'); return null; }
    return out;
  };
  const heading = mode === 'sign-up' ? 'Create your account' : mode === 'check-email' ? 'Check your email' : `Sign in to ${Name}`;
  const lede = mode === 'check-email' ? `We sent a link to ${email}. Follow it to confirm your address, then sign in here.`
    : mode === 'sign-up' ? 'Your teammates will see this name beside your threads and messages.'
      : 'Use the account your computer is signed in with. Your threads are here even when it is closed.';
  const canSubmit = !!email.trim() && !!password && (mode !== 'sign-up' || !!name.trim()) && !busy && !!c.cloud;

  return (
    <Wall>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: inset.top + 40, paddingBottom: inset.bottom + 22 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: color.card, borderWidth: 1, borderColor: color.lineStrong, paddingTop: 30, paddingHorizontal: 22, paddingBottom: 22 }}>
            <View style={{ marginBottom: 20 }} accessible accessibilityRole="image" accessibilityLabel={Name}><AppMark size={28} /></View>
            <T style={{ fontFamily: font.medium, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, marginBottom: 8 }}>{heading}</T>
            <T style={{ fontSize: 13.5, lineHeight: 20, color: color.dim, marginBottom: 24 }}>{lede}</T>
            {!c.cloud && !c.preview && <T style={{ fontSize: 13, color: color.dim, marginBottom: 16 }}>This build was made without the cloud's address, so it cannot sign in.</T>}
            {mode === 'check-email' ? (
              <Pressable onPress={() => { setMode('sign-in'); setPassword(''); }} style={{ height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent }}>
                <T style={{ fontSize: 14, fontFamily: font.medium, color: color.bg }}>Back to sign in</T>
              </Pressable>
            ) : (
              <>
                <View style={{ gap: 10 }}>
                  {(apple || c.preview) && <Provider mark={<AppleMark />} label={busy === 'apple' ? 'Signing in…' : 'Continue with Apple'} disabled={!!busy} onPress={run('apple', () => appleSignIn(c.cloud!))} />}
                  <Provider mark={<GoogleMark />} label={busy === 'google' ? 'Signing in…' : 'Continue with Google'} disabled={!!busy} onPress={run('google', () => googleSignIn(c.cloud!))} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
                  <T style={smallCaps}>or</T>
                  <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
                </View>
                <View style={{ gap: 14 }}>
                  {mode === 'sign-up' && <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" autoComplete="name" />}
                  <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" />
                  <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType={mode === 'sign-up' ? 'newPassword' : 'password'} autoComplete={mode === 'sign-up' ? 'new-password' : 'password'} />
                </View>
                <Pressable disabled={!canSubmit} accessibilityRole="button"
                  onPress={mode === 'sign-up' ? run('email', signUp) : run('email', () => c.cloud!.signInWithPassword(email.trim(), password))}
                  style={({ pressed }) => ({ height: 40, marginTop: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1 })}>
                  <T style={{ fontSize: 14, fontFamily: font.medium, color: color.bg }}>
                    {busy === 'email' ? (mode === 'sign-up' ? 'Creating…' : 'Signing in…') : mode === 'sign-up' ? 'Create account' : 'Sign in'}
                  </T>
                </Pressable>
              </>
            )}
            {error && <T style={{ fontSize: 13, lineHeight: 19, color: color.dim, marginTop: 14 }} accessibilityRole="alert">{error}</T>}
            {mode !== 'check-email' && (
              <T style={{ fontSize: 13, color: color.faint, marginTop: 20 }}>
                {mode === 'sign-in' ? 'New here? ' : 'Have an account? '}
                <T onPress={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null); }}
                  style={{ fontSize: 13, color: color.text, textDecorationLine: 'underline', textDecorationColor: color.lineStrong }}>
                  {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
                </T>
              </T>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Wall>
  );
}
