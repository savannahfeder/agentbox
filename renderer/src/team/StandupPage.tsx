// The Standup: a post from each teammate for a standup day, the days before it
// under it, a week of days to pick from, a search, and when it happens.
import { Fragment, useState } from 'react';
import { MemberFace } from './everything/TeamStrip';
import type { Member } from './everything/members';
import { I } from './rooms/icons';
import type { TodayLine, TodayPerson } from './today';
import {
  earlierStandupDays, keepStandup, postMatches, postsOf, readStandup, sentenceOf, standupWeek, standupWindow, titleOf,
  previousStandupDay, type Part, type StandupPost, type StandupSettings,
} from './standup';
import './standup.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Monday first, as the week strip reads.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const TIMES = Array.from({ length: 25 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
const EARLIER = 2;
const store = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const clockOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};
const dayTitle = (day: number) => new Date(day).toLocaleDateString('en-US', { weekday: 'long' });
const dateOf = (day: number) => new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

/** The standup day a page opens on: today, or the last one before it. */
function openingDay(now: number, s: StandupSettings): number {
  const today = midnight(now);
  return s.days.includes(new Date(today).getDay()) ? today : previousStandupDay(today, s);
}

function Words({ parts, onOpen, onMore }: { parts: Part[]; onOpen: (l: TodayLine) => void; onMore?: () => void }) {
  return <>{parts.map((p, i) => (typeof p === 'string'
    ? <Fragment key={i}>{p}</Fragment>
    : 'more' in p
      ? <button type="button" key={i} className="su-link" onClick={onMore}>{p.more} more</button>
      : <button type="button" key={i} className="su-link" onClick={() => onOpen(p)}>{titleOf(p)}</button>))}</>;
}

function Post({ p, face, at, since, all, onOpen, onPerson }: {
  p: StandupPost; face?: Member;
  /** The standup's time, on today's posts only: a past one's time is not kept. */
  at: string | null;
  since: string;
  /** Searching: every task named, so the one that matched is never behind "more". */
  all: boolean;
  onOpen: (l: TodayLine) => void; onPerson?: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const n = p.done.length;
  const moreWorking = p.working.length > 2;
  return <article className="su-post" aria-label={p.name}>
    <span className="su-face">{face && <MemberFace m={face} size={32} />}</span>
    <div className="su-body">
      <div className="su-hd">
        {onPerson && p.key !== 'me' ? <button type="button" className="su-name" onClick={() => onPerson(p.key)}>{p.name}</button> : <b className="su-name">{p.name}</b>}
        {at && <span>{at}</span>}
      </div>
      <p className="su-tx"><Words parts={sentenceOf(p, { all })} onOpen={onOpen} onMore={() => setOpen(true)} /></p>
      {p.needs.map((need) => <p className="su-need" key={need.line.key}>
        <span>{need.on === 'you' ? 'Needs you on ' : need.on ? `Waiting on ${need.on} for ` : 'Stuck on '}<Words parts={[need.line]} onOpen={onOpen} /></span>
      </p>)}
      {n > 0 && <button type="button" className="su-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? I.down() : I.chev()}{n} {n === 1 ? 'thing' : 'things'} done since {since}
      </button>}
      {open && n > 0 && <ul className="su-done">{p.done.map((l) => <li key={l.key}><button type="button" className="su-link" onClick={() => onOpen(l)}>{titleOf(l)}</button></li>)}</ul>}
      {open && moreWorking && <>
        <p className="su-list-l">Working on</p>
        <ul className="su-done">{p.working.map((l) => <li key={l.key}><button type="button" className="su-link" onClick={() => onOpen(l)}>{titleOf(l)}</button></li>)}</ul>
      </>}
    </div>
  </article>;
}

function Settings({ s, onChange, onClose }: { s: StandupSettings; onChange: (s: StandupSettings) => void; onClose: () => void }) {
  const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const toggleDay = (d: number) => {
    const days = s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort();
    if (days.length) onChange({ ...s, days });
  };
  return <section className="su-set" aria-label="Standup settings">
    <div className="su-set-row">
      <span className="su-set-l">Days</span>
      <div className="su-chips">{WEEK.map((d) => <button type="button" key={d} className={`su-chip${s.days.includes(d) ? ' on' : ''}`} aria-pressed={s.days.includes(d)} onClick={() => toggleDay(d)}>{DAY_NAMES[d]}</button>)}</div>
    </div>
    <div className="su-set-row">
      <span className="su-set-l">Time</span>
      <select className="su-select" value={s.at} aria-label="Standup time" onChange={(e) => onChange({ ...s, at: e.target.value })}>
        {(TIMES.includes(s.at) ? TIMES : [s.at, ...TIMES]).map((t) => <option key={t} value={t}>{clockOf(t)}</option>)}
      </select>
      <span className="su-tz">{zone}</span>
    </div>
    <div className="su-set-row"><span className="su-set-l" /><button type="button" className="su-btn" onClick={onClose}>Done</button></div>
  </section>;
}

export function StandupPage({ now, faces, team = [], dayFor, onOpen, onPerson }: {
  now: number;
  faces: ReadonlyMap<string, Member>;
  /** Everyone who could post: a teammate with nothing is named, so quiet never reads as missing. */
  team?: readonly { key: string; name: string; kind: 'person' | 'mate' }[];
  /** The team's day for a span: what moved in it, per person and AI teammate. */
  dayFor: (window: { from: number; to: number }) => { people: TodayPerson[] };
  onOpen: (l: TodayLine) => void;
  onPerson?: (key: string) => void;
}) {
  const [s, setS] = useState<StandupSettings>(() => readStandup(store() ?? { getItem: () => null }));
  const [picked, setPicked] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [setting, setSetting] = useState(false);
  const change = (next: StandupSettings) => { setS(next); const st = store(); if (st) keepStandup(st, next); };
  const day = picked ?? openingDay(now, s);
  const week = standupWeek(day, s, now);
  const searching = q.trim().length > 0;
  const days = searching ? week.filter((d) => !d.ahead).map((d) => d.day).reverse() : [day, ...earlierStandupDays(day, s, EARLIER)];
  const moveWeek = (by: number) => {
    const d = new Date(day); d.setDate(d.getDate() + by * 7);
    const to = d.setHours(0, 0, 0, 0);
    if (to > midnight(now)) setPicked(openingDay(now, s)); else setPicked(s.days.includes(new Date(to).getDay()) ? to : previousStandupDay(to, s));
  };
  const nextWeekAhead = week.length > 0 && week[week.length - 1].day >= midnight(now);
  let found = 0;
  return <div className="su" aria-label="Standup">
    <div className="su-col">
      <div className="su-top">
        <h2>{dayTitle(day)}</h2><span className="su-date">{dateOf(day)}</span>
        <div className="su-r">
          <button type="button" className="su-tog" role="switch" aria-checked={s.mates} title="Off, their work is counted in your post" onClick={() => change({ ...s, mates: !s.mates })}><i />AI teammates post too</button>
          <button type="button" className={`su-icon${setting ? ' on' : ''}`} aria-expanded={setting} aria-label="Standup settings" title="Standup settings" onClick={() => setSetting(!setting)}>{I.sliders()}</button>
        </div>
      </div>
      {setting && <Settings s={s} onChange={change} onClose={() => setSetting(false)} />}
      <div className="su-days" role="tablist" aria-label="Standup days">
        <button type="button" className="su-ar" aria-label="The week before" onClick={() => moveWeek(-1)}>{I.back()}</button>
        {week.map((d) => <button type="button" role="tab" key={d.day} disabled={d.ahead} aria-selected={d.day === day && !searching}
          className={`su-day${d.day === day && !searching ? ' on' : ''}`} onClick={() => { setQ(''); setPicked(d.day); }}>{d.label}</button>)}
        <button type="button" className="su-ar" aria-label="The week after" disabled={nextWeekAhead} onClick={() => moveWeek(1)}>{I.chev()}</button>
        <label className="su-search">{I.search()}<input value={q} placeholder="Search standups" aria-label="Search standups" onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {days.map((d, i) => {
        const posts = postsOf(dayFor(standupWindow(d, s, now)).people, { mates: s.mates, live: d === midnight(now) }).filter((p) => postMatches(p, q));
        found += posts.length;
        const since = DAY_NAMES[new Date(previousStandupDay(d, s)).getDay()];
        // An earlier day with nothing in it is left out rather than said again and again.
        if ((searching || i > 0) && !posts.length) return null;
        return <section key={d} className="su-dayfeed" aria-label={dayTitle(d)}>
          {(i > 0 || searching) && <div className="su-sep">{dayTitle(d)} {dateOf(d)}</div>}
          {posts.length === 0 && <p className="su-empty">Nothing moved.</p>}
          {posts.map((p) => <Post key={`${d}/${p.key}`} p={p} face={faces.get(p.key)} at={d === midnight(now) ? clockOf(s.at) : null} since={since} all={searching}
            onOpen={onOpen} onPerson={onPerson} />)}
          {i === 0 && !searching && (() => {
            const quiet = team.filter((t) => (t.kind === 'person' || s.mates) && !posts.some((p) => p.key === t.key))
              .map((t) => (t.kind === 'person' ? t.name.split(/\s+/)[0] : t.name));
            if (!quiet.length) return null;
            const names = quiet.length === 1 ? quiet[0] : `${quiet.slice(0, -1).join(', ')} and ${quiet[quiet.length - 1]}`;
            return <p className="su-quiet">Nothing from {names} since {dayTitle(previousStandupDay(d, s))}’s standup.</p>;
          })()}
        </section>;
      })}
      {searching && !found && <p className="su-empty">No standup this week mentions that.</p>}
    </div>
  </div>;
}
