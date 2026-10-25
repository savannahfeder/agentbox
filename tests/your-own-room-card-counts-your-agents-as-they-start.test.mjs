// YOUR OWN ROOM CARD COUNTS YOUR AGENTS AS THEY START (w-3d0fa23ffb, 2026-10-22).
//
// The power tester sent two tasks and her own card on the room's wall still
// said "1 agent working" while In progress said 3; later it said 3 while In
// progress said 2. Her card read her own count back off the cloud, which her
// Mac sends on the team's sync pass, so it trailed by a pass or more. My own
// card now counts what this Mac is running, as it already names what I am
// working on. Everyone else's card still comes off the cloud.
import { it, expect } from 'vitest';
import { wallCards } from '../shared/room-cards.mjs';

const NOW = Date.parse('2026-10-22T15:00:00-07:00');
const ME = 'p-me', MAYA = 'p-maya';
const prof = (person_id, extra = {}) => ({ person_id, display_name: person_id, show_working: 'everyone', show_agents: true, show_level: true, show_activity: true, ...extra });
const pres = (person_id, agents) => ({ person_id, device: 'aaaaaaaaaaaa', gone: false, agents_running: agents, working_at: new Date(NOW - 60_000).toISOString(), updated_at: new Date(NOW - 30_000).toISOString(), hours_total: 1 });
const wall = (mine, extra = {}) => wallCards({ members: [ME, MAYA], meId: ME, now: NOW, profiles: [prof(ME, extra), prof(MAYA)], presence: [pres(ME, 1), pres(MAYA, 2)], mine });

it('my card says what this Mac runs now, not what the cloud last heard', () => {
  expect(wall({ workingOn: 'Bump node', agents: 3 }).find((c) => c.id === ME).agents).toBe(3);
});

it('and none when nothing is running here', () => {
  expect(wall({ workingOn: null, agents: 0 }).find((c) => c.id === ME).agents).toBe(0);
});

it("someone else's card is still what their Mac sent", () => {
  expect(wall({ workingOn: null, agents: 3 }).find((c) => c.id === MAYA).agents).toBe(2);
});

it('with my count hidden, my card hides it too', () => {
  expect(wall({ workingOn: null, agents: 3 }, { show_agents: false }).find((c) => c.id === ME).agents).toBeNull();
});
