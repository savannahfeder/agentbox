// The two sign-ins a phone does natively. Apple hands the app a token for the
// account database; Google goes through the database's own page in the
// system's sign-in sheet and comes back to the app with a one-time code.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { googleReturn } from '../lib/google-return';
import type { Cloud } from '../state/cloud';

export async function appleSignIn(cloud: Cloud) {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const got = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashed,
  });
  if (!got.identityToken) throw new Error('Apple did not sign you in. Try again.');
  return cloud.signInWithIdToken('apple', got.identityToken, nonce);
}

export const appleAvailable = () => AppleAuthentication.isAvailableAsync().catch(() => false);

export async function googleSignIn(cloud: Cloud) {
  const done = await WebBrowser.openAuthSessionAsync(await cloud.googleUrl(googleReturn), googleReturn);
  if (done.type !== 'success') return null;
  const code = new URL(done.url).searchParams.get('code');
  if (!code) throw new Error('Google did not sign you in. Try again.');
  return cloud.finishGoogle(code);
}
