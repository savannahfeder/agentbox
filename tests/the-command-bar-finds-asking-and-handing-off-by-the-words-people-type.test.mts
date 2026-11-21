// THE COMMAND BAR FINDS ASKING AND HANDING OFF BY THE WORDS PEOPLE TYPE (w-f702d60afe, 2026-11-21).
//
// A hand-off review typed into ⌘K on a thread: "hand off", "handoff" and
// "hand it" found nothing, "ask theo" found a file, and there was no row at all
// for asking someone for help or a review.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadCommands } from '../renderer/src/thread-commands.ts';
import { matchesQuery } from '../renderer/src/palette-rows.ts';

const theo = { id: 'p-theo', name: 'Theo Okafor' };
const rows = threadCommands({ give: [theo], ask: [theo] });
const found = (q: string) => rows.filter((r) => matchesQuery(q, r)).map((r) => r.label);

describe('the rows', () => {
  it('offers asking for a review and for help, by first name, before handing over', () => {
    expect(rows.map((r) => r.label)).toEqual(['Ask Theo for a review…', 'Ask Theo for help…', 'Hand over to Theo Okafor…']);
  });
  it('finds handing over by hand off and handoff', () => {
    for (const q of ['hand off', 'handoff', 'hand over', 'assign']) expect(found(q), q).toContain('Hand over to Theo Okafor…');
  });
  it('finds asking by ask theo, review and help', () => {
    expect(found('ask theo')).toEqual(['Ask Theo for a review…', 'Ask Theo for help…']);
    expect(found('review')).toContain('Ask Theo for a review…');
    expect(found('help')).toContain('Ask Theo for help…');
  });
  it('offers no ask without people to ask', () => {
    expect(threadCommands({ give: [theo] }).map((r) => r.label)).toEqual(['Hand over to Theo Okafor…']);
  });
});

describe('running one opens the thread menu\'s sheet with the person picked', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
  it('asks only people not already asked, and not on an ask', () => {
    expect(app).toContain("ask: giveToFor(target).filter((p) => !p.id.startsWith('mate:') && !p.asked && !target.ask),");
  });
  it('sends the event the menu hears', () => {
    expect(app).toContain('window.dispatchEvent(new CustomEvent(ASK_PERSON_EVENT, { detail: { kind: d.kind, to: { id: d.to, name: d.name } } }))');
    expect(menu).toContain('window.addEventListener(ASK_PERSON_EVENT, askPerson);');
    expect(menu).toContain('setGiveStart(d.kind); setGivingFromShare(true); setGiving(true); setGivingTo(d.to); setOpen(true);');
  });
});

// A second walk-through: "take back" found nothing on a handed-over thread,
// "share" found only who can see it, and Hand over to Theo went at once with
// no note and no Cancel, unlike the menu.
describe('the second pass', () => {
  it('hands a person over through the note step, an AI teammate at once', () => {
    const [give] = threadCommands({ give: [theo] });
    expect(give.does).toEqual({ act: 'ask', kind: 'give', to: 'p-theo', name: 'Theo Okafor' });
    const [mate] = threadCommands({ give: [{ id: 'mate:m1', name: 'Maintainer' }] });
    expect(mate.label).toBe('Hand over to Maintainer');
    expect(mate.does.act).toBe('give');
  });
  it('finds asking and handing over by share', () => {
    expect(found('share')).toEqual(['Ask Theo for a review…', 'Ask Theo for help…', 'Hand over to Theo Okafor…']);
  });
  it('offers Take it back on a handed-over thread, by take back', () => {
    const back = threadCommands({ takeBack: true });
    expect(back.map((r) => r.label)).toEqual(['Take it back']);
    expect(back.filter((r) => matchesQuery('take back', r))).toHaveLength(1);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("case 'take-back': void takeHandOverBack(item); return;");
    expect(app).toContain('takeBack: !!handedToPage(target),');
  });
});
