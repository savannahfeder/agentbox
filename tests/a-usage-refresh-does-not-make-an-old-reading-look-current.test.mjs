// On 2026-10-17 Settings labelled all local readings "Checked just now" using
// the newest account's timestamp, while ignoring refresh errors on the others.
// The header keeps the newest time; a tile says its own only when it differs
// enough to matter (15 minutes) or its last refresh failed, so five tiles do
// not repeat "Checked just now" five times.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import * as settings from '../renderer/src/components/Settings';
const { PlaceTiles, cloudPlaceAccounts } = settings;

const now = 10_000_000;
const minute = 60_000;
const account = (extra = {}) => ({ key: 'one', name: 'one@example.test', about: [], ...extra });
const draw = accounts => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts, now }));

it('an old reading says how old on its own tile, and a fresh one adds nothing', () => {
  const html = draw([account({ checkedAt: now }), account({ key: 'two', checkedAt: now - 60 * minute })]);
  expect(html).not.toContain('Checked just now');
  expect(html).toContain('Checked 1 hour ago');
  expect(cloudPlaceAccounts({ accounts: [{ engine: 'claude', key: 'c', limits: [{ span: 'session', percent: 8 }], readAt: now - minute }] }, 'claude', now)[0].checkedAt).toBe(now - minute);
});

it('the line starts at 15 minutes, not a minute before', () => {
  expect(draw([account({ checkedAt: now - 14 * minute - 59_999 })])).not.toContain('Checked');
  expect(draw([account({ checkedAt: now - 15 * minute })])).toContain('Checked 15 minutes ago');
});

it('a failed refresh keeps the meters and says when they were read, however recent', () => {
  const html = draw([account({ checkedAt: now - minute, usageError: 'Usage unavailable', limits: [{ span: 'session', percent: 8 }] })]);
  expect(html).toContain('Usage unavailable');
  expect(html).toContain('Checked 1 minute ago');
  expect(html).toContain('8%');
});

it('the header still says when this computer was last checked', () => {
  const source = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
  expect(source).toContain('{!busy && checked && <span className="acct-checked">{checked}</span>}');
});

it('a failure with no old reading shows why, without inventing zero or a checked time', () => {
  const html = draw([account({ usageError: 'Usage unavailable' })]);
  expect(html).toContain('Usage unavailable');
  expect(html).not.toContain('0%');
  expect(html).not.toContain('Checked');
  expect(html).not.toContain('No usage reading yet');
});

it('uses the newest reading of the same account and refuses a sibling account’s newer reading', () => {
  const old = { profile: 'one', at: now - 60_000, limits: [{ span: 'session', percent: 39 }] };
  const fresh = { engine: 'claude', profile: 'one', at: now, limits: [{ span: 'session', percent: 8 }] };
  expect(settings.accountReadingFor('one', [old], fresh)).toEqual(fresh);
  expect(settings.accountReadingFor('one', [{ ...old, at: now + 1 }], fresh).at).toBe(now + 1);
  expect(settings.accountReadingFor('one', [old], { ...fresh, profile: 'two' }).at).toBe(old.at);
  expect(settings.accountReadingFor('one', [], { ...fresh, profile: 'two' })).toBeNull();
});
