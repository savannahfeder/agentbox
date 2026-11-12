// A list an agent answers with is drawn as a table, whether it wrote a csv or
// a markdown table. After tables shipped, the person asked a thread for "a
// table of the top 10 AI companies by revenue" and got a plain markdown table:
// the brief's one line about csv files sat in a list of what the app can show,
// beside "the answer is in this message, not in a file beside it" and
// "tables draw", and the agent followed those. So the brief now says it plainly
// and on its own, and a markdown table in a message is drawn the same way.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableFromGrid, sortRows } from '../renderer/src/table-file.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = fs.readFileSync(path.join(root, 'briefs/message-rules.md'), 'utf8').replace(/\s+/g, ' ');
const shipped = JSON.parse(fs.readFileSync(path.join(root, 'shared/instruction-defaults.json'), 'utf8')).messages;

describe('the brief tells an agent to answer a list with a table', () => {
  it('says so as a rule of its own, asked for or not', () => {
    expect(rules).toMatch(/A LIST IS A TABLE/);
    expect(rules).toMatch(/whether or not they asked for a table/);
    expect(rules).toMatch(/\.csv with a header row/);
  });
  it('says the table is part of the answer, not a file beside it', () => {
    expect(rules).toMatch(/drawn as a table in the message/);
  });
  it('keeps the shipped copy the same as the brief', () => {
    expect(shipped).toBe(fs.readFileSync(path.join(root, 'briefs/message-rules.md'), 'utf8'));
  });
});

describe('a markdown table in a message', () => {
  const grid = [
    ['#', 'Company', 'What they sell', 'Revenue per year', 'Stage'],
    ['1', 'Anthropic', 'Claude models and API', '~$68B', 'Private'],
    ['2', 'OpenAI', 'ChatGPT and API', '~$50B', 'Private'],
    ['3', 'CoreWeave', 'AI cloud computing', '~$12.4-13.2B', 'Public'],
    ['4', 'Databricks', 'Data and AI platform', '$7B+', 'Private'],
  ];
  const t = tableFromGrid(grid);
  it('reads the same as a csv with those rows', () => {
    expect(t.columns.map((c) => c.name)).toEqual(['#', 'Company', 'What they sell', 'Revenue per year', 'Stage']);
    expect(t.rows).toHaveLength(4);
  });
  it('takes a rank column first as a number, and the column after it as the name', () => {
    expect(t.columns[0].kind).toBe('number');
    expect(t.columns[1].kind).toBe('name');
  });
  it('still makes the first column the name when it is not a rank', () => {
    expect(tableFromGrid([['Company', 'Stage'], ['A', 'Seed'], ['B', 'Seed']]).columns[0].kind).toBe('name');
    expect(tableFromGrid([['Year', 'Revenue'], ['2024', '$1M'], ['2025', '$2M']]).columns[0].kind).toBe('name');
  });
  it('knows it is ranked, so the rank stands in for the row number', () => {
    expect(t.ranked).toBe(true);
    expect(tableFromGrid([['Company', 'Stage'], ['A', 'Seed'], ['B', 'Seed']]).ranked).toBe(false);
  });
  it('keeps a city under "Base" as text', () => {
    const v = tableFromGrid([['Firm', 'Base'], ['A', 'San Francisco'], ['B', 'San Francisco'], ['C', 'New York'], ['D', 'New York']]);
    expect(v.columns[1].kind).toBe('text');
  });
  it('lines up money written with a ~ or a +', () => {
    expect(t.columns[3].kind).toBe('number');
  });
  it('reads trillions, and sorts them above billions', () => {
    const v = tableFromGrid([['Company', 'Volume'], ['Stripe', '~$1.4T'], ['Plaid', '$10B+'], ['Adyen', '~$1.2T'], ['Wise', '~$150B']]);
    expect(v.columns[1].kind).toBe('number');
    expect(sortRows(v, v.rows, { col: 1, dir: 'desc' }).map((r) => r[0])).toEqual(['Stripe', 'Adyen', 'Wise', 'Plaid']);
  });
});
