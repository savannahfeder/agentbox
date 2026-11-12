// THE CLOUD SETUP SAYS WHICH ACCOUNT IT MEANS.
//
// A tester who had just signed in to Agentbox and paid for the cloud read
// "Add the account it should use." and could not tell whether it meant their
// Agentbox login or their Claude account, which use different emails. The line
// sits right after the Agentbox sign-in and the payment, so "the account" read
// as the one they had just used. It means the Claude or Codex plan the agents
// run on, so it says so.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SETUP } from '../renderer/src/cloud-setup.ts';
import { CloudSetup } from '../renderer/src/components/CloudSetup.tsx';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the line over the accounts', () => {
  it('names the two kinds of account it means', () => {
    expect(SETUP.homeLede).toMatch(/Claude/);
    expect(SETUP.homeLede).toMatch(/Codex/);
  });

  it('is no longer the line that could mean either login', () => {
    expect(SETUP.homeLede).not.toBe('Add the account it should use.');
    expect(SETUP.homeLede).not.toMatch(/Agentbox/);
  });

  it('is still one short plain sentence', () => {
    expect(SETUP.homeLede.split(' ').length).toBeLessThanOrEqual(10);
    expect(SETUP.homeLede).not.toMatch(/[:;—–]/);
    expect(SETUP.homeLede).toMatch(/^[A-Z][^.]*\.$/);
  });

  it('is the line the accounts screen shows', () => {
    const cloud = { setUp: true, managed: false, mode: 'mac', running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null }, accounts: [], signIns: [] };
    const html = renderToStaticMarkup(React.createElement(CloudSetup, { cloud, onMode: () => {}, onClose: () => {} }));
    expect(text(html)).toContain(SETUP.homeLede);
  });
});
