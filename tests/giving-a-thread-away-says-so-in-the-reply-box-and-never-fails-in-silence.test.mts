// GIVING A THREAD AWAY SAYS SO IN THE REPLY BOX, AND NEVER FAILS IN SILENCE (2026-11-20).
//
// Second rerun, synthetic team. Theo gave "Add /health endpoint with test" to
// Sam with Hand it over. Nothing on screen changed and no toast stayed; after
// a reload the thread still had its reply box and options, still ANSWERED in
// Needs you. Measured on his copy: the hand-over ran (its patch file was
// written at 03:11:54) and then wrote nothing, no task and no close. With no
// two-person record between them yet, the hand-over waits on a full pass of
// the cloud before it makes one, and the only word on screen was a 2.5-second
// "Sending to Sam…" toast; its end, whenever it came, was another toast, and
// main kept no record of it.
//
// The reply box's place now says what is happening: "Giving this to Sam…"
// while it runs, "Not given to Sam: <why>" with Try again if it fails, and
// once given "You gave this to Theo" with Message and Reopen, so a reply that
// would be refused is never offered. Main logs a hand-over that fails.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GivenDock, givenState } from '../renderer/src/components/GivenDock.tsx';

const open = { status: 'open', answer: null };
const given = { status: 'done', answer: 'Given to Sam Ortiz: this is yours now.' };
const draw = (state: NonNullable<ReturnType<typeof givenState>>) => renderToStaticMarkup(React.createElement(GivenDock, {
  state, onMessage: () => {}, onReopen: () => {}, onRetry: () => {}, onKeep: () => {},
}));

describe('what the reply box’s place says', () => {
  it('is nothing on a thread nobody is giving away', () => {
    expect(givenState(open, null)).toBeNull();
  });

  it('says it is on its way while the hand-over runs, the reported one', () => {
    const html = draw(givenState(open, { name: 'Sam Ortiz' })!);
    expect(html).toContain('Giving this to Sam…');
    expect(html).not.toContain('<button');
  });

  it('says why when it fails, with Try again and Keep it', () => {
    const html = draw(givenState(open, { name: 'Sam Ortiz', error: 'the cloud did not answer' })!);
    expect(html).toContain('Not given to Sam: the cloud did not answer');
    expect(html).toContain('>Try again</button>');
    expect(html).toContain('>Keep it</button>');
  });

  it('once given, says so with Message and Reopen, and no reply box', () => {
    const html = draw(givenState(given, null)!);
    expect(html).toContain('You gave this to Sam');
    expect(html).toContain('>Message Sam</button>');
    expect(html).toContain('>Reopen</button>');
    expect(html).not.toContain('Reply');
  });

  it('reads the thread over a hand-over that has finished', () => {
    expect(givenState(given, { name: 'Sam Ortiz' })?.kind).toBe('given');
  });
});

describe('the wiring', () => {
  it('Focus draws it in the reply box’s place', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/update \|\| trouble \? null : given \? \(\s*<GivenDock/);
  });

  it('the window keeps the hand-over’s state until it ends, and the error with it', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/setHanding\(\(was\) => \(\{ \.\.\.was, \[key\]: \{ name: to\.name \} \}\)\)/);
    expect(app).toMatch(/\[key\]: \{ name: to\.name, error: out\.error/);
  });

  it('main logs a hand-over that fails', () => {
    const team = fs.readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8');
    expect(team).toMatch(/log\(`team: could not give \$\{id\} to/);
  });
});
