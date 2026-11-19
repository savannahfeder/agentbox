// GIVING A THREAD TO SOMEONE ELSE NAMES THEM "INSTEAD".
//
// Test days 2026-11-16 and 2026-11-18: after "Give it to someone else" on a
// thread an agent already had, the line read "Give it to Quality lead." and a
// tester took it for an instruction, not a choice. Of five redesigns the
// founder kept today's line: "this is actually still the best, just add
// 'instead' after naming the alternatives" (2026-11-18). The line Auto draws
// when it could not tell who should have it names nobody it replaces, so it
// stays as it was.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const line = fs.readFileSync(new URL('../renderer/src/components/RouteLine.tsx', import.meta.url), 'utf8');

it('the choice of someone else ends "instead."', () => {
  expect(line).toContain('<span>Give it to <Choices to={others} mates={mates} names={names} onPick={pick} /> instead.</span>');
});

it("Auto's own question is unchanged", () => {
  expect(line).toContain('<span>{routed.why} Give it to <Choices to={routed.ask} mates={mates} onPick={pick} />.</span>');
});
