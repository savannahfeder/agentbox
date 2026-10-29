// A throwaway copy's window says so, and stands where you can see both.
//
// "Open Agentbox as a new user" (main/fresh-user.mjs) launches the app again
// inside a throwaway home, beside the one it was opened from. The offset is a
// window's shoulder rather than a tile: the point is to see there are two, with
// the real one still readable behind. A copy that cannot fit the offset is left
// centred rather than pushed half off the screen, which a 1440-wide laptop is.

/** How far down and across a second copy stands. */
export const OFFSET = 48;

/** The window options a copy adds, given whether it is a throwaway one. */
export function newUserWindow({ fresh, name, screen, width = 1440, height = 900 } = {}) {
  if (!fresh) return { title: name };
  const title = `${name} (new user)`;
  if (!screen) return { title };
  const centred = {
    x: Math.round(screen.x + (screen.width - width) / 2),
    y: Math.round(screen.y + (screen.height - height) / 2),
  };
  const x = centred.x + OFFSET;
  const y = centred.y + OFFSET;
  if (x + width > screen.x + screen.width || y + height > screen.y + screen.height) return { title };
  return { title, x, y };
}
