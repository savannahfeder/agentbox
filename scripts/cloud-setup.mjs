#!/usr/bin/env node
// SETS UP CLOUD RUNS IN YOUR OWN AWS ACCOUNT, ONCE (docs/cloud/PLAN.md).
//
//   aws login --region us-east-1      # an admin sign-in, the 12-hour kind
//   node scripts/cloud-setup.mjs      # safe to run again: it only fills gaps
//
// What it makes, all in us-east-1 and all named agentbox-*:
//   - an S3 bucket for packs and results (private, everything gone in 7 days)
//   - an ECR repository and a CodeBuild project that builds the sandbox image
//     in AWS, on ARM, so this Mac never needs Docker
//   - the runtime's own role, which may pull that image and write its logs and
//     nothing else: the sandbox reaches S3 only through presigned URLs
//   - the AgentCore runtime itself
//   - an IAM user for the app, allowed to start and stop sessions on that one
//     runtime and to read and write that one bucket; its key is written to
//     ~/.aws/credentials as the `agentbox-cloud` profile, so the app never
//     runs on the 12-hour sign-in
// and it writes what it made to ~/.agentbox/cloud.json (never to git: an AWS
// account id is not committed here).
//
// Flags: --rebuild builds the image even when nothing in it changed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cloudConfigPath } from '../main/cloud/config.mjs';

const REGION = 'us-east-1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX = path.join(HERE, '..', 'cloud', 'sandbox');
const IMAGE_FILES = ['Dockerfile', 'server.mjs', 'mcp-stub.mjs', 'usage.mjs', 'sudo.mjs'];
const NAMES = {
  repo: 'agentbox-sandbox',
  build: 'agentbox-sandbox-build',
  buildRole: 'agentbox-codebuild-role',
  runtimeRole: 'agentbox-sandbox-runtime-role',
  runtime: 'agentbox_sandbox',
  appUser: 'agentbox-cloud-app',
  profile: 'agentbox-cloud',
};
const CONFIG_PATH = cloudConfigPath();

const say = (...a) => console.log('cloud-setup:', ...a);

function aws(args, { json = true, allowFail = false, input } = {}) {
  try {
    const out = execFileSync('aws', [...args, '--region', REGION, ...(json ? ['--output', 'json'] : [])], {
      encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, AWS_PAGER: '' },
    });
    return json && out.trim() ? JSON.parse(out) : out;
  } catch (err) {
    if (allowFail) return null;
    const msg = String(err.stderr || err.message).trim();
    throw new Error(`aws ${args.slice(0, 2).join(' ')} failed: ${msg}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// IAM is eventually consistent: a role made a second ago is often not yet
// assumable. Retry the call that needs it rather than sleeping blind.
async function retrying(what, fn, tries = 12) {
  for (let i = 1; ; i += 1) {
    try { return fn(); } catch (err) {
      if (i >= tries || !/assume|AccessDenied|not authorized|InvalidParameterValue|ValidationException.*role/i.test(err.message)) throw err;
      say(`${what}: waiting for IAM (${i}/${tries})`);
      await sleep(5000);
    }
  }
}

// The versions the image pins: exactly what this Mac runs, so a conversation
// started in the cloud resumes here and the other way round.
function versions() {
  const claude = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim().split(/\s+/)[0];
  if (!/^\d+\.\d+\.\d+$/.test(claude)) throw new Error(`could not read the Claude Code version from "${claude}"`);
  const codex = (execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim().match(/(\d+\.\d+\.\d+)/) || [])[1];
  if (!codex) throw new Error('could not read the Codex version');
  return { claude, codex };
}

/**
 * The sandbox's own role: pull its image and write its own logs. Customer
 * code runs as root beside it, so nothing wider (a runtime's log groups are
 * named after it: `<runtime name>-<id>`).
 */
export function runtimeRolePolicy({ region, account, repo, runtime }) {
  return {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['ecr:GetAuthorizationToken'], Resource: '*' },
      { Effect: 'Allow', Action: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'], Resource: `arn:aws:ecr:${region}:${account}:repository/${repo}` },
      { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'], Resource: `arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/${runtime}-*` },
      // Discovery is asked of every group, as AWS's own runtime role does.
      { Effect: 'Allow', Action: ['logs:DescribeLogGroups'], Resource: `arn:aws:logs:${region}:${account}:log-group:*` },
    ],
  };
}

function ensureRole(name, trustService, policy) {
  const trust = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: trustService }, Action: 'sts:AssumeRole' }] });
  let role = aws(['iam', 'get-role', '--role-name', name], { allowFail: true })?.Role;
  if (!role) {
    say(`making role ${name}`);
    role = aws(['iam', 'create-role', '--role-name', name, '--assume-role-policy-document', trust]).Role;
  }
  aws(['iam', 'put-role-policy', '--role-name', name, '--policy-name', `${name}-policy`, '--policy-document', JSON.stringify(policy)], { json: false });
  return role.Arn;
}

function ensureBucket(bucket) {
  // head-bucket prints nothing when the bucket is there, and fails when not.
  if (aws(['s3api', 'head-bucket', '--bucket', bucket], { allowFail: true, json: false }) === null) {
    say(`making bucket ${bucket}`);
    aws(['s3api', 'create-bucket', '--bucket', bucket], { json: false });
  }
  aws(['s3api', 'put-public-access-block', '--bucket', bucket, '--public-access-block-configuration',
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'], { json: false });
  aws(['s3api', 'put-bucket-lifecycle-configuration', '--bucket', bucket, '--lifecycle-configuration', JSON.stringify({
    Rules: [
      { ID: 'runs-expire', Status: 'Enabled', Filter: { Prefix: 'runs/' }, Expiration: { Days: 7 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } },
      { ID: 'builds-expire', Status: 'Enabled', Filter: { Prefix: 'build/' }, Expiration: { Days: 30 } },
    ],
  })], { json: false });
}

function ensureRepo() {
  const found = aws(['ecr', 'describe-repositories', '--repository-names', NAMES.repo], { allowFail: true })?.repositories?.[0];
  if (found) return found.repositoryUri;
  say(`making image repository ${NAMES.repo}`);
  return aws(['ecr', 'create-repository', '--repository-name', NAMES.repo, '--image-scanning-configuration', 'scanOnPush=true']).repository.repositoryUri;
}

const BUILDSPEC = `version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin \${REPO_URI%%/*}
  build:
    commands:
      - docker build --build-arg CLAUDE_CODE_VERSION=$CLAUDE_CODE_VERSION --build-arg CODEX_VERSION=$CODEX_VERSION -t $REPO_URI:$IMAGE_TAG .
  post_build:
    commands:
      - docker push $REPO_URI:$IMAGE_TAG
`;

function ensureBuildProject(bucket, roleArn) {
  const env = 'type=ARM_CONTAINER,image=aws/codebuild/amazonlinux-aarch64-standard:3.0,computeType=BUILD_GENERAL1_SMALL,privilegedMode=true';
  const existing = aws(['codebuild', 'batch-get-projects', '--names', NAMES.build]).projects?.[0];
  const args = ['--source', `type=S3,location=${bucket}/build/source.zip`, '--artifacts', 'type=NO_ARTIFACTS', '--environment', env, '--service-role', roleArn];
  if (existing) aws(['codebuild', 'update-project', '--name', NAMES.build, ...args]);
  else { say(`making build project ${NAMES.build}`); aws(['codebuild', 'create-project', '--name', NAMES.build, ...args]); }
}

function imageTag(v) {
  const h = crypto.createHash('sha256');
  h.update(`${v.claude}/${v.codex}`);
  for (const f of IMAGE_FILES) h.update(fs.readFileSync(path.join(SANDBOX, f)));
  h.update(BUILDSPEC);
  return `cc${v.claude}-cx${v.codex}-${h.digest('hex').slice(0, 10)}`;
}

async function buildImage(bucket, repoUri, v, tag) {
  const already = aws(['ecr', 'describe-images', '--repository-name', NAMES.repo, '--image-ids', `imageTag=${tag}`], { allowFail: true });
  if (already?.imageDetails?.length && !process.argv.includes('--rebuild')) { say(`image ${tag} already built`); return `${repoUri}:${tag}`; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-sandbox-src-'));
  for (const f of IMAGE_FILES) fs.copyFileSync(path.join(SANDBOX, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'buildspec.yml'), BUILDSPEC);
  const zip = path.join(dir, 'source.zip');
  execFileSync('zip', ['-q', '-j', zip, ...IMAGE_FILES.map((f) => path.join(dir, f)), path.join(dir, 'buildspec.yml')]);
  const key = `build/source-${tag}.zip`;
  aws(['s3', 'cp', zip, `s3://${bucket}/${key}`, '--only-show-errors'], { json: false });
  fs.rmSync(dir, { recursive: true, force: true });
  say(`building image ${tag} in CodeBuild (a few minutes)`);
  const build = await retrying('start build', () => aws(['codebuild', 'start-build', '--project-name', NAMES.build,
    '--source-location-override', `${bucket}/${key}`,
    '--environment-variables-override',
    `name=REPO_URI,value=${repoUri},type=PLAINTEXT`,
    `name=IMAGE_TAG,value=${tag},type=PLAINTEXT`,
    `name=CLAUDE_CODE_VERSION,value=${v.claude},type=PLAINTEXT`,
    `name=CODEX_VERSION,value=${v.codex},type=PLAINTEXT`]).build);
  for (;;) {
    await sleep(10_000);
    const b = aws(['codebuild', 'batch-get-builds', '--ids', build.id]).builds[0];
    if (b.buildStatus === 'IN_PROGRESS') continue;
    if (b.buildStatus !== 'SUCCEEDED') throw new Error(`image build ${b.buildStatus}: see CodeBuild build ${b.id}`);
    break;
  }
  say(`image ${tag} built`);
  return `${repoUri}:${tag}`;
}

async function ensureRuntime(containerUri, roleArn) {
  const list = aws(['bedrock-agentcore-control', 'list-agent-runtimes']).agentRuntimes || [];
  const found = list.find((r) => r.agentRuntimeName === NAMES.runtime);
  const common = [
    '--agent-runtime-artifact', JSON.stringify({ containerConfiguration: { containerUri } }),
    '--role-arn', roleArn,
    '--network-configuration', JSON.stringify({ networkMode: 'PUBLIC' }),
    '--protocol-configuration', JSON.stringify({ serverProtocol: 'HTTP' }),
    '--lifecycle-configuration', JSON.stringify({ idleRuntimeSessionTimeout: 900, maxLifetime: 28800 }),
  ];
  let id;
  if (found) {
    id = found.agentRuntimeId;
    const current = aws(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', id]);
    if (current.agentRuntimeArtifact?.containerConfiguration?.containerUri !== containerUri) {
      say('pointing the runtime at the new image');
      await retrying('update runtime', () => aws(['bedrock-agentcore-control', 'update-agent-runtime', '--agent-runtime-id', id, ...common]));
    }
  } else {
    say(`making AgentCore runtime ${NAMES.runtime}`);
    id = (await retrying('create runtime', () => aws(['bedrock-agentcore-control', 'create-agent-runtime', '--agent-runtime-name', NAMES.runtime, ...common]))).agentRuntimeId;
  }
  for (;;) {
    const r = aws(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', id]);
    if (r.status === 'READY') return { id, arn: r.agentRuntimeArn };
    if (/FAILED/.test(r.status)) throw new Error(`runtime ${r.status}: ${r.failureReason || 'no reason given'}`);
    await sleep(5000);
  }
}

function ensureAppUser(bucket, runtimeArn) {
  if (!aws(['iam', 'get-user', '--user-name', NAMES.appUser], { allowFail: true })) {
    say(`making the app's user ${NAMES.appUser}`);
    aws(['iam', 'create-user', '--user-name', NAMES.appUser]);
  }
  const policy = {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:StopRuntimeSession'], Resource: [runtimeArn, `${runtimeArn}/*`] },
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: `arn:aws:s3:::${bucket}/runs/*` },
      // Each account's cloud sign-in (main/cloud/logins.mjs). The app only
      // presigns links to these for the sandbox, which carry the signer's
      // rights, and deletes the ones a newer sign-in replaced. No expiry rule
      // covers logins/.
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: `arn:aws:s3:::${bucket}/logins/*` },
      // Without list rights S3 answers a missing object with 403, not 404, and
      // "this run uploaded no transcript" would read as a refusal.
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: `arn:aws:s3:::${bucket}`, Condition: { StringLike: { 's3:prefix': ['runs/*'] } } },
    ],
  };
  aws(['iam', 'put-user-policy', '--user-name', NAMES.appUser, '--policy-name', `${NAMES.appUser}-policy`, '--policy-document', JSON.stringify(policy)], { json: false });
  // The key on disk is kept if AWS still knows it. A key this Mac does not
  // hold is NEVER retired from here: it may be another Mac's, mid-run. AWS
  // allows two keys per user, so a third Mac is told to free one by hand.
  let onDisk = null;
  try {
    onDisk = execFileSync('aws', ['configure', 'get', 'aws_access_key_id', '--profile', NAMES.profile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch { /* no such profile yet */ }
  const keys = aws(['iam', 'list-access-keys', '--user-name', NAMES.appUser]).AccessKeyMetadata || [];
  if (onDisk && keys.some((k) => k.AccessKeyId === onDisk)) return;
  if (keys.length >= 2) {
    throw new Error(`the app's user ${NAMES.appUser} already has two keys, held by other Macs; delete one in IAM if a Mac is gone, then run this again`);
  }
  const key = aws(['iam', 'create-access-key', '--user-name', NAMES.appUser]).AccessKey;
  execFileSync('aws', ['configure', 'set', 'aws_access_key_id', key.AccessKeyId, '--profile', NAMES.profile]);
  execFileSync('aws', ['configure', 'set', 'aws_secret_access_key', key.SecretAccessKey, '--profile', NAMES.profile]);
  execFileSync('aws', ['configure', 'set', 'region', REGION, '--profile', NAMES.profile]);
  say(`the app's key is in ~/.aws/credentials as the ${NAMES.profile} profile`);
}

async function main() {
  const who = aws(['sts', 'get-caller-identity']);
  const account = who.Account;
  const bucket = `agentbox-cloud-${account}`;
  say(`account ${account}, ${REGION}`);
  const version = versions();

  ensureBucket(bucket);
  const repoUri = ensureRepo();
  const buildRoleArn = ensureRole(NAMES.buildRole, 'codebuild.amazonaws.com', {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['ecr:GetAuthorizationToken'], Resource: '*' },
      { Effect: 'Allow', Action: ['ecr:BatchCheckLayerAvailability', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:PutImage', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'], Resource: `arn:aws:ecr:${REGION}:${account}:repository/${NAMES.repo}` },
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:GetObjectVersion'], Resource: `arn:aws:s3:::${bucket}/build/*` },
      { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `arn:aws:logs:${REGION}:${account}:log-group:/aws/codebuild/${NAMES.build}*` },
    ],
  });
  const runtimeRoleArn = ensureRole(NAMES.runtimeRole, 'bedrock-agentcore.amazonaws.com', runtimeRolePolicy({ region: REGION, account, repo: NAMES.repo, runtime: NAMES.runtime }));
  await retrying('build project', () => ensureBuildProject(bucket, buildRoleArn));
  const tag = imageTag(version);
  const containerUri = await buildImage(bucket, repoUri, version, tag);
  const runtime = await ensureRuntime(containerUri, runtimeRoleArn);
  ensureAppUser(bucket, runtime.arn);

  const config = { region: REGION, bucket, runtimeArn: runtime.arn, runtimeId: runtime.id, image: containerUri, claudeCodeVersion: version.claude, codexVersion: version.codex, profile: NAMES.profile, madeAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  say(`done; wrote ${CONFIG_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(`cloud-setup: ${err.message}`); process.exit(1); });
}
