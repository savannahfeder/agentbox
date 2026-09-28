// THE COMMENT HEADERS ON THE SECOND ENGINE STILL SAY TRUE THINGS.
//
// This repo treats a comment that has stopped being true as a real defect, and
// the reason is written into CLAUDE.md's own habits: every file here opens with
// what broke, when, and the number that proved it, because "a test whose reason
// is not written down gets deleted by whoever next finds it inconvenient". A
// header that is WRONG is worse than one that is missing. It is the thing the
// next session reads before it touches the file, and it will be believed.
//
// The second engine arrived in slices, and each slice's header described the
// world as it was on the day it was written. Five of them stopped being true as
// the next slice landed:
//
//   codex-app-server.mjs said "NOTHING IMPORTS THIS FILE YET. It is inert on
//   purpose" -- the supervisor imports it and spawns it.
//
//   shared/engines.mjs said the reason Codex is not the default is that there
//   is "no card, no spool, no picker, nothing importing it". The card and the
//   spool were built first; the picker followed on 2026-09-04, and with it the
//   last of that list stopped being true. The default did not move -- it is
//   held by the head-to-head measurement at the top of that file, which is now
//   a decision rather than a consequence of nothing being drawn.
//
// That was the fail-open bug: an empty override is a deep merge that turns
// nothing off, so it ran every server she has.
//
//   supervisor.mjs said the Mac's aggregate ceiling was an unreachable conjunct
//   -- a cooldown shrinking capacity under live sessions reaches it -- and said
//   `codexBin` "is not written by main/config.mjs at all yet", which is now the
//   second thing main/config.mjs resolves.
//
// These are asserted against the source because there is nothing else to assert
// them against. A header is not behaviour; it is a promise about behaviour, and
// the only way to keep a promise honest in a test is to read it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the transport header', () => {
  const source = read('main/codex-app-server.mjs');

  it('no longer says nothing imports it', () => {
    expect(source).not.toMatch(/NOTHING IMPORTS THIS/i);
    expect(source).not.toMatch(/It is inert on purpose/i);
  });

  it('names what does import it, so the next reader is not left grepping', () => {
    expect(source).toMatch(/main\/supervisor\.mjs/);
  });

  // AND IT IS REALLY IMPORTED, which is the fact the header now has to match.
  it('is really imported by the supervisor', () => {
    expect(read('main/supervisor.mjs')).toMatch(/from '\.\/codex-app-server\.mjs'/);
  });
});

describe('the engine-choice header', () => {
  const source = read('shared/engines.mjs');

  it('no longer says there is no card and no spool', () => {
    expect(source).not.toMatch(/no card, no spool/i);
  });

  // AND IT NO LONGER SAYS THE PICKER IS WHAT IS MISSING, because it is not.
  // This assertion used to read "still says there is no picker, because there
  // is not", and it passed on a bare `/picker/i` — which the new paragraph
  // matches too. A test that a header is TRUE cannot be a test that a word
  // appears in it, so it asks for the fact instead.
  it('no longer says the missing picker is why the default has not moved', () => {
    expect(source).not.toMatch(/WHAT IS ACTUALLY STILL MISSING IS THE PICKER/i);
    expect(source).not.toMatch(/nothing draws a choice, so nothing can be chosen/i);
  });

  // AND THE PICKER REALLY IS THERE, which is the fact the header now has to
  // match: a word in the composer's sentence and a row in Settings, the two
  // places her ask named.
  it('is matched by a picker that really exists', () => {
    expect(read('renderer/src/components/EnginePicker.tsx')).toMatch(/EnginePicker/);
    expect(read('renderer/src/components/Compose.tsx')).toMatch(/<EnginePicker/);
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/Coding agent/);
  });

  // THE HALF THAT IS STILL TRUE STAYS, and it is the one that matters: the
  // renderer does not decide what is on offer. It never calls the ungated
  // helpers; it is handed the list on the snapshot, from the one method that
  // asks the gate first.
  it('still keeps the renderer out of the question entirely', () => {
    const renderer = read('renderer/src/App.tsx');
    expect(renderer).not.toMatch(/availableEngines|engineChoiceExists|enginePicked/);
    expect(renderer).toMatch(/snap\.engines\?\.choices/);
  });

  // And the header says who the one caller is, so the next reader is not left
  // grepping — the same promise the transport header above makes.
  it('names the one caller that may answer what is on offer', () => {
    expect(source).toMatch(/Supervisor#engineChoices/);
  });
});

describe('the worker-facade header', () => {
  const source = read('main/codex-session.mjs');

  it('no longer calls an unreadable isolation list correct', () => {
    expect(source).not.toMatch(/An empty or unreadable list yields an empty override, which is correct/i);
  });

  it('says what an unreadable one does instead', () => {
    expect(source).toMatch(/THROW/);
  });
});

describe('the supervisor comments the last two reviews contradicted', () => {
  const source = read('main/supervisor.mjs');

  it('no longer calls the Mac ceiling unreachable', () => {
    expect(source).not.toMatch(/the second half was unreachable/i);
    expect(source).not.toMatch(/A conjunct that no mutation can make fail/i);
  });

  it('no longer says config.mjs does not write codexBin', () => {
    expect(source).not.toMatch(/`codexBin` is not written by\s*\n?\s*\*?\s*main\/config\.mjs at all yet/);
    expect(source).not.toMatch(/is not written by[\s\S]{0,40}main\/config\.mjs at all yet/);
  });

  // THE SIXTH. `codexThreadParamsFor` said a row with a model on it "runs on
  // the engine's own default and the run SAYS what was dropped". Neither half
  // survived main/codex-models.mjs: a word Codex knows is now carried rather
  // than dropped, a word it does not know stops the run rather than running it
  // on the default, and the sentence it claimed to SAY was being emitted on a
  // stderr with no listener attached to it yet.
  it('no longer says a refused model runs on the engine own default', () => {
    expect(source).not.toMatch(/row runs on the engine's own default/);
    expect(source).not.toMatch(/which reaches her through the worker's stderr/);
  });

  it('says what happens to the model instead, and names where the list comes from', () => {
    expect(source).toMatch(/codex-models\.mjs/);
    expect(source).toMatch(/models_cache\.json/);
  });

  // AND IT IS REALLY WIRED, which is the fact those sentences now have to match.
  it('really reads the list before it starts a thread', () => {
    expect(source).toMatch(/from '\.\/codex-models\.mjs'/);
    expect(source).toMatch(/codexKnownSlugs\(/);
  });
});

describe('the header on the module that reads the list', () => {
  const source = read('main/codex-models.mjs');

  // The one thing this file must never go back to claiming, because it is what
  // the deleted 2026-08 original claimed and it is why `gpt-5.6-sol` was thrown
  // away: that the models a picker may offer are all the models Codex accepts.
  it('says the offer list is not everything codex accepts', () => {
    expect(source).toMatch(/codexKnownSlugs/);
    expect(source).toMatch(/visibility/);
  });

  // It reads a file and spawns nothing, and that has to stay true: a picker
  // must never be the reason a login shell starts while she is typing.
  it('spawns nothing, and nothing imported here could', () => {
    expect(source).not.toMatch(/child_process|execFile|spawnSync/);
  });
});
