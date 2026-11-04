// Google goes through the account database's own page in the system's
// sign-in sheet and comes back to the app with a one-time code.
import * as WebBrowser from 'expo-web-browser';
import { googleReturn } from '../lib/google-return';
import type { Cloud } from '../state/cloud';

export async function googleSignIn(cloud: Cloud) {
  const done = await WebBrowser.openAuthSessionAsync(await cloud.googleUrl(googleReturn), googleReturn);
  if (done.type !== 'success') return null;
  const code = new URL(done.url).searchParams.get('code');
  if (!code) throw new Error('Google did not sign you in. Try again.');
  return cloud.finishGoogle(code);
}
