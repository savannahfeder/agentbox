// A SIGN-IN CARD CLOSES WITH ITS RUN, AND THE AGENT IS TOLD SO (w-abab5aca62).
//
// A run put an AWS sign-in card on its thread, called sign_in a few times,
// then ended its turn with an answer telling the person to open the card and
// paste the code. The app closes a run's open card as the run ends
// (main/supervisor.mts `_closeSignInItWaitedOn`), since the login behind it
// ends with the run, so when the person came back there was no card, and
// they had to reply "try again". Nothing the agent read said the card closes
// with its run: the tool's description and its waiting answer only said to
// call again.
//
// Now both say so, and what to do instead of pointing at a card that is going.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('an agent waiting on a sign-in card', () => {
  let product: { id: string; dir: string };
  let work: typeof import('../mcp/core/work.mts');
  beforeEach(async () => {
    const home = (await import('../main/store/home.mts')).appHome();
    process.env.STORE_ACCOUNT_ID = 'acct-sign-in-run-end';
    fs.mkdirSync(path.join(home, 'accounts', 'acct-sign-in-run-end'), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    const made = (await import('../mcp/core/products.mts')).createProduct(`Sign in run end ${Math.random().toString(36).slice(2, 8)}`);
    product = { id: made.id, dir: path.join(home, 'accounts', 'acct-sign-in-run-end', made.id) };
    work = await import('../mcp/core/work.mts');
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('is told the card closes when its run ends, and not to end its turn pointing at it', async () => {
    const { askToSignIn, waitForSignIn } = await import('../mcp/core/sign-in.mts');
    const t = work.createItem(product.id, { title: 'Read the logs', labels: ['founder'] }, { source: 'system' });
    const ask = askToSignIn(t.id, { service: 'AWS', url: 'https://us-east-1.signin.aws.amazon.com/v1/authorize', asksForCode: true }, { product: product.id });
    const out = await waitForSignIn(t.id, ask.id, { product: product.id, waitMs: 50, pollMs: 10 });
    expect(out.status).toBe('waiting');
    expect(out.message).toMatch(/card closes when your run ends/);
    expect(out.message).toMatch(/never end your turn pointing them at the card/);
    expect(out.message).toMatch(/reply when they can sign in/);
  });
});

describe('what the agent reads before it asks', () => {
  it('says the card closes when the run ends', () => {
    expect(read('mcp/tools.mts')).toMatch(/The card closes when your run ends/);
  });

  it('is still true: the app closes a card its run left open as the run ends', () => {
    expect(read('main/supervisor.mts')).toMatch(/this\._closeSignInItWaitedOn\(item\);/);
  });
});
