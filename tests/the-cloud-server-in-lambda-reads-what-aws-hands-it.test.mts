// THE CLOUD SERVER IN LAMBDA READS WHAT AWS HANDS IT.
//
// The cloud server's rules are tested on their own (one-persons-cloud-runs-
// are-out-of-every-other-persons-reach, the-cloud-server-holds-each-person-
// to-their-plan). In Lambda they sit behind three translations, and each one
// fails quietly: a function URL request whose body arrives base64-encoded, an
// S3 notice whose key arrives URL-encoded (so a done.json is never matched and
// a finished run is charged 8 hours), and S3's answer to a conditional write
// that lost a race (so two starts both take the last agent). Plus the one
// question asked of the account database: who is this?
import { describe, it, expect } from 'vitest';
import { lambdaHandler, bucketObjects, supabaseWhoIs, gatewayFromEnv } from '../cloud/gateway/lambda.mjs';
import { adminEvent } from '../scripts/cloud-gateway-admin.mjs';

function recorder() {
  const seen = { handled: [], created: [], swept: 0, admin: [] };
  return {
    seen,
    gw: {
      async handle(req) { seen.handled.push(req); return { status: 201, body: { fine: true } }; },
      async objectCreated(key) { seen.created.push(key); },
      async sweep() { seen.swept += 1; return { freeRunning: 0 }; },
      async admin(a) { seen.admin.push(a); return { ok: true }; },
    },
  };
}

// Second review, 2026-10-20: ceilings, spent hours and missed done.json
// notices were only seen when that person next called; one person could not
// be cut off; and nothing stopped the whole cloud when spend ran away.
describe('the events that are not a Mac', () => {
  it('the clock\'s event sweeps', async () => {
    const { gw, seen } = recorder();
    await lambdaHandler(gw)({ sweep: true });
    expect(seen.swept).toBe(1);
    expect(seen.handled).toEqual([]);
  });

  it('a direct call from the owner is an admin step, and the same shape through the public URL is not', async () => {
    const { gw, seen } = recorder();
    await lambdaHandler(gw)({ admin: { do: 'disable', person: 'p' } });
    expect(seen.admin).toEqual([{ do: 'disable', person: 'p' }]);
    await lambdaHandler(gw)({ admin: { do: 'enable', person: 'p' }, rawPath: '/v1/me', headers: {}, requestContext: { http: { method: 'GET' } } });
    expect(seen.admin).toHaveLength(1);
    expect(seen.handled).toHaveLength(1);
  });

  it('the owner\'s command line becomes the event the function takes, and nothing half-said does', () => {
    expect(adminEvent(['plan', 'p', 'pro'])).toEqual({ admin: { do: 'plan', person: 'p', plan: 'pro' } });
    expect(adminEvent(['disable', 'p'])).toEqual({ admin: { do: 'disable', person: 'p' } });
    expect(adminEvent(['pause'])).toEqual({ admin: { do: 'pause' } });
    expect(adminEvent(['sweep'])).toEqual({ sweep: true });
    for (const bad of [[], ['plan', 'p'], ['disable'], ['delete', 'p']]) expect(() => adminEvent(bad), bad.join(' ')).toThrow(/usage/);
  });

  it('the budget alarm pauses new runs', async () => {
    const { gw, seen } = recorder();
    await lambdaHandler(gw)({ Records: [{ EventSource: 'aws:sns', Sns: { Message: 'AWS Budget Notification: actual spend over threshold' } }] });
    expect(seen.admin).toEqual([{ do: 'pause' }]);
  });
});

describe('a function URL request', () => {
  it('reaches the server as method, path, headers and body, and its answer goes back as JSON', async () => {
    const { gw, seen } = recorder();
    const out = await lambdaHandler(gw)({ rawPath: '/v1/invoke', headers: { authorization: 'Bearer abk_x' }, body: '{"a":1}', requestContext: { http: { method: 'POST' } } });
    expect(seen.handled[0]).toEqual({ method: 'POST', path: '/v1/invoke', headers: { authorization: 'Bearer abk_x' }, body: '{"a":1}' });
    expect(out).toEqual({ statusCode: 201, headers: { 'content-type': 'application/json' }, body: '{"fine":true}' });
  });

  it('a base64 body is read as the text it encodes', async () => {
    const { gw, seen } = recorder();
    await lambdaHandler(gw)({ rawPath: '/v1/link', headers: {}, body: Buffer.from('{"op":"get"}').toString('base64'), isBase64Encoded: true, requestContext: { http: { method: 'POST' } } });
    expect(seen.handled[0].body).toBe('{"op":"get"}');
  });
});

describe('S3\'s notice that an object landed', () => {
  it('names the key as stored, decoded', async () => {
    const { gw, seen } = recorder();
    await lambdaHandler(gw)({ Records: [{ eventSource: 'aws:s3', s3: { object: { key: 'runs/u-1/run%3Done/done.json' } } }, { eventSource: 'aws:s3', s3: { object: { key: 'runs/a+b/done.json' } } }] });
    expect(seen.created).toEqual(['runs/u-1/run=one/done.json', 'runs/a b/done.json']);
  });

  it('a record that is not from S3 is ignored', async () => {
    const { gw, seen } = recorder();
    await lambdaHandler(gw)({ Records: [{ eventSource: 'aws:sqs', s3: { object: { key: 'runs/u-1/r/done.json' } } }] });
    expect(seen.created).toEqual([]);
    expect(seen.handled).toEqual([]);
  });
});

describe('the ledger\'s objects in the bucket', () => {
  const client = (fail) => {
    const sent = [];
    return { sent, async send(cmd) { sent.push(cmd.input); if (fail) throw fail; return { ETag: '"e1"', Body: { transformToString: async () => '{"x":1}' } }; } };
  };

  it('a write that lost a race is a conflict, whichever way S3 says it', async () => {
    for (const fail of [Object.assign(new Error('x'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } }), Object.assign(new Error('x'), { name: 'ConditionalRequestConflict', $metadata: { httpStatusCode: 409 } })]) {
      const objects = bucketObjects({ bucket: 'b', client: client(fail) });
      await expect(objects.put('ledger/people/p.json', '{}', { ifMatch: '"e1"' })).rejects.toMatchObject({ conflict: true });
    }
  });

  it('any other failure is not a conflict, so it is not retried as one', async () => {
    const objects = bucketObjects({ bucket: 'b', client: client(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })) });
    await expect(objects.put('k', '{}')).rejects.not.toMatchObject({ conflict: true });
  });

  it('the condition goes with the write, and a read carries its ETag', async () => {
    const c = client(null);
    const objects = bucketObjects({ bucket: 'b', client: c });
    await objects.put('k', '{}', { ifMatch: '"e1"' });
    await objects.put('k', '{}', { ifNoneMatch: '*' });
    expect(c.sent[0]).toMatchObject({ Bucket: 'b', Key: 'k', IfMatch: '"e1"' });
    expect(c.sent[1]).toMatchObject({ IfNoneMatch: '*' });
    expect(c.sent[1].IfMatch).toBeUndefined();
    expect(await objects.get('k')).toEqual({ body: '{"x":1}', etag: '"e1"' });
  });

  it('a missing object reads as nothing', async () => {
    const objects = bucketObjects({ bucket: 'b', client: client(Object.assign(new Error('x'), { name: 'NoSuchKey' })) });
    expect(await objects.get('k')).toBe(null);
    const missing = bucketObjects({ bucket: 'b', client: client(Object.assign(new Error('x'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })) });
    expect(await missing.head('k')).toBe(null);
    // A refusal is not "missing": a wrong policy shows as an error. The
    // sweep, which may not stop for one, passes it by itself.
    const refused = bucketObjects({ bucket: 'b', client: client(Object.assign(new Error('x'), { name: 'Forbidden', $metadata: { httpStatusCode: 403 } })) });
    await expect(refused.head('k')).rejects.toThrow();
  });

  it('a look gives the size, and a list follows every page', async () => {
    const pages = [{ Contents: [{ Key: 'ledger/people/a.json' }], IsTruncated: true, NextContinuationToken: 't' }, { Contents: [{ Key: 'ledger/people/b.json' }], IsTruncated: false }];
    const sent = [];
    const c = { async send(cmd) { sent.push(cmd.input); return cmd.input.Prefix ? pages.shift() : { ContentLength: 42 }; } };
    const objects = bucketObjects({ bucket: 'b', client: c });
    expect(await objects.head('k')).toEqual({ size: 42 });
    expect(await objects.list('ledger/people/')).toEqual(['ledger/people/a.json', 'ledger/people/b.json']);
    expect(sent[2]).toMatchObject({ Prefix: 'ledger/people/', ContinuationToken: 't' });
  });
});

describe('who a database session belongs to', () => {
  it('is asked of the database with its public key and the session, and only a real answer counts', async () => {
    const asked = [];
    const fetchImpl = async (url, init) => {
      asked.push({ url, init });
      return init.headers.authorization === 'Bearer good'
        ? { ok: true, json: async () => ({ id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com', email_confirmed_at: '2026-10-20T10:00:00Z' }) }
        : { ok: false, json: async () => ({}) };
    };
    const whoIs = supabaseWhoIs({ url: 'https://db.example/', anonKey: 'pub', fetchImpl });
    expect(await whoIs('good')).toEqual({ id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com' });
    expect(await whoIs('bad')).toBe(null);
    expect(asked[0].url).toBe('https://db.example/auth/v1/user');
    expect(asked[0].init.headers.apikey).toBe('pub');
    expect(asked[0].init.signal).toBeDefined();
  });

  // The owner's call, 2026-10-20: the cloud signs in through the app's own
  // sign-in page, Google or an email and a password. Google-only guarded a
  // free allowance per made-up address, and there is no free allowance now.
  // An address nobody has confirmed still gets nothing.
  it('a Google sign-in or a confirmed email counts; an email nobody confirmed does not', async () => {
    const user = (extra) => ({ ok: true, json: async () => ({ id: '11111111-1111-4111-8111-111111111111', ...extra }) });
    const answers = {
      google: user({ app_metadata: { provider: 'google', providers: ['google'] }, email_confirmed_at: '2026-10-20T10:00:00Z' }),
      email: user({ app_metadata: { provider: 'email', providers: ['email'] }, email_confirmed_at: '2026-10-20T10:00:00Z' }),
      unconfirmed: user({ app_metadata: { provider: 'email', providers: ['email'] }, email_confirmed_at: null }),
    };
    const whoIs = supabaseWhoIs({ url: 'https://db.example', anonKey: 'pub', fetchImpl: async (u, init) => answers[init.headers.authorization.slice(7)] });
    expect(await whoIs('google')).not.toBe(null);
    expect(await whoIs('email')).not.toBe(null);
    expect(await whoIs('unconfirmed')).toBe(null);
  });
});

describe('starting the server', () => {
  it('names every setting it is missing', async () => {
    await expect(gatewayFromEnv({ REGION: 'us-east-1' })).rejects.toThrow(/BUCKET, RUNTIME_ARN, SUPABASE_URL, SUPABASE_ANON_KEY, SIGNER_SECRET_ARN/);
  });

  // Second review: the signer's key can link every customer's sign-in, so it
  // is read from the secret store, never kept in the function's settings.
  it('reads the signer\'s key from the secret store', async () => {
    const asked = [];
    const readSecret = async (arn) => { asked.push(arn); return JSON.stringify({ id: 'AKIA-signer', secret: 's3cr3t' }); };
    const gw = await gatewayFromEnv({ REGION: 'us-east-1', BUCKET: 'b', RUNTIME_ARN: 'arn:r', SUPABASE_URL: 'https://db', SUPABASE_ANON_KEY: 'pub', SIGNER_SECRET_ARN: 'arn:secret' }, { readSecret });
    expect(asked).toEqual(['arn:secret']);
    expect(typeof gw.handle).toBe('function');
  });

  it('reads Stripe\'s key from the secret store when it is set, and says paying is off when it is not', async () => {
    const env = { REGION: 'us-east-1', BUCKET: 'b', RUNTIME_ARN: 'arn:r', SUPABASE_URL: 'https://db', SUPABASE_ANON_KEY: 'pub', SIGNER_SECRET_ARN: 'arn:secret' };
    const asked = [];
    const readSecret = async (arn) => { asked.push(arn); return JSON.stringify(arn === 'arn:stripe' ? { key: 'sk_test_x', webhookSecret: 'whsec_x' } : { id: 'AKIA-signer', secret: 's3cr3t' }); };
    await gatewayFromEnv({ ...env, STRIPE_SECRET_ARN: 'arn:stripe' }, { readSecret });
    expect(asked).toEqual(['arn:secret', 'arn:stripe']);
    const off = await gatewayFromEnv(env, { readSecret });
    // Unsigned, so a server with Stripe would say 400; one without says 503.
    expect((await off.handle({ method: 'POST', path: '/v1/stripe', headers: {}, body: '{}' })).status).toBe(503);
  });
});

describe('what a browser is sent back to', () => {
  it('keeps the query, and answers as a page, not JSON', async () => {
    const seen = [];
    const gw = { handle: async (r) => { seen.push(r.path); return { status: 200, type: 'html', body: '<p>hi</p>' }; } };
    const out = await lambdaHandler(gw)({ rawPath: '/v1/paid', rawQueryString: 'cancelled=1', headers: {}, requestContext: { http: { method: 'GET' } } });
    expect(seen).toEqual(['/v1/paid?cancelled=1']);
    expect(out).toEqual({ statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<p>hi</p>' });
  });
});
