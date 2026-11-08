// Where the app's own return address lands. Google's sign-in sheet takes its
// return itself; a reset email's link is opened from the mail app, so it is
// taken here, and only when this phone asked for a reset.
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
  const ours = !!cloud && cloud.resetAsked() && (!!code || !!failed);

  useEffect(() => {
    if (!c.opened || taking) return;
    if (!ours) { if (router.canGoBack()) router.back(); else router.replace('/'); return; }
    setTaking(true);
    const again = (said: string) => router.replace({ pathname: '/reset-password', params: { said } });
    if (!code) { again(failed || 'That link did not work. Ask for a new one.'); return; }
    c.signedInWith(() => cloud!.finishReset(code)).then(
      () => router.replace({ pathname: '/reset-password', params: { step: 'new' } }),
      (err) => again(String(err?.message ?? '') || 'That link did not work. Ask for a new one.'),
    );
  }, [c.opened, ours, taking]);

  return <Wall><Waiting /></Wall>;
}
