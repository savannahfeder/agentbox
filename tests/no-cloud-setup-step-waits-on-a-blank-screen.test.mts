// NO CLOUD SETUP STEP WAITS ON A BLANK SCREEN.
//
// QA batch 004 (F-96, w-aaedc8f711), browser mode: Sign in closed the dialog
// at once and left a dark page carrying only the back arrow and the wordmark
// for 5 to 9 seconds, then "Choose a plan" appeared. The blank was the
// setup screen's `loading` step, which drew an empty stack while it read the
// account's plan from the cloud server, and the sign-in card had already let
// go of its button. Both ends of the gap now say something.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloudSetup } from '../renderer/src/components/CloudSetup.tsx';
import { SETUP } from '../renderer/src/cloud-setup.ts';
import { setupStep } from '../renderer/src/cloud-setup-step.ts';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cloud = { setUp: true, managed: true, offered: false, mode: 'full', whenOn: 'full', running: 0, accounts: [], signIns: [] };
const draw = (plan) => renderToStaticMarkup(React.createElement(CloudSetup, { cloud, plan, onMode: () => {}, onClose: () => {} }));

describe('the step before the plan has been read', () => {
  const html = draw(null);
  it('is still the loading step', () => {
    expect(setupStep({ managed: true, plan: null })).toBe('loading');
  });
  it('says what it is doing instead of drawing an empty card', () => {
    expect(text(html)).toContain(SETUP.loadingLede);
  });
  it('with a moving mark beside it, so it does not read as hung', () => {
    expect(html).toContain('cs-busy');
  });
  it('and no heading, so none flashes before "Choose a plan"', () => {
    expect(html).not.toContain(SETUP.payHead);
    expect(html).not.toMatch(/class="fr-page"/);
  });
});

describe('the steps either side of it still say their own thing', () => {
  it('the plan step asks for a plan', () => {
    const t = text(draw({ signedIn: true, plan: 'none' }));
    expect(t).toContain(SETUP.payHead);
    expect(t).not.toContain(SETUP.loadingLede);
  });
  it('the accounts step asks for an account', () => {
    const t = text(draw({ signedIn: true, plan: 'pro' }));
    expect(t).toContain(SETUP.homeLede);
    expect(t).not.toContain(SETUP.loadingLede);
  });
});

describe('the sign-in card holds its button until the screen behind it is ready', () => {
  const page = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');
  const submit = page.slice(page.indexOf('const submit = async'), page.indexOf('const askForReset'));
  it('hands over on the last path of its submit', () => {
    expect(submit.slice(submit.lastIndexOf('return;'))).toContain('onSignedIn');
  });
  it('and lets go of the button on no path but the ones that stay here', () => {
    // Clearing it before handing over put the untouched form back on screen
    // for the moment before the snapshot carried the new cloud through.
    expect(submit.slice(submit.lastIndexOf('return;'))).not.toContain('setBusy(null)');
  });
});
