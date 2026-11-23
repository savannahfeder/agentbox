// A PASTED SIGN-IN CODE REACHES THE AGENT WHOLE (w-abab5aca62).
//
// An agent ran `aws login --remote` and put its link on a card that takes the
// code AWS's page shows once you sign in. The person signed in and pasted the
// code. The agent was handed its first 80 characters, and AWS refused them:
// "Failed to retrieve an auth_code or state from the verification code".
// Measured on that thread: the answer on the row was exactly 80 characters,
// the start of a base64 code that carries a whole encrypted token and a state.
// The card's answer kept at most 80 (shared/sign-in-ask.mts
// `cleanSignInAnswer`), and AWS's codes run to several hundred.
//
// A code now reaches the agent as it was pasted, up to the 4,096 characters
// the cloud machine's own sign-in takes, and one longer than that is refused
// rather than cut, since a cut code can only fail.
import { describe, it, expect } from 'vitest';
import { cleanSignInAnswer } from '../shared/sign-in-ask.mts';
import { buildLine, foldWorkItems } from '../shared/work-items.mts';

const ID = 's-abcdef1234';
// Made up, the shape of AWS's: base64 of "code=<encrypted token>&state=<uuid>".
const AWS_CODE = Buffer.from(`code=eyJ6aXAiOiJERUYiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiZGlyIn0..${'x'.repeat(420)}.${'y'.repeat(22)}&state=00000000-1111-2222-3333-444444444444`).toString('base64');

describe('the code a person pastes into a sign-in card', () => {
  it('is kept whole when it is as long as an AWS code', () => {
    expect(AWS_CODE.length).toBeGreaterThan(600);
    expect(cleanSignInAnswer({ id: ID, said: 'code', code: AWS_CODE, at: 1 })?.code).toBe(AWS_CODE);
  });

  it('is kept whole on the thread, the way the agent reads it back', () => {
    const lines = [
      buildLine({ id: 'w-0a1b2c3d4e', patch: { title: 'Read the logs', status: 'open', kind: 'directive' }, source: 'system', now: 1 }),
      buildLine({ id: 'w-0a1b2c3d4e', patch: { signIn: { id: ID, service: 'AWS', url: 'https://us-east-1.signin.aws.amazon.com/v1/authorize', asksForCode: true, at: 2 } }, source: 'agent', now: 2 }),
      buildLine({ id: 'w-0a1b2c3d4e', patch: { signInAnswer: { id: ID, said: 'code', code: AWS_CODE, at: 3 } }, source: 'founder', now: 3 }),
    ];
    expect(foldWorkItems(lines).get('w-0a1b2c3d4e')?.signInAnswer?.code).toBe(AWS_CODE);
  });

  it('keeps a short code, like the ones gh and supabase show, as it was', () => {
    expect(cleanSignInAnswer({ id: ID, said: 'code', code: '  ABCD-1234 ', at: 1 })?.code).toBe('ABCD-1234');
  });

  it('is kept up to the 4,096 characters a cloud sign-in takes, and refused past them rather than cut', () => {
    expect(cleanSignInAnswer({ id: ID, said: 'code', code: 'a'.repeat(4096), at: 1 })?.code).toHaveLength(4096);
    expect(cleanSignInAnswer({ id: ID, said: 'code', code: 'a'.repeat(4097), at: 1 })).toBeUndefined();
  });

  it('is still refused when nothing was pasted', () => {
    expect(cleanSignInAnswer({ id: ID, said: 'code', code: '   ', at: 1 })).toBeUndefined();
  });
});
