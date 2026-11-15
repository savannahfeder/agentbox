// "Hand to an agent" turned every `attachments/...` link in the pressed message
// into a file on the card, `..` included, and a teammate's synced words keep
// their link targets as written. So `[screenshot.png](attachments/../../../../../Documents)`
// put a chip named screenshot.png on the card, and once a folder attachment
// was copied as its files, sending the card copied the recipient's Documents
// into the chosen project. Reproduced on a dummy home folder with the real
// handOffStart and saveAttachments. The card now takes only a plain name under
// attachments/, the same rule the sync uses for what it fetches.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handOffStart } from '../renderer/src/threads/composer-rules';
import { saveAttachments } from '../main/save-attachments.mts';

const start = (text: string, dir = '/x/accounts/a/convo') =>
  handOffStart({ product: 'convo', id: 'w', message: { uid: 'm', text, by: 'mal' }, nameOf: () => 'Mal', dir });

describe('the card takes only a file in the conversation', () => {
  it('a plain name comes along', () => {
    expect(start('see [deck.pdf](attachments/mk2x9-ab12cd-deck.pdf)').attachments.map((a) => a.srcPath))
      .toEqual(['/x/accounts/a/convo/attachments/mk2x9-ab12cd-deck.pdf']);
  });
  it('a name with dots inside it still comes along', () => {
    expect(start('[v2](attachments/team-look.v2.md)').attachments).toHaveLength(1);
  });
  for (const target of ['attachments/../../../../../Documents', 'attachments/..', 'attachments/../other-convo/attachments/x.pdf', 'attachments/sub/x.png', 'attachments/.ssh', 'attachments/./x.png']) {
    it(`${target} does not`, () => {
      expect(start(`have a look [screenshot.png](${target})`).attachments).toEqual([]);
      expect(start(`have a look ![screenshot.png](${target})`).attachments).toEqual([]);
    });
  }
});

describe('sending the card copies nothing from outside the conversation', () => {
  let home: string;
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
  it('a link up to Documents brings no file of yours into the project', () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-home-'));
    fs.mkdirSync(path.join(home, 'Documents'), { recursive: true });
    fs.writeFileSync(path.join(home, 'Documents', 'passwords.txt'), 'dummy');
    const convo = path.join(home, 'Zero', 'accounts', 'a', 'convo');
    fs.mkdirSync(path.join(convo, 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(convo, 'attachments', 'mk2x9-ab12cd-real.png'), 'png');
    const project = path.join(home, 'Zero', 'accounts', 'a', 'mine');
    const { attachments } = start('[screenshot.png](attachments/../../../../../Documents) ![real.png](attachments/mk2x9-ab12cd-real.png)', convo);
    const saved = saveAttachments(project, attachments);
    expect(saved.map((s) => s.name)).toEqual(['real.png']);
    expect(fs.readdirSync(path.join(project, 'attachments')).some((f) => f.includes('passwords'))).toBe(false);
  });
});
