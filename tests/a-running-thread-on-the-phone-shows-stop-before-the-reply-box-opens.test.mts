// A RUNNING THREAD ON THE PHONE SHOWS STOP BEFORE THE REPLY BOX OPENS.
//
// What broke (phone tester, Android, 2026-11-15): on a thread whose agent was
// running, Stop was nowhere on the screen or in More. It lived only in the
// opened reply box's Send slot, so it appeared only after a tap on Reply.
// Measured by reading the thread page's source: the folded box drew the
// draft, the model, the choices count and the mic, and no Stop.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../mobile/src/app/thread/[product]/[id].tsx', import.meta.url), 'utf8');
const dock = page.slice(page.indexOf('function Dock('), page.indexOf('<Sheet open={sheet === \'stop\'}'));
const folded = dock.slice(dock.indexOf('{!open ? ('), dock.indexOf(') : (', dock.indexOf('{!open ? (')));
const opened = dock.slice(dock.indexOf(') : (', dock.indexOf('{!open ? (')));

describe('Stop on a running thread', () => {
  it('is in the folded reply box, so no tap on Reply is needed', () => {
    expect(folded).toMatch(/\{offers\.stop && <View[^>]*>\{stopButton\}<\/View>\}/);
  });
  it('is still in the opened box while nothing is typed, with Send once something is', () => {
    expect(opened).toMatch(/\{offers\.stop && !ready \? stopButton : \(/);
  });
  it('is one button, which asks before it stops', () => {
    expect(dock.match(/accessibilityLabel=\{thread\.running \? 'Stop this agent' : 'Stop this task'\}/g)).toHaveLength(1);
    expect(dock).toMatch(/const stopButton = \(\s*<Pressable onPress=\{\(\) => setSheet\('stop'\)\}/);
  });
  it('is not drawn in the folded box on a thread that offers no Stop', () => {
    expect(folded.match(/stopButton/g)).toHaveLength(1);
  });
});
