// Home's Team this week listed everyone on the team, so the founder scrolled
// past two people not working on the company to find the one they wanted, and
// an AI teammate whose line said "Waiting on you" sat last because nothing in
// Needs you was from it. Measured on the rules Home draws the card with.
import { describe, it, expect } from 'vitest';
import {
  hideMate, pinMate, readTeamCardChoice, showMate, teamCard, teamRowLine, undoHide, unpinMate, writeTeamCardChoice,
  type TeamCardChoice, type TeamRowState,
} from '../renderer/src/home/home-model.ts';

const row = (key: string, state: TeamRowState, total = 0) => ({ key, state, week: [0, 0, 0, 0, 0, 0, total], total });
const keys = (rows: { key: string }[]) => rows.map((r) => r.key);
const none: TeamCardChoice = { pinned: [], hidden: [] };

// The reported team: two AI teammates wait on you, Lena finished one thing,
// Theo and Priya finished nothing yet read as working, Support finished three.
const team = [
  row('mate:marketing', 'waiting', 19), row('mate:improve', 'waiting', 5), row('person:lena', 'quiet', 1),
  row('person:theo', 'working'), row('person:priya', 'working'), row('mate:support', 'quiet', 3),
];

describe('Team this week shows who you pinned and not who you hid', () => {
  it('puts a pinned teammate under whoever waits on you and drops the hidden ones (the reported case)', () => {
    const choice = hideMate(hideMate(pinMate(none, 'person:lena'), 'person:theo'), 'person:priya');
    const card = teamCard(team, choice);
    expect(keys(card.shown)).toEqual(['mate:marketing', 'mate:improve', 'person:lena', 'mate:support']);
    expect(keys(card.hidden)).toEqual(['person:theo', 'person:priya']);
  });

  it('keeps someone you hid on the card while they wait on you', () => {
    const card = teamCard([row('person:theo', 'waiting'), row('person:lena', 'quiet', 1)], hideMate(none, 'person:theo'));
    expect(keys(card.shown)).toEqual(['person:theo', 'person:lena']);
    expect(card.shown[0].hidden).toBe(true);
    expect(card.hidden).toEqual([]);
  });

  it('ranks a pinned teammate who waits on you with the others who wait', () => {
    const card = teamCard([row('mate:a', 'waiting', 9), row('person:lena', 'waiting', 1), row('mate:b', 'working')], pinMate(none, 'person:lena'));
    expect(keys(card.shown)).toEqual(['mate:a', 'person:lena', 'mate:b']);
  });

  it('keeps pinned teammates in the order you pinned them, whoever did more', () => {
    const choice = pinMate(pinMate(none, 'person:lena'), 'mate:support');
    expect(keys(teamCard(team.filter((r) => r.state !== 'waiting'), choice).shown).slice(0, 2)).toEqual(['person:lena', 'mate:support']);
  });

  it('leaves the busiest first order as it was when nothing is pinned or hidden', () => {
    expect(keys(teamCard(team, none).shown)).toEqual(['mate:marketing', 'mate:improve', 'person:theo', 'person:priya', 'mate:support', 'person:lena']);
    expect(teamCard(team, none).hidden).toEqual([]);
  });

  it('marks each row pinned or hidden so its menu can offer the way back', () => {
    const card = teamCard(team, hideMate(pinMate(none, 'person:lena'), 'person:theo'));
    expect(card.shown.find((r) => r.key === 'person:lena')).toMatchObject({ pinned: true, hidden: false });
    expect(card.hidden[0]).toMatchObject({ key: 'person:theo', pinned: false, hidden: true });
  });

  it('ignores a pinned or hidden teammate who is no longer on the team', () => {
    const card = teamCard([row('person:lena', 'quiet')], { pinned: ['person:gone'], hidden: ['person:left'] });
    expect(keys(card.shown)).toEqual(['person:lena']);
    expect(card.hidden).toEqual([]);
  });
});

describe('pinning and hiding', () => {
  it('hiding a pinned teammate unpins them, and pinning a hidden one shows them', () => {
    const hidden = hideMate(pinMate(none, 'person:lena'), 'person:lena');
    expect(hidden).toEqual({ pinned: [], hidden: ['person:lena'] });
    expect(pinMate(hidden, 'person:lena')).toEqual({ pinned: ['person:lena'], hidden: [] });
  });
  it('pins and hides each teammate once', () => {
    expect(pinMate(pinMate(none, 'a'), 'a').pinned).toEqual(['a']);
    expect(hideMate(hideMate(none, 'a'), 'a').hidden).toEqual(['a']);
  });
  it('unpin and show take back only that teammate', () => {
    const c = { pinned: ['a', 'b'], hidden: ['c', 'd'] };
    expect(unpinMate(c, 'a')).toEqual({ pinned: ['b'], hidden: ['c', 'd'] });
    expect(showMate(c, 'd')).toEqual({ pinned: ['a', 'b'], hidden: ['c'] });
  });
});

// A tester pinned a teammate, hid them and pressed Z: they came back unpinned.
describe('undoing a hide', () => {
  it('brings a pinned teammate back pinned, in the place they had (the reported case)', () => {
    const before = { pinned: ['a', 'person:lena', 'b'], hidden: [] };
    expect(undoHide(hideMate(before, 'person:lena'), 'person:lena', before)).toEqual(before);
  });
  it('brings an unpinned teammate back unpinned', () => {
    const before = { pinned: ['a'], hidden: ['c'] };
    expect(undoHide(hideMate(before, 'person:lena'), 'person:lena', before)).toEqual(before);
  });
  it('keeps what changed since, and does not pin twice', () => {
    const before = { pinned: ['person:lena'], hidden: [] };
    const since = pinMate(hideMate(hideMate(before, 'person:lena'), 'person:theo'), 'b');
    expect(undoHide(since, 'person:lena', before)).toEqual({ pinned: ['person:lena', 'b'], hidden: ['person:theo'] });
    expect(undoHide(before, 'person:lena', before).pinned).toEqual(['person:lena']);
  });
});

describe('the choice is kept on this computer', () => {
  const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('reads back what was written', () => {
    const s = memory();
    writeTeamCardChoice({ pinned: ['person:lena'], hidden: ['person:theo'] }, s);
    expect(readTeamCardChoice(s)).toEqual({ pinned: ['person:lena'], hidden: ['person:theo'] });
  });
  it('reads nothing pinned or hidden from an empty or broken store', () => {
    expect(readTeamCardChoice(memory())).toEqual(none);
    const s = memory();
    s.setItem('agentbox.home.teamCard', '{not json');
    expect(readTeamCardChoice(s)).toEqual(none);
    s.setItem('agentbox.home.teamCard', JSON.stringify({ pinned: 'person:lena', hidden: [3, 'person:theo'] }));
    expect(readTeamCardChoice(s)).toEqual({ pinned: [], hidden: ['person:theo'] });
    expect(readTeamCardChoice(null)).toEqual(none);
  });
});

describe('the line under a name says no more than Needs you', () => {
  it('an AI teammate whose own status waits on you, with nothing in Needs you, does not say so (the reported case)', () => {
    expect(teamRowLine({ waiting: false, now: 'Waiting on you', agents: 0 })).toBe('Nothing running');
    expect(teamRowLine({ waiting: false, now: 'Waiting on you', agents: 1 })).toBe('Working');
  });
  it('says Waiting on you when Needs you holds something from them', () => {
    expect(teamRowLine({ waiting: true, now: null, agents: 0 })).toBe('Waiting on you');
    expect(teamRowLine({ waiting: true, now: 'Pricing page', agents: 1 })).toBe('Waiting on you');
  });
  it('keeps any other line as it was', () => {
    expect(teamRowLine({ waiting: false, now: 'Not on Rooms yet', agents: 1 })).toBe('Not on Rooms yet');
    expect(teamRowLine({ waiting: false, now: null, agents: 2 })).toBe('Working');
    expect(teamRowLine({ waiting: false, now: null, agents: 0 })).toBe('Nothing running');
  });
});
