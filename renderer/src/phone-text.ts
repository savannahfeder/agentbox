// THE IPHONE'S TEXT SIZE, WHICH THE PHONE APP ALREADY FOLLOWS (2026-10-28).
// React Native scales every Text by the setting in Display & Brightness, so on
// a phone set one step up the phone app drew its inbox 1.118 times the size it
// asks for, and the web app, which ignores the setting, read small beside it
// ("Everything there has just a bit bigger font"). Safari reports the setting
// as the size of `-apple-system-body`: 17px at the default. phone.css scales
// the inbox's words by --phone-type and leaves their room as it is.

/** The body size at the default text size. */
const DEFAULT_BODY = 17;

/** How much bigger than asked to draw the words, from the body size Safari reports. */
export function textScale(bodyPx: number | undefined): number {
  if (!bodyPx || !Number.isFinite(bodyPx) || bodyPx <= 0) return 1;
  // The accessibility sizes go to 53px; past 1.35 a title no longer fits two lines.
  const scale = Math.min(1.35, Math.max(0.8, bodyPx / DEFAULT_BODY));
  return Math.round(scale * 1000) / 1000;
}

/** Sets --phone-type now and again whenever the app comes back, as the setting may have changed meanwhile. */
export function followTextSize() {
  const root = document.documentElement;
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden; pointer-events: none;';
  document.body.appendChild(probe);
  const read = () => {
    // Anywhere but Safari the declaration is dropped and the probe has the page's size, 16px or so: no scaling.
    const apple = probe.style.font.includes('apple-system-body');
    const size = apple ? parseFloat(getComputedStyle(probe).fontSize) : undefined;
    root.style.setProperty('--phone-type', String(textScale(size)));
  };
  read();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') read(); });
}
