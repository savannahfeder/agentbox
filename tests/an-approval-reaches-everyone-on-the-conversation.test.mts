// AN APPROVAL REACHES EVERYONE ON THE CONVERSATION, NOT ONLY THE FILE'S OWNER.
//
// Maya approved onboarding-b.png in the Lumen group at 06:13; a minute later
// Dev wrote "Building B unless Maya objects": he had not heard. Checked first,
// in fileNewsFor: an approval was news only to the file's owner (Sofia), the
// same rule as a comment, so nobody else in the group or on the thread got a
// Needs you row. An approval is a decision the people on the conversation act
// on, so it now reaches them too. A comment still reaches only its owner and
// whoever it names, and the one who approved hears nothing.
import { describe, it, expect } from 'vitest';
import { fileNewsFor } from '../shared/artifact-marks.mjs';
import { groupFileRow } from '../shared/room-needs-you.mjs';

const FILE = 'onboarding-b.png';
const approval = { file: FILE, by: 'maya', ts: 10, owner: 'sofia' };
const note = { id: 'n1', file: FILE, place: { kind: 'whole' }, text: 'Darker', by: 'maya', ts: 11, owner: 'sofia' };
const item = (people) => ({ createdBy: 'sofia', people, artifacts: { notes: [note], approvals: [approval], seen: {} } });

describe('on a thread', () => {
  it('reaches the owner', () => {
    expect(fileNewsFor(item(['sofia', 'maya', 'dev']), 'sofia').map((n) => n.kind)).toEqual(['approved', 'note']);
  });
  it('reaches someone else on the thread, with the approval only', () => {
    expect(fileNewsFor(item(['sofia', 'maya', 'dev']), 'dev').map((n) => n.kind)).toEqual(['approved']);
  });
  it('does not reach someone who is not on it', () => {
    expect(fileNewsFor(item(['sofia', 'maya']), 'dev')).toEqual([]);
  });
  it('does not reach the one who approved', () => {
    expect(fileNewsFor(item(['sofia', 'maya', 'dev']), 'maya')).toEqual([]);
  });
});

describe('in a group', () => {
  const marks = [{ id: 'm1', by: 'maya', at: 10, mark: { do: 'approve', file: FILE, owner: 'sofia' } }];
  it('reaches every member, saying who approved which file', () => {
    expect(groupFileRow({ roomId: 'r', roomName: 'Lumen', marks, me: 'dev', nameOf: (id) => id })).toMatchObject({ by: 'maya', body: 'approved onboarding-b.png' });
  });
  it('a comment in the group still reaches only the owner', () => {
    const said = [{ id: 'm2', by: 'maya', at: 10, mark: { do: 'note', id: 'n', file: FILE, place: { kind: 'whole' }, text: 'x', owner: 'sofia' } }];
    expect(groupFileRow({ roomId: 'r', roomName: 'Lumen', marks: said, me: 'dev' })).toBeNull();
  });
});
