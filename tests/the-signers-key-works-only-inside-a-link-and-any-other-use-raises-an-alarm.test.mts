// THE SIGNER'S KEY WORKS ONLY INSIDE A LINK, AND ANY OTHER USE RAISES AN ALARM.
//
// What was wrong (2026-10-22, before Agentbox Cloud opened to strangers): the
// cloud server signs every link with one IAM user's key
// (`agentbox-gateway-signer`, kept in Secrets Manager). That key could read
// and write every person's runs and every saved Claude and Codex sign-in, and
// list both, by any means, not only through a link. Its only legitimate use
// is to sign links, so it never makes an AWS call itself, and nothing would
// have noticed if it did: no trail, no alarm, and the key never changed.
// Checked with the app's own AWS login on 2026-10-22: CloudTrail, CloudWatch,
// SNS, IAM and GuardDuty all refuse it, so what exists could not be seen from
// here, and scripts/cloud-gateway-setup.mjs made none of it.
//
// Now the signer's rights hold only for requests signed in a link's query
// string, it cannot list sign-ins, its key is replaced after 90 days (the old
// one kept until its last link has expired), and a trail of the account's
// management events and of reads and writes of sign-ins raises an alarm, by
// email, at any management call by the signer or any use of its key outside
// a link.
import { describe, it, expect } from 'vitest';
import {
  signerPolicy, signerKeyPlan, SIGNER_KEY_DAYS, trailSelectors, signerMisuse, trailBucketPolicy,
  trailLogsPolicy, alarmEmail, gatewayAlarms,
} from '../scripts/cloud-gateway-setup.mjs';

const where = { bucket: 'agentbox-cloud-x', region: 'us-east-1', account: '000000000000' };
const SIGNER = 'arn:aws:iam::000000000000:user/agentbox-gateway-signer';
const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;

describe('the signer\'s rights', () => {
  it('every one of them holds only for a request signed in a link', () => {
    for (const s of signerPolicy(where).Statement) {
      expect(s.Effect).toBe('Allow');
      expect(s.Condition.StringEquals['s3:authType']).toBe('REST-QUERY-STRING');
    }
  });

  it('may list runs, so a missing run file answers 404, and never sign-ins, so a stolen key cannot find one', () => {
    const list = signerPolicy(where).Statement.filter((s) => [].concat(s.Action).includes('s3:ListBucket'));
    expect(list).toHaveLength(1);
    expect(list[0].Condition.StringLike['s3:prefix']).toEqual(['runs/*']);
  });
});

describe('the signer\'s key', () => {
  const now = Date.UTC(2026, 9, 22);
  const made = (days) => now - days * DAY;

  it('is kept until it is 90 days old; at that age a new one is made and the old one retired, not deleted', () => {
    expect(SIGNER_KEY_DAYS).toBe(90);
    expect(signerKeyPlan({ inUse: 'K1', keys: [{ id: 'K1', made: made(89) }], now })).toEqual({ keep: 'K1', retire: null, remove: [], make: false });
    expect(signerKeyPlan({ inUse: 'K1', keys: [{ id: 'K1', made: made(90) - 1 }], now })).toEqual({ keep: null, retire: 'K1', remove: [], make: true });
  });

  it('a retired key stays while links it signed can still be used, and goes after', () => {
    const keys = [{ id: 'K1', made: made(91) }, { id: 'K2', made: made(1) }];
    expect(signerKeyPlan({ inUse: 'K2', keys, previous: { id: 'K1', at: now - 12 * HOUR }, now })).toEqual({ keep: 'K2', retire: null, remove: [], make: false });
    expect(signerKeyPlan({ inUse: 'K2', keys, previous: { id: 'K1', at: now - 13 * HOUR - 1 }, now })).toEqual({ keep: 'K2', retire: null, remove: ['K1'], make: false });
  });

  it('an old key with a retired one still waiting is kept for now, as IAM holds two at most', () => {
    const keys = [{ id: 'K1', made: made(200) }, { id: 'K2', made: made(95) }];
    expect(signerKeyPlan({ inUse: 'K2', keys, previous: { id: 'K1', at: now - HOUR }, now })).toEqual({ keep: 'K2', retire: null, remove: [], make: false });
  });

  it('any key that is neither in use nor waiting is deleted, and with none in use a new one is made', () => {
    expect(signerKeyPlan({ inUse: 'K2', keys: [{ id: 'K1', made: made(1) }, { id: 'K2', made: made(1) }], now })).toEqual({ keep: 'K2', retire: null, remove: ['K1'], make: false });
    expect(signerKeyPlan({ inUse: null, keys: [{ id: 'K1', made: made(1) }, { id: 'K2', made: made(2) }], now })).toEqual({ keep: null, retire: null, remove: ['K1', 'K2'], make: true });
    expect(signerKeyPlan({ inUse: 'K9', keys: [{ id: 'K1', made: made(1) }], now })).toEqual({ keep: null, retire: null, remove: ['K1'], make: true });
  });
});

describe('the trail', () => {
  it('records the account\'s management events and the reads and writes of sign-ins in our bucket, and not every run file', () => {
    const [management, signins, ...rest] = trailSelectors(where);
    expect(rest).toEqual([]);
    expect(management.FieldSelectors).toEqual([{ Field: 'eventCategory', Equals: ['Management'] }]);
    expect(signins.FieldSelectors).toEqual([
      { Field: 'eventCategory', Equals: ['Data'] },
      { Field: 'resources.type', Equals: ['AWS::S3::Object'] },
      { Field: 'resources.ARN', StartsWith: ['arn:aws:s3:::agentbox-cloud-x/logins/'] },
    ]);
  });

  it('its bucket takes writes only from this trail, under this account\'s own folder', () => {
    const p = trailBucketPolicy({ trailBucket: 'agentbox-trail-x', trailArn: 'arn:aws:cloudtrail:us-east-1:000000000000:trail/agentbox-gateway-trail', account: '000000000000' });
    for (const s of p.Statement) {
      expect(s.Principal).toEqual({ Service: 'cloudtrail.amazonaws.com' });
      expect(s.Condition.StringEquals['aws:SourceArn']).toBe('arn:aws:cloudtrail:us-east-1:000000000000:trail/agentbox-gateway-trail');
    }
    const write = p.Statement.find((s) => s.Action === 's3:PutObject');
    expect(write.Resource).toBe('arn:aws:s3:::agentbox-trail-x/AWSLogs/000000000000/*');
  });

  it('writes only to its own log group', () => {
    const p = trailLogsPolicy({ ...where, logGroup: '/agentbox/cloudtrail' });
    expect(p.Statement).toHaveLength(1);
    expect(p.Statement[0].Action.sort()).toEqual(['logs:CreateLogStream', 'logs:PutLogEvents']);
    expect(p.Statement[0].Resource).toBe('arn:aws:logs:us-east-1:000000000000:log-group:/agentbox/cloudtrail:log-stream:*');
  });
});

describe('what raises the alarm', () => {
  const misuse = signerMisuse(SIGNER);
  const presigned = (eventName, key) => ({ eventCategory: 'Data', eventName, userIdentity: { arn: SIGNER }, additionalEventData: { AuthenticationMethod: 'QueryString' }, requestParameters: { key } });

  it('any management call by the signer, allowed or not', () => {
    expect(misuse.matches({ eventCategory: 'Management', eventName: 'GetCallerIdentity', userIdentity: { arn: SIGNER } })).toBe(true);
    expect(misuse.matches({ eventCategory: 'Management', eventName: 'ListBuckets', errorCode: 'AccessDenied', userIdentity: { arn: SIGNER } })).toBe(true);
  });

  it('the signer\'s key used on a sign-in outside a link', () => {
    expect(misuse.matches({ ...presigned('GetObject', 'logins/u-x/claude/a.json'), additionalEventData: { AuthenticationMethod: 'AuthHeader' } })).toBe(true);
  });

  it('never a link doing its job, nor anyone else\'s call', () => {
    expect(misuse.matches(presigned('GetObject', 'logins/u-x/claude/a.json'))).toBe(false);
    expect(misuse.matches(presigned('PutObject', 'logins/u-x/claude/a.json'))).toBe(false);
    expect(misuse.matches({ eventCategory: 'Management', eventName: 'GetSecretValue', userIdentity: { arn: 'arn:aws:sts::000000000000:assumed-role/agentbox-gateway-role/agentbox-gateway' } })).toBe(false);
    expect(misuse.matches({ eventCategory: 'Management', eventName: 'GetCallerIdentity', userIdentity: { arn: `${SIGNER}-not` } })).toBe(false);
  });

  it('is said to CloudWatch as the same rule', () => {
    expect(misuse.pattern).toBe(`{ ($.userIdentity.arn = "${SIGNER}") && (($.eventCategory = "Management") || ($.additionalEventData.AuthenticationMethod = "AuthHeader")) }`);
  });
});

describe('the alarms', () => {
  const alarms = gatewayAlarms({ topicArn: 'arn:aws:sns:us-east-1:000000000000:agentbox-gateway-alarm', signerArn: SIGNER });

  it('one use of the signer\'s key outside a link is enough, and silence is not an alarm', () => {
    const a = alarms.find((x) => x.name === 'agentbox-gateway-signer-misused');
    expect(a).toMatchObject({ logGroup: '/agentbox/cloudtrail', threshold: 1, periodSeconds: 300, missing: 'notBreaching', actions: ['arn:aws:sns:us-east-1:000000000000:agentbox-gateway-alarm'] });
    expect(a.pattern).toBe(signerMisuse(SIGNER).pattern);
  });

  it('someone reaching their storage cap is said too, from the server\'s own log', () => {
    const a = alarms.find((x) => x.name === 'agentbox-gateway-storage-cap');
    expect(a).toMatchObject({ logGroup: '/aws/lambda/agentbox-gateway', threshold: 1, missing: 'notBreaching' });
    expect(a.pattern).toBe('?"cloud storage is full" ?"over twice the"');
  });

  it('none of them goes to the budget\'s topic, which pauses every new run', () => {
    for (const a of alarms) expect(a.actions.some((x) => x.endsWith(':agentbox-gateway-budget'))).toBe(false);
  });
});

describe('where the alarm is emailed', () => {
  it('the address given wins; else the one the budget already emails; else none', () => {
    const subscribers = [{ SubscriptionType: 'SNS', Address: 'arn:aws:sns:x' }, { SubscriptionType: 'EMAIL', Address: 'owner@example.com' }];
    expect(alarmEmail({ argv: ['--alarm-email', 'ops@example.com'], subscribers })).toBe('ops@example.com');
    expect(alarmEmail({ argv: [], subscribers })).toBe('owner@example.com');
    expect(alarmEmail({ argv: [], subscribers: [{ SubscriptionType: 'SNS', Address: 'arn:aws:sns:x' }] })).toBe(null);
    expect(alarmEmail({ argv: ['--alarm-email'], subscribers: null })).toBe(null);
  });
});
