// A HANDED-OVER FILE SHOWS ONCE, NOT AS THE SENDER'S PATH TOO.
//
// Found by the third team test on w-1fc102959f (2026-11-09) by all three
// testers, then reproduced in two copies: Theo gave Maya a thread whose agent
// had made a table and two new versions. The task's "Where it got to" names
// each file by Theo's own disk path, and the copies that came across sit in
// attachments/ under a content prefix. Maya's task drew both: six tiles for
// three files, the three on Theo's paths stuck "On its way" or "Not delivered:
// the file was not found on the sender's computer", since nothing can bring a
// path on someone else's disk. They sat at the foot of the task, so after
// Maya replied they read as files she had attached and failed to send.
//
// Pinned: a full path whose file came across as an attachment is left out;
// one that did not come across stays (it still tells the reader something);
// two different files of one name in two folders both stay.
import { describe, it, expect } from 'vitest';
import { withoutBareTwins } from '../renderer/src/file-glance.ts';

const theo = '/tmp/agentbox-verify/instances/x-theo/store/accounts/a/payments-api/designs/w-1';

describe("a task's files", () => {
  it('drop the sender\'s path when its copy arrived', () => {
    const paths = [`${theo}/rows-v3.csv`, 'attachments/0a1b2c3d4e5f-rows-v3.csv', `${theo}/rows.csv`, 'attachments/9f8e7d6c5b4a-rows.csv'];
    expect(withoutBareTwins(paths)).toEqual(['attachments/0a1b2c3d4e5f-rows-v3.csv', 'attachments/9f8e7d6c5b4a-rows.csv']);
  });

  it('know a handed-on copy by its own prefix too', () => {
    expect(withoutBareTwins([`${theo}/rows-v3.csv`, 'attachments/mw94aqml-7ooz52-rows-v3.csv'])).toEqual(['attachments/mw94aqml-7ooz52-rows-v3.csv']);
  });

  // After the hand-on fix the task links only the copy, and its label was read as a second, bare file.
  it('drop a link\'s bare label when the copy it links is there', () => {
    expect(withoutBareTwins(['attachments/mw94slxi-ss0apq-rows.csv', 'rows.csv'])).toEqual(['attachments/mw94slxi-ss0apq-rows.csv']);
    expect(withoutBareTwins(['attachments/mw94slxi-ss0apq-rows.csv', 'other.csv'])).toEqual(['attachments/mw94slxi-ss0apq-rows.csv', 'other.csv']);
  });

  it('keep the sender\'s path when nothing came across for it', () => {
    expect(withoutBareTwins([`${theo}/rows-v2.csv`, 'attachments/0a1b2c3d4e5f-rows-v3.csv'])).toEqual([`${theo}/rows-v2.csv`, 'attachments/0a1b2c3d4e5f-rows-v3.csv']);
  });

  it('keep two files of one name in two folders of your own', () => {
    expect(withoutBareTwins(['designs/w-1/plan.md', 'reports/plan.md'])).toEqual(['designs/w-1/plan.md', 'reports/plan.md']);
  });

  it('still drop a bare name when a path to it is there', () => {
    expect(withoutBareTwins(['plan.md', 'designs/w-1/plan.md'])).toEqual(['designs/w-1/plan.md']);
  });
});
