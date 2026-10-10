// Reported 2026-10-07: two account rows showed "Raven Enterprise", including
// one headed "Not signed in". The saved tier was printed ahead of sign-in
// status. Render the real account rows to check both sides of that boundary;
// the internal Enterprise tier must also read as a plain plan name.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountRows } from '../renderer/src/components/Settings.tsx';
import { planLabel, readPlan } from '../main/claude-plan.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

globalThis.React = React;
const account = (over = {}) => ({
  profile: 'default', email: null, signedIn: false, chosen: false,
  plan: 'Enterprise', trouble: null, dir: null, ...over,
});
const draw = (accounts) => renderToStaticMarkup(React.createElement(AccountRows, {
  agent: { engine: 'claude', accounts }, onChoose: () => {}, onAdd: () => {},
}));

describe('a plan belongs to a signed-in account', () => {
  it('shows the sign-in instruction instead of a saved plan', () => {
    const html = draw([account()]);
    expect(html).toContain('Not signed in');
    expect(html).toContain('Finish signing in to use it');
    expect(html).not.toContain('Enterprise');
  });

  it('gives the same instruction when there is no saved plan', () => {
    expect(draw([account({ plan: null })])).toContain('Finish signing in to use it');
  });

  it('keeps the plan on the signed-in row in the reported pair', () => {
    const html = draw([account(), account({
      profile: 'work', email: 'work@example.com', signedIn: true, chosen: true,
    })]);
    expect(html.match(/Enterprise/g)).toHaveLength(1);
    expect(html).toContain('In use');
    expect(html).toContain('Finish signing in to use it');
  });

  it('still says signed in when that account has no plan reading', () => {
    const html = draw([account({ email: 'you@example.com', signedIn: true, plan: null })]);
    expect(html).toContain('>Signed in<');
    expect(html).not.toContain('Finish signing in');
  });

  it('keeps the repair message for a troubled account', () => {
    const html = draw([account({ trouble: 'Sign in again to continue.', dir: '/example/claude' })]);
    expect(html).toContain('Sign in again to continue.');
    expect(html).toContain('CLAUDE_CONFIG_DIR=/example/claude claude');
    expect(html).not.toContain('Enterprise');
  });
});

describe('Enterprise has a plain plan name', () => {
  it.each(['raven_enterprise', 'default_raven_enterprise'])('calls %s Enterprise', (tier) => {
    expect(planLabel(tier)).toBe('Enterprise');
  });

  it('keeps existing and unfamiliar plan names', () => {
    expect(planLabel('default_claude_max_20x')).toBe('Max 20x');
    expect(planLabel('default_claude_pro')).toBe('Pro');
    expect(planLabel('some_new_thing')).toBe('Some New Thing');
    expect(planLabel('raven_other')).toBe('Raven Other');
    expect(planLabel(null)).toBe(null);
  });

  it('changes only the displayed name, preserving the saved tier and capacity classification', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-plan-'));
    try {
      fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
        oauthAccount: { organizationRateLimitTier: 'default_raven_enterprise' },
      }));
      expect(readPlan('default', { home })).toMatchObject({
        known: true, label: 'Enterprise', tier: 'default_raven_enterprise', max: false,
      });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
