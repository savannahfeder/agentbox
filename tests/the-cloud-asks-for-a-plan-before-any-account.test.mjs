// THE CLOUD ASKS FOR A PLAN BEFORE ANY ACCOUNT.
//
// Signing up for Agentbox Cloud went: make an account, add a Claude or Codex
// account, and only later find the plans in Settings. The owner (w-2c627fdea8,
// 2026-10-23): "you shouldn't add your Claude or Codex account before it
// charges you ... minimize friction and steps to payment". Plans in the
// invitation were tried and turned down ("You have to choose a plan no matter
// what ... go back to the previous card"), and so were stacked rows ("better
// not to do stacks but to have cards side by side"). So the invitation is the
// plain card again, and the setup screen opens on the same three cards as
// Settings › Cloud until the plan is paid.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupStep } from '../renderer/src/cloud-setup-step.ts';
import { CloudPlanCards } from '../renderer/src/components/CloudPlanCards.tsx';
import { CloudSetup } from '../renderer/src/components/CloudSetup.tsx';
import { SETUP } from '../renderer/src/cloud-setup.ts';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('which step the setup screen opens on', () => {
  it('a signed-in cloud with no plan pays first', () => {
    expect(setupStep({ managed: true, plan: { signedIn: true, plan: 'none' } })).toBe('pay');
  });
  it('one with a plan goes to its accounts', () => {
    expect(setupStep({ managed: true, plan: { signedIn: true, plan: 'pro' } })).toBe('accounts');
  });
  it('a plan not read yet shows neither, so the accounts never flash first', () => {
    expect(setupStep({ managed: true, plan: null })).toBe('loading');
  });
  it('a Mac on its own AWS account is never asked to pay', () => {
    expect(setupStep({ managed: false, plan: { signedIn: true, plan: 'none' } })).toBe('accounts');
    expect(setupStep({ managed: false, plan: null })).toBe('accounts');
  });
  it('nor is one the server no longer knows', () => {
    expect(setupStep({ managed: true, plan: { signedIn: false } })).toBe('accounts');
  });
});

describe('the plan cards', () => {
  const html = renderToStaticMarkup(React.createElement(CloudPlanCards, { plan: { signedIn: true, plan: 'none' }, onChoose: () => {} }));
  it('are three, side by side, each with its price, agents and hours', () => {
    expect((html.match(/class="cloud-plan"/g) || []).length).toBe(3);
    const t = text(html);
    for (const s of ['$40', '$100', '$200', '+10 agent slots', '+25 agent slots', 'Unlimited agent slots', '400 hours a month', '1,200 hours a month', '3,000 hours a month']) expect(t).toContain(s);
  });
  it('each with its own button to choose it', () => {
    expect(text(html)).toMatch(/Choose Pro.*Choose Plus.*Choose Max/);
  });
  it('say which is opening Stripe, and hold the others until it opens', () => {
    const open = renderToStaticMarkup(React.createElement(CloudPlanCards, { plan: { signedIn: true, plan: 'none' }, opening: 'plus', onChoose: () => {} }));
    expect(text(open)).toContain('Opening Stripe…');
    expect((open.match(/disabled=""/g) || []).length).toBe(3);
  });
  it('are the same cards Settings › Cloud draws', () => {
    expect(read('renderer/src/components/Settings.tsx')).toContain('<CloudPlanCards plan={plan}');
  });
});

describe('the setup screen', () => {
  const cloud = { setUp: true, managed: true, offered: false, mode: 'full', whenOn: 'full', running: 0, accounts: [], signIns: [] };
  const draw = (plan) => renderToStaticMarkup(React.createElement(CloudSetup, { cloud, plan, onMode: () => {}, onClose: () => {} }));
  it('with no plan, shows the three cards and asks for no account', () => {
    const html = draw({ signedIn: true, plan: 'none' });
    expect(text(html)).toContain(SETUP.payHead);
    expect((html.match(/class="cloud-plan"/g) || []).length).toBe(3);
    expect(text(html)).not.toContain(SETUP.homeLede);
    expect(text(html)).not.toContain(SETUP.planClaude);
  });
  it('once paid, asks for the account it runs on', () => {
    const t = text(draw({ signedIn: true, plan: 'pro' }));
    expect(t).toContain(SETUP.homeLede);
    expect(t).not.toContain(SETUP.payHead);
  });
});

describe('the invitation is the plain card again', () => {
  const pages = read('renderer/src/threads/Pages.tsx');
  it('one button, Set up the cloud, and no plans', () => {
    const invite = pages.slice(pages.indexOf('th-cloud-invite"'), pages.indexOf('</div>}', pages.indexOf('th-cloud-invite"')));
    expect(invite).toContain('{SETUP.inviteGo}');
    expect(invite).not.toMatch(/plan/i);
  });
});
