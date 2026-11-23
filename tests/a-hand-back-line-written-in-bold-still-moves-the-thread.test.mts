// A HAND-BACK LINE WRITTEN IN BOLD STILL MOVES THE THREAD.
//
// What broke (2026-11-23): a cloud run that needed a file only the Mac has
// ended on `**AGENTBOX-NEEDS-THE-COMPUTER: your Mac's memory log**`. Its brief
// tells it both to end on that one line and to open its last message in bold,
// and it did both. The reader wanted the marker as the line's first
// characters, so the thread never moved: the row showed the marker as the
// agent's answer and the work sat in the cloud, where it could not be done.
// Measured on that row: its result was the bold line, and nothing ran on the
// Mac until the line was sent again as plain text.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { HAND_BACK, SEND_TO_CLOUD, asksForCloud, handBackWhat, handsBack, withoutHandBack } from '../shared/cloud-hand-back.mts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-hand-back-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const SAID = `**${HAND_BACK} your Mac's memory log**`;

describe('the marked line, dressed the way a last message is', () => {
  it('is read in bold, as it was written that day', () => {
    expect(handsBack(SAID)).toBe(true);
    expect(handBackWhat(SAID)).toBe("your Mac's memory log");
  });

  it('is read in the other marks a message puts round one line', () => {
    for (const line of [
      `__${HAND_BACK} the iOS simulator__`,
      `*${HAND_BACK} the iOS simulator*`,
      `\`${HAND_BACK} the iOS simulator\``,
      `**\`${HAND_BACK} the iOS simulator\`**`,
      `  **${HAND_BACK} the iOS simulator**  `,
      `> ${HAND_BACK} the iOS simulator`,
    ]) {
      expect(handsBack(line), line).toBe(true);
      expect(handBackWhat(line), line).toBe('the iOS simulator');
    }
  });

  it('keeps an asterisk that belongs to what was missing', () => {
    expect(handBackWhat(`${HAND_BACK} the *.mov files in Movies`)).toBe('the *.mov files in Movies');
  });

  it('is still read plain, and after other lines', () => {
    expect(handsBack(`${HAND_BACK} the key file`)).toBe(true);
    expect(handsBack(`Checking.\n**${HAND_BACK} the key file**`)).toBe(true);
    expect(handBackWhat(`Checking.\n**${HAND_BACK} the key file**`)).toBe('the key file');
  });

  it('is not read where the line only talks about it', () => {
    expect(handsBack(`The cloud note says to write "**${HAND_BACK}**" when stuck.`)).toBe(false);
    expect(handsBack(`**Note:** ${HAND_BACK} is the line a cloud run ends on.`)).toBe(false);
    expect(handsBack(`- [ ] ${HAND_BACK} was tested`)).toBe(false);
    expect(handsBack('**Done: the film is cut.**')).toBe(false);
  });

  it('is taken off what is drawn, marks and all', () => {
    expect(withoutHandBack(`I looked first.\n\n${SAID}`)).toBe('I looked first.');
    expect(withoutHandBack(SAID)).toBe('');
  });

  it('the line that sends a run to the cloud is read the same way', () => {
    expect(asksForCloud(`**${SEND_TO_CLOUD} a long render**`)).toBe(true);
    expect(asksForCloud(`${SEND_TO_CLOUD} a long render`)).toBe(true);
    expect(asksForCloud(`The note says "${SEND_TO_CLOUD}" sends it there.`)).toBe(false);
  });
});

describe('a cloud run that ends on the bold line', () => {
  const product = { slug: 'p', dir: '', repoPath: '/r' };
  const make = (root) => {
    product.dir = root;
    const store = {
      listItems: () => [], listProducts: () => [product], isDue: () => true,
      readItem: () => ({ id: 'w-a', status: 'open', wrote: {} }),
      recordSessionResult() {}, settleAnswer() {}, releaseRunClaim() {},
    };
    const sup = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, store, root);
    sup.storeMcpCommand = () => '/fake/store';
    return sup;
  };

  it('moves the thread to this Mac and keeps the line off the row', () => {
    const sup = make(tmp());
    const session = { itemId: 'w-a', product: 'p', cloud: true, startedAt: Date.now() - 60_000, result: SAID, resultIsError: false };
    expect(sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, session)).toBe(true);
    expect(sup._cloudEligible({ id: 'w-a', product: 'p' })).toBe(false);
    expect(sup.closingMessageIsTheAnswer(session)).toBe(false);
    expect(sup._movedWhy['w-a']).toEqual({ why: 'handed-back', detail: "your Mac's memory log" });
  });
});

describe('every reader of the line', () => {
  it('asks the one function, so none of them reads it its own way', () => {
    for (const file of ['cloud/gateway/phone.mjs', 'renderer/src/item-thread.ts', 'shared/runs-said.mts', 'main/supervisor.mts']) {
      expect(read(file), file).not.toMatch(/startsWith\((HAND_BACK|SEND_TO_CLOUD)\)/);
    }
  });
});
