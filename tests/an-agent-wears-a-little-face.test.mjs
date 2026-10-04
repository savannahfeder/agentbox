// AN AGENT WEARS A LITTLE FACE: TWO EYES IN THE DASHED SQUARE, NOTHING ELSE.
//
// The new-task card's To line said "Agent" beside an EMPTY dashed square, which
// read as a picture that had not loaded (w-3e4eb60cc2, seen on a screenshot of
// the card). Out of fifteen faces drawn, and then the face photographed in the
// app with an orange badge, a grey badge and none, the pick was "just the
// little eyes, no badge or anything". The Model line under it already names the
// agent, so a badge only repeated it. The dashed edge stays, because across the
// app it is what says "agent" rather than "person".
//
// Measured by rendering the face, and by reading the card and the older picker
// for the empty square and the "Cc"/"Cx" letters they drew.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentFace } from '../renderer/src/components/AgentFace.tsx';
import { Face } from '../renderer/src/team/people.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const face = () => renderToStaticMarkup(createElement(AgentFace));

describe('the face itself', () => {
  it('draws two eyes in the dashed square', () => {
    const html = face();
    expect(html).toContain('agent-face');
    expect(html.match(/<rect /g)?.length).toBe(2);
  });

  it('wears no badge and no mark of any engine', () => {
    expect(face()).not.toMatch(/badge|data-engine|<line|<path/);
    expect(src('components', 'agent-face.css')).not.toContain('badge');
  });

  it('is hidden from screen readers, since the word beside it says who', () => {
    expect(face()).toMatch(/^<span[^>]*aria-hidden="true"/);
  });
});

describe('a person is not an agent', () => {
  it('still shows their initials in a solid square, with no eyes', () => {
    const html = renderToStaticMarkup(createElement(Face, { person: { id: 'p1', name: 'Jo Example' } }));
    expect(html).toContain('>Jo<');
    expect(html).not.toContain('agent-');
  });
});

describe('where an agent is drawn', () => {
  it('the new-task card never leaves the square empty, in the To line or its menu', () => {
    const card = src('threads', 'ThreadComposer.tsx');
    expect(card).not.toMatch(/className="tc-agent"[^>]*\/>/);
    expect(card.match(/<AgentFace \/>/g)?.length).toBe(2);
  });

  it('the older picker draws the face instead of the letters Cc and Cx', () => {
    const picker = src('team', 'WhoPicker.tsx');
    expect(picker).not.toMatch(/'Cx' : 'Cc'/);
    expect(picker).toContain('<AgentFace />');
  });
});
