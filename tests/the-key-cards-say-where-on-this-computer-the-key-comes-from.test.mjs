// THE KEY CARDS SAY WHERE ON THIS COMPUTER THE KEY COMES FROM.
//
// What was wrong (2026-11-08): the daily report's cloud run asked for the
// PostHog key with a paste box whose own words said the key was in the Mac
// Keychain as "posthog-read-key". The person had to go and copy it.
//
// Two cards now carry the place. The approval card a waiting run raises
// (main/cloud/key-asks.mts) says which key, where it is read from and that it
// is kept for every cloud thread. The ask line a run ends on can carry the same
// place as a third part, and the thread's card then offers it in one press,
// above the paste box. Measured on the functions and markup those screens draw.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement as h } from 'react';
import { Supervisor } from '../main/supervisor.mts';
import { renderToStaticMarkup } from 'react-dom/server';
import { NEED, needsIn } from '../shared/cloud-needs.mjs';
import { approvalReads, UNREADABLE } from '../renderer/src/approval-card.ts';
import { NeedCard, NeedPlace } from '../renderer/src/components/NeedCard.tsx';

const LINE = `${NEED} key POSTHOG_PERSONAL_KEY | the PostHog personal API key the daily report reads | keychain posthog-read-key`;

describe('the ask line', () => {
  it('reads a place after the key, as a third part', () => {
    expect(needsIn(LINE)).toEqual([{ kind: 'key', name: 'POSTHOG_PERSONAL_KEY', what: 'the PostHog personal API key the daily report reads', from: { place: 'keychain', from: 'posthog-read-key' } }]);
    expect(needsIn(`${NEED} key POSTHOG_KEY | the PostHog key | file ~/app/.env POSTHOG_KEY`)[0].from).toEqual({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' });
  });

  it('leaves a line with no place as it was, and keeps a third part that is not a place in what it is', () => {
    expect(needsIn(`${NEED} key SENTRY_AUTH_TOKEN | a Sentry auth token, from sentry.io/settings`)).toEqual([{ kind: 'key', name: 'SENTRY_AUTH_TOKEN', what: 'a Sentry auth token, from sentry.io/settings' }]);
    expect(needsIn(`${NEED} key SENTRY_AUTH_TOKEN | a Sentry auth token | from sentry.io/settings`)).toEqual([{ kind: 'key', name: 'SENTRY_AUTH_TOKEN', what: 'a Sentry auth token | from sentry.io/settings' }]);
  });
});

describe('the approval card a waiting run raises', () => {
  it('says which key, where it is read from, and that every cloud thread gets it', () => {
    expect(approvalReads({ name: 'POSTHOG_PERSONAL_KEY', what: 'the PostHog personal API key the daily report reads', place: 'keychain', from: 'posthog-read-key' }, 'cloud_key')).toEqual({
      what: 'asks for a key from this computer',
      body: 'PostHog personal API key the daily report reads\nFrom your Keychain, as posthog-read-key\nKept for every cloud thread as POSTHOG_PERSONAL_KEY',
    });
    expect(approvalReads({ name: 'POSTHOG_KEY', what: '', place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' }, 'cloud_key').body).toBe('POSTHOG_KEY\nFrom POSTHOG_KEY in ~/app/.env\nKept for every cloud thread as POSTHOG_KEY');
  });

  it('shows nothing it could not read as a place', () => {
    expect(approvalReads({ name: 'X_KEY', place: 'browser', from: 'cookies' }, 'cloud_key').body).toBe(UNREADABLE);
    expect(approvalReads({ name: 'not a name', place: 'keychain', from: 'k' }, 'cloud_key').body).toBe(UNREADABLE);
  });

  it('leaves every other card as it was', () => {
    expect(approvalReads({ command: 'echo hello' }, 'Bash')).toEqual({ what: 'asks to run', body: 'echo hello' });
  });
});

describe('the thread\'s card', () => {
  const place = { itemId: 'w-1', saved: [], given: [], live: true, needs: needsIn(LINE), saveKeys: async () => null, sendFile: async () => null, sendCode: async () => null, onComputer: () => {}, openLink: () => {} };
  const draw = (line, over = {}) => renderToStaticMarkup(h(NeedPlace.Provider, { value: { ...place, needs: needsIn(line), ...over } }, h(NeedCard, { source: JSON.stringify(needsIn(line)[0]), fallback: null })));

  it('offers the key where it is in one press, with the paste box still under it', () => {
    const html = draw(LINE);
    expect(html).toContain('Use the one in your Keychain');
    expect(html).toContain('posthog-read-key');
    expect(html).toContain('Or paste it');
  });

  it('names a file or the shell by what it is', () => {
    expect(draw(`${NEED} key POSTHOG_KEY | the PostHog key | file ~/app/.env POSTHOG_KEY`)).toContain('Use the one in .env');
    expect(draw(`${NEED} key POSTHOG_KEY | the PostHog key | shell POSTHOG_KEY`)).toContain('Use the one in your shell');
  });

  it('offers no such press when the run did not say where the key is', () => {
    const html = draw(`${NEED} key SENTRY_AUTH_TOKEN | a Sentry auth token`);
    expect(html).not.toContain('Use the one');
    expect(html).toContain('Paste the key');
  });
});

describe('the press', () => {
  let tmp; let sup; let puts;
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-press-')));
    sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], cloudRuns: 'full' }, { listItems: () => [], listProducts: () => [], isDue: () => true }, tmp);
    sup._saveState = () => {};
    puts = new Map();
    sup._cloudClients = async () => ({ storage: { async put(k, body) { puts.set(k, String(body)); }, async del() {} } });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('reads the key where the run said it is, and saves it like a pasted one', async () => {
    fs.writeFileSync(path.join(tmp, '.env'), 'POSTHOG_KEY=phx_stand-in-value-0000\n');
    const out = await sup.cloudKey('save', 'POSTHOG_KEY', '', { label: 'PostHog key', from: { place: 'file', from: '~/.env', entry: 'POSTHOG_KEY' } });
    expect(out.keys.map((k) => k.name)).toEqual(['POSTHOG_KEY']);
    expect([...puts.values()]).toEqual([JSON.stringify({ name: 'POSTHOG_KEY', value: 'phx_stand-in-value-0000' })]);
  });

  it('says why and saves nothing when the key is not there, or the place is not one', async () => {
    await expect(sup.cloudKey('save', 'POSTHOG_KEY', '', { from: { place: 'file', from: '~/.env', entry: 'POSTHOG_KEY' } })).rejects.toThrow(/nothing at/);
    await expect(sup.cloudKey('save', 'POSTHOG_KEY', '', { from: { place: 'browser', from: 'x' } })).rejects.toThrow(/not a place/);
    expect(puts.size).toBe(0);
  });
});
