// Where the app's own return address lands. Google's sign-in sheet takes its
// return itself; an email's link (a reset, or a sign-in link) is opened from
// the mail app, so it is taken here, and only when this phone asked for one.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { router } from '../lib/router';
import { useCloud } from '../state/cloud';
import { Waiting } from '../ui/LogoOrbit';
import { Wall } from '../ui/parts';

export default function SignedIn() {
  const c = useCloud();
  const { code, error_description: failed } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [taking, setTaking] = useState(false);
  const cloud = c.cloud;
  const link = !!cloud && cloud.linkAsked();
  const ours = !!cloud && (cloud.resetAsked() || link) && (!!code || !!failed);

  useEffect(() => {
    if (!c.opened || taking) return;
    if (!ours) { if (router.canGoBack()) router.back(); else router.replace('/'); return; }
    setTaking(true);
    const asking = link ? '/sign-in-link' : '/reset-password';
    const again = (said: string) => router.replace({ pathname: asking, params: { said } });
    if (!code) { again(failed || 'That link did not work. Ask for a new one.'); return; }
    c.signedInWith(() => (link ? cloud!.finishSignInLink(code) : cloud!.finishReset(code))).then(
      () => (link ? router.replace('/') : router.replace({ pathname: '/reset-password', params: { step: 'new' } })),
      (err) => again(String(err?.message ?? '') || 'That link did not work. Ask for a new one.'),
    );
  }, [c.opened, ours, taking]);

  return <Wall><Waiting /></Wall>;
}
