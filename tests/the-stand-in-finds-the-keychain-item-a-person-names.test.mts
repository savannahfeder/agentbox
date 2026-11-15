// THE STAND-IN FINDS THE KEYCHAIN ITEM A PERSON NAMES.
//
// What broke (w-c07d8993c4, 2026-11-09 power test): a tester asked a cloud
// thread to "use Resend delivery logs, the API key is in my Keychain as
// resend-api-key". The stand-in read only the first "Keychain" in its prompt,
// the thread's cut-off title ("...in my Keychain as…"), found no item, and
// asked for the key to be pasted. The tester replied "The key is already on
// this computer in Keychain as resend-api-key", and the stand-in took
// "computer" as the item, so the card's Keychain button looked for an item
// called computer. Read from the work items in the tester's copy of the app.
import { describe, it, expect } from 'vitest';
import { keyPlaceIn } from '../scripts/lib/stand-in-key-place.mjs';

describe('where the stand-in reads a key is kept', () => {
  it('skips a cut-off title and finds the item in the body', () => {
    const text = 'Title: use Resend delivery logs, the API key is in my Keychain as…\n\nuse Resend delivery logs, the API key is in my Keychain as resend-api-key. Cloud please.';
    expect(keyPlaceIn(text)).toEqual({ place: 'keychain', from: 'resend-api-key' });
  });

  it('does not take the computer as the item', () => {
    expect(keyPlaceIn('The key is already on this computer in Keychain as resend-api-key.')).toEqual({ place: 'keychain', from: 'resend-api-key' });
    expect(keyPlaceIn('It is on my Mac in the Keychain, called posthog-read-key')).toEqual({ place: 'keychain', from: 'posthog-read-key' });
  });

  it('takes the item named after the Keychain over a word before it', () => {
    expect(keyPlaceIn('Use PostHog from my Keychain as posthog-read-key')).toEqual({ place: 'keychain', from: 'posthog-read-key' });
    expect(keyPlaceIn('the key is already in my Keychain as posthog-read-key, please use it')).toEqual({ place: 'keychain', from: 'posthog-read-key' });
  });

  it('does not take the verb as the item', () => {
    expect(keyPlaceIn('My Keychain has resend-api-key.')).toEqual({ place: 'keychain', from: 'resend-api-key' });
    expect(keyPlaceIn('the Keychain is where posthog-read-key lives')).toBeNull();
  });

  it('still reads an item named before the Keychain', () => {
    expect(keyPlaceIn('posthog-read-key in my Keychain')).toEqual({ place: 'keychain', from: 'posthog-read-key' });
    expect(keyPlaceIn('Keychain item: resend-api-key.')).toEqual({ place: 'keychain', from: 'resend-api-key' });
  });

  it('finds no item when none is named', () => {
    expect(keyPlaceIn('the key is in my Keychain')).toBeNull();
    expect(keyPlaceIn('Use Resend please')).toBeNull();
  });

  it('still reads a key file and a shell variable', () => {
    expect(keyPlaceIn('it is in ~/.config/resend.key')).toEqual({ place: 'file', from: '~/.config/resend.key' });
    expect(keyPlaceIn('POSTHOG_KEY in ~/app/.env')).toEqual({ place: 'file', from: '~/app/.env', entry: 'POSTHOG_KEY' });
    expect(keyPlaceIn('$OPENROUTER_API_KEY in my shell')).toEqual({ place: 'shell', from: 'OPENROUTER_API_KEY' });
  });
});
