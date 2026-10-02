// THE TEAM'S SETUP PAGE: where you sign in, start a team, invite people and
// see who is on it, because those are the only times the team is a thing you
// set up rather than a place you look.
//
// It used to be the Team page as well, the state of the company in one list.
// That half moved onto the Inbox (w-05ff3d1438, 2026-10-01): the Inbox and the
// Team page were one question on two pages, so the faces at the end of the
// Inbox's tab bar now pick whose threads are on it.
import { useState } from 'react';
import type { Person, Product, TeamCallResult, TeamState } from '../types';
import { api } from '../api';
import { Face } from './people';


export function TeamPage({ team, products, inviteFocus = false }: {
  team: TeamState | null | undefined; products: Product[];
  /** Opened from Invite people: the email box has the cursor. */
  inviteFocus?: boolean;
}) {
  if (!team?.configured) return <div className="tm-setup"><h2>Teams are not set up in this build</h2><p>This copy of the app has no team cloud configured.</p></div>;
  if (!team.signedIn) return <SignIn error={team.error} />;
  // THE COMPANY LIST THAT STOOD HERE IS GONE (w-05ff3d1438): whose threads you
  // see is picked by the faces on the Inbox now, so this page only ever sets
  // the team up.
  return <TeamSetup team={team} products={products} inviteFocus={inviteFocus} />;
}

function useCall() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<TeamCallResult>) => {
    setBusy(true); setError(null);
    const out = await fn();
    setBusy(false);
    if (!out.ok) setError(out.error ?? 'That did not work.');
    return out.ok;
  };
  return { busy, error, run };
}

function SignIn({ error }: { error: string | null }) {
  const { busy, error: callError, run } = useCall();
  return <div className="tm-setup">
    <h2>Sign in to see your team</h2>
    <p>Your team sees a short summary of each of your threads, unless you mark one private. Signing in opens Google in your browser.</p>
    <div className="tm-field-row"><button className="tm-btn" disabled={busy} onClick={() => run(() => api.teamSignIn())}>{busy ? 'Waiting for Google…' : 'Sign in with Google'}</button></div>
    {(callError || error) && <p className="tm-error">{callError || error}</p>}
  </div>;
}

function TeamSetup({ team, products, onDone, inviteFocus = false }: { team: TeamState; products: Product[]; onDone?: () => void; inviteFocus?: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // WHO YOU INVITED, SAID BACK (persona test, 2026-10-01: "The field emptied,
  // with no toast, no pending row... I can't tell if it worked").
  const [invited, setInvited] = useState<string[]>([]);
  // AN INVITE IS ASKED, NEVER TAKEN UP ON ITS OWN (review, 2026-10-01). Not
  // now hides it until the page is opened again.
  const [notNow, setNotNow] = useState<string[]>([]);
  const { busy, error, run } = useCall();
  const me = team.me;
  const invite = (team.invites ?? []).find((i) => !notNow.includes(i.teamId));
  return <div className="tm-setup">
    <div className="tm-signed">{me && <Face person={me} me />}<span>Signed in as {me?.email}</span><button className="tm-btn" disabled={busy} onClick={() => run(() => api.teamSignOut())}>Sign out</button></div>
    {!team.team && invite ? <>
      <h2>{invite.invitedByName ? `${invite.invitedByName.split(/\s+/)[0]} invited you to ${invite.teamName}.` : `You are invited to ${invite.teamName}.`} Join?</h2>
      <div className="tm-field-row">
        <button className="tm-btn" disabled={busy} onClick={() => run(() => api.teamAcceptInvite(invite.teamId))}>Join</button>
        <button className="tm-btn" disabled={busy} onClick={() => setNotNow([...notNow, invite.teamId])}>Not now</button>
      </div>
    </> : !team.team ? <>
      <h2>Start your team</h2>
      <p>Name it, then invite people by email. Anyone you invite is asked to join when they sign in with that email.</p>
      <form className="tm-field-row" onSubmit={(e) => { e.preventDefault(); void run(() => api.teamCreate(name)); }}>
        <input className="tm-input" placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="tm-btn" disabled={busy || !name.trim()}>Start team</button>
      </form>
      <p>Waiting for an invite instead? Ask a teammate to invite {me?.email}. It shows up here within a few seconds.</p>
    </> : <TeamSettings team={team} me={me} inviteFocus={inviteFocus} invited={invited} setInvited={setInvited} email={email} setEmail={setEmail} busy={busy} run={run} onDone={onDone} />}
    {error && <p className="tm-error">{error}</p>}
  </div>;
}

/** TEAM SETTINGS (2026-10-01): an invite page and team settings beside it.
 *  The team's name, its people, the invites still
 *  out, and leaving. The owner renames, removes and cancels; anyone leaves.
 *  The database is what enforces it; this only hides what would be refused. */
function TeamSettings({ team, me, inviteFocus, invited, setInvited, email, setEmail, busy, run, onDone }: {
  team: TeamState; me: Person | null; inviteFocus: boolean; invited: string[]; setInvited: (f: (was: string[]) => string[]) => void;
  email: string; setEmail: (v: string) => void; busy: boolean; run: (fn: () => Promise<TeamCallResult>) => Promise<boolean>; onDone?: () => void;
}) {
  const name = team.team?.name ?? '';
  const [draft, setDraft] = useState(name);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const owner = team.people.find((p) => p.id === me?.id)?.role === 'owner';
  // You first, from the team's own list so your role comes with you.
  const mine = team.people.find((p) => p.id === me?.id) ?? me;
  const people = [mine, ...team.people.filter((p) => p.id !== me?.id)].filter((p): p is Person => !!p);
  const joined = (e: string) => team.people.some((p) => p.email?.toLowerCase() === e.toLowerCase());
  const out = [...new Set([...(team.sent ?? []).map((s) => s.email), ...invited])].filter((e) => !joined(e));
  return <>
    <div className="tm-section">Team name</div>
    {owner ? (
      <form className="tm-field-row" onSubmit={(e) => { e.preventDefault(); void run(() => api.teamRename(draft)); }}>
        <input className="tm-input" value={draft} aria-label="Team name" onChange={(e) => setDraft(e.target.value)} />
        <button className="tm-btn" disabled={busy || !draft.trim() || draft.trim() === name}>Rename</button>
      </form>
    ) : <h2>{name}</h2>}

    <div className="tm-section">People</div>
    {people.map((p) => (
      <div key={p.id} className="tm-person-line">
        <Face person={p} me={p.id === me?.id} />{p.id === me?.id ? 'You' : p.name}
        <small>{p.role === 'owner' ? `${p.email} · owner` : p.email}</small>
        {owner && p.id !== me?.id && (
          <button type="button" className="tm-line-act" disabled={busy} onClick={() => void run(() => api.teamRemoveMember(p.id))}>Remove</button>
        )}
      </div>
    ))}
    {out.map((e) => (
      <div key={e} className="tm-person-line tm-invited">
        <span className="tm-av tm-av-empty" aria-hidden="true" />{e}
        <small>Invited. They join when they sign in with this email.</small>
        {(owner || invited.includes(e)) && (
          <button type="button" className="tm-line-act" disabled={busy} onClick={async () => { if (await run(() => api.teamCancelInvite(e))) setInvited((was) => was.filter((x) => x !== e)); }}>Cancel</button>
        )}
      </div>
    ))}

    <div className="tm-section">Invite people</div>
    <form className="tm-field-row" onSubmit={async (e) => { e.preventDefault(); const sent = email.trim(); if (await run(() => api.teamInvite(sent))) { setEmail(''); setInvited((was) => [...was.filter((x) => x !== sent), sent]); } }}>
      <input className="tm-input" placeholder="Their email" value={email} autoFocus={inviteFocus} onChange={(e) => setEmail(e.target.value)} />
      <button className="tm-btn" disabled={busy || !email.trim()}>Invite</button>
    </form>

    <div className="tm-section">Leave</div>
    {confirmLeave ? (
      <div className="tm-field-row">
        <span className="tm-leave-ask">Leave {name}? Your threads stay on this Mac; the team stops seeing them.</span>
        <button type="button" className="tm-btn" disabled={busy} onClick={() => void run(() => api.teamLeave())}>Leave</button>
        <button type="button" className="tm-btn" onClick={() => setConfirmLeave(false)}>Stay</button>
      </div>
    ) : (
      <div className="tm-field-row"><button type="button" className="tm-btn" onClick={() => setConfirmLeave(true)}>Leave {name}</button></div>
    )}
    {onDone && <div className="tm-field-row" style={{ marginTop: 22 }}><button className="tm-btn" onClick={onDone}>Done</button></div>}
  </>;
}

