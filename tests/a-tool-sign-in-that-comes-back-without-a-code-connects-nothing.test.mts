// A TOOL SIGN-IN THAT CAME BACK WITH NO CODE SAID "CONNECTED".
//
// The loopback page took any return with the right state and no `error` as a
// success: it showed "Connected" and handed back a null code, which the token
// exchange then sent as an empty code. Measured by knocking on the loopback
// page as the browser would, with and without a code.
import { describe, it, expect } from 'vitest';
import { loopbackPage } from '../main/connections/oauth.mts';

async function knock(query: string) {
  const page = loopbackPage({ state: 'st', ms: 5_000, name: 'Linear' });
  const address = await page.listen();
  const res = await fetch(`${address}?${query}`, { signal: AbortSignal.timeout(5_000) });
  const body = await res.text();
  const got = await page.code.then((code) => ({ code }), (err: Error) => ({ err: err.message }));
  page.close();
  return { status: res.status, body, got };
}

describe('the page a tool sign-in comes back to', () => {
  it('connects nothing when the browser brings back no code and no error', async () => {
    const { status, body, got } = await knock('state=st');
    expect(status).toBe(400);
    expect(body).not.toContain('Connected');
    expect(got).toEqual({ err: expect.stringContaining('without a code') });
  });

  it('connects nothing when the code is there but empty', async () => {
    const { got } = await knock('state=st&code=');
    expect('err' in got).toBe(true);
  });

  it('still takes a real code', async () => {
    const { status, body, got } = await knock('state=st&code=abc');
    expect(status).toBe(200);
    expect(body).toContain('Connected');
    expect(got).toEqual({ code: 'abc' });
  });

  it('still says no when the person said no', async () => {
    const { got } = await knock('state=st&error=access_denied');
    expect(got).toEqual({ err: expect.stringContaining('You said no') });
  });
});
