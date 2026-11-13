// A TEAM'S PLAN AND BILLING (the owner's pick, 2026-11-08: the trial first).
// The trial's days on a track; what each person has now beside what they get
// once the team pays; each member's own hours left. A paid team shows its
// price, next bill and, for its owner, the card and the last invoice.
// Every member has hours of their own: a seat is the $40 cloud plan.
import type { ReactNode } from 'react';
import { TEAM } from '../../../cloud/gateway/plans.mjs';
import type { CloudPlan, Person, TeamBillingDetails } from '../types';
import { Face } from './people';
import './team-billing.css';

type Team = NonNullable<CloudPlan['team']>;

const DAY = 86_400_000;
const n = (x: number) => x.toLocaleString('en-US');
const day = (t: number | null | undefined) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
// Hours left, rounded up as the bar beside them is drawn: 0 only when none are left.
const hours = (s: number) => {
  const h = s / 3600;
  return h >= 10 ? n(Math.ceil(h)) : String(Math.ceil(h * 10) / 10);
};
const seats = (k: number) => `${k} ${k === 1 ? 'seat' : 'seats'}`;

export interface TeamBillingRow { id: string; name: string; you: boolean; owner: boolean; left: number; percent: number; running: number }

/** Everything the page says, worked out from what the cloud server and the team say. */
export function teamBillingView(team: Team, people: Person[], meId: string | null, now = Date.now()) {
  const each = team.hours * 3600;
  const left = (used: number) => Math.max(0, each - used);
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows: TeamBillingRow[] = (team.people ?? []).map((m) => {
    const p = byId.get(m.id);
    const you = m.id === meId;
    return {
      id: m.id, you, name: you ? 'You' : p?.name || m.name || 'A teammate', owner: p ? p.role === 'owner' : you && team.owner,
      left: left(m.usedSeconds), percent: each > 0 ? Math.round((left(m.usedSeconds) / each) * 100) : 0, running: m.running,
    };
  }).sort((a, b) => Number(b.you) - Number(a.you));
  const days = team.endsAt ? Math.max(1, Math.ceil((team.endsAt - now) / DAY)) : 0;
  const count = team.trial ? team.members : team.seats || team.members;
  const price = `$${n(TEAM.dollarsPerSeat * count)} a month`;
  return {
    days, ends: day(team.endsAt), started: day(team.endsAt ? team.endsAt - TEAM.trialDays * DAY : null),
    spentPercent: team.trial ? Math.round(((TEAM.trialDays - days) / TEAM.trialDays) * 100) : 100,
    seatsLine: seats(count), price,
    mine: `${hours(left(team.usedSeconds))} of ${n(team.hours)}`,
    rows,
  };
}

const Card = ({ name, big, children }: { name: string; big: string; children: ReactNode }) => (
  <div className="tb-compare-card">
    <div className="tb-compare-name">{name}</div>
    <div className="tb-compare-big">{big}</div>
    {children}
  </div>
);

export function TeamBilling({ team, people, meId, billing, now = Date.now(), paying = false, onPay, onManage, onInvite }: {
  team: Team; people: Person[]; meId: string | null; billing: TeamBillingDetails | null; now?: number;
  /** Stripe is opening, or the page is waiting for the payment to land. */
  paying?: boolean;
  onPay?: () => void; onManage?: () => void; onInvite?: () => void;
}) {
  const v = teamBillingView(team, people, meId, now);
  const last = billing?.invoices?.[0];
  return <>
    <div className="tb-hero">
      <div className="tb-hero-title">{team.trial ? `${v.days} ${v.days === 1 ? 'day' : 'days'} left in your team's trial` : `Team · ${v.price}`}</div>
      {team.trial ? <>
        <div className="tb-hero-track"><i style={{ width: `${v.spentPercent}%` }} /></div>
        <div className="tb-hero-ends"><span>Started {v.started}</span><span>Ends {v.ends}</span></div>
      </> : (
        <div className="tb-hero-sub">{team.owner
          ? `${v.seatsLine}${billing?.nextAt ? ` · next bill $${n(billing.nextAmount ?? 0)} on ${day(billing.nextAt)}` : ''}`
          : v.seatsLine}</div>
      )}
      {team.owner && (team.trial && !team.seats
        ? <button type="button" className="set-ghost" disabled={paying} onClick={onPay}>{paying ? 'Opening Stripe…' : `Pay for ${v.seatsLine} now · ${v.price}`}</button>
        : <button type="button" className="set-ghost" onClick={onManage}>Manage billing</button>)}
    </div>
    <div className="tb-compare">
      <Card name={team.trial ? 'Now, each person' : 'This month, you'} big={v.mine}>
        <div className="tb-compare-small">{team.trial ? 'of your trial hours left' : 'cloud hours left'}</div>
        <div className="tb-compare-small">Any number at once</div>
      </Card>
      {team.trial ? (
        <Card name={`From ${v.ends}, each person`} big={`$${TEAM.dollarsPerSeat} a month`}>
          <div className="tb-compare-small">{n(TEAM.hoursPerSeat)} cloud hours a month</div>
          <div className="tb-compare-small">{team.owner ? `You pay ${v.price} for ${team.members}` : "Paid by your team's owner"}</div>
        </Card>
      ) : team.owner ? (
        <Card name="Billing" big={billing?.card ? `${billing.card.brand} ${billing.card.last4}` : 'No card yet'}>
          <div className="tb-compare-small">Invoices go to {billing?.email ?? 'you'}</div>
          <div className="tb-compare-small">{last ? `Last ${day(last.at)}, $${n(last.amount)} · ${last.status === 'paid' ? 'Paid' : last.status === 'failed' ? 'Failed' : 'Due'}` : 'No invoices yet'}</div>
        </Card>
      ) : (
        <Card name="Your seat" big={`$${TEAM.dollarsPerSeat} a month`}>
          <div className="tb-compare-small">{n(TEAM.hoursPerSeat)} cloud hours a month</div>
          <div className="tb-compare-small">Paid by your team's owner</div>
        </Card>
      )}
    </div>
    <div className="set-group">
      <div className={`set-group-label${team.owner ? ' set-group-head' : ''}`}>
        <span>Members · {team.members}</span>
        {team.owner && onInvite && <button type="button" className="set-ghost tb-small" onClick={onInvite}>Invite people</button>}
      </div>
      <div className="tb-members">
        {v.rows.map((m) => (
          <div key={m.id} className="tb-member">
            <Face name={m.you ? (people.find((p) => p.id === m.id)?.name ?? m.name) : m.name} me={m.you} />
            <div className="tb-member-name">{m.name}<small>{m.owner ? 'Owner' : 'Member'}</small></div>
            <div className="tb-member-use">
              <span className="tb-member-bar"><i style={{ width: `${m.percent}%` }} /></span>
              <span className="tb-member-hours">{hours(m.left)} of {n(team.hours)} h</span>
            </div>
            <div className="tb-member-running">{m.running ? `${m.running} running` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  </>;
}
