// SENDING TO A PERSON, OR HANDING A THREAD ON, SAYS IT WENT (2026-11-11).
//
// Two testers on one team, round two: "Send to Lena gives no visible
// confirmation: the same file and note remain on screen with Send to Lena
// still visible", and "the command bar closes; the thread shows no assignment
// or confirmation. Cannot tell if Theo got it." Measured from the code: a note
// on Lena's file empties the box and the button still reads Send to Lena,
// because it names the file's owner whatever is typed; the file view covers
// the app's toast. Share and a hand-off toasted only once the cloud answered,
// seconds after the press, for 2.5 s, so a look straight after the press found
// nothing; the hand-off said "Task sent to Theo Okafor".
//
// What must NOT happen: a send that failed says Sent, or a plain comment says
// it went to someone.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { noteSentWords } from '../renderer/src/artifact-pins.ts';
import { handedToWhom, sendingTo } from '../renderer/src/toast-parts.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');

describe('the note button once a note has gone', () => {
  it('says who it went to', () => {
    expect(noteSentWords('Send to Lena')).toBe('Sent to Lena');
    expect(noteSentWords('Send to your agent')).toBe('Sent to your agent');
  });

  it('says nothing for a comment kept on the file', () => {
    expect(noteSentWords('Comment')).toBe(null);
  });

  it('is shown only after the write came back ok, and the button keeps saying it until the next words', () => {
    expect(view).toMatch(/const went = noteSentWords\(sendWords\);/);
    const send = view.slice(view.indexOf('const send = async'), view.indexOf('const settle = async'));
    expect(send.indexOf("if (failed(out, 'That comment did not save.'))")).toBeGreaterThan(-1);
    expect(send.indexOf('setJustSent(went)')).toBeGreaterThan(send.indexOf("if (failed(out, 'That comment did not save.'))"));
    expect(view).toMatch(/if \(value\.trim\(\)\) setJustSent\(null\);/);
  });
});

describe('the toast for a hand-off', () => {
  it('names the person by first name', () => {
    expect(handedToWhom('Theo Okafor')).toBe('Handed to Theo');
    expect(handedToWhom('Theo')).toBe('Handed to Theo');
  });

  it('says only Handed on when there is no name', () => {
    expect(handedToWhom('')).toBe('Handed on');
  });
});

describe('the line while it goes', () => {
  it('names who it is going to', () => {
    expect(sendingTo('Lena')).toBe('Sending to Lena…');
  });
});

describe('the app', () => {
  const give = app.slice(app.indexOf('const giveThread = async'), app.indexOf('const runThreadCommand ='));
  const share = app.slice(app.indexOf('send: async (target, to, note) =>'), app.indexOf('see: (item, to) =>'));

  it('says the hand-off is going at the press, and who has it once it went', () => {
    expect(give.indexOf('showToast(sendingTo(')).toBeGreaterThan(-1);
    expect(give.indexOf('showToast(sendingTo(')).toBeLessThan(give.indexOf('await api.teamHandOn'));
    expect(give).toMatch(/showToast\(out\.ok \? handedToWhom\(to\.name\) : out\.error \?\? 'That did not work\.'/);
  });

  it('says a share is going at the press, and keeps who it went to up long enough to read', () => {
    expect(share.indexOf('showToast(sendingTo(names))')).toBeGreaterThan(-1);
    expect(share.indexOf('showToast(sendingTo(names))')).toBeLessThan(share.indexOf('await api.teamSync()'));
    expect(share).toMatch(/showToast\(out\.ok \? `Sent to \$\{names\}` : \(out\.error \?\? `It did not reach \$\{names\}\.`\), out\.ok \? \{ product: item\.product, id: item\.id \} : undefined\);/);
  });
});
