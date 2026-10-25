#!/usr/bin/env node
// SETS UP THE CLOUD SERVER (docs/cloud/PLAN.md, "The cloud server").
//
//   aws login --region us-east-1           # an admin sign-in
//   node scripts/cloud-gateway-setup.mjs   # safe to run again
//   node scripts/cloud-gateway-setup.mjs --bundle-only   # build it, deploy nothing
//
// It needs what scripts/cloud-setup.mjs made (the bucket and the runtime, in
// ~/.agentbox/cloud.json) and the team database's address and public key
// (cloud/team.config.json or ~/.agentbox/team.config.json). It makes, all
// named agentbox-gateway*:
//   - the signer, an IAM user whose key signs the links (`runs/`, `logins/`),
//     its key kept in Secrets Manager
//   - the function's role: start and stop sessions on that one runtime, its
//     ledger and relayed calls in that one bucket, and that one secret
//   - the function, bundled into one file, with a public function URL
//   - S3's notice to the function when a run's done.json lands
//   - a sweep every 5 minutes
//   - a phone sweep every minute, which starts in the cloud a phone's reply
//     no computer has claimed (cloud/gateway/phone.mjs), with the team
//     database's service key kept in Secrets Manager, read once from the
//     Supabase Management API with this Mac's Supabase CLI sign-in
//   - a notice from the budget the spike made (`agentcore-sandboxes`) that
//     pauses new runs when the month's spend passes it
//   - a trail of the account's management events and of reads and writes of
//     sign-ins, into its own bucket and log group, and alarms, emailed to
//     `--alarm-email <address>` or to whoever the budget already emails, when
//     the signer's key is used outside a link or someone fills their storage
// and prints the function URL. Paying is on once scripts/stripe-setup.mjs has
// stored Stripe's secret; run this again after it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCloudConfig } from '../main/cloud/config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const NAMES = {
  fn: 'agentbox-gateway', role: 'agentbox-gateway-role', signer: 'agentbox-gateway-signer', notice: 'agentbox-gateway-done',
  sweep: 'agentbox-gateway-sweep', topic: 'agentbox-gateway-budget', budget: 'agentcore-sandboxes',
  stripe: 'agentbox-gateway-stripe', phoneSweep: 'agentbox-gateway-phone', supabase: 'agentbox-gateway-supabase',
  trail: 'agentbox-gateway-trail', trailRole: 'agentbox-gateway-trail-logs', trailLogs: '/agentbox/cloudtrail', alarms: 'agentbox-gateway-alarm',
};
export const STRIPE_SECRET_NAME = NAMES.stripe;
export const GATEWAY_FUNCTION = NAMES.fn;
// The most functions running at once: the ceiling on a burst of calls. It
// does not stop machines already going; `admin pause` and the sweep do.
const CONCURRENCY = 200;
// Longer than its own 60 s wait on AgentCore (main/cloud/aws.mjs), shorter
// than the Mac's wait on it (main/cloud/managed.mjs).
export const FUNCTION_SECONDS = 90;

/**
 * What the function's own role may do. Links are signed by the signer, so
 * the role reads and writes only its ledger and the calls it relays, looks
 * for a run's done.json, and deletes what a Mac asks it to.
 */
export function rolePolicy({ bucket, runtimeArn, region, account, signerSecretArn = `arn:aws:secretsmanager:${region}:${account}:secret:${NAMES.signer}-*`, stripeSecretArn = null, supabaseSecretArn = null }) {
  const at = (p) => `arn:aws:s3:::${bucket}/${p}`;
  const secrets = [signerSecretArn, stripeSecretArn, supabaseSecretArn].filter(Boolean);
  return {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:StopRuntimeSession'], Resource: [runtimeArn, `${runtimeArn}/runtime-endpoint/*`] },
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: [at('ledger/*'), at('runs/*/calls/*')] },
      { Effect: 'Allow', Action: ['s3:GetObject'], Resource: [at('runs/*/done.json')] },
      { Effect: 'Allow', Action: ['s3:DeleteObject'], Resource: [at('runs/*'), at('logins/*')] },
      // runs/ too, so a done.json not there yet answers 404, not 403.
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: `arn:aws:s3:::${bucket}`, Condition: { StringLike: { 's3:prefix': ['ledger/*', 'runs/*'] } } },
      { Effect: 'Allow', Action: ['secretsmanager:GetSecretValue'], Resource: secrets.length === 1 ? secrets[0] : secrets },
      { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `arn:aws:logs:${region}:${account}:log-group:/aws/lambda/${NAMES.fn}*` },
    ],
  };
}

/**
 * What the signer's links may do: runs and sign-ins, never the ledger, and
 * only inside a link, so the key used any other way is refused. It may list
 * runs, so a link to a missing run file answers 404, not 403; never sign-ins,
 * whose every reader takes a 403 as "not there" (main/cloud/logins.mjs).
 */
export function signerPolicy({ bucket }) {
  const inALink = { 's3:authType': 'REST-QUERY-STRING' };
  return {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: ['runs/*', 'logins/*'].map((p) => `arn:aws:s3:::${bucket}/${p}`), Condition: { StringEquals: inALink } },
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: `arn:aws:s3:::${bucket}`, Condition: { StringEquals: inALink, StringLike: { 's3:prefix': ['runs/*'] } } },
    ],
  };
}

export const SIGNER_KEY_DAYS = 90;
// A link lasts at most 12 hours (cloud/gateway/gateway.mjs), so a retired key
// signed nothing still usable after this.
const RETIRED_KEY_MS = 13 * 60 * 60_000;

/**
 * Which of the signer's keys to keep, make, retire and delete. The one in use
 * is kept until it is SIGNER_KEY_DAYS old; then a new one is made and the old
 * one retired, kept until its links have expired (`previous`, from the secret).
 */
export function signerKeyPlan({ inUse, keys, previous = null, now = Date.now() }) {
  const current = keys.find((k) => k.id === inUse) || null;
  const waiting = previous && previous.id !== inUse && keys.some((k) => k.id === previous.id) && now - previous.at <= RETIRED_KEY_MS ? previous.id : null;
  // IAM holds two keys at most: an old one with a retired one waiting goes next time.
  const retire = current && now - current.made >= SIGNER_KEY_DAYS * 24 * 60 * 60_000 && !waiting ? current.id : null;
  const keep = current && !retire ? current.id : null;
  return { keep, retire, remove: keys.map((k) => k.id).filter((id) => id !== keep && id !== retire && id !== waiting), make: !keep };
}

// THE ALARM. The signer only signs links, so its key never makes an AWS call
// itself: any management call by it, or any use of it outside a link, is
// someone else holding it. Reads and writes of sign-ins are the only data
// events recorded, as they are what a stolen key is for and few.

/** The trail's selectors: every management event, and S3 objects under logins/. */
export function trailSelectors({ bucket }) {
  return [
    { Name: 'management', FieldSelectors: [{ Field: 'eventCategory', Equals: ['Management'] }] },
    { Name: 'sign-ins', FieldSelectors: [
      { Field: 'eventCategory', Equals: ['Data'] },
      { Field: 'resources.type', Equals: ['AWS::S3::Object'] },
      { Field: 'resources.ARN', StartsWith: [`arn:aws:s3:::${bucket}/logins/`] },
    ] },
  ];
}

/** The signer's key used other than to sign a link: as CloudWatch's filter, and as the same rule here. */
export function signerMisuse(signerArn) {
  const any = [['eventCategory', 'Management'], ['additionalEventData.AuthenticationMethod', 'AuthHeader']];
  const at = (event, field) => field.split('.').reduce((o, k) => o?.[k], event);
  return {
    pattern: `{ ($.userIdentity.arn = "${signerArn}") && (${any.map(([f, v]) => `($.${f} = "${v}")`).join(' || ')}) }`,
    matches: (event) => at(event, 'userIdentity.arn') === signerArn && any.some(([f, v]) => at(event, f) === v),
  };
}

export function trailBucketPolicy({ trailBucket, trailArn, account }) {
  const from = { Service: 'cloudtrail.amazonaws.com' };
  return {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Principal: from, Action: 's3:GetBucketAcl', Resource: `arn:aws:s3:::${trailBucket}`, Condition: { StringEquals: { 'aws:SourceArn': trailArn } } },
      { Effect: 'Allow', Principal: from, Action: 's3:PutObject', Resource: `arn:aws:s3:::${trailBucket}/AWSLogs/${account}/*`, Condition: { StringEquals: { 's3:x-amz-acl': 'bucket-owner-full-control', 'aws:SourceArn': trailArn } } },
    ],
  };
}

/** What the trail's role may do: write to its own log group. */
export function trailLogsPolicy({ region, account, logGroup }) {
  return {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `arn:aws:logs:${region}:${account}:log-group:${logGroup}:log-stream:*` }],
  };
}

/** The alarms, each a metric filter on a log group and an alarm on its count. */
export function gatewayAlarms({ topicArn, signerArn }) {
  const one = { threshold: 1, periodSeconds: 300, missing: 'notBreaching', actions: [topicArn] };
  return [
    { name: `${NAMES.fn}-signer-misused`, logGroup: NAMES.trailLogs, metric: 'SignerKeyOutsideALink', pattern: signerMisuse(signerArn).pattern, ...one },
    // The words cloud/gateway/gateway.mjs logs when someone reaches their cap.
    { name: `${NAMES.fn}-storage-cap`, logGroup: `/aws/lambda/${NAMES.fn}`, metric: 'StorageCapReached', pattern: '?"cloud storage is full" ?"over twice the"', ...one },
  ];
}

/** Where the alarms are emailed: the address given, or the one the budget already emails. */
export function alarmEmail({ argv, subscribers }) {
  const i = argv.indexOf('--alarm-email');
  const given = i >= 0 ? argv[i + 1] : null;
  if (given && !given.startsWith('--')) return given;
  return (subscribers || []).find((x) => x.SubscriptionType === 'EMAIL')?.Address ?? null;
}

/** The bucket's notices with ours added, every other one kept. */
export function withDoneNotice(current, functionArn) {
  const others = (current?.LambdaFunctionConfigurations || []).filter((c) => c.Id !== NAMES.notice);
  return {
    ...(current || {}),
    LambdaFunctionConfigurations: [...others, {
      Id: NAMES.notice,
      LambdaFunctionArn: functionArn,
      Events: ['s3:ObjectCreated:*'],
      Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'runs/' }, { Name: 'suffix', Value: 'done.json' }] } },
    }],
  };
}

/** The team database's service key, out of the Management API's list of its keys. */
export function serviceKeyOf(keys) {
  const found = Array.isArray(keys) ? keys.find((k) => k?.name === 'service_role' && typeof k.api_key === 'string') : null;
  return found ? found.api_key : null;
}

// This Mac's Supabase CLI sign-in, as `supabase login` keeps it in the keychain.
function supabaseCliToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return raw.startsWith('go-keyring-base64:') ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8') : raw;
  } catch { return null; }
}

async function databaseServiceKey(dbUrl) {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(dbUrl || '')?.[1];
  const token = ref ? supabaseCliToken() : null;
  if (!token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { authorization: `Bearer ${token}`, 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  return serviceKeyOf(await res.json());
}

/** The function in one file, with nothing to install in Lambda. */
export async function bundle(outDir) {
  const { build } = await import('esbuild');
  fs.mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'cloud', 'gateway', 'lambda.mjs')],
    outfile: path.join(outDir, 'index.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning',
    // Lambda's own copy of the AWS libraries has it; this repository does not.
    external: ['@aws-sdk/client-secrets-manager'],
    // The AWS libraries still require() node's own modules.
    banner: { js: "import { createRequire as __agentboxRequire } from 'node:module'; const require = __agentboxRequire(import.meta.url);" },
  });
  const zip = path.join(outDir, 'gateway.zip');
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-q', '-j', zip, path.join(outDir, 'index.mjs')]);
  return zip;
}

const say = (...a) => console.log('cloud-gateway-setup:', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-gateway-'));
  const zip = await bundle(out);
  say(`bundled ${(fs.statSync(zip).size / 1024).toFixed(0)} KB`);
  if (process.argv.includes('--bundle-only')) { console.log(zip); return; }

  const cloud = readCloudConfig();
  if (!cloud?.bucket) throw new Error('run scripts/cloud-setup.mjs first: the server uses its bucket and runtime');
  const { region, bucket, runtimeArn } = cloud;
  const { loadCloudConfig } = await import('../main/team/session.mjs');
  const db = loadCloudConfig(ROOT, { packaged: false });
  if (!db) throw new Error('no team.config.json on this Mac: the server checks sign-ins against that database');

  const aws = (args, { json = true, allowFail = false } = {}) => {
    try {
      const o = execFileSync('aws', [...args, '--region', region, ...(json ? ['--output', 'json'] : [])], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, AWS_PAGER: '' } });
      return json && o.trim() ? JSON.parse(o) : o;
    } catch (err) {
      if (allowFail) return null;
      throw new Error(`aws ${args.slice(0, 2).join(' ')} failed: ${String(err.stderr || err.message).trim()}`);
    }
  };
  const account = aws(['sts', 'get-caller-identity']).Account;

  // The signer, and its key, kept in Secrets Manager only.
  if (!aws(['iam', 'get-user', '--user-name', NAMES.signer], { allowFail: true })) { say(`making user ${NAMES.signer}`); aws(['iam', 'create-user', '--user-name', NAMES.signer]); }
  aws(['iam', 'put-user-policy', '--user-name', NAMES.signer, '--policy-name', `${NAMES.signer}-policy`, '--policy-document', JSON.stringify(signerPolicy({ bucket }))], { json: false });
  const stored = aws(['secretsmanager', 'get-secret-value', '--secret-id', NAMES.signer], { allowFail: true });
  const inUse = stored ? JSON.parse(stored.SecretString) : null;
  const keys = aws(['iam', 'list-access-keys', '--user-name', NAMES.signer]).AccessKeyMetadata.map((k) => ({ id: k.AccessKeyId, made: Date.parse(k.CreateDate) }));
  const plan = signerKeyPlan({ inUse: inUse?.id || null, keys, previous: inUse?.previous || null });
  for (const id of plan.remove) aws(['iam', 'delete-access-key', '--user-name', NAMES.signer, '--access-key-id', id], { json: false });
  if (plan.make) {
    if (plan.retire) say(`replacing the signer's key, ${SIGNER_KEY_DAYS} days old; the old one goes at a run 13 hours from now or later`);
    const k = aws(['iam', 'create-access-key', '--user-name', NAMES.signer]).AccessKey;
    const previous = plan.retire ? { id: plan.retire, at: Date.now() } : undefined;
    const value = JSON.stringify({ id: k.AccessKeyId, secret: k.SecretAccessKey, ...(previous ? { previous } : {}) });
    if (stored) aws(['secretsmanager', 'put-secret-value', '--secret-id', NAMES.signer, '--secret-string', value]);
    else aws(['secretsmanager', 'create-secret', '--name', NAMES.signer, '--secret-string', value]);
  }
  const signerSecretArn = aws(['secretsmanager', 'describe-secret', '--secret-id', NAMES.signer]).ARN;
  // Stripe's key and webhook secret, once scripts/stripe-setup.mjs has stored them.
  const stripeSecretArn = aws(['secretsmanager', 'describe-secret', '--secret-id', NAMES.stripe], { allowFail: true })?.ARN || null;
  if (!stripeSecretArn) say('no Stripe secret yet: paying stays off until scripts/stripe-setup.mjs runs');
  // The team database's service key, for the phone sweep. Never printed.
  const serviceKey = await databaseServiceKey(db.url).catch(() => null);
  if (serviceKey) {
    const value = JSON.stringify({ serviceKey });
    if (aws(['secretsmanager', 'describe-secret', '--secret-id', NAMES.supabase], { allowFail: true })) aws(['secretsmanager', 'put-secret-value', '--secret-id', NAMES.supabase, '--secret-string', value]);
    else aws(['secretsmanager', 'create-secret', '--name', NAMES.supabase, '--secret-string', value]);
  }
  const supabaseSecretArn = aws(['secretsmanager', 'describe-secret', '--secret-id', NAMES.supabase], { allowFail: true })?.ARN || null;
  if (!supabaseSecretArn) say('no database service key (sign in with `supabase login`): a phone\'s reply waits for its computer');

  // The role.
  const trust = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] });
  let role = aws(['iam', 'get-role', '--role-name', NAMES.role], { allowFail: true })?.Role;
  if (!role) { say(`making role ${NAMES.role}`); role = aws(['iam', 'create-role', '--role-name', NAMES.role, '--assume-role-policy-document', trust]).Role; }
  aws(['iam', 'put-role-policy', '--role-name', NAMES.role, '--policy-name', `${NAMES.role}-policy`, '--policy-document', JSON.stringify(rolePolicy({ bucket, runtimeArn, region, account, signerSecretArn, stripeSecretArn, supabaseSecretArn }))], { json: false });

  // The function. A role made a moment ago is not assumable yet: retry.
  const env = { REGION: region, BUCKET: bucket, RUNTIME_ARN: runtimeArn, SUPABASE_URL: db.url, SUPABASE_ANON_KEY: db.anonKey, SIGNER_SECRET_ARN: signerSecretArn, ...(stripeSecretArn ? { STRIPE_SECRET_ARN: stripeSecretArn } : {}), ...(supabaseSecretArn ? { SUPABASE_SERVICE_SECRET_ARN: supabaseSecretArn } : {}) };
  // The chip goes with the code (create, or a code update), never with a settings update.
  const settings = ['--runtime', 'nodejs22.x', '--handler', 'index.handler', '--timeout', String(FUNCTION_SECONDS), '--memory-size', '512', '--environment', JSON.stringify({ Variables: env })];
  const arm = ['--architectures', 'arm64'];
  const existing = aws(['lambda', 'get-function-configuration', '--function-name', NAMES.fn], { allowFail: true });
  const waitUpdated = () => aws(['lambda', 'wait', 'function-updated-v2', '--function-name', NAMES.fn], { json: false });
  if (!existing) {
    for (let i = 1; ; i += 1) {
      try { aws(['lambda', 'create-function', '--function-name', NAMES.fn, '--role', role.Arn, '--zip-file', `fileb://${zip}`, ...arm, ...settings]); break; } catch (err) {
        if (i >= 12 || !/assume|role/i.test(err.message)) throw err;
        say(`waiting for the role (${i}/12)`); await sleep(5000);
      }
    }
    aws(['lambda', 'wait', 'function-active-v2', '--function-name', NAMES.fn], { json: false });
  } else {
    aws(['lambda', 'update-function-code', '--function-name', NAMES.fn, '--zip-file', `fileb://${zip}`, ...arm]);
    waitUpdated();
    aws(['lambda', 'update-function-configuration', '--function-name', NAMES.fn, '--role', role.Arn, ...settings]);
    waitUpdated();
  }
  aws(['lambda', 'put-function-concurrency', '--function-name', NAMES.fn, '--reserved-concurrent-executions', String(CONCURRENCY)], { allowFail: true });
  const fnArn = aws(['lambda', 'get-function-configuration', '--function-name', NAMES.fn]).FunctionArn;
  const allow = (id, principal, extra = []) => aws(['lambda', 'add-permission', '--function-name', NAMES.fn, '--statement-id', id, '--action', 'lambda:InvokeFunction', '--principal', principal, ...extra], { allowFail: true });

  // Its public address. The server checks every caller itself.
  let urlConfig = aws(['lambda', 'get-function-url-config', '--function-name', NAMES.fn], { allowFail: true });
  if (!urlConfig) urlConfig = aws(['lambda', 'create-function-url-config', '--function-name', NAMES.fn, '--auth-type', 'NONE']);
  aws(['lambda', 'add-permission', '--function-name', NAMES.fn, '--statement-id', 'public-url', '--action', 'lambda:InvokeFunctionUrl', '--principal', '*', '--function-url-auth-type', 'NONE'], { allowFail: true });
  allow('public-url-invoke', '*', ['--invoked-via-function-url']);

  // S3's notice when a run ends.
  allow('s3-done', 's3.amazonaws.com', ['--source-arn', `arn:aws:s3:::${bucket}`, '--source-account', account]);
  const current = aws(['s3api', 'get-bucket-notification-configuration', '--bucket', bucket], { allowFail: true }) || {};
  aws(['s3api', 'put-bucket-notification-configuration', '--bucket', bucket, '--notification-configuration', JSON.stringify(withDoneNotice(current, fnArn))], { json: false });

  // The sweep, every 5 minutes.
  const rule = aws(['events', 'put-rule', '--name', NAMES.sweep, '--schedule-expression', 'rate(5 minutes)']).RuleArn;
  aws(['events', 'put-targets', '--rule', NAMES.sweep, '--targets', JSON.stringify([{ Id: 'gateway', Arn: fnArn, Input: '{"sweep":true}' }])]);
  allow('sweep', 'events.amazonaws.com', ['--source-arn', rule]);

  // The phone sweep, every minute: a reply no computer has claimed for a
  // minute starts in the cloud (cloud/gateway/phone.mjs).
  if (supabaseSecretArn) {
    const phoneRule = aws(['events', 'put-rule', '--name', NAMES.phoneSweep, '--schedule-expression', 'rate(1 minute)']).RuleArn;
    aws(['events', 'put-targets', '--rule', NAMES.phoneSweep, '--targets', JSON.stringify([{ Id: 'gateway', Arn: fnArn, Input: '{"phoneSweep":true}' }])]);
    allow('phone-sweep', 'events.amazonaws.com', ['--source-arn', phoneRule]);
  }

  // The budget's alarm pauses new runs.
  const topic = aws(['sns', 'create-topic', '--name', NAMES.topic]).TopicArn;
  aws(['sns', 'set-topic-attributes', '--topic-arn', topic, '--attribute-name', 'Policy', '--attribute-value', JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { Service: 'budgets.amazonaws.com' }, Action: 'SNS:Publish', Resource: topic, Condition: { StringEquals: { 'aws:SourceAccount': account } } }],
  })], { json: false });
  allow('budget', 'sns.amazonaws.com', ['--source-arn', topic]);
  aws(['sns', 'subscribe', '--topic-arn', topic, '--protocol', 'lambda', '--notification-endpoint', fnArn]);
  // The budget may already alert at 100% (by email): the topic joins that alert.
  const at100 = 'NotificationType=ACTUAL,ComparisonOperator=GREATER_THAN,Threshold=100,ThresholdType=PERCENTAGE';
  const budget = ['--account-id', account, '--budget-name', NAMES.budget];
  const subscribers = aws(['budgets', 'describe-subscribers-for-notification', ...budget, '--notification', at100], { allowFail: true })?.Subscribers;
  if (!subscribers) aws(['budgets', 'create-notification', ...budget, '--notification', at100, '--subscribers', `SubscriptionType=SNS,Address=${topic}`], { json: false });
  else if (!subscribers.some((s) => s.Address === topic)) aws(['budgets', 'create-subscriber', ...budget, '--notification', at100, '--subscriber', `SubscriptionType=SNS,Address=${topic}`], { json: false });

  // The trail, its bucket and log group, and the alarms on them.
  const signerArn = aws(['iam', 'get-user', '--user-name', NAMES.signer]).User.Arn;
  const trailArn = `arn:aws:cloudtrail:${region}:${account}:trail/${NAMES.trail}`;
  const trailBucket = `${NAMES.trail}-${account}-${region}`;
  if (aws(['s3api', 'head-bucket', '--bucket', trailBucket], { json: false, allowFail: true }) === null) {
    say(`making bucket ${trailBucket}`);
    aws(['s3api', 'create-bucket', '--bucket', trailBucket, ...(region === 'us-east-1' ? [] : ['--create-bucket-configuration', `LocationConstraint=${region}`])]);
  }
  aws(['s3api', 'put-public-access-block', '--bucket', trailBucket, '--public-access-block-configuration', 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'], { json: false });
  aws(['s3api', 'put-bucket-policy', '--bucket', trailBucket, '--policy', JSON.stringify(trailBucketPolicy({ trailBucket, trailArn, account }))], { json: false });
  aws(['s3api', 'put-bucket-lifecycle-configuration', '--bucket', trailBucket, '--lifecycle-configuration', JSON.stringify({ Rules: [{ ID: 'trail-expire', Status: 'Enabled', Filter: { Prefix: '' }, Expiration: { Days: 90 } }] })], { json: false });
  aws(['logs', 'create-log-group', '--log-group-name', NAMES.trailLogs], { json: false, allowFail: true });
  aws(['logs', 'put-retention-policy', '--log-group-name', NAMES.trailLogs, '--retention-in-days', '30'], { json: false });
  const trailTrust = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'cloudtrail.amazonaws.com' }, Action: 'sts:AssumeRole' }] });
  let trailRole = aws(['iam', 'get-role', '--role-name', NAMES.trailRole], { allowFail: true })?.Role;
  if (!trailRole) { say(`making role ${NAMES.trailRole}`); trailRole = aws(['iam', 'create-role', '--role-name', NAMES.trailRole, '--assume-role-policy-document', trailTrust]).Role; }
  aws(['iam', 'put-role-policy', '--role-name', NAMES.trailRole, '--policy-name', `${NAMES.trailRole}-policy`, '--policy-document', JSON.stringify(trailLogsPolicy({ region, account, logGroup: NAMES.trailLogs }))], { json: false });
  const trailSettings = ['--name', NAMES.trail, '--s3-bucket-name', trailBucket, '--is-multi-region-trail', '--include-global-service-events', '--cloud-watch-logs-log-group-arn', `arn:aws:logs:${region}:${account}:log-group:${NAMES.trailLogs}:*`, '--cloud-watch-logs-role-arn', trailRole.Arn];
  const hasTrail = aws(['cloudtrail', 'describe-trails', '--trail-name-list', NAMES.trail]).trailList?.length > 0;
  // A role made a moment ago is not usable by CloudTrail yet: retry.
  for (let i = 1; ; i += 1) {
    try { aws(['cloudtrail', hasTrail ? 'update-trail' : 'create-trail', ...trailSettings]); break; } catch (err) {
      if (i >= 12 || !/role|assume|InvalidCloudWatchLogs/i.test(err.message)) throw err;
      say(`waiting for the trail's role (${i}/12)`); await sleep(5000);
    }
  }
  aws(['cloudtrail', 'put-event-selectors', '--trail-name', NAMES.trail, '--advanced-event-selectors', JSON.stringify(trailSelectors({ bucket }))]);
  aws(['cloudtrail', 'start-logging', '--name', NAMES.trail], { json: false });
  const alarmTopic = aws(['sns', 'create-topic', '--name', NAMES.alarms]).TopicArn;
  const email = alarmEmail({ argv: process.argv, subscribers });
  if (!email) say('no address for the alarms: run again with --alarm-email <address>');
  else if (!aws(['sns', 'list-subscriptions-by-topic', '--topic-arn', alarmTopic]).Subscriptions.some((x) => x.Protocol === 'email' && x.Endpoint === email)) {
    aws(['sns', 'subscribe', '--topic-arn', alarmTopic, '--protocol', 'email', '--notification-endpoint', email]);
    say('the alarms email an address that must confirm first: open the message AWS just sent it');
  }
  aws(['logs', 'create-log-group', '--log-group-name', `/aws/lambda/${NAMES.fn}`], { json: false, allowFail: true });
  for (const a of gatewayAlarms({ topicArn: alarmTopic, signerArn })) {
    aws(['logs', 'put-metric-filter', '--log-group-name', a.logGroup, '--filter-name', a.name, '--filter-pattern', a.pattern, '--metric-transformations', JSON.stringify([{ metricName: a.metric, metricNamespace: 'Agentbox', metricValue: '1' }])], { json: false });
    aws(['cloudwatch', 'put-metric-alarm', '--alarm-name', a.name, '--namespace', 'Agentbox', '--metric-name', a.metric, '--statistic', 'Sum', '--period', String(a.periodSeconds), '--evaluation-periods', '1', '--threshold', String(a.threshold), '--comparison-operator', 'GreaterThanOrEqualToThreshold', '--treat-missing-data', a.missing, '--alarm-actions', ...a.actions], { json: false });
  }

  say('ready');
  console.log(urlConfig.FunctionUrl);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`cloud-gateway-setup: ${err.message}`); process.exit(1); });
}
