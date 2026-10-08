// HOW BIG THE TERMINAL MAY BE DRAGGED (renderer/src/components/TaskTerminal.tsx).
//
// Small enough still shows a few lines; large enough still leaves the page it
// sits in a strip to read (the thread's title and a line or two above it, or a
// column of the conversation beside it). The size is one for the whole app,
// remembered under SIZE_KEY, the way an editor remembers its panel.
export const SIZE_KEY = 'zero.terminal.size';
export const TERMINAL_MIN = { height: 120, width: 280 };
const LEAVE = { height: 120, width: 320 };
const LARGEST = 4000;

/** `start` px, the edge moved `delta` px toward growing, in a pane `room` px across. */
export function dragSize(dimension, start, delta, room) {
  const min = TERMINAL_MIN[dimension];
  const max = Math.max(min, room - LEAVE[dimension]);
  return Math.round(Math.min(max, Math.max(min, start + delta)));
}

export function readSavedSize(raw) {
  let saved;
  try { saved = JSON.parse(raw ?? ''); } catch { return {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  const out = {};
  for (const dimension of ['height', 'width']) {
    const v = saved[dimension];
    if (Number.isFinite(v) && v >= TERMINAL_MIN[dimension] && v <= LARGEST) out[dimension] = v;
  }
  return out;
}
