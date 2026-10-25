// A POWER TESTER READS THE END OF A LONG THREAD (w-4465054f04, 2026-10-22).
//
// In the cloud power test two testers logged their own reply as lost: "Reply
// ... appears in no thread" (broken) and "Fifth reply in a long thread never
// appears". The ledgers had both replies on the right thread, handed to a
// worker within a second and answered within 40 s. `look` kept only the first
// 2,500 characters of the page, and a thread reads top-down, so the newest
// messages, at its foot, were never in what the testers read. A long screen
// now keeps its start and its end, and says how much of the middle it left out.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const browse = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/browse.mjs', import.meta.url), 'utf8');
const source = browse.slice(browse.indexOf('const LOOK = `') + 'const LOOK = `'.length, browse.indexOf('})()`;') + '})()'.length);
// The template literal as browse.mjs builds it, then run against a page holding only text.
const LOOK = eval('`' + source + '`');
const look = (innerText) => new Function('document', 'getComputedStyle', 'innerHeight', `return ${LOOK}`)(
  { querySelectorAll: () => [], body: { innerText }, activeElement: null },
  () => ({}),
  900,
);
const screen = (out) => out.slice('SCREEN TEXT:\n'.length, out.indexOf('\n\nTHINGS TO PRESS'));

it('reads a short screen whole', () => {
  expect(screen(look('Threads\nNeeds you\nMy reply'))).toBe('Threads\nNeeds you\nMy reply');
});

it('keeps the newest message at the foot of a long thread', () => {
  const thread = `Booking thread\n${'An older answer from the agent. '.repeat(400)}\nok merge it, then also add a test for 3 overlapping at once\nMerged, and the three-overlap tests pass.`;
  const text = screen(look(thread));
  expect(text.startsWith('Booking thread')).toBe(true);
  expect(text).toContain('ok merge it, then also add a test for 3 overlapping at once');
  expect(text.endsWith('Merged, and the three-overlap tests pass.')).toBe(true);
  expect(text).toMatch(/\[\d+ characters in the middle left out\]/);
  expect(text.length).toBeLessThan(6200);
});

it('cuts nothing from a screen exactly at the limit, and marks one just over it', () => {
  const max = Number(/const max = (\d+);/.exec(LOOK)?.[1]);
  expect(max).toBeGreaterThanOrEqual(6000);
  expect(screen(look('a'.repeat(max)))).toBe('a'.repeat(max));
  expect(screen(look('a'.repeat(max + 1)))).toMatch(/\[1 characters in the middle left out\]/);
});
