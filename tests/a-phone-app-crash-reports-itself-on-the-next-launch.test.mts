// A PHONE APP CRASH REPORTS ITSELF ON THE NEXT LAUNCH.
//
// What broke (w-67ed5a8e02, then w-a68a52a026, 2026-11-03 to 11-07): the
// TestFlight app crashed on the founder's iPhone, two rounds of fixes shipped,
// and the new build still crashed. Nobody ever saw why: the phone app sent no
// crash report anywhere, though its Settings switch "Counts and crash reports"
// promises one. Every fix was a guess. Now an error that would end the app is
// written to a file before it does, and the next launch emails it through the
// feedback function once the computer's settings say crash reports are on.
import { describe, it, expect } from 'vitest';
import { catchCrashes, crashNote, crashNoteFrom, crashReport, reportsOn } from '../mobile/src/lib/crash-note';

const HERMES_STACK = [
  "TypeError: Cannot read property 'title' of undefined",
  '    at ThreadScreen (address at /private/var/containers/Bundle/Application/0F1E2D3C-AAAA-BBBB-CCCC-123456789ABC/Agentbox.app/main.jsbundle:1:482211)',
  '    at renderWithHooks (address at /private/var/containers/Bundle/Application/0F1E2D3C-AAAA-BBBB-CCCC-123456789ABC/Agentbox.app/main.jsbundle:1:90123)',
  '    at anonymous (native)',
].join('\n');

function fakeErrorUtils() {
  const seen = [];
  let handler = (err, fatal) => seen.push([err, fatal]);
  return { seen, setGlobalHandler: (h) => { handler = h; }, getGlobalHandler: () => handler, fire: (err, fatal) => handler(err, fatal) };
}

describe('the note kept when the app is about to end', () => {
  it('keeps the function names and places in the bundle, not the phone’s folders', () => {
    const err = new TypeError("Cannot read property 'title' of undefined");
    err.stack = HERMES_STACK;
    const note = crashNote(err, '0.1.0 (13)', 1000);
    expect(note.at).toBe(1000);
    expect(note.version).toBe('0.1.0 (13)');
    expect(note.name).toBe('TypeError');
    expect(note.frames).toEqual(['ThreadScreen main.jsbundle:1:482211', 'renderWithHooks main.jsbundle:1:90123', 'anonymous native']);
    expect(JSON.stringify(note)).not.toMatch(/containers|0F1E2D3C/);
  });

  it('takes quoted words and paths out of the message, since a thread title can sit in one', () => {
    const note = crashNote(new Error('No thread named "Fix the Acme invoice" at /var/mobile/Containers/Data/x.json'), '0.1.0', 1);
    expect(note.message).toBe("No thread named '<str>' at <path>");
  });

  it('cuts a long message and keeps at most fifteen frames', () => {
    const err = new Error('x'.repeat(1000));
    err.stack = Array.from({ length: 40 }, (_, i) => `    at f${i} (main.jsbundle:1:${i})`).join('\n');
    const note = crashNote(err, '0.1.0', 1);
    expect(note.message.length).toBeLessThanOrEqual(301);
    expect(note.frames).toHaveLength(15);
  });

  it('a thrown string or nothing at all still makes a note', () => {
    expect(crashNote('boom', '0.1.0', 1).message).toBe('boom');
    expect(crashNote(undefined, '0.1.0', 1).message).toBe('undefined');
  });
});

describe('catching the error that would end the app', () => {
  it('a fatal error is kept, then handed on so the app still ends as before', () => {
    const eu = fakeErrorUtils(); const kept = [];
    catchCrashes(eu, (text) => kept.push(text), () => '0.1.0 (13)', () => 5);
    const err = new Error('boom');
    eu.fire(err, true);
    expect(crashNoteFrom(kept[0])).toMatchObject({ message: 'boom', version: '0.1.0 (13)', at: 5 });
    expect(eu.seen).toEqual([[err, true]]);
  });

  it('an error that does not end the app is not kept', () => {
    const eu = fakeErrorUtils(); const kept = [];
    catchCrashes(eu, (text) => kept.push(text), () => '0.1.0', () => 5);
    eu.fire(new Error('soft'), false);
    expect(kept).toEqual([]);
    expect(eu.seen).toHaveLength(1);
  });

  it('a note that cannot be written still lets the error through', () => {
    const eu = fakeErrorUtils();
    catchCrashes(eu, () => { throw new Error('disk full'); }, () => '0.1.0', () => 5);
    const err = new Error('boom');
    eu.fire(err, true);
    expect(eu.seen).toEqual([[err, true]]);
  });

  it('without ErrorUtils (the browser preview) nothing is caught and nothing throws', () => {
    expect(() => catchCrashes(undefined, () => {}, () => '', () => 0)).not.toThrow();
  });
});

describe('reading the kept note back', () => {
  it('a damaged or missing file reads as no note', () => {
    expect(crashNoteFrom(null)).toBeNull();
    expect(crashNoteFrom('{not json')).toBeNull();
    expect(crashNoteFrom('{"message":3}')).toBeNull();
  });
});

describe('whether the report may go', () => {
  const row = (diagnostics) => ({ device: 'mac', settings: { workspace: { diagnostics } } });
  it('goes when the newest computer has crash reports on', () => {
    expect(reportsOn([row(true), row(false)])).toBe(true);
  });
  it('does not go when it has them off', () => {
    expect(reportsOn([row(false), row(true)])).toBe(false);
  });
  it('is not known yet before any computer’s settings are read', () => {
    expect(reportsOn([])).toBeNull();
    expect(reportsOn([{ device: 'mac', settings: null }])).toBeNull();
  });
});

describe('the report', () => {
  it('names the build, the error and where it was', () => {
    const err = new TypeError('bad');
    err.stack = HERMES_STACK;
    const text = crashReport(crashNote(err, '0.1.0 (13), ios 26.1', Date.UTC(2026, 10, 7, 12)));
    expect(text).toContain('Phone app crash');
    expect(text).toContain('0.1.0 (13), ios 26.1');
    expect(text).toContain('TypeError: bad');
    expect(text).toContain('ThreadScreen main.jsbundle:1:482211');
    expect(text).toContain('2026-11-07T12:00:00.000Z');
  });
});
