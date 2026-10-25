// THE CLOUD SERVER IN LAMBDA. One function answers every event it gets: HTTP
// from its function URL (a Mac), S3's notice that a run's done.json landed,
// the clock's sweep and its phone sweep, the budget alarm, and the owner's
// direct admin calls.
// scripts/cloud-gateway-setup.mjs bundles this file and deploys it.
//
// Links are signed with a separate IAM user's key, read from the secret
// store, not with the function's role: a link lasts no longer than the
// credentials that signed it, and a role's last hours, where a run's results
// link must outlive the run's 8.
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { awsTransport, awsStorage } from '../../main/cloud/aws.mjs';
import { createGateway } from './gateway.mjs';
import { supabaseRest } from './phone.mjs';
import { sendToExpo } from '../../main/phone-alerts.mjs';
import { stripeClient } from './stripe.mjs';

const TIMEOUT_MS = 20_000;
const http = { requestTimeout: TIMEOUT_MS, connectionTimeout: 5_000, throwOnRequestTimeout: true };
const missing = (err) => ['NoSuchKey', 'NotFound'].includes(err?.name) || err?.$metadata?.httpStatusCode === 404;

/** The ledger's objects in the bucket, with S3's conditional writes. */
export function bucketObjects({ region, bucket, client = new S3Client({ region, requestHandler: http }) }) {
  const conflicted = (err) => [409, 412].includes(err?.$metadata?.httpStatusCode) || /PreconditionFailed|ConditionalRequestConflict/.test(err?.name || '');
  return {
    async get(key) {
      try {
        const o = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { body: await o.Body.transformToString(), etag: o.ETag };
      } catch (err) {
        if (missing(err)) return null;
        throw err;
      }
    },
    async head(key) {
      try { return { size: (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength }; } catch (err) {
        if (missing(err)) return null;
        throw err;
      }
    },
    async put(key, body, { ifMatch, ifNoneMatch } = {}) {
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/json', ...(ifMatch ? { IfMatch: ifMatch } : {}), ...(ifNoneMatch ? { IfNoneMatch: ifNoneMatch } : {}) }));
      } catch (err) {
        if (conflicted(err)) throw Object.assign(new Error('changed meanwhile'), { conflict: true });
        throw err;
      }
    },
    async del(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
    async list(prefix) {
      const keys = [];
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ...(token ? { ContinuationToken: token } : {}) }));
        for (const o of page.Contents || []) keys.push(o.Key);
        token = page.IsTruncated ? page.NextContinuationToken : null;
      } while (token);
      return keys;
    },
    async sizes(prefix, { max = Infinity } = {}) {
      const items = [];
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ...(token ? { ContinuationToken: token } : {}) }));
        for (const o of page.Contents || []) items.push({ key: o.Key, size: o.Size, at: o.LastModified?.getTime?.() ?? 0 });
        token = page.IsTruncated ? page.NextContinuationToken : null;
      } while (token && items.length < max);
      return { items: items.slice(0, max), truncated: !!token || items.length > max };
    },
  };
}

/**
 * A run's files and a kit, read and written through the signer's links: the
 * function's own role never reads `runs/`.
 */
export function linkedFiles({ links, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  return {
    async get(key) {
      const res = await fetchImpl(await links.get(key, 300), { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`the bucket answered ${res.status} for ${key}`);
      return res.text();
    },
    async put(key, body) {
      const res = await fetchImpl(await links.put(key, 300), { method: 'PUT', body, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`the bucket answered ${res.status} for ${key}`);
    },
  };
}

/**
 * Who a database session belongs to, asked of the database itself: a Google
 * sign-in, or an email address its owner has confirmed.
 */
export function supabaseWhoIs({ url, anonKey, fetchImpl = fetch }) {
  return async (token) => {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const u = await res.json();
    return u?.id && u.email_confirmed_at ? { id: u.id, email: u.email ?? null } : null;
  };
}

// Lambda's own copy of the AWS libraries has this client; the bundle leaves it out.
async function readSecretFromAws(arn, region) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region, requestHandler: http });
  return (await client.send(new GetSecretValueCommand({ SecretId: arn }))).SecretString;
}

export async function gatewayFromEnv(env = process.env, { readSecret = (arn) => readSecretFromAws(arn, env.REGION) } = {}) {
  const need = ['REGION', 'BUCKET', 'RUNTIME_ARN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SIGNER_SECRET_ARN'];
  const lacking = need.filter((k) => !env[k]);
  if (lacking.length) throw new Error(`the cloud server is missing ${lacking.join(', ')}`);
  const region = env.REGION;
  const bucket = env.BUCKET;
  const key = JSON.parse(await readSecret(env.SIGNER_SECRET_ARN));
  const transport = awsTransport({ region, runtimeArn: env.RUNTIME_ARN });
  const signer = awsStorage({ region, bucket, credentials: { accessKeyId: key.id, secretAccessKey: key.secret } });
  const objects = bucketObjects({ region, bucket });
  // Without it the server runs and says paying is not set up.
  const billing = env.STRIPE_SECRET_ARN ? JSON.parse(await readSecret(env.STRIPE_SECRET_ARN)) : null;
  // Without it a phone's reply waits for its computer, as before.
  const database = env.SUPABASE_SERVICE_SECRET_ARN ? JSON.parse(await readSecret(env.SUPABASE_SERVICE_SECRET_ARN)) : null;
  return createGateway({
    ...(billing ? { stripe: stripeClient({ key: billing.key, webhookSecret: billing.webhookSecret, managedPayments: !!billing.managedPayments }) } : {}),
    ...(database?.serviceKey ? {
      phone: {
        db: supabaseRest({ url: env.SUPABASE_URL, serviceKey: database.serviceKey }),
        runFiles: linkedFiles({ links: { get: signer.getUrl, put: signer.putUrl } }),
        sendPush: (messages) => sendToExpo(messages),
      },
    } : {}),
    agentcore: transport,
    links: { get: signer.getUrl, put: signer.putUrl, head: signer.headUrl },
    removeObject: (k) => objects.del(k),
    objects,
    whoIs: supabaseWhoIs({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY }),
    log: (m) => console.log(m),
  });
}

/** A Lambda handler over a gateway, for every kind of event it is sent. */
export function lambdaHandler(gw) {
  return async (event) => {
    // The function URL: a Mac. Checked first, so nothing a Mac sends is
    // ever read as one of the events below.
    if (event?.requestContext?.http) {
      const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
      const path = event.rawQueryString ? `${event.rawPath}?${event.rawQueryString}` : event.rawPath;
      const out = await gw.handle({ method: event.requestContext.http.method, path, headers: event.headers || {}, body });
      if (out.type === 'html') return { statusCode: out.status, headers: { 'content-type': 'text/html; charset=utf-8' }, body: out.body };
      return { statusCode: out.status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(out.body) };
    }
    if (Array.isArray(event?.Records)) {
      for (const r of event.Records) {
        if (r?.eventSource === 'aws:s3') await gw.objectCreated(decodeURIComponent(String(r.s3?.object?.key || '').replace(/\+/g, ' ')));
        else if (r?.EventSource === 'aws:sns') await gw.admin({ do: 'pause' });
      }
      return { ok: true };
    }
    if (event?.phoneSweep) return gw.phoneSweep();
    if (event?.sweep) return gw.sweep();
    if (event?.admin) return gw.admin(event.admin);
    return { ok: false, error: 'not an event this function takes' };
  };
}

let ready = null;
export const handler = async (event) => {
  ready ??= gatewayFromEnv().then(lambdaHandler, (err) => { ready = null; throw err; });
  return (await ready)(event);
};
