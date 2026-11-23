// THE PHONE INBOX IS DRAWN FOR A THUMB AND A GLANCE (2026-11-22). Its tabs were
// underlined words, each row a title over an uppercase mono project name at
// 11px with a hairline to the screen's edge, a mention's face 20px beside its
// first line, and the new-thread button a bordered dark disc. Part of "a
// redesign of everything". Measured by reading app/index.tsx, which held each.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { TAB_GAP, COUNT_GAP } from '../mobile/src/lib/tabs';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const fn = (name: string) => inbox.slice(inbox.indexOf(`function ${name}(`), inbox.indexOf('\n}\n', inbox.indexOf(`function ${name}(`)));
const tabs = fn('Tabs');

describe('the tabs', () => {
  it('are pills under the title, the picked one filled, and never at the foot', () => {
    expect(tabs).toMatch(/borderRadius: corner\.pill, backgroundColor: on === t\.id \? color\.graphite : 'transparent'/);
    expect(tabs).toMatch(/color: on === t\.id \? color\.ink : color\.dim/);
    expect(tabs).not.toMatch(/borderBottomWidth/);
    expect(tabs).not.toMatch(/foot/);
    expect(inbox).toMatch(/below=\{<Tabs /);
  });
  it('sit close, since each pill pads itself', () => {
    expect(TAB_GAP).toBeLessThanOrEqual(6);
    expect(COUNT_GAP).toBeGreaterThan(TAB_GAP);
    expect(tabs).toMatch(/gap: TAB_GAP \}\}/);
  });
});

describe('a row', () => {
  it.each(['ThreadRow', 'MentionRow', 'QuestionRow', 'RepeatRows'])('%s says its project and age in plain small words', (name) => {
    expect(fn(name)).not.toMatch(/uppercase|font\.mono/);
    expect(fn(name)).toMatch(name === 'RepeatRows' ? /`Next \$\{words\.when\}`/ : /<Shape [^\n]* when=\{/);
    expect(fn('Shape')).toMatch(/const meta = metaWords\(\)/);
  });
  it('is parted from the next by a line that stops short of both edges', () => {
    expect(inbox).toMatch(/const Parted = [^\n]*left: size\.inset, right: size\.inset, height: 1, backgroundColor: color\.rowLine/);
    expect(inbox.match(/<Parted /g)!.length).toBeGreaterThanOrEqual(4);
  });
  it('has a heavier title while it is unread, beside its dot', () => {
    expect(fn('ThreadRow')).toMatch(/fontFamily: unread \? font\.semibold : font\.regular/);
    expect(fn('ThreadRow')).toMatch(/\{unread && <Unread \/>\}/);
    expect(inbox).toMatch(/const Unread = \(\) => <View style=\{\{ position: 'absolute', left: 7,[^\n]*backgroundColor: color\.accent/);
  });
  it('gives a person who wrote to you a small face on their name\'s line, their words under it', () => {
    expect(fn('MentionRow')).toMatch(/<Face name=\{m\.byName \|\| 'Someone'\} size=\{FACE\} \/>/);
    expect(fn('QuestionRow')).toMatch(/<TeammateMark t=\{mate\} size=\{FACE\} \/>/);
  });
  it('says what waits on you in a label of its own', () => {
    expect(fn('ThreadRow')).toMatch(/aside && <Chip mine=\{!row\.held\}>\{aside\}<\/Chip>/);
  });
});

describe('the new-thread button', () => {
  it('is the one filled disc on the page, with no border, lifted off it', () => {
    const pen = inbox.slice(inbox.indexOf('<Squish accessibilityLabel="New thread"'), inbox.indexOf('</Squish>'));
    expect(pen).toMatch(/backgroundColor: color\.graphite, \.\.\.lift\('float'\)/);
    expect(pen).not.toMatch(/borderWidth/);
  });
});
