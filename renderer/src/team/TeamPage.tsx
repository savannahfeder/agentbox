// THE TEAM'S SETUP PAGE: where you sign in, start a team, invite people and
// see who is on it, because those are the only times the team is a thing you
// set up rather than a place you look.
//
// It used to be the Team page as well, the state of the company in one list.
// That half moved onto the Inbox (w-05ff3d1438, 2026-10-01): the Inbox and the
// Team page were one question on two pages, so the faces at the end of the
// Inbox's tab bar now pick whose threads are on it.
import { Fragment, useRef, useState } from 'react';
import type { Person, PictureIn, TeamCallResult, TeamState } from '../types';
import { shrinkPicture } from './shrink-picture';
import { api } from '../api';
import { Face } from './people';
import { handoverAsk, handoverOf } from './handover';
import { inviteWords } from './invite-words';
import { inviteEach, pastedInvites } from './invite-list';
import { AskForMultiplayer, NOT_LET_IN } from './ask-for-multiplayer';
import { StartPro } from './StartPro';
import { StartTeam } from './StartTeam';
import { PRO_FOR_INVITES, askOwnerForPro } from './multiplayer-words';


export function TeamPage({ team, inviteFocus = false }: {
  team: TeamState | null | undefined;
  /** Opened from Invite people: the email box has the cursor. */
  inviteFocus?: boolean;
}) {
  if (!team?.configured) return <div className="tm-setup"><h2>Teams are not set up in this build</h2><p>This copy of the app has no team cloud configured.</p></div>;
  if (!team.signedIn) return <SignIn error={team.error} />;
  // THE COMPANY LIST THAT STOOD HERE IS GONE (w-05ff3d1438): whose threads you
  // see is picked by the faces on the Inbox now, so this page only ever sets
  // the team up.
  return <TeamSetup team={team} inviteFocus={inviteFocus} />;
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
    <p>Your team can open and read your threads and their files, unless you mark one private. Signing in opens Google in your browser.</p>
    <div className="tm-field-row"><button className="tm-btn" disabled={busy} onClick={() => run(() => api.teamSignIn())}>{busy ? 'Waiting for Google…' : 'Sign in with Google'}</button></div>
    {(callError || error) && <p className="tm-error">{callError || error}</p>}
  </div>;
}

function TeamSetup({ team, onDone, inviteFocus = false }: { team: TeamState; onDone?: () => void; inviteFocus?: boolean }) {
  const [email, setEmail] = useState('');
  // WHO YOU INVITED, SAID BACK (2026-10-01): an invite used to empty the field
  // and show nothing else, so there was no way to tell it had worked.
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
    </> : !team.team && team.multiplayer === false ? <>
      <h2>{NOT_LET_IN}</h2>
      <div className="tm-field-row"><AskForMultiplayer email={me?.email} className="tm-btn" /></div>
      <p>Waiting for an invite from a teammate instead? Ask them to invite {me?.email}. It shows up here within a few seconds.</p>
    </> : !team.team ? <>
      {/* Pro makes and names the team, so nothing here asks for a name (tests/invite-people-with-no-team-never-asks-for-a-team-name). */}
      <StartTeam me={me} multiplayer={team.multiplayer} left title={PRO_FOR_INVITES} />
      <p>Waiting for an invite instead? Ask a teammate to invite {me?.email}. It shows up here within a few seconds.</p>
    </> : <TeamSettings team={team} me={me} inviteFocus={inviteFocus} invited={invited} setInvited={setInvited} email={email} setEmail={setEmail} busy={busy} run={run} onDone={onDone} />}
    {error && <p className="tm-error">{error}</p>}
  </div>;
}

function HandOver({ team, me, leaving, busy, onCancel, onRemove }: {
  team: TeamState; me: Person | null; leaving: Person; busy: boolean;
  onCancel: () => void; onRemove: (handover: ReturnType<typeof handoverOf>) => void;
}) {
  const ask = handoverAsk(team.people, team.teamMates, me?.id ?? null, leaving.id);
  const [to, setTo] = useState(ask.takers[0]?.id ?? '');
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const first = leaving.name.split(/\s+/)[0];
  const taker = ask.takers.find((t) => t.id === to);
  const toggle = (id: string, pause: boolean) => setPaused((was) => { const next = new Set(was); if (pause) next.add(id); else next.delete(id); return next; });
  return <div className="tm-handover" role="group" aria-label={`Remove ${leaving.name}`}>
    <div className="tm-handover-q">Who takes {first}&rsquo;s open work?</div>
    <div className="tm-choices">
      {ask.takers.map((t) => <button key={t.id} type="button" className="tm-choice" aria-pressed={to === t.id} onClick={() => setTo(t.id)}>{t.name}</button>)}
    </div>
    <p className="tm-handover-note">Tasks given to {first} and threads waiting on {first} move to {taker?.id === me?.id ? 'you' : taker?.name.split(/\s+/)[0] ?? 'them'}, each with a line saying so.</p>
    {ask.mates.map((m) => <div key={m.id} className="tm-handover-mate">
      <span>{m.name}</span>
      <div className="tm-choices">
        <button type="button" className="tm-choice" aria-pressed={!paused.has(m.id)} onClick={() => toggle(m.id, false)}>Give to {taker?.id === me?.id ? 'you' : taker?.name.split(/\s+/)[0]}</button>
        <button type="button" className="tm-choice" aria-pressed={paused.has(m.id)} onClick={() => toggle(m.id, true)}>Pause</button>
      </div>
    </div>)}
    <div className="tm-field-row">
      <button type="button" className="tm-btn" disabled={busy || !to} onClick={() => onRemove(handoverOf(to, ask.mates, paused))}>Remove {first}</button>
      <button type="button" className="tm-btn" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

/** A quiet button that opens a picture from disk, shrinks it, and hands it on. */
function PickPicture({ label, fit, busy, onPicked }: { label: string; fit: 'crop' | 'whole'; busy: boolean; onPicked: (photo: PictureIn) => unknown }) {
  const input = useRef<HTMLInputElement>(null);
  const [unreadable, setUnreadable] = useState(false);
  return <>
    <button type="button" className="tm-line-act" disabled={busy} onClick={() => input.current?.click()}>{label}</button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setUnreadable(false);
      try { onPicked(await shrinkPicture(file, { fit })); } catch { setUnreadable(true); }
    }} />
    {unreadable && <span className="tm-pic-note">That file is not a picture this can open.</span>}
  </>;
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
  const [myName, setMyName] = useState(me?.name ?? '');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Said under the box, where the eye is, rather than at the foot of the page.
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);
  const inviteEnd = useRef<HTMLDivElement>(null);
  const owner = team.people.find((p) => p.id === me?.id)?.role === 'owner';
  // You first, from the team's own list so your role comes with you.
  const mine = team.people.find((p) => p.id === me?.id) ?? me;
  const people = [mine, ...team.people.filter((p) => p.id !== me?.id)].filter((p): p is Person => !!p);
  const joined = (e: string) => team.people.some((p) => p.email?.toLowerCase() === e.toLowerCase());
  const out = [...new Set([...(team.sent ?? []).map((s) => s.email), ...invited])].filter((e) => !joined(e));
  const logo = team.team?.logoUrl ?? null;
  return <>
    {mine && <>
      <div className="tm-section">You</div>
      <div className="tm-pic-row">
        <Face person={mine} me size={40} />
        <PickPicture label="Change photo" fit="crop" busy={busy} onPicked={(photo) => run(() => api.teamUpdateMe({ photo }))} />
        {mine.avatarUrl && <button type="button" className="tm-line-act" disabled={busy} onClick={() => void run(() => api.teamUpdateMe({ photo: null }))}>Remove</button>}
      </div>
      <form className="tm-field-row" onSubmit={(e) => { e.preventDefault(); void run(() => api.teamUpdateMe({ name: myName })); }}>
        <input className="tm-input" value={myName} aria-label="Your name" maxLength={80} onChange={(e) => setMyName(e.target.value)} />
        <button className="tm-btn" disabled={busy || !myName.trim() || myName.trim() === (mine.name ?? '')}>Save</button>
      </form>
    </>}

    <div className="tm-section">Team name</div>
    {owner ? (
      <form className="tm-field-row" onSubmit={(e) => { e.preventDefault(); void run(() => api.teamRename(draft)); }}>
        <input className="tm-input" value={draft} aria-label="Team name" onChange={(e) => setDraft(e.target.value)} />
        <button className="tm-btn" disabled={busy || !draft.trim() || draft.trim() === name}>Rename</button>
      </form>
    ) : <h2>{name}</h2>}
    {owner && <>
      <div className="tm-section">Team logo</div>
      <div className="tm-pic-row">
        {logo ? <img className="tm-logo" src={logo} alt="" referrerPolicy="no-referrer" /> : <span className="th-mark tm-logo" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
        <PickPicture label={logo ? 'Change logo' : 'Upload logo'} fit="whole" busy={busy} onPicked={(photo) => run(() => api.teamSetLogo(photo))} />
        {logo && <button type="button" className="tm-line-act" disabled={busy} onClick={() => void run(() => api.teamSetLogo(null))}>Remove</button>}
      </div>
    </>}

    <div className="tm-section">People</div>
    {people.map((p) => (<Fragment key={p.id}>
      <div className="tm-person-line">
        <Face person={p} me={p.id === me?.id} />{p.id === me?.id ? 'You' : p.name}
        <small>{p.role === 'owner' ? `${p.email} · owner` : p.email}</small>
        {owner && p.id !== me?.id && removing !== p.id && (
          <button type="button" className="tm-line-act" disabled={busy} onClick={() => setRemoving(p.id)}>Remove</button>
        )}
      </div>
      {removing === p.id && <HandOver team={team} me={me} leaving={p} busy={busy}
        onCancel={() => setRemoving(null)}
        onRemove={async (handover) => { if (await run(() => api.teamRemoveMember(p.id, handover))) setRemoving(null); }} />}
    </Fragment>))}
    {out.map((e) => (
      <div key={e} className="tm-person-line tm-invited">
        <Face name={e} />{e}
        <small>Invited. They join when they sign in with this email.</small>
        <button type="button" className="tm-line-act" onClick={() => {
          // One you invited on this page is not in `sent` until the next sync.
          const by = team.sent?.find((s) => s.email === e)?.invitedBy ?? me?.id;
          const from = team.people.find((p) => p.id === by)?.name ?? null;
          void navigator.clipboard?.writeText(inviteWords({ from, team: name, email: e })).then(() => setCopied(e), () => {});
        }}>{copied === e ? 'Copied' : 'Copy invite'}</button>
        {(owner || invited.includes(e)) && (
          <button type="button" className="tm-line-act" disabled={busy} onClick={async () => { if (await run(() => api.teamCancelInvite(e))) setInvited((was) => was.filter((x) => x !== e)); }}>Cancel</button>
        )}
      </div>
    ))}

    <div className="tm-section">Invite people</div>
    {team.multiplayer === false ? <div className="tm-field-row">
      <span className="tm-leave-ask">{NOT_LET_IN}.</span>
      <AskForMultiplayer email={me?.email} className="tm-btn" />
    </div> : team.pro === false ? <div className="tm-field-row">
      {owner ? <>
        <span className="tm-leave-ask">{PRO_FOR_INVITES}</span>
        <StartPro hasTeam name={me?.name} className="tm-btn" autoFocus={inviteFocus} />
      </> : <span className="tm-leave-ask">{askOwnerForPro(team.people.find((p) => p.role === 'owner')?.name)}</span>}
    </div> : <form className="tm-field-row" onSubmit={(e) => {
      e.preventDefault();
      void run(async () => {
        const sent = await inviteEach(email, { onTeam: team.people.map((p) => p.email), invited: out }, async (one) => {
          const got = await api.teamInvite(one);
          return got.ok ? null : got.error ?? 'That did not work.';
        });
        setEmail(sent.left);
        if (sent.invited.length) setInvited((was) => [...was.filter((x) => !sent.invited.includes(x)), ...sent.invited]);
        setInviteProblem(sent.problem);
        return { ok: true };
      // The invited rows above push the box down; keep it, and what it says, in view.
      }).then(() => requestAnimationFrame(() => inviteEnd.current?.scrollIntoView({ block: 'nearest' })));
    }}>
      <input className="tm-input" placeholder="Their emails" value={email} spellCheck={false} autoFocus={inviteFocus} onChange={(e) => { setEmail(e.target.value); setInviteProblem(null); }}
        onPaste={(e) => {
          const lines = pastedInvites(e.clipboardData.getData('text'));
          if (lines == null) return;
          e.preventDefault();
          const box = e.currentTarget;
          const at = box.selectionStart ?? email.length;
          setEmail(email.slice(0, at) + lines + email.slice(box.selectionEnd ?? at));
        }} />
      <button className="tm-btn" disabled={busy || !email.trim()}>Invite</button>
    </form>}
    {inviteProblem && <p className="tm-invite-problem">{inviteProblem}</p>}
    <div ref={inviteEnd} />

    <div className="tm-section">Leave</div>
    {confirmLeave ? (
      <div className="tm-field-row">
        <span className="tm-leave-ask">Leave {name}? Your threads stay on this computer; the team stops seeing them.</span>
        <button type="button" className="tm-btn" disabled={busy} onClick={() => void run(() => api.teamLeave())}>Leave</button>
        <button type="button" className="tm-btn" onClick={() => setConfirmLeave(false)}>Stay</button>
      </div>
    ) : (
      <div className="tm-field-row"><button type="button" className="tm-btn" onClick={() => setConfirmLeave(true)}>Leave {name}</button></div>
    )}
    {onDone && <div className="tm-field-row" style={{ marginTop: 22 }}><button className="tm-btn" onClick={onDone}>Done</button></div>}
  </>;
}

