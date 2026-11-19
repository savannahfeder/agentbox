// Multiplayer is invite-only for now (cloud/supabase/migrations/20261119000000_multiplayer_is_invite_only.sql).
// Asking goes in as feedback with the signed-in email, the address that gets
// put on the list.
import { useState } from 'react';
import { api } from '../api';

export const NOT_LET_IN = 'Multiplayer is invite-only for now';

export const askWords = (email: string | null | undefined) => `Please let my team into multiplayer. My email is ${email ?? 'unknown'}.`;

export function AskForMultiplayer({ email, className }: { email: string | null | undefined; className: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'asked'>('idle');
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setState('busy'); setError(null);
    const out = await api.sendFeedback({ text: askWords(email), files: [] });
    if (out.ok) setState('asked');
    else { setState('idle'); setError(out.error ?? 'The ask did not send. Try again.'); }
  };
  return <>
    <button type="button" className={className} disabled={state !== 'idle'} onClick={() => void ask()}>
      {state === 'asked' ? 'Asked' : state === 'busy' ? 'Asking' : 'Ask for an invite'}
    </button>
    {error && <span className="st-problem" role="status">{error}</span>}
  </>;
}
