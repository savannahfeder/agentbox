// Groups showed a level beside every name, on hover cards and profiles, and on
// the phone, worked out from agent hours. The team does not want that kind of
// made-up score (w-d19d20f14f). Measured before the change: wallCards and
// summarizeRuns both returned `level`, and seven screens drew it.
//
// The switch that used to read "Your level" still hides your agent hours from
// the cloud, so it stays, named for what it hides.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as hours from '../shared/agent-hours.mts';
import { wallCards } from '../shared/room-cards.mts';
import { openGroupWords } from '../renderer/src/team/rooms/room-rules.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-04T12:00:00Z');
const prof = (person_id, extra = {}) => ({ person_id, display_name: person_id, avatar_url: null, show_working: 'team', show_agents: true, show_level: true, show_status: true, ...extra });
const pres = (person_id) => ({ person_id, mac_id: 'm1', updated_at: new Date(NOW).toISOString(), agents_running: 2, hours_total: 1240, hours_week: 15, week_start: '2026-11-02', hours_today: 1, day: '2026-11-04', streak_days: 3, active_days: [], hours_by_month: [] });

describe('no level is worked out', () => {
  it('a card carries hours but no level, whatever the switch says', () => {
    for (const show_level of [true, false]) {
      const [card] = wallCards({ members: ['maya'], meId: 'me', now: NOW, profiles: [prof('maya', { show_level })], presence: [pres('maya')] });
      expect(card).not.toHaveProperty('level');
      if (show_level) expect(card.hoursTotal).toBe(1240);
    }
  });

  it('a person not on Groups yet carries no level either', () => {
    const [card] = wallCards({ members: ['kai'], meId: 'me', now: NOW, profiles: [], presence: [], names: [{ person_id: 'kai', name: 'Kai M', has_card: false }] });
    expect(card).not.toHaveProperty('level');
  });

  it('the hours summary has no level and the curve is gone', () => {
    const s = hours.summarizeRuns([{ key: 'a', at: NOW - 1000, seconds: 3600 }], { now: NOW });
    expect(s.total).toBeCloseTo(1);
    expect(s).not.toHaveProperty('level');
    expect(hours).not.toHaveProperty('levelFor');
    expect(hours).not.toHaveProperty('hoursForLevel');
    expect(hours).not.toHaveProperty('MASTERY_HOURS');
  });
});

describe('no screen says level', () => {
  const screens = [
    'renderer/src/team/rooms/RoomPage.tsx',
    'renderer/src/team/rooms/RoomPerson.tsx',
    'renderer/src/team/rooms/RoomDialogs.tsx',
    'renderer/src/team/rooms/RoomsSettings.tsx',
    'renderer/src/team/rooms/GoInvisible.tsx',
    'renderer/src/team/everything/members.ts',
    'mobile/src/ui/Everything.tsx',
    'mobile/src/ui/Groups.tsx',
  ];
  it.each(screens)('%s neither draws a level nor names one', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.level\b/);
    expect(src).not.toMatch(/\blevel\s*:/);
    expect(src).not.toMatch(/\blevel\b/i);
  });

  it('the card type has no level', () => {
    const type = read('renderer/src/types.ts').match(/export interface RoomCard \{[\s\S]*?\n\}/)[0];
    expect(type).not.toMatch(/\blevel\b/);
  });

  it('the switch that hides your hours says so', () => {
    expect(read('renderer/src/team/rooms/RoomsSettings.tsx')).toContain('label="Your agent hours"');
  });

  it('an open group says strangers see your hours, not a level', () => {
    const me = { show_working: 'team', show_level: true, show_agents: true };
    expect(openGroupWords(me)).not.toMatch(/level/);
    expect(openGroupWords(me)).toContain('your agent hours');
    expect(openGroupWords({ ...me, show_level: false })).not.toContain('agent hours');
  });
});
