// THE TEAM PAGE: the state of the company.
//
// Approved 2026-09-30 (w-e731ca9376): every open task in the company, one line
// each, newest movement first, NEVER grouped (there could be 200 tasks in a
// project). Tabs filter by state, a row of faces filters by person. Live work
// is shown here on purpose: this is the page you open to see what is going on.
// A teammate's private task is a blank "Private task" line (person and state,
// never title or project); your own private task shows its title, a lock and
// "Hidden from the team", so a work task left private by mistake is easy to see.
//
// It is also where you sign in, start a team, invite people and choose which
// projects are shared, because those are the only times the team is a thing
// you set up rather than a place you look.
import { useMemo, useState } from 'react';
import type { Person, Product, TeamCallResult, TeamState, WorkItem } from '../types';
import { api } from '../api';
import { isShared } from '../../../shared/team-rules.mjs';
import { Face, LockIcon, firstName } from './people';
import { companyLines, movedAgo as ago, type CompanyLine as Line } from './company';

type Tab = 'open' | 'run' | 'wait' | 'sched' | 'done';


export function TeamPage({ team, products, items, now, onOpen, forceSetup = false, inviteFocus = false }: {
  team: TeamState | null | undefined; products: Product[]; items: WorkItem[]; now: number; onOpen: (item: WorkItem) => void;
  /** Team members and Invite people, from the foot of the sidebar: the setup page, always. */
  forceSetup?: boolean;
  /** Opened from Invite people: the email box has the cursor. */
  inviteFocus?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('open');
  const [who, setWho] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const lines = useMemo(() => (team?.signedIn && team.team ? companyLines(items, products, team, now) : { open: [], doneToday: [] }), [items, products, team, now]);

  if (!team?.configured) return <div className="tm-setup"><h2>Teams are not set up in this build</h2><p>This copy of the app has no team cloud configured.</p></div>;
  if (!team.signedIn) return <SignIn error={team.error} />;
  if (!team.team || setup || forceSetup) return <TeamSetup team={team} products={products} inviteFocus={inviteFocus} onDone={team.team && !forceSetup ? () => setSetup(false) : undefined} />;

  const byPerson = (l: Line) => !who || l.owner === who;
  const open = lines.open.filter(byPerson);
  const done = lines.doneToday.filter(byPerson);
  const shown = tab === 'open' ? open : tab === 'done' ? done : open.filter((l) => l.state === tab);
  const count = (t: Tab) => (t === 'open' ? open.length : t === 'done' ? done.length : open.filter((l) => l.state === t).length);
  const everyone: (Person | null)[] = [team.me, ...team.people.filter((p) => p.id !== team.me?.id)];
  const tabs: [Tab, string][] = [['open', 'Open'], ['run', 'Running'], ['wait', 'Waiting'], ['sched', 'Scheduled'], ['done', 'Done today']];

  return <div className="tm-team-pane"><div className="list">
    <div className="tm-bar">
      <div className="tm-tabs">{tabs.map(([t, label]) => <button key={t} className={`tm-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{label}<b>{count(t)}</b></button>)}</div>
      <div className={`tm-faces${who ? ' picked' : ''}`}>
        <button className={`tm-every${who ? '' : ' on'}`} onClick={() => setWho(null)}>Everyone</button>
        {everyone.map((p) => p && <button key={p.id} className={`tm-face-btn${who === p.id ? ' on' : ''}`} title={p.id === team.me?.id ? 'You' : p.name} onClick={() => setWho(who === p.id ? null : p.id)}><Face person={p} me={p.id === team.me?.id} /></button>)}
        <button className="tm-every" style={{ marginLeft: 8 }} title="Invite people and choose which projects are shared" onClick={() => setSetup(true)}>Team</button>
      </div>
    </div>
    <div>
      <div className="row tm-head"><div className="row-main tm-grid"><div /><div>Task</div><div>Project</div><div>Person</div><div>State</div><div className="num">Moved</div></div></div>
      {shown.length === 0 && <div className="tm-empty-note">{who ? 'Nothing here for this person.' : 'Nothing here yet. Share a project from Team to see its work.'}</div>}
      {shown.map((l) => {
        const person = l.owner === team.me?.id ? team.me : team.people.find((p) => p.id === l.owner) ?? null;
        return <div key={l.key} className="row tm-row" onClick={() => l.item && onOpen(l.item)} style={{ cursor: l.item ? 'pointer' : 'default' }}>
          <div className="row-main tm-grid">
            <span className={`tm-mark tm-is-${l.state}`} />
            <div className={`tm-title${l.title === null ? ' private' : ''}`}>
              {l.title === null ? <><LockIcon />Private task</> : <>{l.mine && <LockIcon />}{l.title}{l.mine && <small>Hidden from the team</small>}</>}
            </div>
            <div className="tm-proj">{l.title === null ? '' : l.project}</div>
            <div className="tm-owner"><Face person={person} me={l.owner === team.me?.id} />{l.owner === team.me?.id ? 'You' : firstName(person)}</div>
            <div className={`tm-state tm-is-${l.state}`}>{l.stateText}</div>
            <div className="num">{ago(now - l.movedAt)}</div>
          </div>
        </div>;
      })}
    </div>
  </div></div>;
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

/** TEAM SETTINGS (2026-10-01): her words, "the invite team page and the team
 *  settings I had mentioned". The team's name, its people, the invites still
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

