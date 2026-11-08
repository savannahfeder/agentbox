// THE APP REVIEW COMPUTER: a small AWS server that stays on and signed in to the
// phone app's demo account while Apple reviews it, so a reviewer's replies are
// answered for days with no computer of theirs. The cloud alone goes quiet 20
// minutes after an answer (IDLE_CLOSE_MS, cloud/gateway/phone.mjs).
//
// It always ends. Each machine has an end date (14 days unless --days says
// otherwise, 30 at most), held three ways:
//   1. the machine shuts itself down then, counted again at every boot, and
//      AWS deletes it on shutdown rather than keeping it stopped;
//   2. an AWS schedule deletes it then, whatever the machine is doing;
//   3. `off` deletes it, its schedule, its key and its firewall rule at once.
// It makes no second machine while one exists.
//
//   REVIEW_EMAIL=… REVIEW_PASSWORD=… CLAUDE_CODE_OAUTH_TOKEN=… node scripts/app-review-computer.mjs on [--days 14]
//   node scripts/app-review-computer.mjs status
//   node scripts/app-review-computer.mjs off
//
// CLAUDE_CODE_OAUTH_TOKEN comes from `claude setup-token`. Needs the aws CLI
// signed in. The password and token go over SSH to a file only root reads,
// never into the machine's user data, which anyone with EC2 access can read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DAYS = 14;
export const MAX_DAYS = 30;
const PURPOSE = 'app-review';
const NAME = 'agentbox-app-review';
const ROLE = `${NAME}-scheduler`;
const PORT = 7777;
const ON_STATES = ['pending', 'running', 'stopping', 'stopped'];
const UBUNTU = '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id';
const DAY_MS = 24 * 60 * 60_000;

export function expiryOf(now, days = DEFAULT_DAYS) {
  if (!Number.isFinite(days) || days < 1) throw new Error('--days must be a whole number of days, 1 or more');
  if (days > MAX_DAYS) throw new Error(`The review computer is kept ${MAX_DAYS} days at most`);
  return new Date(now + Math.round(days) * DAY_MS).toISOString();
}

export const hoursLeft = (expiresAt, now) => Math.max(0, Math.round((Date.parse(expiresAt) - now) / 3_600_000));

export function refuseSecond(instances) {
  const on = instances.filter((i) => ON_STATES.includes(i.State?.Name));
  if (on.length) throw new Error(`A review computer is already on: ${on.map((i) => i.InstanceId).join(', ')}. Run \`off\` first, or \`status\`.`);
}

export function envFileOf({ email, password, claudeToken }) {
  for (const [k, v] of Object.entries({ email, password, claudeToken })) {
    if (typeof v !== 'string' || !v || /[\r\n]/.test(v)) throw new Error(`${k} is missing or has a line break`);
  }
  return `AGENTBOX_TEAM_TEST_LOGIN=${email}:${password}\nCLAUDE_CODE_OAUTH_TOKEN=${claudeToken}\n`;
}

/** What the machine runs at its first boot. No secrets: those arrive over SSH. */
export function userDataOf({ expiresAt }) {
  const epoch = Math.floor(Date.parse(expiresAt) / 1000);
  return `#!/bin/bash
set -eux
# Guard one: shut down at the end date. Shutdown deletes the machine
# (--instance-initiated-shutdown-behavior terminate), and this runs at every boot.
cat >/usr/local/bin/agentbox-review-expiry <<'EOF'
#!/bin/bash
EXPIRES=${epoch}
left=$(( (EXPIRES - $(date +%s)) / 60 ))
if [ "$left" -le 1 ]; then shutdown -h now; else shutdown -h +$left; fi
EOF
chmod 755 /usr/local/bin/agentbox-review-expiry
cat >/etc/systemd/system/agentbox-review-expiry.service <<'EOF'
[Unit]
Description=Turn the App Review computer off at its end date
[Service]
Type=oneshot
ExecStart=/usr/local/bin/agentbox-review-expiry
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now agentbox-review-expiry

apt-get update
apt-get install -y git xz-utils
# Node from nodejs.org, checked against its published checksum.
NODE=v22.14.0
cd /tmp
curl -fsSLO https://nodejs.org/dist/$NODE/node-$NODE-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/$NODE/SHASUMS256.txt
grep " node-$NODE-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -
tar -xJf node-$NODE-linux-x64.tar.xz -C /usr/local --strip-components=1
cd /
npm install -g agentbox-app @anthropic-ai/claude-code
id agentbox || useradd -m -s /bin/bash agentbox

# The demo project the reviewer's agents work in.
sudo -u agentbox bash -c 'mkdir -p ~/demo && cd ~/demo && git init -q && printf "# Demo site\\n\\nA small page for trying Agentbox.\\n" > README.md && printf "<!doctype html><title>Demo</title><h1>Hello</h1>\\n" > index.html && git add -A && git -c user.name=Agentbox -c user.email=demo@agentbox.invalid commit -qm "A small page"'

cat >/etc/systemd/system/agentbox-review.service <<'EOF'
[Unit]
Description=Agentbox, signed in to the App Review demo account
After=network-online.target
ConditionPathExists=/etc/agentbox-review.env
[Service]
User=agentbox
WorkingDirectory=/home/agentbox
EnvironmentFile=/etc/agentbox-review.env
ExecStart=/usr/bin/env agentbox-app --no-open --port ${PORT}
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
`;
}

export function runInstancesArgs({ ami, securityGroup, keyName, userData, expiresAt }) {
  const tags = `{Key=Name,Value=${NAME}},{Key=agentbox:purpose,Value=${PURPOSE}},{Key=agentbox:expires,Value=${expiresAt}}`;
  return [
    'ec2', 'run-instances', '--image-id', ami, '--instance-type', 't3.medium', '--count', '1',
    '--key-name', keyName, '--security-group-ids', securityGroup,
    '--instance-initiated-shutdown-behavior', 'terminate',
    '--metadata-options', 'HttpTokens=required',
    '--block-device-mappings', JSON.stringify([{ DeviceName: '/dev/sda1', Ebs: { VolumeSize: 20, VolumeType: 'gp3', DeleteOnTermination: true } }]),
    '--user-data', userData,
    '--tag-specifications', `ResourceType=instance,Tags=[${tags}]`, `ResourceType=volume,Tags=[${tags}]`,
    '--query', 'Instances[0].InstanceId', '--output', 'text',
  ];
}

/** Guard two: AWS deletes the machine at the end date, once, then forgets the schedule. */
export function scheduleArgs({ instanceId, expiresAt, roleArn }) {
  return [
    'scheduler', 'create-schedule', '--name', `${NAME}-off-${instanceId}`,
    '--schedule-expression', `at(${expiresAt.slice(0, 19)})`, '--schedule-expression-timezone', 'UTC',
    '--flexible-time-window', 'Mode=OFF', '--action-after-completion', 'DELETE',
    '--target', JSON.stringify({ Arn: 'arn:aws:scheduler:::aws-sdk:ec2:terminateInstances', RoleArn: roleArn, Input: JSON.stringify({ InstanceIds: [instanceId] }) }),
  ];
}

const TRUST = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'scheduler.amazonaws.com' }, Action: 'sts:AssumeRole' }] };
const MAY_TERMINATE = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 'ec2:TerminateInstances', Resource: 'arn:aws:ec2:*:*:instance/*', Condition: { StringEquals: { [`aws:ResourceTag/agentbox:purpose`]: PURPOSE } } }] };

// ---- the commands, run on a Mac or Linux machine with the aws CLI signed in ----

const home = path.join(os.homedir(), '.agentbox', 'app-review');
const stateFile = path.join(home, 'computer.json');
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const aws = (args, input) => execFileSync('aws', [...args, '--region', region], { encoding: 'utf8', timeout: 120_000, input }).trim();
const awsJson = (args) => JSON.parse(aws([...args, '--output', 'json']) || 'null');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ours() {
  const out = awsJson(['ec2', 'describe-instances', '--filters', `Name=tag:agentbox:purpose,Values=${PURPOSE}`]);
  return (out?.Reservations ?? []).flatMap((r) => r.Instances ?? []);
}

function ensureRole() {
  try { return aws(['iam', 'get-role', '--role-name', ROLE, '--query', 'Role.Arn', '--output', 'text']); } catch { /* made below */ }
  const arn = aws(['iam', 'create-role', '--role-name', ROLE, '--assume-role-policy-document', JSON.stringify(TRUST), '--query', 'Role.Arn', '--output', 'text']);
  aws(['iam', 'put-role-policy', '--role-name', ROLE, '--policy-name', 'terminate-the-review-computer', '--policy-document', JSON.stringify(MAY_TERMINATE)]);
  return arn;
}

async function ssh(state, command, { input, timeout = 120_000 } = {}) {
  return execFileSync('ssh', ['-i', state.keyFile, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', `ubuntu@${state.ip}`, command], { encoding: 'utf8', timeout, input });
}

async function on(days) {
  refuseSecond(ours());
  const login = envFileOf({ email: process.env.REVIEW_EMAIL, password: process.env.REVIEW_PASSWORD, claudeToken: process.env.CLAUDE_CODE_OAUTH_TOKEN });
  const expiresAt = expiryOf(Date.now(), days);
  const stamp = Date.now().toString(36);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const keyName = `${NAME}-${stamp}`;
  const keyFile = path.join(home, `${keyName}.pem`);
  fs.writeFileSync(keyFile, aws(['ec2', 'create-key-pair', '--key-name', keyName, '--query', 'KeyMaterial', '--output', 'text']) + '\n', { mode: 0o600 });
  const myIp = (await (await fetch('https://checkip.amazonaws.com', { signal: AbortSignal.timeout(10_000) })).text()).trim();
  const vpc = aws(['ec2', 'describe-vpcs', '--filters', 'Name=isDefault,Values=true', '--query', 'Vpcs[0].VpcId', '--output', 'text']);
  const securityGroup = aws(['ec2', 'create-security-group', '--group-name', keyName, '--description', 'SSH to the App Review computer from the Mac that made it', '--vpc-id', vpc, '--query', 'GroupId', '--output', 'text']);
  aws(['ec2', 'authorize-security-group-ingress', '--group-id', securityGroup, '--protocol', 'tcp', '--port', '22', '--cidr', `${myIp}/32`]);
  const ami = aws(['ssm', 'get-parameter', '--name', UBUNTU, '--query', 'Parameter.Value', '--output', 'text']);
  const instanceId = aws(runInstancesArgs({ ami, securityGroup, keyName, userData: userDataOf({ expiresAt }), expiresAt }));
  const state = { instanceId, region, expiresAt, keyName, keyFile, securityGroup, ip: null };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(`Started ${instanceId}. It deletes itself on ${expiresAt} at the latest.`);
  try {
    aws(scheduleArgs({ instanceId, expiresAt, roleArn: ensureRole() }));
    console.log('AWS will also delete it then, whatever it is doing.');
  } catch (err) {
    console.error(`The AWS schedule could not be made (${String(err.message).split('\n')[0]}); the machine still shuts itself down then.`);
  }
  aws(['ec2', 'wait', 'instance-running', '--instance-ids', instanceId]);
  state.ip = aws(['ec2', 'describe-instances', '--instance-ids', instanceId, '--query', 'Reservations[0].Instances[0].PublicIpAddress', '--output', 'text']);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  for (let i = 0; ; i++) {
    try { await ssh(state, 'true', { timeout: 20_000 }); break; } catch (err) { if (i >= 30) throw err; await sleep(10_000); }
  }
  await ssh(state, 'cloud-init status --wait', { timeout: 30 * 60_000 });
  await ssh(state, 'sudo install -m 600 /dev/stdin /etc/agentbox-review.env && sudo systemctl enable --now agentbox-review', { input: login });
  console.log(`Signed in and running. To open it from this Mac:\n  ssh -i ${keyFile} -N -L ${PORT}:127.0.0.1:${PORT} ubuntu@${state.ip}\nthen the address in: ssh -i ${keyFile} ubuntu@${state.ip} journalctl -u agentbox-review`);
}

function status() {
  const all = ours().filter((i) => i.State?.Name !== 'terminated');
  if (!all.length) { console.log('No review computer exists.'); return; }
  for (const i of all) {
    const expires = i.Tags?.find((t) => t.Key === 'agentbox:expires')?.Value ?? 'none';
    console.log(`${i.InstanceId} ${i.State.Name} ${i.PublicIpAddress ?? ''} ends ${expires} (${expires === 'none' ? '?' : hoursLeft(expires, Date.now())} hours left)`);
  }
}

async function off() {
  const all = ours().filter((i) => i.State?.Name !== 'terminated');
  const ids = all.map((i) => i.InstanceId);
  if (ids.length) {
    aws(['ec2', 'terminate-instances', '--instance-ids', ...ids]);
    console.log(`Deleting ${ids.join(', ')}.`);
    aws(['ec2', 'wait', 'instance-terminated', '--instance-ids', ...ids]);
  }
  for (const id of ids) { try { aws(['scheduler', 'delete-schedule', '--name', `${NAME}-off-${id}`]); } catch { /* ran or never made */ } }
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
  if (state) {
    try { aws(['ec2', 'delete-security-group', '--group-id', state.securityGroup]); } catch { /* already gone */ }
    try { aws(['ec2', 'delete-key-pair', '--key-name', state.keyName]); } catch { /* already gone */ }
    fs.rmSync(state.keyFile, { force: true });
    fs.rmSync(stateFile, { force: true });
  }
  console.log(ids.length ? 'The review computer is gone.' : 'No review computer was on.');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const at = rest.indexOf('--days');
  if (cmd === 'on') await on(at === -1 ? DEFAULT_DAYS : Number(rest[at + 1]));
  else if (cmd === 'status') status();
  else if (cmd === 'off') await off();
  else { console.error('usage: app-review-computer.mjs on [--days N] | status | off'); process.exitCode = 2; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
