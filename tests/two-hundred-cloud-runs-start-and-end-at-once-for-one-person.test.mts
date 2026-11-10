// TWO HUNDRED CLOUD RUNS START AND END AT ONCE FOR ONE PERSON.
//
// Every start, finish and stop rewrites the person's one ledger record with a
// conditional write, and a write that lost its race read again at most 8 times
// and then answered 500. Against the real cloud server code, with the bucket
// taking 15-70 ms a call, 200 starts at once got 21 places and 179 server
// errors (25 at once: 10 errors), whatever the plan allowed; a server error on
// a start sends the thread back to the computer. 200 done.json notices at once
// failed the same way. Measured with scripts/cloud-load-test.mjs --standin.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const PERSON = '44444444-4444-4444-8444-444444444444';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (a: number, b: number) => a + Math.random() * (b - a);

type Objects = ReturnType<typeof memoryObjects>;
// The bucket with a bucket's delays, so writes race as they do on S3.
function slowBucket(mem: Objects = memoryObjects()): Objects {
  return {
    ...mem,
    get: async (k: string) => { await sleep(between(2, 6)); return mem.get(k); },
    put: async (k: string, body: string, opts?: { ifMatch?: string; ifNoneMatch?: string }) => { await sleep(between(3, 9)); return mem.put(k, body, opts); },
  };
}

async function maxAccount(objects: Objects, { ledgerWriteMs }: { ledgerWriteMs?: number } = {}) {
  const gw = createGateway({
    ...(ledgerWriteMs ? { ledgerWriteMs } : {}),
    agentcore: { async invoke() { await sleep(between(5, 40)); return { ok: true, seq: 1 }; }, async stop() {} },
    links: { get: async (k: string) => `x://${k}`, put: async (k: string) => `x://${k}`, head: async (k: string) => `x://${k}` },
    removeObject: async () => {}, objects, whoIs: async () => ({ id: PERSON }),
  });
  await gw.admin({ do: 'plan', person: PERSON, plan: 'max' });
  const made = await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ name: 'lt', acceptedTerms: TERMS_VERSION }) });
  const key = made.body.key;
  const start = (i: number) => gw.handle({ method: 'POST', path: '/v1/invoke', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ sessionId: `s${i}`, payload: { action: 'start', runId: `r${i}` } }) });
  const live = async () => Object.keys(JSON.parse((await objects.get(`ledger/people/${PERSON}.json`))!.body).live);
  return { gw, start, live };
}

const tally = (outs: { status: number; body: { ok?: boolean; error?: string } }[]) => {
  const by: Record<string, number> = {};
  for (const o of outs) { const k = `${o.status} ${o.body?.ok ? 'ok' : o.body?.error}`; by[k] = (by[k] || 0) + 1; }
  return by;
};

describe('one person on Max starting and ending runs all at once', () => {
  it('gives each of 200 starts at once its place, and none twice', async () => {
    const objects = slowBucket();
    const { start, live } = await maxAccount(objects);
    const outs = await Promise.all(Array.from({ length: 200 }, (_, i) => start(i)));
    expect(tally(outs)).toEqual({ '200 ok': 200 });
    expect((await live()).sort()).toEqual(Array.from({ length: 200 }, (_, i) => `s${i}`).sort());
  }, 60_000);

  it('refuses the 201st for the plan, not as a server error', async () => {
    const objects = slowBucket();
    const { start } = await maxAccount(objects);
    const outs = await Promise.all(Array.from({ length: 201 }, (_, i) => start(i)));
    expect(tally(outs)).toEqual({ '200 ok': 200, '200 agents': 1 });
  }, 60_000);

  it('ends all 100 when their done.json notices land at once', async () => {
    const objects = slowBucket();
    const { gw, start, live } = await maxAccount(objects);
    for (let i = 0; i < 100; i += 10) await Promise.all(Array.from({ length: 10 }, (_, j) => start(i + j)));
    expect((await live()).length).toBe(100);
    await Promise.all(Array.from({ length: 100 }, (_, i) => gw.objectCreated(`runs/u-${PERSON}/r${i}/done.json`)));
    expect(await live()).toEqual([]);
  }, 60_000);

  it('still gives up on a write that can never land, rather than trying for ever', async () => {
    const mem = memoryObjects();
    const objects = slowBucket(mem);
    const { start } = await maxAccount(objects, { ledgerWriteMs: 2000 });
    const put = objects.put;
    let tries = 0;
    objects.put = async (k, body, opts) => {
      if (k.startsWith('ledger/people/')) { tries += 1; await sleep(1); throw Object.assign(new Error('changed meanwhile'), { conflict: true }); }
      return put(k, body, opts);
    };
    const began = Date.now();
    const out = await start(0);
    expect(out.status).toBe(500);
    expect(tries).toBeGreaterThan(8);
    expect(Date.now() - began).toBeGreaterThanOrEqual(2000);
    // 2.3 s alone, 5.1 s inside a busy push gate; for ever is what this rules out.
    expect(Date.now() - began).toBeLessThan(10_000);
  }, 60_000);

  it('does not retry a write the bucket refused for any other reason', async () => {
    const objects = slowBucket();
    const { start } = await maxAccount(objects);
    const put = objects.put;
    let tries = 0;
    objects.put = async (k, body, opts) => {
      if (k.startsWith('ledger/people/')) { tries += 1; throw new Error('AccessDenied'); }
      return put(k, body, opts);
    };
    expect((await start(0)).status).toBe(500);
    expect(tries).toBe(1);
  });
});
