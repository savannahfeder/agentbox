// Which look the phone app wears: the desktop's three (renderer/src/skins.ts
// LOOKS), picked on the phone and kept on the phone. It is not one of the
// computer's settings, because each screen chooses its own, as on the desktop.
//
// The rules follow the desktop's (renderer/src/theme.ts): nothing picked, or a
// value this build does not know, is Dark; only Match system reads the phone.
export type PhoneLook = 'light' | 'dark' | 'match';
export type Worn = 'light' | 'dark';

export const LOOK_KEY = 'agentbox-look';

export const PHONE_LOOKS: { id: PhoneLook; name: string }[] = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'match', name: 'Match system' },
];

/** What was picked, from whatever the store holds. */
export function lookOf(stored: string | null | undefined): PhoneLook {
  return stored === 'light' || stored === 'match' ? stored : 'dark';
}

/** What is worn: the pick, or the phone's own setting under Match system. */
export function wornOf(look: PhoneLook, phone: string | null | undefined): Worn {
  if (look === 'match') return phone === 'light' ? 'light' : 'dark';
  return look;
}
