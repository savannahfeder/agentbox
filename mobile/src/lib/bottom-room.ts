// The room the phone's own bar takes at the foot of the screen.
//
// Android draws every app edge to edge, under its navigation bar, and is meant
// to report that bar's height as the bottom inset. On a device that reports
// none, every button, sheet row and reply box at the foot sat under the bar.

/** Android's three-button navigation bar, in points. */
export const ANDROID_NAV_BAR = 48;

export function bottomRoom(os: string, reported: number): number {
  return os === 'android' && reported < 1 ? ANDROID_NAV_BAR : reported;
}
