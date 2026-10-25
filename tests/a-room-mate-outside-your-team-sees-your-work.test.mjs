// A ROOM-MATE OUTSIDE YOUR TEAM SEES YOUR WORK, AND EVERYONE IS ON THE WALL
// (w-3d0fa23ffb, 2026-10-22).
//
// An hour with a test account outside the founder's team, in the founder's
// room. The founder asked to see what she was up to, "like being able to see
// your activity not just your name", and could not: thread names and the
// Activity tab came only off the team's thread cards, which a person on no
// team never sends or gets. And the room said five people while its wall
// showed two: three teammates had not turned Rooms on and had no card. "Show
// everybody in the room, even if they're not active. Otherwise it feels pretty
// lonely."
//
// Now a member with no card is on the wall, named, as not on Rooms yet.
import { describe, it, expect } from 'vitest';
import { wallCards } from '../shared/room-cards.mjs';

const NOW = Date.parse('2026-10-22T15:00:00-07:00');
const MIN = 60_000;
const MAYA = 'p-maya', ANA = 'p-ana', TEO = 'p-teo', ME = 'p-me';
const prof = (person_id, display_name, extra = {}) => ({ person_id, display_name, avatar_url: null, show_working: 'everyone', show_agents: true, show_level: true, show_status: true, show_activity: true, status_text: null, status_until: null, ...extra });
const pres = (person_id, extra = {}) => ({ person_id, device: 'aaaaaaaaaaaa', gone: false, agents_running: 1, working_on: null, working_private: false, working_at: new Date(NOW - 5 * MIN).toISOString(), hours_total: 10, hours_week: 1, week_start: '2026-10-19', hours_today: 1, day: '2026-10-22', streak_days: 1, active_days: [], hours_by_month: [], activity: [], updated_at: new Date(NOW - MIN).toISOString(), ...extra });

// The list of threads on the presence row, and the Activity tab it fed, went
// on 2026-10-25 (tests/a-persons-page-shows-none-of-their-threads). The one
// thread name, on the switch that names it, stays.
describe('the wall a room-mate outside my team sees', () => {
  const base = { members: [MAYA, ANA, ME], meId: ME, now: NOW, teammates: [], teamCards: [] };

  it("names the thread Maya shows everyone, and none of her list", () => {
    const activity = [{ title: 'Add an idempotency key', project: 'Payments API', state: 'running', at: NOW - MIN }];
    const w = wallCards({ ...base, profiles: [prof(MAYA, 'Maya C.')], presence: [pres(MAYA, { activity, working_on: 'Add an idempotency key' })] });
    expect(w.find((c) => c.id === MAYA)).toMatchObject({ workingOn: 'Add an idempotency key', activity: null });
  });
});

describe('everybody in the room is on the wall', () => {
  const names = [
    { person_id: ANA, name: 'Ana L.', avatar_url: null, has_card: true },
    { person_id: TEO, name: 'Teo Park', avatar_url: 'https://x.test/t.png', has_card: false },
    { person_id: MAYA, name: 'Maya C.', avatar_url: null, has_card: true },
  ];
  const base = { members: [ANA, TEO, MAYA, ME], meId: ME, now: NOW, teammates: [ANA, TEO], teamCards: [], names };

  it('a member who has not turned Rooms on is on it, named, and says so', () => {
    const w = wallCards({ ...base, profiles: [prof(ANA, 'Ana L.')], presence: [] });
    expect(w.find((c) => c.id === TEO)).toMatchObject({ name: 'Teo P.', avatarUrl: 'https://x.test/t.png', away: true, agents: null, level: null, workingOn: null });
  });

  it('a member who is invisible is not: they have a card nobody may read', () => {
    const w = wallCards({ ...base, profiles: [prof(ANA, 'Ana L.')], presence: [] });
    expect(w.some((c) => c.id === MAYA)).toBe(false);
  });

  it('with no names from the cloud, the wall is the cards, as before', () => {
    const w = wallCards({ ...base, names: null, profiles: [prof(ANA, 'Ana L.')], presence: [] });
    expect(w.map((c) => c.id)).toEqual([ANA]);
  });
});
