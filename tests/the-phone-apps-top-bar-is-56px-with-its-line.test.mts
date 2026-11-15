// The phone app's top bar was 57px: 56px of bar with its line drawn under it.
// The phone website's bar (`--phone-top`, 56px) holds its line inside the 56,
// so every screen's words in the app sat 1px lower than the website's.
// Measured from the bars' bottoms on the preview build and the website, both
// at 402px wide. The View panel opened under the bar moves up with it.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const filters = fs.readFileSync('mobile/src/ui/Filters.tsx', 'utf8');
const bar = parts.slice(parts.indexOf('export function TopBar('), parts.indexOf('\n}\n', parts.indexOf('export function TopBar(')));

describe("the phone app's top bar is 56px with its line", () => {
  it('draws the line under 55px of bar', () => {
    expect(bar).toMatch(/borderBottomWidth: 1/);
    expect(bar).toMatch(/height: size\.topBar - 1,/);
  });
  it('opens the View panel straight under it', () => {
    expect(filters).toMatch(/top: inset\.top \+ size\.topBar, left: 0/);
    expect(filters).not.toMatch(/size\.topBar \+ 1/);
  });
});
