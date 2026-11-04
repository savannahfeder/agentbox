// WHO A THREAD SENT TO AUTO WENT TO, as one line under the person's words
// (shared/auto-route.mjs, designs/w-b5f23cff71 84 to 88). It says who took it
// and why, or asks her to pick when Auto could not tell, and gives it to
// someone else in one press. It never says more than that: no plan, no orders.
import { useContext, useState } from 'react';
import { api } from '../api';
import { TeamContext } from '../team/people';
import { giveRows } from '../thread-commands';
import type { Teammate, WorkItem } from '../types';
import { TeammateMark } from '../teammates/TeammatesRail';
import { AgentFace } from './AgentFace';
import { AutoFace } from './AutoFace';
import './route-line.css';

type Mate = Pick<Teammate, 'id' | 'name' | 'letter'> & { paused?: boolean; status?: string };

const mateOf = (to: string | undefined, mates: ReadonlyMap<string, Mate>) => (to?.startsWith('mate:') ? mates.get(to.slice('mate:'.length)) ?? null : null);

/** "A, B or C", each a word she can press. */
function Choices({ to, mates, names, onPick }: { to: string[]; mates: ReadonlyMap<string, Mate>; names?: ReadonlyMap<string, string>; onPick: (to: string) => void }) {
  return <>{to.map((key, n) => (
    <span key={key}>
      {n > 0 && (n === to.length - 1 ? ' or ' : ', ')}
      <button type="button" onClick={() => onPick(key)}>{key === 'agent' ? 'an agent' : names?.get(key) ?? mateOf(key, mates)?.name ?? 'a teammate'}</button>
    </span>
  ))}</>;
}

export function RouteLine({ item, mates }: { item: WorkItem; mates: ReadonlyMap<string, Mate> }) {
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const team = useContext(TeamContext);
  const routed = item.routed;
  if (!routed) return null;
  const people = team ? giveRows(item, { me: team.me, people: team.state.people ?? [], product: team.products.get(item.product) }) : [];
  const pick = (to: string) => {
    setChanging(false);
    setError(null);
    if (people.some((p) => p.id === to)) {
      void api.teamHandOn({ product: item.product, id: item.id, to }).then((out) => { if (!out.ok) setError(out.error ?? 'That did not work.'); });
      return;
    }
    api.routeThread({ product: item.product, id: item.id, to }).catch((e) => setError(String(e?.message ?? e)));
  };
  const working = [...mates.values()].filter((t) => !t.paused && t.status !== 'draft');
  const failed = error && <span className="rt-error">{error}</span>;

  if (routed.ask?.length) {
    const asked = routed.ask.map((key) => mateOf(key, mates)).filter((t): t is Mate => !!t);
    return <div className="rt-line">
      {asked.length ? <span className="rt-faces">{asked.map((t) => <TeammateMark key={t.id} t={t} />)}</span> : <AutoFace />}
      <span>{routed.why} Give it to <Choices to={routed.ask} mates={mates} onPick={pick} />.</span>
      {failed}
    </div>;
  }

  const mate = mateOf(routed.to, mates);
  const others = [...people.map((p) => p.id), ...working.map((t) => `mate:${t.id}`), 'agent'].filter((key) => key !== routed.to);
  const names = new Map(people.map((p) => [p.id, p.name]));
  return <div className="rt-line">
    {mate ? <TeammateMark t={mate} /> : <AgentFace />}
    {changing
      ? <span>Give it to <Choices to={others} mates={mates} names={names} onPick={pick} />.</span>
      : <span>{mate ? <><b>{mate.name}</b> took this.{routed.why ? ` ${routed.why}` : ''}</> : routed.why}</span>}
    {!changing && others.length > 0 && <button type="button" className="rt-change" onClick={() => setChanging(true)}>Give it to someone else</button>}
    {failed}
  </div>;
}
