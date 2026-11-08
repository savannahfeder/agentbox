// A TEAM'S PLAN AND BILLING: the plan and what it costs, its hours and agents,
// who is on it and what each used, and, for the owner, the card, the invoice
// email and the invoices. The owner (2026-11-08) asked for the detail Vercel
// and Linear give a team; five layouts are drawn here to choose between
// (`layout`), and the one chosen stays.
import type { ReactNode } from 'react';
import type { CloudPlan } from '../types';
import { Face } from './people';
import './team-billing.css';

export type TeamBillingLayout = 'sections' | 'members' | 'trial' | 'columns' | 'tabs';

export interface TeamBillingMember { id: string; name: string; email: string; role: 'owner' | 'member'; usedSeconds: number; running: number; me?: boolean }
export interface TeamBillingInvoice { at: number; amount: number; status: 'paid' | 'open' | 'failed' }
export interface TeamBillingDetails {
  periodStart: number | null; periodEnd: number | null;
  nextAt: number | null; nextAmount: number | null;
  card: { brand: string; last4: string } | null;
  email: string | null;
  invoices: TeamBillingInvoice[];
}

type Team = NonNullable<CloudPlan['team']>;
const DOLLARS_A_SEAT = 40;
const HOURS_A_SEAT = 400;
const AGENTS_A_SEAT = 10;
const n = (x: number) => x.toLocaleString('en-US');
const day = (t: number | null) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const hours = (s: number) => {
  const h = s / 3600;
  return h >= 10 ? n(Math.round(h)) : String(Math.round(h * 10) / 10);
};

export function TeamBilling({ team, members, billing, layout = 'sections', now = Date.now(), onPay, onManage, onInvite }: {
  team: Team; members: TeamBillingMember[]; billing: TeamBillingDetails | null; layout?: TeamBillingLayout; now?: number;
  onPay?: () => void; onManage?: () => void; onInvite?: () => void;
}) {
  const v = view(team, members, billing, now);
  const parts = { v, team, members, billing, onPay, onManage, onInvite };
  if (layout === 'members') return <MembersFirst {...parts} />;
  if (layout === 'trial') return <TrialFirst {...parts} />;
  if (layout === 'columns') return <Columns {...parts} />;
  if (layout === 'tabs') return <Tabs {...parts} />;
  return <Sections {...parts} />;
}

type Parts = { v: View; team: Team; members: TeamBillingMember[]; billing: TeamBillingDetails | null; onPay?: () => void; onManage?: () => void; onInvite?: () => void };
type View = ReturnType<typeof view>;

function view(team: Team, members: TeamBillingMember[], billing: TeamBillingDetails | null, now: number) {
  const left = Math.max(0, team.hours * 3600 - team.usedSeconds);
  const days = team.endsAt ? Math.max(1, Math.ceil((team.endsAt - now) / 86_400_000)) : 0;
  const seats = team.trial ? team.members : team.seats;
  const monthly = DOLLARS_A_SEAT * seats;
  return {
    name: team.trial ? 'Team trial' : 'Team',
    seatsLine: `${seats} ${seats === 1 ? 'seat' : 'seats'}`,
    price: `$${n(monthly)} a month`,
    days, ends: day(team.endsAt),
    hoursLeft: hours(left), hoursAll: n(team.hours), hoursPercent: team.hours > 0 ? Math.round((left / (team.hours * 3600)) * 100) : 0,
    running: `${team.running} of ${team.agents}`,
    runningPercent: Math.min(100, Math.round((team.running / Math.max(1, team.agents)) * 100)),
    period: billing?.periodStart ? `${day(billing.periodStart)} to ${day(billing.periodEnd)}` : '',
    next: billing?.nextAt ? `$${n(billing.nextAmount ?? monthly)} on ${day(billing.nextAt)}` : '',
    mostUsed: Math.max(1, ...members.map((m) => m.usedSeconds)),
    afterTrial: `$${DOLLARS_A_SEAT} a person a month, ${HOURS_A_SEAT} cloud hours and ${AGENTS_A_SEAT} agents at once each, shared`,
  };
}

const Section = ({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) => (
  <div className="set-group">
    <div className={`set-group-label${action ? ' set-group-head' : ''}`}><span>{label}</span>{action}</div>
    {children}
  </div>
);
const Plate = ({ children }: { children: ReactNode }) => <div className="set-plate">{children}</div>;
const Line = ({ label, desc, children }: { label: string; desc?: ReactNode; children?: ReactNode }) => (
  <div className="set-row">
    <div className="set-row-text"><div className="set-row-label">{label}</div>{desc && <div className="set-row-desc">{desc}</div>}</div>
    {children && <div className="set-row-ctl">{children}</div>}
  </div>
);
const Meter = ({ label, value, percent }: { label: string; value: string; percent: number }) => (
  <div className="bill-meter">
    <div className="bill-meter-label">{label}</div>
    <div className="bill-meter-value">{value}</div>
    <span className="bill-meter-bar"><i style={{ width: `${percent}%` }} /></span>
  </div>
);

function PlanBox({ v, team, onPay, onManage, bare = false }: Parts & { bare?: boolean }) {
  const sub = team.trial
    ? `${v.days} ${v.days === 1 ? 'day' : 'days'} left, ends ${v.ends}`
    : `${v.price} · ${v.seatsLine} · next bill ${v.next || 'when the month turns'}`;
  return (
    <div className="bill-summary">
      <div>
        <div className="bill-plan">{v.name}</div>
        <div className="bill-price">{sub}</div>
      </div>
      {team.owner && !bare && (team.trial
        ? <button type="button" className="set-ghost" onClick={onPay}>Pay for {v.seatsLine} · {v.price}</button>
        : <button type="button" className="set-ghost" onClick={onManage}>Manage billing</button>)}
    </div>
  );
}

function MemberRows({ v, members }: Parts) {
  return (
    <div className="tb-members">
      {members.map((m) => (
        <div key={m.id} className="tb-member">
          <Face name={m.name} me={m.me} />
          <div className="tb-member-name">{m.me ? 'You' : m.name}<small>{m.role === 'owner' ? 'Owner' : 'Member'}</small></div>
          <div className="tb-member-use">
            <span className="tb-member-bar"><i style={{ width: `${Math.round((m.usedSeconds / v.mostUsed) * 100)}%` }} /></span>
            <span className="tb-member-hours">{hours(m.usedSeconds)} h</span>
          </div>
          <div className="tb-member-running">{m.running ? `${m.running} running` : ''}</div>
        </div>
      ))}
    </div>
  );
}

function BillingRows({ v, billing, team, onManage }: Parts) {
  if (!team.owner) return <Plate><Line label="Who pays" desc={`Your team's owner, ${team.trial ? `from ${v.ends}` : 'each month'}`} /></Plate>;
  return (
    <Plate>
      <Line label="Payment method" desc={billing?.card ? `${billing.card.brand} ending ${billing.card.last4}` : 'Added when you pay for the team'}>
        {billing?.card && <button type="button" className="set-ghost" onClick={onManage}>Change</button>}
      </Line>
      <Line label="Invoices go to" desc={billing?.email ?? 'Your email'} />
    </Plate>
  );
}

function InvoiceRows({ billing, onManage }: Parts) {
  const list = billing?.invoices ?? [];
  if (!list.length) return null;
  return (
    <Section label="Invoices" action={<button type="button" className="set-ghost tb-small" onClick={onManage}>All invoices</button>}>
      <div className="tb-invoices">
        {list.slice(0, 4).map((i) => (
          <div key={i.at} className="tb-invoice">
            <span>{day(i.at)}</span><span>${n(i.amount)}</span><span className={`tb-status is-${i.status}`}>{i.status === 'paid' ? 'Paid' : i.status === 'open' ? 'Due' : 'Failed'}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

const InviteButton = ({ onInvite }: Parts) => <button type="button" className="set-ghost tb-small" onClick={onInvite}>Invite people</button>;

// 1. One page of sections, top to bottom, as Vercel's team billing.
function Sections(p: Parts) {
  return <>
    <Section label="Your plan"><PlanBox {...p} /></Section>
    <Section label={p.team.trial ? 'Trial usage' : `This period · ${p.v.period}`}>
      <div className="bill-meters">
        <Meter label="Cloud hours left" value={`${p.v.hoursLeft} of ${p.v.hoursAll}`} percent={p.v.hoursPercent} />
        <Meter label="Agents in the cloud" value={`${p.v.running} running`} percent={p.v.runningPercent} />
      </div>
    </Section>
    <Section label={`Members · ${p.members.length}`} action={p.team.owner ? <InviteButton {...p} /> : undefined}><MemberRows {...p} /></Section>
    <Section label="Billing"><BillingRows {...p} /></Section>
    <InvoiceRows {...p} />
  </>;
}

// 2. The people first, as Cursor's team page: each member's share of the hours is the page.
function MembersFirst(p: Parts) {
  return <>
    <div className="tb-strip">
      <div><div className="bill-plan">{p.v.name}</div><div className="bill-price">{p.team.trial ? `${p.v.days} days left` : `${p.v.price} · ${p.v.seatsLine}`}</div></div>
      <div className="tb-strip-figure"><b>{p.v.hoursLeft}</b><span>of {p.v.hoursAll} hours left</span></div>
      <div className="tb-strip-figure"><b>{p.team.running}</b><span>of {p.team.agents} agents running</span></div>
    </div>
    <Section label="Who used what" action={p.team.owner ? <InviteButton {...p} /> : undefined}>
      <div className="tb-table">
        <div className="tb-table-head"><span>Member</span><span>Role</span><span>Hours</span><span>Running</span></div>
        {p.members.map((m) => (
          <div key={m.id} className="tb-table-row">
            <span className="tb-table-who"><Face name={m.name} me={m.me} />{m.me ? 'You' : m.name}</span>
            <span>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
            <span className="tb-member-use"><span className="tb-member-bar"><i style={{ width: `${Math.round((m.usedSeconds / p.v.mostUsed) * 100)}%` }} /></span>{hours(m.usedSeconds)}</span>
            <span>{m.running || ''}</span>
          </div>
        ))}
      </div>
    </Section>
    <Section label="Billing">
      <Plate>
        <Line label={p.team.trial ? `After ${p.v.ends}` : 'Next bill'} desc={p.team.trial ? p.v.afterTrial : p.v.next}>
          {p.team.owner && <button type="button" className="set-ghost" onClick={p.team.trial ? p.onPay : p.onManage}>{p.team.trial ? `Pay for ${p.v.seatsLine}` : 'Manage billing'}</button>}
        </Line>
      </Plate>
    </Section>
  </>;
}

// 3. The trial first, as Vercel's trial banner: how long, how much, and what happens at the end.
function TrialFirst(p: Parts) {
  const spentDays = p.team.trial ? 14 - p.v.days : 14;
  return <>
    <div className="tb-hero">
      <div className="tb-hero-title">{p.team.trial ? `${p.v.days} days left in your team's trial` : `Your team is on ${p.v.seatsLine}`}</div>
      <div className="tb-hero-track"><i style={{ width: `${Math.round((spentDays / 14) * 100)}%` }} /></div>
      <div className="tb-hero-ends"><span>Started {day(p.team.endsAt ? p.team.endsAt - 14 * 86_400_000 : null)}</span><span>Ends {p.v.ends}</span></div>
      {p.team.owner && <button type="button" className="set-ghost" onClick={p.onPay}>Pay for {p.v.seatsLine} now · {p.v.price}</button>}
    </div>
    <div className="tb-compare">
      <div className="tb-compare-card">
        <div className="tb-compare-name">Now</div>
        <div className="tb-compare-big">{p.v.hoursLeft} of {p.v.hoursAll}</div>
        <div className="tb-compare-small">cloud hours left, shared by {p.members.length}</div>
        <div className="tb-compare-small">{p.team.agents} agents at once</div>
      </div>
      <div className="tb-compare-card">
        <div className="tb-compare-name">From {p.v.ends}</div>
        <div className="tb-compare-big">{p.v.price}</div>
        <div className="tb-compare-small">{n(HOURS_A_SEAT * p.members.length)} cloud hours a month, shared</div>
        <div className="tb-compare-small">{AGENTS_A_SEAT * p.members.length} agents at once · paid by {p.team.owner ? 'you' : "your team's owner"}</div>
      </div>
    </div>
    <Section label={`Members · ${p.members.length}`} action={p.team.owner ? <InviteButton {...p} /> : undefined}><MemberRows {...p} /></Section>
  </>;
}

// 4. Two columns, as Linear's billing: the team's use on the left, the money on the right.
function Columns(p: Parts) {
  return (
    <div className="tb-columns">
      <div>
        <Section label="Your plan"><PlanBox {...p} bare /></Section>
        <Section label="Cloud hours left">
          <div className="tb-big">{p.v.hoursLeft}<span> of {p.v.hoursAll}</span></div>
          <span className="bill-meter-bar"><i style={{ width: `${p.v.hoursPercent}%` }} /></span>
        </Section>
        <Section label={`Members · ${p.members.length}`} action={p.team.owner ? <InviteButton {...p} /> : undefined}><MemberRows {...p} /></Section>
      </div>
      <div className="tb-side">
        <div className="tb-side-row"><span>Seats</span><b>{p.v.seatsLine}</b></div>
        <div className="tb-side-row"><span>{p.team.trial ? `From ${p.v.ends}` : 'Next bill'}</span><b>{p.team.trial ? p.v.price : p.v.next}</b></div>
        <div className="tb-side-row"><span>Agents at once</span><b>{p.team.agents}</b></div>
        {p.team.owner && <div className="tb-side-row"><span>Card</span><b>{p.billing?.card ? `${p.billing.card.brand} ${p.billing.card.last4}` : 'None yet'}</b></div>}
        {p.team.owner && <div className="tb-side-row"><span>Invoices to</span><b>{p.billing?.email ?? 'Your email'}</b></div>}
        {p.team.owner && (p.billing?.invoices ?? []).slice(0, 3).map((i) => <div key={i.at} className="tb-side-row tb-faint"><span>{day(i.at)}</span><b>${n(i.amount)} · {i.status === 'paid' ? 'Paid' : 'Due'}</b></div>)}
        {p.team.owner && <button type="button" className="set-ghost" onClick={p.onManage}>Manage billing</button>}
      </div>
    </div>
  );
}

// 5. One plan box over three tabs, as Stripe-backed tools do: Usage, Members, Billing.
function Tabs(p: Parts) {
  return <>
    <Section label="Your plan"><PlanBox {...p} /></Section>
    <div className="tb-tabs"><span className="on">Usage</span><span>Members · {p.members.length}</span>{p.team.owner && <span>Billing</span>}</div>
    <div className="bill-meters">
      <Meter label="Cloud hours left" value={`${p.v.hoursLeft} of ${p.v.hoursAll}`} percent={p.v.hoursPercent} />
      <Meter label="Agents in the cloud" value={`${p.v.running} running`} percent={p.v.runningPercent} />
    </div>
    <Section label="By member"><MemberRows {...p} /></Section>
  </>;
}
