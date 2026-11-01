// THE CONNECTIONS PAGE: every tool with a real server, by what it is for, and a
// small sheet behind each. The state on a tile is the last real check, and every
// state says what to do.
import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Face, firstName, TeamContext } from '../team/people';
import { SearchIcon } from '../components/SearchIcon';
import type { ConnectionsList, ConnectionTile } from '../types';
import { checkResultLine, copyLine, copyNextLine, failureLine, offerLine, openConnections, peopleOnCard, stateLine, tilesFound, toolWords, whenLine, whoHasIt, whoReadsCopies } from './connections-shown';
import { MARKS } from './marks';
import './connections.css';

function Mark({ id, name }: { id: string; name: string }) {
  const path = MARKS[id];
  if (path) return <span className="cn-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d={path} /></svg></span>;
  return <span className="cn-mark cn-mark-letter" aria-hidden="true">{name.charAt(0)}</span>;
}

const DOT: Record<string, string> = { works: 'cn-dot-good', not_signed_in: 'cn-dot-hurt', not_allowed: 'cn-dot-hurt', nothing_to_read: 'cn-dot-quiet', down: 'cn-dot-hurt', unreachable: 'cn-dot-hurt', choose_reads: 'cn-dot-quiet' };

function People({ tile }: { tile: ConnectionTile }) {
  const team = useContext(TeamContext);
  const people = peopleOnCard(tile, team?.state.people, team?.state.me?.id);
  if (!people.length) return null;
  return <span className="cn-who" title={`${people.map((p) => p.name).join(', ')} ${people.length === 1 ? 'has' : 'have'} this`}>
    {people.slice(0, 4).map((p) => <Face key={p.id} person={p} size={22} me={p.id === team?.state.me?.id} />)}
  </span>;
}

const failedNow = (tile: ConnectionTile) => tile.state === 'works' && (tile.failures[0]?.at ?? 0) > (tile.at ?? 0);

function Tile({ tile, now, onOpen }: { tile: ConnectionTile; now: number; onOpen: () => void }) {
  const line = tile.connected ? (tile.changed.length > 0 ? `${tile.word}, tools changed` : stateLine(tile, now)) : offerLine(tile);
  const dot = failedNow(tile) ? 'cn-dot-hurt' : DOT[tile.state];
  return <button type="button" className="cn-tile" aria-label={`Open ${tile.name}`} onClick={onOpen}>
    <Mark id={tile.id} name={tile.name} />
    <span className="cn-tile-words">
      <span className="cn-tile-name">{tile.name}</span>
      <span className="cn-state">
        {dot && <span className={`cn-dot ${dot}`} aria-hidden="true" />}
        <span className="cn-state-words">{line}</span>
      </span>
      {tile.copy && <span className="cn-copy-line">{copyLine(tile.copy, now)}</span>}
    </span>
    <People tile={tile} />
  </button>;
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => <div className="cn-section">
  <h3>{title}</h3>
  {children}
</div>;

function ClientBoxes({ tile, onGo, busy }: { tile: ConnectionTile; onGo: (p: { clientId: string; clientSecret: string }) => void; busy: boolean }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  return <form className="cn-form" onSubmit={(e) => { e.preventDefault(); onGo({ clientId, clientSecret }); }}>
    <p className="cn-label">The address to give {tile.name}</p>
    <code className="cn-address" data-selectable>{tile.redirect}</code>
    <input className="cn-input" aria-label="Client ID" placeholder="Client ID" autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} />
    <input className="cn-input" aria-label="Client secret" placeholder="Client secret" type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
    <div className="cn-actions"><button type="submit" className="cn-button cn-button-main" disabled={busy || !clientId.trim() || !clientSecret.trim()}>Connect</button></div>
  </form>;
}

function KeyBox({ label, onGo, busy, go = 'Connect' }: { label: string; onGo: (key: string) => void; busy: boolean; go?: string }) {
  const [key, setKey] = useState('');
  return <form className="cn-form" onSubmit={(e) => { e.preventDefault(); onGo(key); }}>
    <input className="cn-input" aria-label={label} placeholder={label} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
    <div className="cn-actions"><button type="submit" className="cn-button cn-button-main" disabled={busy || !key.trim()}>{go}</button></div>
  </form>;
}

function ChooseReads({ tile }: { tile: ConnectionTile }) {
  const [picked, setPicked] = useState<string[]>(tile.chosen ?? []);
  const [busy, setBusy] = useState(false);
  const flip = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  return <Section title="What agents may read">
    <ul className="cn-picks">
      {(tile.offered ?? []).map((t) => <li key={t.name}><label className="cn-pick" title={t.description}>
        <input type="checkbox" checked={picked.includes(t.name)} onChange={() => flip(t.name)} />
        <span>{toolWords(t.name)}</span>
      </label></li>)}
    </ul>
    <div className="cn-actions"><button type="button" className="cn-button" disabled={busy || !picked.length} onClick={() => { setBusy(true); void api.connectionsChoose({ id: tile.id, names: picked }).finally(() => setBusy(false)); }}>Save and check</button></div>
  </Section>;
}

function CopySection({ tile, now, projects, onNotice }: { tile: ConnectionTile; now: number; projects: ConnectionsList['projects']; onNotice: (t: string) => void }) {
  const copy = tile.copy ?? null;
  const [asking, setAsking] = useState(false);
  const [project, setProject] = useState(copy?.project ?? projects[0]?.slug ?? '');
  const [channels, setChannels] = useState((copy?.channels ?? []).map((c) => `#${c}`).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = projects.find((p) => p.slug === project);
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const out = await fn();
    setBusy(false);
    if (!out.ok) setError(out.error ?? 'That did not work.');
    else setAsking(false);
  };
  if (!copy && !asking) {
    return <div className="cn-actions cn-copy-actions"><button type="button" className="cn-button" onClick={() => setAsking(true)}>Keep a copy in Files</button></div>;
  }
  return <Section title="Copy in Files">
    {copy && !asking && <>
      <p className="cn-todo">{copyLine(copy, now)}. In the {tile.name} folder of {copy.projectName}.</p>
      {copyNextLine(copy, now) && <p className="cn-when">{copyNextLine(copy, now)}</p>}
      {copy.failed.length > 0 && <ul className="cn-failures">{copy.failed.map((f) => <li key={`${f.what}${f.at}`}>{f.what ? `${f.what}. ` : ''}{f.why}</li>)}</ul>}
      <div className="cn-actions">
        <button type="button" className="cn-button" disabled={busy} onClick={() => void act(() => api.connectionsCopy({ id: tile.id, do: 'now' }))}>{busy ? 'Copying' : 'Copy now'}</button>
        <button type="button" className="cn-button cn-button-quiet" disabled={busy} onClick={() => void act(async () => { const o = await api.connectionsCopy({ id: tile.id, do: 'stop' }); if (o.ok) onNotice(`${tile.name} stops copying. Its files stay in Files.`); return o; })}>Stop copying</button>
      </div>
    </>}
    {asking && <form className="cn-form" onSubmit={(e) => { e.preventDefault(); void act(() => api.connectionsCopy({ id: tile.id, do: 'start', project, channels: channels.split(/[\s,]+/).filter(Boolean) })); }}>
      <select className="cn-input" aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
        {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
      </select>
      {tile.copyAsks === 'channels' && <input className="cn-input" aria-label="Channels" placeholder="Channels, like #launch, #support" value={channels} onChange={(e) => setChannels(e.target.value)} />}
      {chosen && <p className="cn-when">{whoReadsCopies(chosen.seenBy, chosen.name)}</p>}
      <div className="cn-actions">
        <button type="submit" className="cn-button cn-button-main" disabled={busy || !project}>{busy ? 'Copying' : 'Keep a copy'}</button>
        <button type="button" className="cn-button cn-button-quiet" onClick={() => setAsking(false)}>Cancel</button>
      </div>
    </form>}
    {error && <p className="cn-todo" role="alert">{error}</p>}
  </Section>;
}

function Sheet({ tile, now, list, onClose, onNotice }: { tile: ConnectionTile; now: number; list: ConnectionsList; onClose: () => void; onNotice: (text: string) => void }) {
  const [busy, setBusy] = useState<null | 'connect' | 'check' | 'disconnect'>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const canEncrypt = list.canEncrypt;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const connect = async (creds: { clientId?: string; clientSecret?: string; key?: string } = {}) => {
    setBusy('connect');
    setError(null);
    setFound(null);
    const out = await api.connectionsConnect({ id: tile.id, ...creds });
    setBusy(null);
    if (!out.ok) setError(out.error ?? 'That did not connect.');
    else if (out.tile) setFound(checkResultLine(out.tile, 'connect', Date.now()));
  };
  const check = async () => {
    setBusy('check');
    setError(null);
    setFound(null);
    const checked = await api.connectionsCheck({ id: tile.id });
    setBusy(null);
    if (checked) setFound(checkResultLine(checked, 'check', Date.now()));
  };
  const disconnect = async () => {
    setBusy('disconnect');
    await api.connectionsDisconnect({ id: tile.id });
    setBusy(null);
    onNotice(`${tile.name} is disconnected.`);
    if (tile.custom) onClose();
  };
  const signInAgain = tile.state === 'not_signed_in';
  const wanting = !tile.connected || signInAgain;
  const team = useContext(TeamContext);
  const others = whoHasIt(tile.id, team?.state.people).filter((p) => p.id !== team?.state.me?.id);
  const waiting = busy === 'connect' && tile.access !== 'key';
  const asksClient = wanting && tile.access === 'own_client' && !tile.hasClient;
  const asksKey = wanting && tile.access === 'key';
  const canPress = wanting && !asksClient && !asksKey && tile.access !== 'vendor_approval';

  return <div className="modal-backdrop cn-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cn-sheet" role="dialog" aria-label={tile.name}>
      <div className="cn-sheet-head">
        <Mark id={tile.id} name={tile.name} />
        <span className="cn-tile-words">
          <span className="cn-tile-name">{tile.name}</span>
          <span className="cn-state">
            {(failedNow(tile) || DOT[tile.state]) && <span className={`cn-dot ${failedNow(tile) ? 'cn-dot-hurt' : DOT[tile.state]}`} aria-hidden="true" />}
            <span>{busy === 'check' ? 'Checking' : tile.connected ? stateLine(tile, now) : offerLine(tile)}</span>
          </span>
        </span>
      </div>

      {found && <p className="cn-found" role="status">{found}</p>}
      {tile.state === 'works' && tile.read && <p className="cn-read"><span className="cn-read-label">{tile.toolCount} tools. Last read</span> {tile.read}</p>}
      {tile.todo && <p className="cn-todo">{tile.todo}</p>}
      {(!tile.connected || signInAgain) && tile.needs && <p className="cn-todo">{tile.needs}</p>}
      {whenLine(tile, now) && <p className="cn-when">{whenLine(tile, now)}</p>}
      {tile.endsAt && <p className="cn-when">Its sign-in ends at {new Date(tile.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} and {tile.name} gives no way to renew it.</p>}
      {tile.changed.length > 0 && <p className="cn-todo">
        Its tools changed since you connected: {tile.changed.join(', ')}. Agents still only get the ones listed here.{' '}
        <button type="button" className="cn-inline" onClick={() => void api.connectionsAccept({ id: tile.id })}>Got it</button>
      </p>}
      {!canEncrypt && !tile.connected && <p className="cn-todo">This computer cannot encrypt a sign-in right now, so it cannot keep one.</p>}
      {error && <p className="cn-todo" role="alert">{error}</p>}

      {asksClient && !waiting && <ClientBoxes tile={tile} busy={busy !== null || !canEncrypt} onGo={(c) => void connect(c)} />}
      {asksKey && <KeyBox label="Personal access token" busy={busy !== null || !canEncrypt} onGo={(key) => void connect({ key })} go={signInAgain ? 'Save the new token' : 'Connect'} />}

      <div className="cn-actions">
        {waiting
          ? <>
            <span className="cn-waiting">Finish in your browser.</span>
            <button type="button" className="cn-button" onClick={() => void api.connectionsCancel({ id: tile.id })}>Cancel</button>
          </>
          : <>
            {canPress && <button type="button" className="cn-button cn-button-main" disabled={!canEncrypt} onClick={() => void connect()}>{signInAgain ? 'Sign in again' : 'Connect'}</button>}
            {tile.connected && <button type="button" className="cn-button" disabled={busy !== null} onClick={() => void check()}>Check now</button>}
            {tile.connected && <button type="button" className="cn-button cn-button-quiet" disabled={busy !== null} onClick={() => { setFound(null); void disconnect(); }}>Disconnect</button>}
          </>}
      </div>

      {tile.connected && tile.copyable && (tile.state === 'works' || tile.copy) && <CopySection tile={tile} now={now} projects={list.projects} onNotice={onNotice} />}
      {!tile.connected && tile.copy && <p className="cn-when">{tile.copy.count} copied files are still in Files. They stay fresh again once this is connected.</p>}

      {tile.failures.length > 0 && <Section title="Failed reads and changes">
        <ul className="cn-failures">{tile.failures.map((f) => <li key={`${f.at}${f.tool}`}>{failureLine(f, now)}</li>)}</ul>
      </Section>}

      {tile.chooses && tile.connected
        ? <ChooseReads key={(tile.offered ?? []).length} tile={tile} />
        : <>
          {tile.reads?.length > 0 && <Section title="What agents can read">
            <ul className="cn-tools">{tile.reads.map((n) => <li key={n}>{toolWords(n)}</li>)}</ul>
          </Section>}
          {tile.writes?.length > 0 && <Section title="What needs your yes">
            <ul className="cn-tools">{tile.writes.map((n) => <li key={n}>{toolWords(n)}</li>)}</ul>
          </Section>}
          {tile.chooses === undefined && !tile.reads?.length && <p className="cn-when">Once it is connected, you choose which of its tools agents may read.</p>}
        </>}
      {others.length > 0 && <p className="cn-foot">{others.map((p) => firstName(p)).join(', ')} {others.length === 1 ? 'has' : 'have'} this connected.</p>}
      <p className="cn-foot">Agents reach this through your app, so it needs your app open.</p>
    </div>
  </div>;
}

/** The small button a thread shows where an agent wrote a link to this page. */
export function ConnectionLink({ id, children }: { id: string | null; children: ReactNode }) {
  return <button type="button" className="cn-link" onClick={() => openConnections(id)}>{children}</button>;
}

function AddByAddress({ onAdded, onExisting }: { onAdded: (id: string) => void; onExisting: (id: string) => void }) {
  const [address, setAddress] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (key?: string) => {
    setBusy(true);
    setError(null);
    const out = await api.connectionsAdd({ address: address.trim(), ...(key ? { key } : {}) });
    setBusy(false);
    if (out.existing) { onExisting(out.existing); setAddress(''); return; }
    if (out.needsKey) { setNeedsKey(true); setError(out.error ?? null); return; }
    if (!out.ok) { setError(out.error ?? 'That did not connect.'); return; }
    setAddress('');
    setNeedsKey(false);
    if (out.tile) onAdded(out.tile.id);
  };
  return <div className="cn-add">
    <form className="cn-add-row" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <input className="cn-input" aria-label="Add any tool by its address" placeholder="Add any tool by its address, https://…" spellCheck={false} value={address} onChange={(e) => { setAddress(e.target.value); setNeedsKey(false); }} />
      <button type="submit" className="cn-button" disabled={busy || !address.trim()}>{busy ? 'Connecting' : 'Add'}</button>
    </form>
    {error && <p className="cn-add-note" role="alert">{error}</p>}
    {needsKey && <KeyBox label="API key or token" busy={busy} onGo={(key) => void go(key)} />}
  </div>;
}

export function ConnectionsPlace({ now, focus, onNotice }: { now: number; focus: string | null; onNotice: (text: string) => void }) {
  const [list, setList] = useState<ConnectionsList | null>(null);
  const [open, setOpen] = useState<string | null>(focus);
  const [query, setQuery] = useState('');
  useEffect(() => { setOpen(focus); }, [focus]);
  useEffect(() => {
    let live = true;
    const read = () => { void api.connections().then((l) => { if (live) setList(l); }); };
    read();
    const off = api.onChanged(read);
    return () => { live = false; off?.(); };
  }, []);
  const tiles = useMemo(() => list?.tiles ?? [], [list]);
  const groups = useMemo(() => list?.groups ?? [], [list]);
  const found = useMemo(() => tilesFound(tiles, query, groups), [tiles, query, groups]);
  const mine = found.filter((t) => t.connected);
  const rest = found.filter((t) => !t.connected);
  const shown = tiles.find((t) => t.id === open) ?? null;
  const line = (t: ConnectionTile) => <Tile key={t.id} tile={t} now={now} onOpen={() => setOpen(t.id)} />;
  return <div className="cn-page">
    <div className="cn-bar">
      <label className="fp-find cn-find"><SearchIcon /><input aria-label="Search tools" placeholder="Search tools" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    </div>
    {mine.length > 0 && <section className="cn-group"><h2>Connected</h2><div className="cn-grid">{mine.map(line)}</div></section>}
    {groups.map((g) => {
      const here = rest.filter((t) => t.group === g.id);
      return here.length ? <section key={g.id} className="cn-group"><h2>{g.name}</h2><div className="cn-grid">{here.map(line)}</div></section> : null;
    })}
    {list && !found.length && <p className="cn-none">No tool here is called that. If it has a server of its own, add it by its address.</p>}
    <AddByAddress onAdded={setOpen} onExisting={setOpen} />
    {shown && list && <Sheet key={shown.id} tile={shown} now={now} list={list} onClose={() => setOpen(null)} onNotice={onNotice} />}
  </div>;
}
