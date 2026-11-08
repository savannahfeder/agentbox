// What a client window may do with an address. It shows its hub and nothing else;
// anything else a page asks to open goes to the person's browser, if it is the
// kind of thing a browser should be handed.

export function sameHub(address: string, hubUrl: string): boolean {
  try { return new URL(address).origin === new URL(hubUrl).origin; } catch { return false; }
}

export function mayOpenOutside(address: string): boolean {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(address).protocol); } catch { return false; }
}
