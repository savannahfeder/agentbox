// A FACE IN THE PHONE INBOX HAS NO COLUMN OF ITS OWN (2026-11-22). A mention
// and a teammate's question each drew a 36px face in a column down the row's
// left, so their name, their words and the line under them all started 48px in
// from where every other row starts, on a screen 393 wide. The founder's
// words on a picture of it: "those profile pictures are taking up a huge
// amount of space", "we either shouldn't show them, or maybe we show them
// somewhere smaller, where they don't take up really critical screen real
// estate". Measured by reading app/index.tsx: `size={36}` beside `gap: 12`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const fn = (name: string) => inbox.slice(inbox.indexOf(`function ${name}(`), inbox.indexOf('\n}\n', inbox.indexOf(`function ${name}(`)));

describe.each(['MentionRow', 'QuestionRow'])('%s', (name) => {
  const row = fn(name);
  it('draws its face small, on the line with the name', () => {
    const lead = row.match(/<View style=\{nameLine\}>\s*<(Face|TeammateMark) [^>]*\/>\s*<T numberOfLines=\{1\}/);
    expect(lead, 'the face leads the name on one line').not.toBeNull();
    expect(row).not.toMatch(/size=\{(2[1-9]|[3-9]\d)\}/);
  });
  it('starts its words and the line under them at the row\'s own edge', () => {
    expect(row).not.toMatch(/flexDirection: 'row', gap: 12/);
    expect(row).not.toMatch(/<View style=\{\{ flex: 1 \}\}>/);
  });
  it('still says who, what and when', () => {
    expect(row).toMatch(/numberOfLines=\{2\}/);
    expect(row).toMatch(/updatedWords\(/);
  });
});

describe('the face on the name\'s line', () => {
  it('is 20 or under and sits level with the name', () => {
    expect(inbox).toMatch(/const nameLine = \{ flexDirection: 'row', alignItems: 'center', gap: 7 \} as const;/);
    expect(inbox).toMatch(/const FACE = (1[6-9]|20);/);
    expect(fn('MentionRow')).toMatch(/<Face name=\{m\.byName \|\| 'Someone'\} size=\{FACE\} \/>/);
    expect(fn('QuestionRow')).toMatch(/<TeammateMark t=\{mate\} size=\{FACE\} \/>/);
  });
});

describe('a thread\'s row', () => {
  it('is as it was: a teammate\'s small mark before the title, and no other face', () => {
    expect(fn('ThreadRow')).toMatch(/\{mate && <View style=\{\{ marginRight: 7 \}\}><TeammateMark t=\{mate\} \/><\/View>\}/);
    expect(fn('ThreadRow')).not.toMatch(/<Face /);
  });
});
