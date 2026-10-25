// Pointing at someone, and their page (round 23): level, rank in the room,
// days in a row, and Progress (agent hours since they started). Never their
// threads: nobody could tell who else saw them.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Room, RoomCard } from '../../types';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { cardName, chartNamed, hoursWords, weekRank } from './room-rules';
import { useOutside } from './RoomsPage';
import { Name } from '../../../../shared/product-name.mjs';

export function PersonHover({ card, room, at, onMessage, onProfile, onRanks, onClose }: {
  card: RoomCard; room: Room; at: DOMRect; onMessage?: () => void; onProfile: () => void; onRanks: () => void; onClose: () => void;
}) {
  const ref = useOutside(onClose);
  const left = Math.min(window.innerWidth - 310, Math.max(10, at.left + at.width / 2 - 150));
  const top = Math.min(window.innerHeight - 280, at.top + 94);
  return <div ref={ref} className="rm-hc rm-pop" style={{ left, top }}>
    <div className="hd"><RoomFace name={card.name} url={card.avatarUrl} size={44} />
      <div className="w"><span className="rm-nm"><span className="n">{cardName(card)}</span></span>{card.headline && <span className="rl">{card.headline}</span>}</div></div>
    {card.bio && <div className="bio">{card.bio}</div>}
    <div className="nums">
      {card.level != null && <div><b>{card.level}</b><span>Level</span></div>}
      <div><button type="button" className="lnk" onClick={onRanks}>#{weekRank(room.wall, card.id)}</button><span>This week</span></div>
      <div><b>{hoursWords(card.hoursTotal)}</b><span>Agent hours</span></div>
    </div>
    <div className="acts">
      {onMessage && !card.me && <button type="button" className="rm-btn" onClick={onMessage}>{I.chat()}Message</button>}
      <button type="button" className="rm-btn" onClick={onProfile}>View profile</button>
    </div>
  </div>;
}

export function ProfilePage({ card, room, rooms, rank, onMessage, onRanks, onRoom, onSaveBio }: {
  card: RoomCard; room: Room; rooms: Room[]; rank: number | undefined;
  onMessage?: () => void; onRanks: () => void;
  onRoom?: (roomId: string) => void;
  /** Keeps my bio, or says why it could not. */
  onSaveBio?: (bio: string | null) => Promise<string | null>;
}) {
  const shared = rooms.filter((r) => r.wall.some((c) => c.id === card.id));
  const firstMonth = card.byMonth.find((m) => m.hours > 0)?.month ?? null;
  return <div className="rm-prof">
    <div className="rm-ph">
      <div className="top"><RoomFace name={card.name} url={card.avatarUrl} size={72} />
        <div className="who">
          <span className="rm-nm"><span className="n">{cardName(card)}</span></span>
          {card.headline && <span className="rl">{card.headline}</span>}
          <Bio text={card.bio} onSave={card.me ? onSaveBio : undefined} />
          {card.status && <span className="st">{I.smile()}{card.status}</span>}
        </div>
        {onMessage && !card.me && <div className="acts"><button type="button" className="rm-btn" onClick={onMessage}>{I.chat()}Message</button></div>}
      </div>
      <div className="rm-stats">
        {card.level != null && <div><b>{card.level}</b><span className="rm-label">Level</span></div>}
        <div><button type="button" className="lnk" onClick={onRanks}>#{weekRank(room.wall, card.id)}</button><span className="rm-label">In {room.name} this week</span></div>
        {rank != null && <div><b>#{rank}</b><span className="rm-label">On {Name} all time</span></div>}
        <div><b>{I.flame()}{card.streak}</b><span className="rm-label">Days in a row</span></div>
      </div>
    </div>
    <div className="rm-prule" />
    <div className="rm-pgrid">
      <div className="rm-chart">
        <div className="rm-ptotal"><b>{hoursWords(card.hoursTotal)}</b><span className="rm-label">Agent hours{firstMonth ? ` since ${monthName(firstMonth, true)}` : ''}</span></div>
        <HoursChart byMonth={card.byMonth} total={card.hoursTotal} />
      </div>
      <div className="rm-pcol">
        {shared.length > 0 && <div className="blk"><span className="rm-label">Groups</span>{shared.map((r) => onRoom
          ? <button type="button" key={r.id} className="line" onClick={() => onRoom(r.id)}>{I.hash()}{r.name}</button>
          : <span key={r.id} className="line">{I.hash()}{r.name}</span>)}</div>}
      </div>
    </div>
  </div>;
}

// The cloud refuses a longer one (room_profiles.bio).
const BIO_MAX = 160;

function Bio({ text, onSave }: { text: string | null; onSave?: (bio: string | null) => Promise<string | null> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Escape unmounts the box, and its blur must not save what was dropped.
  const dropped = useRef(false);
  if (draft == null) {
    if (!onSave) return text ? <span className="rm-bio">{text}</span> : null;
    const edit = () => { dropped.current = false; setError(null); setDraft(text ?? ''); };
    return text
      ? <span className="rm-bio">{text}<button type="button" className="rm-bio-edit" onClick={edit}>Edit</button></span>
      : <button type="button" className="rm-bio-add" onClick={edit}>Add a bio</button>;
  }
  const save = async () => {
    if (dropped.current) return;
    const next = draft.trim();
    if (next === (text ?? '')) { setDraft(null); return; }
    const err = await onSave!(next || null);
    if (err) setError(err); else setDraft(null);
  };
  return <span className="rm-bio-form">
    <textarea autoFocus rows={1} maxLength={BIO_MAX} value={draft} placeholder="A line about you and what you are building"
      onChange={(e) => setDraft(e.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); void save(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dropped.current = true; setDraft(null); }
      }}
      onBlur={() => void save()} />
    {(error || draft.length > BIO_MAX - 40) && <span className="k">{error ?? `${BIO_MAX - draft.length} left`}</span>}
  </span>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthName(ym: string, withYear = false) {
  const [y, m] = ym.split('-').map(Number);
  return withYear ? `${LONG[m - 1]} ${y}` : LONG[m - 1];
}
const monthOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthBefore = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

/** Agent hours added up by the end of each month, from nothing the month
 *  before the first hours. Always two points at least, so it is a line. */
export function chartSeries(byMonth: { month: string; hours: number }[], total: number, now = Date.now()) {
  const from = byMonth.findIndex((m) => m.hours > 0);
  let months = from < 0 ? byMonth.slice(-2) : byMonth.slice(Math.max(0, from - 1));
  if (!months.length) months = [{ month: monthOf(now), hours: 0 }];
  if (months.length < 2) months = [{ month: monthBefore(months[0].month), hours: 0 }, ...months];
  let run = Math.max(0, total - months.reduce((n, m) => n + m.hours, 0));
  return { months: months.map((m) => m.month), pts: months.map((m) => (run += m.hours)) };
}

// The axis numbers start at the text edge; the plot starts LEFT after it.
const W = 900, H = 300, LEFT = 44, RIGHT = 20;
const xAt = (i: number, n: number, w = W) => LEFT + (n < 2 ? 0 : (i / (n - 1)) * (w - LEFT - RIGHT));

/** The point nearest the pointer, `fraction` of the way across a chart `w` wide. */
export function pointUnder(fraction: number, n: number, w = W) {
  const i = Math.round(((fraction * w - LEFT) / (w - LEFT - RIGHT)) * (n - 1));
  return Math.max(0, Math.min(n - 1, i));
}

export const pointWords = (month: string, last: boolean) => (last ? 'Now' : `End of ${monthName(month)}`);

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Drawn at its own width, so the axis text is never stretched. */
export function HoursChart({ byMonth, total }: { byMonth: { month: string; hours: number }[]; total: number }) {
  const [at, setAt] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(W);
  useBeforePaint(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { months, pts } = chartSeries(byMonth, total);
  const step = niceStep(Math.max(...pts, 1) / 3);
  const top = step * Math.max(1, Math.ceil(Math.max(...pts, 1) / step));
  const X = (i: number) => xAt(i, pts.length, w);
  const Y = (v: number) => 10 + (1 - v / top) * (H - 40);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const last = pts.length - 1;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const named = chartNamed(months, byMonth);
  const place = (i: number) => ({ left: X(i), top: Y(pts[i]) });
  return <div className="rm-chartbox" ref={box}>
    <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-label={`${hoursWords(total)} agent hours`}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAt(pointUnder((e.clientX - r.left) / r.width, pts.length, w)); }}
      onPointerLeave={() => setAt(null)}>
      {ticks.map((v) => <g key={v}><line className="grid" x1={LEFT} x2={w - RIGHT} y1={Y(v)} y2={Y(v)} /><text x="0" y={Y(v) + 3.5}>{v.toLocaleString('en-US')}</text></g>)}
      {months.map((m, i) => named[i] && <text key={m} x={X(i)} y={H - 6} textAnchor="middle">{MONTHS[Number(m.slice(5)) - 1]}</text>)}
      <path className="ar" d={`${line} L${X(last)} ${Y(0)} L${X(0)} ${Y(0)} Z`} />
      {at != null && <line className="guide" x1={X(at)} x2={X(at)} y1={Y(top)} y2={Y(0)} />}
      <path className="ln" d={line} fill="none" strokeWidth="1.75" strokeLinejoin="round" />
      <rect className="pt" x={X(last) - 4} y={Y(pts[last]) - 4} width="8" height="8" strokeWidth="2" />
      {at != null && at !== last && <rect className="pt" x={X(at) - 4} y={Y(pts[at]) - 4} width="8" height="8" strokeWidth="2" />}
    </svg>
    {at != null && <div className={`tip rm-pop${X(at) > w / 2 ? ' left' : ''}`} style={place(at)}><span>{pointWords(months[at], at === last)}</span>{hoursWords(pts[at])} agent hours</div>}
  </div>;
}

// A round step for the hours axis: 1, 2, 2.5 or 5 times a power of ten.
function niceStep(rough: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= rough) return Math.max(1, k * p);
  return 10 * p;
}
