// The judgements `npm run deploy` makes, kept pure so they can be tested
// without releasing anything (tests/one-command-puts-out-every-part-of-a-release).

const parts = (v) => String(v).replace(/^v/, '').split('.').map((n) => Number(n) || 0);

function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/**
 * The version to put out: main's own number when it is newer than everything
 * already on npm or the download page, otherwise the patch after the newest.
 * Main's package.json can then lag behind what is out, and that is fine: the
 * number only has to be new, and a lagging one used to stop the release.
 */
export function nextVersion(mainVersion, taken = []) {
  const newest = taken.reduce((best, v) => (best === null || compare(v, best) > 0 ? v : best), null);
  if (newest === null || compare(mainVersion, newest) > 0) return String(mainVersion).replace(/^v/, '');
  const [major, minor, patch] = parts(newest);
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * What a release page says. The version alone used to be all of it, so nothing
 * anywhere wrote down which commit became which release, and a build made from
 * that commit reported the older number main still carried (F-138).
 */
export function releaseNotes({ version, commit = '', sourceVersion = '' } = {}) {
  const head = `Agentbox ${version}`;
  if (!commit) return head;
  const lines = [head, '', `Built from https://github.com/savannahfeder/agentbox/commit/${commit}`];
  if (sourceVersion && sourceVersion !== version) {
    lines.push('', `That commit's package.json still says ${sourceVersion}. The version is picked when the release runs rather than committed, so a copy built from source calls itself ${sourceVersion}. This release is ${version}.`);
  }
  return lines.join('\n');
}

/**
 * Which file names the AWS account the cloud server runs in. cloud.json first,
 * then cloud.own-aws.json, which is where those details went when this Mac's
 * cloud.json became the managed cloud's address (2026-10-25). None means stop:
 * scripts/cloud-setup.mjs would make a second cloud beside the live one.
 */
export function serverConfig(files) {
  const order = Object.keys(files).sort((a, b) => (a.endsWith('/cloud.json') ? -1 : b.endsWith('/cloud.json') ? 1 : 0));
  return order.find((f) => files[f]?.bucket && files[f]?.runtimeArn) ?? null;
}

/** One line per place people get Agentbox from, and whether it now has this version. */
export function whatIsLive({ version, startedAt, npm, download, feed, server }) {
  const deployed = Date.parse(String(server ?? '').replace(/\+0000$/, 'Z'));
  return [
    { part: 'npm', ok: npm === version, saw: npm ?? 'could not read it' },
    { part: 'website download', ok: download === `v${version}`, saw: download ?? 'could not read it' },
    { part: 'update feed', ok: feed === version, saw: feed ?? 'could not read it' },
    { part: 'cloud server', ok: Number.isFinite(deployed) && deployed >= startedAt, saw: server ?? 'could not read it' },
  ];
}
