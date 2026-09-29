// A LEAKED TOOL CALL IS NOT PART OF WHAT THE AGENT SAID.
//
// On w-b108b1d596 a worker's result reached the pane ending "7,369 tests both
// times.</result>\n</invoke>", with a whole `note` parameter after that in one
// of the three writes. The tags were on screen for the user to read.
//
// It is cut at the boundary an agent writes through, so it never enters the
// store, and cut again when the pane draws (tests/one-answer-is-not-written-
// twice.test.mjs) because the rows that already carry it are still on screen.
//
// HER OWN WORDS ARE NOT TOUCHED, whatever is in them. She can paste a tool call
// into a row to ask about it, and that is the row where cutting it would be the
// bug.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { unleaked } from '../shared/agents.mjs';
import { appHome } from '../main/store/home.mjs';

describe('the cut itself', () => {
  it('takes the machinery off the end of a real result', () => {
    const said = '**It is on main. Quit and reopen Astral, then right click a link and pick Copy.**\n\nThe full suite ran green twice, 7,369 tests both times.';
    const leaked = `${said}</result>\n<parameter name="note">Merged to main and pushed. She needs to quit and reopen Astral to get it.`;
    expect(unleaked(leaked)).toBe(said);
  });

  it('leaves prose that has no leak in it exactly as written', () => {
    const said = 'Merged and pushed. The result is 3 < 4 and the file is <untitled>.';
    expect(unleaked(said)).toBe(said);
  });

  it('keeps a message that is nothing but the leak from becoming something else', () => {
    expect(unleaked('</result>\n</invoke>')).toBe('');
  });

  // THE ROW THAT ASKED FOR THIS IS THE CASE. The answer explaining the bug to
  // her quotes the tags in backticks, mid-paragraph, and everything after that
  // quote is the part she has to read.
  it('keeps a tag that was quoted on purpose, and the answer under it', () => {
    const said = 'The answer came out with tool-call tags stuck to it, the `</result> </invoke>` you can see in your screenshot, so it wrote the answer three times.\n\nIt says it once now.';
    expect(unleaked(said)).toBe(said);
  });

  it('keeps a fenced example whole', () => {
    const said = 'What leaked:\n\n```\n</result>\n<parameter name="note">a note\n```\n\nAnd it is cut now.';
    expect(unleaked(said)).toBe(said);
  });

  // Quoted once and leaked as well: the leak is still cut, at the leak.
  it('still cuts a real leak on a message that also quotes one', () => {
    const said = 'It ended with `</result>` stuck to it. Fixed now.';
    expect(unleaked(`${said}</result>\n</invoke>`)).toBe(said);
  });

  it('is not confused by a string it was not given', () => {
    expect(unleaked(undefined)).toBe(undefined);
    expect(unleaked(7)).toBe(7);
  });
});

describe('the write an agent makes', () => {
  let product; let work; let store;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct('Copytest');
    work = await import('../mcp/core/work.mjs');
    store = await import('../main/store/work-items.mjs');
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const leaked = '**It is on main.**\n\nThe suite ran green.</result>\n<parameter name="note">Merged and pushed.';

  it('never stores the machinery, on the way in', () => {
    const item = work.createItem(product.id, { title: 'Clicking copy doesnt copy it', body: leaked });
    expect(item.body).toBe('**It is on main.**\n\nThe suite ran green.');
    work.updateItem(item.id, { status: 'done', result: leaked }, { product: product.id });
    const read = store.readWorkItem(path.join(appHome(), 'accounts', 'acct', product.id), item.id)
      ?? work.listWorkItems({ product: product.id, includeDone: true }).find((i) => i.id === item.id);
    expect(read.result).toBe('**It is on main.**\n\nThe suite ran green.');
    expect(read.result).not.toMatch(/<\/result>|<parameter name=/);
  });

  // Hers are hers. She can paste a tool call onto a row to ask about it, and
  // that is the row where cutting it would be the bug.
  it('leaves her own words alone', () => {
    const item = work.createItem(product.id, { title: 'What is this', body: leaked }, { source: 'founder' });
    expect(item.body).toBe(leaked);
  });
});
