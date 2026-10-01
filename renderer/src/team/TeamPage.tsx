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
import { isShared, heldByAPerson, runnerOf } from '../../../shared/team-rules.mjs';
import { Face, LockIcon, firstName } from './people';

type State = 'run' | 'wait' | 'sched';
type Line = {
  key: string;
  item: WorkItem | null;
  title: string | null;
  mine: boolean;
  project: string;
  owner: string | null;
  state: State;
  stateText: string;
  movedAt: number;
};
type Tab = 'open' | 'run' | 'wait' | 'sched' | 'done';

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

function stateOf(item: WorkItem, now: number): State {
  if (item.status === 'claimed' && item.claim && !item.claimExpired) return 'run';
  if (item.runAt && item.runAt > now) return 'sched';
  return 'wait';
}

export function companyLines(items: WorkItem[], products: Product[], team: TeamState, now: number): { open: Line[]; doneToday: Line[] } {
  const me = team.me?.id ?? null;
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const name = (id: string | null | undefined) => (id === me ? 'you' : firstName(team.people.find((p) => p.id === id)));
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const open: Line[] = [];
  const doneToday: Line[] = [];
  for (const item of items) {
    if (item.agent) continue;
    const product = bySlug.get(item.product);
    const shared = isShared(product);
    // A private project's rows are yours: they are on this Mac only.
    if (!shared && !product) continue;
    const owner = shared ? (heldByAPerson(item) ? item.assignee! : runnerOf(item, product)) : me;
    const state = stateOf(item, now);
    const line: Line = {
      key: `${item.product}/${item.id}`, item, title: item.label || item.title, mine: !shared,
      project: product?.name ?? item.productName, owner, state,
      stateText: state === 'run' ? 'Running'
        : state === 'sched' ? `Starts ${new Date(item.runAt!).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
          : `Waiting on ${name(owner)}`,
      movedAt: item.updatedAt,
    };
    if (item.status === 'done') { if (item.updatedAt >= startOfDay.getTime()) doneToday.push(line); continue; }
    open.push(line);
  }
  // Teammates' private work: who and what state, nothing else.
  for (const a of team.activity) {
    if (a.personId === me || a.state === 'done') continue;
    open.push({
      key: `private/${a.personId}/${a.taskKey}`, item: null, title: null, mine: false, project: '', owner: a.personId,
      state: a.state === 'run' ? 'run' : a.state === 'sched' ? 'sched' : 'wait',
      stateText: a.state === 'run' ? 'Running' : a.state === 'sched' ? 'Scheduled' : `Waiting on ${name(a.personId)}`,
      movedAt: a.movedAt,
    });
  }
  const newest = (a: Line, b: Line) => b.movedAt - a.movedAt;
  return { open: open.sort(newest), doneToday: doneToday.sort(newest) };
}

export function TeamPage({ team, products, items, now, onOpen }: {
  team: TeamState | null | undefined; products: Product[]; items: WorkItem[]; now: number; onOpen: (item: WorkItem) => void;
}) {
  const [tab, setTab] = useState<Tab>('open');
  const [who, setWho] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const lines = useMemo(() => (team?.signedIn && team.team ? companyLines(items, products, team, now) : { open: [], doneToday: [] }), [items, products, team, now]);

  if (!team?.configured) return <div className="tm-setup"><h2>Teams are not set up in this build</h2><p>This copy of the app has no team cloud configured.</p></div>;
  if (!team.signedIn) return <SignIn error={team.error} />;
  if (!team.team || setup) return <TeamSetup team={team} products={products} onDone={team.team ? () => setSetup(false) : undefined} />;

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
    <p>Your projects stay private until you share one. Signing in opens Google in your browser.</p>
    <div className="tm-field-row"><button className="tm-btn" disabled={busy} onClick={() => run(() => api.teamSignIn())}>{busy ? 'Waiting for Google…' : 'Sign in with Google'}</button></div>
    {(callError || error) && <p className="tm-error">{callError || error}</p>}
  </div>;
}

function TeamSetup({ team, products, onDone }: { team: TeamState; products: Product[]; onDone?: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const { busy, error, run } = useCall();
  const me = team.me;
  return <div className="tm-setup">
    <div className="tm-signed">{me && <Face person={me} me />}<span>Signed in as {me?.email}</span><button className="tm-btn" disabled={busy} onClick={() => run(() => api.teamSignOut())}>Sign out</button></div>
    {!team.team ? <>
      <h2>Start your team</h2>
      <p>Name it, then invite people by email. Anyone you invite joins when they sign in with that email.</p>
      <form className="tm-field-row" onSubmit={(e) => { e.preventDefault(); void run(() => api.teamCreate(name)); }}>
        <input className="tm-input" placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="tm-btn" disabled={busy || !name.trim()}>Start team</button>
      </form>
      <p>Waiting for an invite instead? Ask a teammate to invite {me?.email}, then sign out and in again.</p>
    </> : <>
      <h2>{team.team.name}</h2>
      <div className="tm-section">People</div>
      {[me, ...team.people.filter((p) => p.id !== me?.id)].map((p) => p && <div key={p.id} className="tm-person-line"><Face person={p} me={p.id === me?.id} />{p.id === me?.id ? 'You' : p.name}<small>{p.email}</small></div>)}
      <form className="tm-field-row" style={{ marginTop: 10 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.teamInvite(email))) setEmail(''); }}>
        <input className="tm-input" placeholder="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="tm-btn" disabled={busy || !email.trim()}>Invite</button>
      </form>
      <div className="tm-section">Projects</div>
      <p>A private project never leaves this Mac. A shared one appears on your teammates' Macs, and its tasks reach whoever has to act.</p>
      {products.filter((p) => !p.practice).map((p) => <ProjectLine key={p.slug} product={p} team={team} busy={busy} run={run} />)}
      {onDone && <div className="tm-field-row" style={{ marginTop: 22 }}><button className="tm-btn" onClick={onDone}>Done</button></div>}
    </>}
    {error && <p className="tm-error">{error}</p>}
  </div>;
}

function ProjectLine({ product, team, busy, run }: { product: Product; team: TeamState; busy: boolean; run: (fn: () => Promise<TeamCallResult>) => Promise<boolean> }) {
  const shared = isShared(product);
  const visibility = shared ? product.team!.visibility : 'private';
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState<string[]>(product.team?.people ?? []);
  const mates = team.people.filter((p) => p.id !== team.me?.id);
  const share = (v: 'team' | 'people', who: string[] = []) => run(() => api.teamShare({ product: product.slug, visibility: v, people: who }));
  return <>
    <div className="tm-project-line">
      {!shared && <LockIcon />}{product.name}
      <div className="tm-seg">
        <button className={visibility === 'private' ? 'on' : ''} disabled={busy || shared} title={shared ? 'A shared project cannot be made private again yet.' : 'Only you'}>Private</button>
        <button className={visibility === 'team' ? 'on' : ''} disabled={busy} onClick={() => { setPicking(false); void share('team'); }}>Everyone</button>
        <button className={visibility === 'people' || picking ? 'on' : ''} disabled={busy} onClick={() => setPicking(!picking)}>Specific people</button>
      </div>
    </div>
    {picking && <div style={{ padding: '6px 0 12px 22px' }}>
      {mates.map((p) => <label key={p.id} className="tm-person-line" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={people.includes(p.id)} onChange={(e) => setPeople(e.target.checked ? [...people, p.id] : people.filter((x) => x !== p.id))} />
        <Face person={p} />{p.name}
      </label>)}
      <button className="tm-btn" disabled={busy} onClick={async () => { if (await share('people', people)) setPicking(false); }}>Share with {people.length || 'no'} {people.length === 1 ? 'person' : 'people'}</button>
    </div>}
  </>;
}
