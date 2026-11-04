// A CONNECTION SHEET SUMS UP WHAT AGENTS MAY DO, AND ASKS FOR ONE THING.
//
// What was wrong (2026-11-02, the pictures of the Notion, Slack and GitHub
// sheets): each sheet listed twelve to fifteen raw tool names in two columns
// ("Search public", "Read user profile"...), Slack's opened on a three-line
// paragraph about registered apps, and every sheet ended on "Agents reach this
// through your app, so it needs your app open." Measured here: a short
// hand-written summary for every tool with a written list, the full list
// behind a disclosure, one short line for a tool that needs a client, a copy
// button on the address, and the footer gone.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ACCESS, catalogFor } from '../shared/connections-catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tools = catalogFor();
const entry = (id) => tools.find((t) => t.id === id);
const sentences = (s) => s.split(/(?<=\.)\s+/).filter(Boolean).length;

describe('the summary of its tools', () => {
  it('every tool with a written list says what agents read and what needs your yes, each in a short phrase', () => {
    for (const t of tools.filter((x) => x.reads)) {
      expect(t.said?.reads, t.id).toBeTruthy();
      expect(t.said.reads.length, t.id).toBeLessThanOrEqual(60);
      if (t.writes.length) {
        expect(t.said.writes, t.id).toBeTruthy();
        expect(t.said.writes.length, t.id).toBeLessThanOrEqual(60);
      }
    }
  });

  it('a tool where you choose its tools after connecting has no summary to make up', () => {
    for (const t of tools.filter((x) => !x.reads)) expect(t.said ?? null, t.id).toBeNull();
  });

  it('reaches the sheet with the tile', () => {
    expect(read('main/connections/index.mjs')).toMatch(/said: entry\.said \?\? null/);
    expect(read('main/connections/index.mjs')).toMatch(/hint: entry\.hint \?\? null/);
  });

  it('the sheet shows the summary, and the full list only behind a disclosure', () => {
    const src = read('renderer/src/connections/ConnectionsPlace.tsx');
    expect(src).toMatch(/tile\.said/);
    expect(src).toMatch(/<details className="cn-all"/);
    expect(src.indexOf('<details className="cn-all"')).toBeLessThan(src.indexOf('className="cn-tools"'));
  });
});

describe('the one line a sheet may add', () => {
  it('a tool that needs a client ID and secret says only who gives you them, in one short sentence', () => {
    for (const t of tools.filter((x) => x.access === ACCESS.OWN_CLIENT)) {
      expect(t.hint, t.id).toBeTruthy();
      expect(sentences(t.hint), t.id).toBe(1);
      expect(t.hint.length, t.id).toBeLessThanOrEqual(70);
    }
    expect(entry('slack').hint).toMatch(/workspace admin/);
  });

  it('every other hint is one short sentence too, and the long story stays out of the sheet', () => {
    for (const t of tools.filter((x) => x.hint)) expect(t.hint.length, t.id).toBeLessThanOrEqual(80);
    const src = read('renderer/src/connections/ConnectionsPlace.tsx');
    expect(src).not.toMatch(/tile\.needs/);
    expect(src).toMatch(/tile\.hint/);
  });

  it('the address to give the tool has a copy button', () => {
    const src = read('renderer/src/connections/ConnectionsPlace.tsx');
    expect(src).toMatch(/className="cn-address"[\s\S]{0,200}<CopyButton text=\{tile\.redirect\}/);
    expect(src).toMatch(/function CopyButton[\s\S]{0,200}aria-label="Copy the address"/);
  });

  it('the footer about keeping the app open is gone', () => {
    expect(read('renderer/src/connections/ConnectionsPlace.tsx')).not.toMatch(/needs your app open/);
  });
});
