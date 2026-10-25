// PICTURES THE WINDOW CANNOT DRAW, and what each is turned into so it can.
// Chromium decodes no TIFF and no HEIC, so one pasted or dropped into a reply
// box is turned into a PNG or a JPEG as it comes in (main/stage-attachment.mjs).
// Both sides read this: the window to know a dropped file is worth staging,
// the main process to turn it.
const TURNED = [[/\.tiff?$/i, '.png'], [/\.hei[cf]$/i, '.jpg']];

/** The name the picture goes on under once turned, or null when it is not one of these. */
export function turnedName(name) {
  const s = String(name ?? '');
  const hit = TURNED.find(([re]) => re.test(s));
  return hit ? s.replace(/\.[^.]+$/, hit[1]) : null;
}
