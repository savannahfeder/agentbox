// A persistent phone notice had no dismissal. Keep dismissal across reloads
// while leaving a different connection problem visible.
import { it, expect } from 'vitest';
import { dismissPhoneStatus, phoneStatusDismissed } from '../renderer/src/phone-status-dismissal';

it('remembers a dismissed notice but leaves a different notice visible', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  expect(phoneStatusDismissed('Offline', storage)).toBe(false);
  dismissPhoneStatus('Offline', storage);
  expect(phoneStatusDismissed('Offline', storage)).toBe(true);
  expect(phoneStatusDismissed('Cannot connect', storage)).toBe(false);
  expect(phoneStatusDismissed('Offline', { getItem: k => values.get(k) })).toBe(true);
  dismissPhoneStatus('Cannot connect', storage);
  expect(phoneStatusDismissed('Offline', storage)).toBe(true);
  expect(phoneStatusDismissed('Cannot connect', storage)).toBe(true);
});

it('still allows dismissal when browser storage is unavailable', () => {
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  expect(phoneStatusDismissed('Offline', storage)).toBe(false);
  expect(() => dismissPhoneStatus('Offline', storage)).not.toThrow();
});
