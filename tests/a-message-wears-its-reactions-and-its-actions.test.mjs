// WHAT A MESSAGE IN A CHAT WEARS: the chips people put on it, and the bar that
// appears when you point at it.
//
// The rest of drawing A of the messages redesign (w-2e8aa16f0f). The layout
// shipped as 61c3230; this is what the drawing has ON each message — small
// square chips underneath, yours a shade brighter, and a quiet sharp bar at the
// top corner with react, reply and "Hand to an agent".
//
// THE LINE THAT MOVED. "Hand it to an agent" was one sentence pinned under the
// whole conversation, so it said the same thing under the newest message
// whatever that message was, and the message you actually wanted work made of
// was usually several up. It is an action on a message now.
//
// Round one of the redesign came back as "no colour, no rounded corners", so
// the look is checked as well as the behaviour: every plate here is square, and
// the one distinction a chip makes — whether you are on it — is carried by
// brightness rather than by a tint.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const ME = 'p-me', MAYA = 'p-maya';
const at = (h, m) => new Date(2026, 9, 5, h, m).getTime();
const said = (by, when, text, uid) => ({ at: when, who: 'you', by, text, uid });

const team = {
  state: {}, me: ME,
  byId: new Map([[ME, { id: ME, name: 'Sam Rivera', email: '', avatarUrl: null }], [MAYA, { id: MAYA, name: 'Maya Chen', email: '', avatarUrl: null }]]),
  products: new Map(),
};

const draw = (events, extra = {}) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
  React.createElement(Thread, {
    events, chat: true, name: 'Claude Code', landOn: 'w-1', onWhole: () => {},
    md: (t) => React.createElement('p', null, t),
    ...extra,
  })));

const HERS = [said(MAYA, at(4, 21), 'Sending my findings here.', 'l-one')];
const acting = { onReact: () => {}, onQuote: () => {}, onHandToAgent: () => {} };

describe('the chips under a message', () => {
  it('draws one per emoji with how many people are on it', () => {
    const html = draw(HERS, { ...acting, reactions: { 'l-one': { '👀': [MAYA, ME], '🙏': [MAYA] } } });
    expect(html.match(/class="chat-chip[ "]/g)).toHaveLength(2);
    expect(html).toContain('>👀</span><span class="chat-chip-count">2<');
    expect(html).toContain('>🙏</span><span class="chat-chip-count">1<');
  });

  it('marks the one you are on, and only that one', () => {
    const html = draw(HERS, { ...acting, reactions: { 'l-one': { '👀': [MAYA, ME], '🙏': [MAYA] } } });
    expect(html.match(/class="chat-chip mine"/g)).toHaveLength(1);
    expect(html).toMatch(/class="chat-chip mine"[^>]*aria-pressed="true"/);
  });

  it('draws no chip row at all on a message nobody reacted to', () => {
    expect(draw(HERS, acting)).not.toContain('chat-chips');
  });

  // THE CASE THAT MUST NOT GET THEM. A message still on its way has not been
  // written to the ledger, so it has no uid, so there is nothing to hang a
  // reaction on; reacting to it would write a chip onto a name that is about to
  // change.
  it('gives a message that has not been written down yet neither chips nor a bar', () => {
    const html = draw([{ at: at(9, 12), who: 'you', text: 'On its way.', pending: true }], acting);
    expect(html).not.toContain('chat-chips');
    expect(html).not.toContain('chat-acts');
  });
});

describe('the bar that appears when you point at a message', () => {
  const html = draw(HERS, acting);

  it('offers react, reply and handing it to an agent', () => {
    expect(html).toContain('class="chat-acts"');
    expect(html.match(/class="chat-act[ "]/g)).toHaveLength(3);
    expect(html).toContain('aria-label="React"');
    expect(html).toContain('aria-label="Reply"');
    expect(html).toContain('aria-label="Hand to an agent"');
  });

  it('says "Hand to an agent" in words, not only as a glyph', () => {
    expect(html).toContain('>Hand to an agent</span>');
  });

  it('keeps the two other actions where there is nothing to hand work to', () => {
    const alone = draw(HERS, { onReact: () => {}, onQuote: () => {} });
    expect(alone).toContain('aria-label="React"');
    expect(alone).not.toContain('aria-label="Hand to an agent"');
  });

  it('leaves a thread with an agent exactly as it was', () => {
    const agent = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
      React.createElement(Thread, {
        events: [said(undefined, at(9, 0), 'Do the thing.', 'l-a')], chat: false,
        name: 'Claude Code', landOn: 'w-1', onWhole: () => {}, md: (t) => React.createElement('p', null, t),
      })));
    expect(agent).not.toContain('chat-acts');
    expect(agent).not.toContain('chat-chips');
  });
});

describe('the look round one asked for', () => {
  const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8');
  const rule = (name) => css.slice(css.indexOf(`${name} {`)).slice(0, css.slice(css.indexOf(`${name} {`)).indexOf('}'));

  it('keeps every new plate square', () => {
    for (const name of ['.chat-chip', '.chat-acts', '.chat-emoji', '.chat-emoji-one', '.fmt-btn']) {
      expect(rule(name)).toContain('border-radius: 0');
    }
  });

  it('says which chip is yours with brightness, never with a colour', () => {
    expect(css).toMatch(/\.chat-chip\.mine \{[^}]*border-color: var\(--text-faint\)[^}]*color: var\(--text\)/);
    // AND NOTHING THIS ROW ADDED NAMES A COLOUR AT ALL. Every `color` and
    // `border-color` below is one of the app's own tokens, so the chips, the bar
    // and the formatting bar take whatever the window is wearing. (The two
    // shadows are #000 at low alpha, which is a depth and not a hue, so the
    // test reads colour declarations rather than every hex in the file.)
    const added = css.slice(css.indexOf('.chat-chips'));
    const colours = [...added.matchAll(/(?:^|[^-\w])((?:border-)?color):\s*([^;}]+)/g)].map((m) => m[2].trim());
    expect(colours.length).toBeGreaterThan(5);
    expect(colours.filter((v) => !v.startsWith('var(') && v !== 'inherit')).toEqual([]);
  });

  it('never lets the bar change a message’s height', () => {
    expect(rule('.chat-acts')).toContain('position: absolute');
  });

  // KEYBOARD-REACHABLE, and it was not. The bar was hidden with `display: none`,
  // which takes its three buttons out of the tab order, so reacting to a
  // message — the one action here with no other route — could only be done with
  // a pointer. It is faded and deaf to the mouse instead, and Tab brings it up.
  it('leaves the bar in the tab order while it is out of sight', () => {
    const acts = rule('.chat-acts');
    expect(acts).not.toContain('display: none');
    expect(acts).toContain('opacity: 0');
    expect(acts).toContain('pointer-events: none');
    expect(css).toMatch(/\.chat-acts:focus-within[^{]*\{[^}]*opacity: 1[^}]*pointer-events: auto/);
  });
});

describe('the line that used to sit under the whole conversation', () => {
  it('is gone from the pane, because it is on the message now', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).not.toContain('className="ts-hand"');
    expect(focus).toContain('onHandToAgent={onHandToAgent ? () => onHandToAgent(item) : undefined}');
  });
});
