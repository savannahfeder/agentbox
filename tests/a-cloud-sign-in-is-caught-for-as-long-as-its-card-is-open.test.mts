// A CLOUD SIGN-IN IS CAUGHT FOR AS LONG AS ITS CARD IS OPEN.
//
// What broke, 2026-11-09: a cloud thread put an `aws login` card in front of
// the person. Its link sends the browser back to
// http://127.0.0.1:8765/oauth/callback, which this computer is meant to catch
// and hand to the cloud agent (main/sign-in-returns.mts). The browser got
// ERR_CONNECTION_REFUSED. The link itself was read right: comesBackTo gives
// port 8765 and /oauth/callback for the real `aws login` link. What the card
// did not promise was the listener's own rules. It stopped 20 minutes after the
// card appeared while the card stayed up until the run ended; a stop for any
// reason (the run missing for one pass, the port busy for a moment) was
// final for that card; and the app's pass skipped it altogether while paused,
// braked or holding for setup.
//
// Measured by driving the real listener on a fixed 127.0.0.1 port with an
// AWS-shaped link, and the supervisor's own pass in each early return.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { comesBackTo } from '../shared/sign-in-ask.mts';
import { SignInReturns, type OpenReturn } from '../main/sign-in-returns.mts';
import { Supervisor } from '../main/supervisor.mts';

// The real `aws login` callback, only ever read out of a link here; nothing listens on it.
const AWS_CALLBACK = 8765;
const awsLink = (port: number) => 'https://us-east-1.signin.aws.amazon.com/v1/authorize?response_type=code'
  + '&client_id=arn%3Aaws%3Asignin%3A%3A%3Adevtools%2Fsame-device&state=st1&code_challenge_method=SHA-256&scope=openid'
  + `&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}/oauth/callback`)}&code_challenge=cc1`;

const freePort = () => new Promise<number>((r) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => r(port)); });
});
// What the browser gets at 127.0.0.1: 0 is ERR_CONNECTION_REFUSED.
const browse = (port: number, p: string) => new Promise<{ status: number; body?: string }>((resolve) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
  }).on('error', () => resolve({ status: 0 }));
});
// Real sockets with the clock faked: a listen settles in a few turns of the loop.
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };

let returns: SignInReturns | undefined;
let caught: string[];
const card = (port: number, ask = 's-aws00001'): OpenReturn => ({ product: 'p', id: 'w-load', ask, url: awsLink(port) });

beforeEach(() => {
  caught = [];
  returns = new SignInReturns({ answer: (_r, landed) => caught.push(landed), log: {} });
});
afterEach(() => { returns?.stopAll(); vi.useRealTimers(); });

describe('an aws login link on a fixed 127.0.0.1 port', () => {
  it('is read as coming back to this computer', () => {
    expect(comesBackTo(awsLink(AWS_CALLBACK))).toEqual({ port: AWS_CALLBACK, path: '/oauth/callback' });
  });

  it('is caught when the person signs in straight away', async () => {
    const port = await freePort();
    returns!.sync([card(port)]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=c1&state=st1')).status).toBe(200);
    expect(caught).toEqual([`http://localhost:${port}/oauth/callback?code=c1&state=st1`]);
  });

  it('is still caught when they get to the card 21 minutes later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const port = await freePort();
    returns!.sync([card(port)]);
    await settle();
    vi.advanceTimersByTime(21 * 60_000);
    returns!.sync([card(port)]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=late')).status).toBe(200);
    expect(caught).toEqual([`http://localhost:${port}/oauth/callback?code=late`]);
  });

  it('is caught after the run was missing from one pass', async () => {
    const port = await freePort();
    returns!.sync([card(port)]);
    await settle();
    returns!.sync([]);
    await settle();
    returns!.sync([card(port)]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=back')).status).toBe(200);
    expect(caught).toEqual([`http://localhost:${port}/oauth/callback?code=back`]);
  });

  it('is caught once the port somebody else held is free again', async () => {
    const port = await freePort();
    const theirs = http.createServer((_q, s) => s.end('theirs')).listen(port, '127.0.0.1');
    await settle();
    returns!.sync([card(port)]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=x')).body).toBe('theirs');
    await new Promise((r) => theirs.close(r));
    returns!.sync([card(port)]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=freed')).status).toBe(200);
    expect(caught).toEqual([`http://localhost:${port}/oauth/callback?code=freed`]);
  });

  it('is caught for a fresh card on the same port that replaces the last one', async () => {
    const port = await freePort();
    returns!.sync([card(port, 's-aws00001')]);
    await settle();
    returns!.sync([card(port, 's-aws00002')]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=fresh')).status).toBe(200);
    expect(caught).toEqual([`http://localhost:${port}/oauth/callback?code=fresh`]);
  });
});

describe('what must not be caught', () => {
  it('a return once the card is gone', async () => {
    const port = await freePort();
    returns!.sync([card(port)]);
    await settle();
    returns!.sync([]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=c')).status).toBe(0);
  });

  it('the same card a second time, after it was caught', async () => {
    const port = await freePort();
    returns!.sync([card(port)]);
    await settle();
    await browse(port, '/oauth/callback?code=one');
    await settle();
    returns!.sync([card(port)]);
    await settle();
    expect((await browse(port, '/oauth/callback?code=two')).status).toBe(0);
    expect(caught).toHaveLength(1);
  });

  it('a link that sends the browser somewhere other than this computer', () => {
    returns!.sync([{ ...card(1), url: awsLink(1).replace('127.0.0.1', 'example.com') }]);
    expect(returns!.open.size).toBe(0);
  });
});

describe("the app's pass listens whatever else holds it", () => {
  let sup: Supervisor;
  let synced: OpenReturn[][];
  const ask = { id: 's-aws00001', service: 'AWS', url: awsLink(AWS_CALLBACK), at: 1 };
  const rows: Record<string, Record<string, unknown>> = {
    'w-cloud': { id: 'w-cloud', product: 'p', status: 'open', signIn: ask },
    'w-mac': { id: 'w-mac', product: 'p', status: 'open', signIn: { ...ask, id: 's-mac00001' } },
  };

  beforeEach(() => {
    synced = [];
    sup = new Supervisor(
      { home: '/nonexistent-home', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 2, authProfiles: ['default'] },
      { listItems: () => Object.values(rows), listProducts: () => [], readItem: (_p: string, id: string) => rows[id] ?? null },
      '/nonexistent-app',
    );
    sup.signInReturns = { sync: (asks: OpenReturn[]) => synced.push(asks), stopAll: () => {} } as unknown as SignInReturns;
    sup.sessions.set('w-cloud', { cloud: true, product: 'p', itemId: 'w-cloud' } as never);
    sup.sessions.set('w-mac', { cloud: false, product: 'p', itemId: 'w-mac' } as never);
  });

  const listened = () => synced.at(-1)?.map((a) => a.ask);

  it('while paused', async () => {
    sup.paused = true;
    await sup._tick();
    expect(listened()).toEqual(['s-aws00001']);
  });

  it('while holding for the first run', async () => {
    sup._firstRunUntil = Date.now() + 60_000;
    await sup._tick();
    expect(listened()).toEqual(['s-aws00001']);
  });

  it('while braked', async () => {
    sup._spawnBraked = () => true;
    sup._anotherEngineCanRun = () => false;
    sup.sayItOnEveryStrandedRow = () => {};
    sup._noteWaitingRows = () => {};
    await sup._tick();
    expect(listened()).toEqual(['s-aws00001']);
  });

  it('never for a run on this computer, whose login listens itself', async () => {
    sup.paused = true;
    await sup._tick();
    expect(listened()).not.toContain('s-mac00001');
  });
});
