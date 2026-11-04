// THE TEAM IN CHATS IS "EVERYONE", ITS NAMES OPEN THEIR PAGE, AND LATER IS NOT WORK.
//
// Three people compared the Team page in the sidebar with the team in Chats on
// 2026-11-02; two kept Chats. What they asked of it: "Team" meant three things
// (a summary with a # like a channel you cannot type in, the team's group chat,
// and the # face), the names in the summary could not be pressed, and a thread
// put off till later was listed as "Working on".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { teamToday } from '../renderer/src/team/today.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const NOW = new Date(2026, 9, 31, 15, 0).getTime();
const at = (h) => new Date(2026, 9, 31, h, 0).getTime();
const base = {
  range: 'today', now: NOW, me: 'p-maya', products: [{ slug: 'lumen', name: 'Lumen', team: {} }], cards: [], decisions: [], needs: [],
  people: [{ id: 'p-dev', name: 'Dev Patel' }], mates: [], mateOf: () => null,
};

describe('your day', () => {
  it('does not call a thread put off till later work', () => {
    const day = teamToday({ ...base, items: [
      { id: 'later', product: 'lumen', title: 'Pick quotes', status: 'open', labels: [], updatedAt: at(10), createdAt: at(9), runAt: NOW + 3600e3 },
      { id: 'now', product: 'lumen', title: 'Draft note', status: 'claimed', labels: [], updatedAt: at(10), createdAt: at(9) },
    ] });
    const me = day.people.find((p) => p.key === 'me');
    expect((me?.working ?? []).map((l) => l.item?.id)).toEqual(['now']);
  });

  // Later is this computer's own hiding time, so the app passes its rule in.
  it('takes the app\'s own Later, which the thread itself does not carry', () => {
    const day = teamToday({ ...base, later: (i) => i.id === 'parked', items: [
      { id: 'parked', product: 'lumen', title: 'Pick quotes', status: 'open', labels: [], updatedAt: at(10), createdAt: at(9) },
      { id: 'now', product: 'lumen', title: 'Draft note', status: 'claimed', labels: [], updatedAt: at(10), createdAt: at(9) },
    ] });
    expect((day.people.find((p) => p.key === 'me')?.working ?? []).map((l) => l.item?.id)).toEqual(['now']);
    expect(read('renderer/src/App.tsx')).toMatch(/later: \(i\) => stateOfMine\(i\) === 'scheduled',/);
  });

  it('offers no Open in Chats inside Chats', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/\{room && !chatsPlaceShown && <PlaceAction/);
  });
});

describe('the team in Chats', () => {
  it('is called Everyone, with the people mark rather than a channel #', () => {
    const col = read('renderer/src/teammates/ChatsColumn.tsx');
    const row = col.slice(col.indexOf('c.onTeam &&'), col.indexOf('</button>}', col.indexOf('c.onTeam &&')));
    expect(row).toMatch(/<span className="cx-n">Everyone<\/span>/);
    expect(row).toMatch(/I\.groupNav\(\)/);
    expect(row).not.toMatch(/tq-hash/);
    expect(read('renderer/src/App.tsx')).toMatch(/todayPage\('Everyone', homeLayout === 'chats' \?/);
  });

  it('opens a person\'s page from their name', () => {
    expect(read('renderer/src/team/TodayPage.tsx')).toMatch(/onPerson && p\.key !== 'me' \? <button type="button" className="td-name" onClick=\{\(\) => onPerson\(p\.key\)\}>/);
  });
});
