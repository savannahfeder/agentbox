// AN AGENT WEARS A LITTLE FACE, WITH ITS OWN MARK ON THE CORNER.
//
// The new-task card's To line said "Agent" beside an EMPTY dashed square, which
// read as a picture that had not loaded (w-3e4eb60cc2, seen on a screenshot of
// the card). The picked fix, out of fifteen drawn: a small face in the dashed
// square, with the engine's mark (Claude's spark, Codex's prompt) as a badge on
// its corner. The dashed edge stays, because across the app it is what says
// "agent" rather than "person".
//
// Measured by rendering the face for each engine, and by reading the card and
// the older picker for the empty square and the "Cc"/"Cx" letters they drew.

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
const face = (props) => renderToStaticMarkup(createElement(AgentFace, props));

describe('the face itself', () => {
  it('draws eyes in the dashed square, with the Claude mark when Claude does it', () => {
    const html = face({ engine: 'claude' });
    expect(html).toContain('agent-face');
    expect(html).toContain('agent-eyes');
    expect(html).toMatch(/agent-badge[^"]*"[^>]*data-engine="claude"/);
  });

  it('wears the Codex mark when Codex does it', () => {
    expect(face({ engine: 'codex' })).toMatch(/agent-badge[^"]*"[^>]*data-engine="codex"/);
  });

  it('is a face with no badge when it is not known which agent', () => {
    const html = face({});
    expect(html).toContain('agent-eyes');
    expect(html).not.toContain('agent-badge');
  });

  it('treats an engine it has no mark for as unknown, not as Claude', () => {
    expect(face({ engine: 'gemini' })).not.toContain('agent-badge');
  });

  it('is hidden from screen readers, since the word beside it says who', () => {
    expect(face({ engine: 'claude' })).toMatch(/^<span[^>]*aria-hidden="true"/);
  });
});

describe('a person is not an agent', () => {
  it('still shows their initials in a solid square, with no face and no badge', () => {
    const html = renderToStaticMarkup(createElement(Face, { person: { id: 'p1', name: 'Jo Example' } }));
    expect(html).toContain('>Jo<');
    expect(html).not.toContain('agent-');
  });
});

describe('where an agent is drawn', () => {
  it('the new-task card never leaves the square empty', () => {
    const card = src('threads', 'ThreadComposer.tsx');
    expect(card).not.toMatch(/className="tc-agent"[^>]*\/>/);
    expect(card.match(/<AgentFace engine=\{pick\.engine\}/g)?.length).toBe(2);
  });

  it('the older picker draws the face instead of the letters Cc and Cx', () => {
    const picker = src('team', 'WhoPicker.tsx');
    expect(picker).not.toMatch(/'Cx' : 'Cc'/);
    expect(picker).toContain('<AgentFace engine={r.id}');
  });
});
