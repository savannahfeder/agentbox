// A FACE SHOWS FIRST AND LAST INITIALS (2026-11-21).
//
// One person was drawn three ways. The team faces took the first two letters
// of the first name (Sam Ortiz "SA", Theo Okafor "TH"), Home's Team card took
// one ("T"), the shared-file page took one, and only the handed-to chip took
// first and last ("TO"). Seen on a screen review of Home, the person page and
// a thread. Every face now reads its letters from one rule; this renders each.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialsOf } from '../renderer/src/team/rooms/room-rules.ts';
import { handedInitials } from '../renderer/src/threads/page-rules.ts';
import { initialOf } from '../renderer/src/shared-file/shared-file.ts';
import { Face } from '../renderer/src/team/people.tsx';
import { HomePage } from '../renderer/src/home/HomePage.tsx';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const face = (props: Parameters<typeof Face>[0]) => html(React.createElement(Face, props)).match(/aria-hidden="true">([^<]*)</)?.[1];

describe('the letters on a face', () => {
  it('are the first letter of the first word and of the last word', () => {
    expect(initialsOf('Sam Ortiz')).toBe('SO');
    expect(initialsOf('Theo Okafor')).toBe('TO');
    expect(initialsOf('maya de la cruz')).toBe('MC');
    expect(initialsOf('  Ana   Lima  ')).toBe('AL');
  });

  it('are the first two letters of a one-word name', () => {
    expect(initialsOf('Theo')).toBe('TH');
    expect(initialsOf('X')).toBe('X');
  });

  it('come from the part before @ of an email', () => {
    expect(initialsOf('theo@example.test')).toBe('TH');
  });

  it('are a question mark when there is nothing to take them from', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('  ')).toBe('?');
  });

  it('are the same from every helper that draws a person', () => {
    for (const name of ['Sam Ortiz', 'Theo Okafor', 'Theo', 'theo@example.test']) {
      expect(handedInitials(name)).toBe(initialsOf(name));
      expect(initialOf(name)).toBe(initialsOf(name));
    }
  });
});

describe('a drawn face', () => {
  it('shows SO for Sam Ortiz, by name or by person', () => {
    expect(face({ name: 'Sam Ortiz' })).toBe('SO');
    expect(face({ person: { id: 'p-sam', name: 'Sam Ortiz', email: 'sam@example.test' } as never })).toBe('SO');
  });

  it('takes an email-only person from the part before @', () => {
    expect(face({ person: { id: 'p-t', name: '', email: 'theo@example.test' } as never })).toBe('TH');
  });

  it("on Home's Team card shows the same two letters, but an AI teammate keeps its own mark", () => {
    const row = (over: object) => ({ key: 'person:p-theo', name: 'Theo Okafor', letter: 'T', ai: false, line: 'Working', state: 'idle', week: [0, 0, 0, 0, 0, 0, 0], total: 0, ...over });
    const page = html(React.createElement(HomePage, {
      hello: 'Good morning', now: 0, needs: [], needsCount: 0, progressCount: 0, progress: [],
      team: [row({}), row({ key: 'mate:m1', name: 'Scout', letter: 'S', ai: true })] as never,
      slot: () => {}, onDoor: () => {}, onOpen: () => {}, onMember: () => {}, onTeam: () => {},
    }));
    expect(page).toMatch(/class="hm-face[^"]*">TO<\/span>/);
    expect(page).not.toMatch(/class="hm-face[^"]*">T<\/span>/);
    expect(page).toMatch(/class="hm-face ai[^"]*">S<\/span>/);
  });
});
