// THE SLASH, THE WORDS, AND WHY BOTH ARE CLAUDE CODE'S AND NOT OURS.
//
// The app had invented its own modes, words and trigger, and this file is the
// guard against it happening again. It asserts, against the list read off `claude --help` on 2.1.241 and
// off code.claude.com/docs/en/permission-modes on 2026-08-23:
//
//   * the six modes are Claude Code's six, by Claude Code's own values
//   * the labels are Claude Code's own labels
//   * the trigger is a forward slash, and a backslash is now just a character
//   * Shift+Tab cycles, which is the key Claude Code actually uses
//
// The named-list test at the bottom is the important one. It is the thing that
// fails loudly the day somebody invents a mode again.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  MODE_ORDER, MODE_WORDS, MODE_COMMAND, MODE_SENTENCE, MODE_HINT, MODE_STATUS,
  MODE_CYCLE, MENU_TITLE, RULES_ALWAYS_APPLY, slashQuery, modeMatches, exactMode, nextMode,
} from '../renderer/src/modes.ts';
import { CLAUDE_PERMISSION_MODES } from '../shared/work-items.mjs';

describe('the six are Claude Code\'s six', () => {
  // THE MEASUREMENT THIS ENCODES, so nobody has to trust the list:
  //   $ claude --version   -> 2.1.241 (Claude Code)
  //   $ claude --help | grep -A6 permission-mode
  //     --permission-mode <mode>  (choices: "acceptEdits", "auto",
  //                                "bypassPermissions", "manual", "dontAsk",
  //                                "plan")
  // `manual` is the CLI's alias for the config value `default`, which is what
  // the docs, the settings file and the SDK all use, so `default` is the value
  // we store. Every one of the seven spellings was handed to the real CLI in a
  // one-turn run on 2026-08-23 and every one started.
  it('names exactly the modes the CLI takes, and nothing invented', () => {
    expect([...MODE_ORDER].sort()).toEqual(
      ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan'],
    );
    expect([...MODE_ORDER].sort()).toEqual([...CLAUDE_PERMISSION_MODES].sort());
  });

  it('is in Anthropic\'s own row order, not a ranking of ours', () => {
    // The Available modes table on code.claude.com/docs/en/permission-modes,
    // top to bottom. A person who has read their page finds our list in the
    // shape they already saw.
    expect(MODE_ORDER).toEqual([
      'default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions',
    ]);
  });

  // THE FOUR REJECTED WORDS, BY NAME. They were invented here rather than
  // Claude Code's, and a grep is the only thing that stops one drifting back in.
  it('has none of the four words she rejected as a label anywhere', () => {
    // The LABEL surfaces only: the name of a mode, its status line and the
    // thing you type. Prose is allowed to say "edit files" because that is
    // what accept edits does; what may never come back is a mode CALLED it.
    const labels = JSON.stringify([MODE_WORDS, MODE_STATUS, MODE_COMMAND]).toLowerCase();
    for (const dead of ['read only', 'edit files', 'checked first', 'never ask']) {
      expect(labels, dead).not.toContain(dead);
    }
  });

  it('says what Claude Code\'s own status bar says', () => {
    // THEIR `title` COLUMN, character for character. The two odd ones are odd
    // in the binary too: "Don't Ask" and "Bypass Permissions" capitalise a way
    // the other four do not, and they are still the labels Claude Code prints.
    expect(MODE_WORDS.default).toBe('Manual');
    expect(MODE_WORDS.acceptEdits).toBe('Accept edits');
    expect(MODE_WORDS.plan).toBe('Plan');
    expect(MODE_WORDS.auto).toBe('Auto');
    expect(MODE_WORDS.dontAsk).toBe("Don't Ask");
    expect(MODE_WORDS.bypassPermissions).toBe('Bypass Permissions');
    // AND THEIR STATUS LINE IS `indicator + " on"`, which is how it is built at
    // run time, so these whole phrases are not literals in the binary.
    expect(MODE_STATUS.default).toBe('manual mode on');
    expect(MODE_STATUS.acceptEdits).toBe('accept edits on');
    expect(MODE_STATUS.plan).toBe('plan mode on');
    expect(MODE_STATUS.auto).toBe('auto mode on');
    expect(MODE_STATUS.dontAsk).toBe("don't ask on");
    expect(MODE_STATUS.bypassPermissions).toBe('bypass permissions on');
  });
});

describe('when the menu opens at all', () => {
  it('opens on a lone forward slash at the start of an empty box', () => {
    expect(slashQuery('/')).toBe('');
    expect(modeMatches(slashQuery('/'))).toEqual(MODE_ORDER);
  });

  it('does not open on a backslash at all any more', () => {
    // The backslash was invented here, not Claude Code's. It is an ordinary character now.
    expect(slashQuery('\\')).toBe(null);
    expect(slashQuery('\\auto')).toBe(null);
  });

  it('does not open on a slash inside a sentence', () => {
    // The failure this stops is a menu appearing over a path somebody pasted.
    expect(slashQuery('the file is at src/App.tsx')).toBe(null);
    expect(slashQuery('  /auto')).toBe(null);
    expect(modeMatches(slashQuery('run / this'))).toEqual([]);
  });

  it('closes as soon as there is a space, because that is prose', () => {
    expect(slashQuery('/auto and then')).toBe(null);
    expect(slashQuery('/ ')).toBe(null);
  });

  it('closes on a word that is nobody, rather than sitting there empty', () => {
    expect(slashQuery('/zzz')).toBe('zzz');
    expect(modeMatches('zzz')).toEqual([]);
  });
});

describe('what it narrows to', () => {
  // NOT ALL OF THESE ARE CLAUDE CODE'S. `bypass` and `acceptedits` track their
  // values; `yolo` is what people call bypass. The CLI does not accept it as a
  // mode value, though it IS internal vocabulary there (`yoloEquivEnabled`).
  // The point of the test is that every spelling somebody reaches for lands
  // somewhere, not that Claude Code answers to all of them.
  it('takes the spellings somebody would reach for', () => {
    expect(modeMatches('bypass')).toEqual(['bypassPermissions']);
    expect(modeMatches('acceptedits')).toEqual(['acceptEdits']);
    expect(modeMatches('yolo')).toEqual(['bypassPermissions']);
    expect(modeMatches('manual')).toEqual(['default']);
    expect(modeMatches('default')).toEqual(['default']);
  });

  // THIS RULE CHANGED WHEN THE WORDS DID, and the change is worth writing down.
  // It used to say auto must win /a, because the only other match was
  // acceptEdits arriving as an ALIAS of a mode we called Edit files. Now that
  // every mode here is Claude Code's own, `accept-edits` is that mode's FIRST
  // word rather than an alias of some word of ours, and there is no honest
  // reason to demote it. The WORD is still this app's: their value is
  // `acceptEdits` and the hyphenated spelling is ours. Two
  // modes genuinely begin with a, both are shown, and Anthropic's table order
  // breaks the tie. One more keystroke settles it.
  it('shows both modes beginning with a, in the table order', () => {
    expect(modeMatches('a')).toEqual(['acceptEdits', 'auto']);
    expect(modeMatches('au')).toEqual(['auto']);
  });

  // The alias rule itself still holds, on the one place aliases are still used.
  it('still ranks a mode\'s own word above another mode\'s alias', () => {
    // `deny` is an alias we keep for dontAsk; `default` is a mode's own word.
    expect(modeMatches('de')).toEqual(['default', 'dontAsk']);
  });

  it('narrows to one as soon as the word is unambiguous', () => {
    expect(modeMatches('au')).toEqual(['auto']);
    expect(modeMatches('pl')).toEqual(['plan']);
    expect(modeMatches('by')).toEqual(['bypassPermissions']);
  });

  it('matches on a prefix, never on a word appearing in the middle', () => {
    // "lan" inside "plan" is a coincidence, and moving a selection on a
    // coincidence is what makes a menu feel random.
    expect(modeMatches('lan')).toEqual([]);
  });
});

describe('typing it straight through, with no menu', () => {
  it('takes an exact word so /auto and a space is a pick', () => {
    expect(exactMode('auto')).toBe('auto');
    expect(exactMode('bypasspermissions')).toBe('bypassPermissions');
    expect(exactMode('manual')).toBe('default');
  });

  it('takes a half typed word as nothing, so it stays in the box', () => {
    expect(exactMode('au')).toBe(null);
    expect(exactMode('')).toBe(null);
    expect(exactMode(null)).toBe(null);
  });
});

describe('Shift+Tab, which is the key Claude Code actually uses', () => {
  // Their docs: "press Shift+Tab to cycle permission modes. From auto, the
  // first press switches to default, and the cycle then runs default ->
  // acceptEdits -> plan -> back to default. Optional modes... slot in after
  // plan, with bypassPermissions first and auto last." And separately:
  // "`dontAsk`: never appears in the cycle". Bypass appears when the session has
  // it available, which is NOT the same as having started in it: the binary has
  // a second flag, `--allow-dangerously-skip-permissions`, "Enable bypassing all
  // permission checks as an option, without it being enabled by default". An
  // earlier comment here said started-in-it and that was wrong.
  it('starts at Manual from anywhere outside the ring', () => {
    expect(nextMode('auto')).toBe('default');
    expect(nextMode(null)).toBe('default');
    expect(nextMode('custom')).toBe('default');
    expect(nextMode('dontAsk')).toBe('default');
    expect(nextMode('bypassPermissions')).toBe('default');
  });

  // OUR ring, not theirs. Theirs varies with what the session has available.
  it('runs our ring and comes back round', () => {
    expect(MODE_CYCLE).toEqual(['default', 'acceptEdits', 'plan', 'auto']);
    expect(nextMode('default')).toBe('acceptEdits');
    expect(nextMode('acceptEdits')).toBe('plan');
    expect(nextMode('plan')).toBe('auto');
    expect(nextMode('auto')).toBe('default');
  });

  // THE FIRST BUILD PUT ALL SIX IN THE RING and called it Claude Code's cycle.
  // OURS IS NOT THEIRS AND MUST NOT BE CALLED THAT: theirs varies per session,
  // ours is a fixed four.
  // It is not: dontAsk is never in theirs, and bypass is in it only for a
  // session that has bypass available. Two flags do that and they are not the
  // same: `--dangerously-skip-permissions` STARTS the session in bypass, and
  // `--allow-dangerously-skip-permissions` only makes it available. It also put the most dangerous mode two
  // keypresses from resting. Both are still one press of the chip away, so
  // nothing is hidden; the key simply does not walk you into them.
  it('never walks into bypass or dont-ask', () => {
    let m = 'default';
    for (let i = 0; i < 20; i += 1) {
      m = nextMode(m);
      expect(m, `press ${i + 1}`).not.toBe('bypassPermissions');
      expect(m, `press ${i + 1}`).not.toBe('dontAsk');
    }
  });
});

describe('what it leaves behind', () => {
  // So the footer has to say WHICH send, and only once she has changed it.
  //
  // THIS USED TO TEST A `modeClause` HELPER THAT NOTHING RENDERED. The helper
  // was exported, unit-tested, and called by no production code at all: the
  // footer builds the clause inline. A test of an unused export is a test that
  // goes green while the screen says whatever it likes, which is the same shape
  // as the defect this whole round started with. The helper is deleted and this
  // reads the source the footer is actually built from.
  const focus = fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8');

  /* * THE SCOPE IS NOW SAID IN THE TOAST, NOT IN A CLAUSE BESIDE SEND.
  */
  it('says which send the mode is for, in the toast', () => {
    expect(focus).toContain('for this message');
    // Since 2026-09-23 the word comes through `statusOf`, which picks the
    // engine's own vocabulary; on a Claude Code row that is still MODE_STATUS.
    expect(focus).toContain('statusOf(m)');
    expect(focus).toContain('MODE_STATUS[m as PermissionMode]');
  });

  it('has no chip and no scope clause left in the footer', () => {
    expect(focus).not.toContain('mode-scope');
    expect(focus).not.toContain('className="mode-chip"');
    expect(focus).not.toContain('clause-mode');
  });

  it('has no unused clause helper left to go stale', async () => {
    const modes = await import('../renderer/src/modes.ts');
    expect(modes.modeClause).toBeUndefined();
  });
});

describe('one vocabulary, not three', () => {
  // THE SLASH IS THEIRS, THE COMMAND NAMES ARE OURS, and the file has to say so.
  // Claiming Claude Code has a /auto is the same class of mistake as the four
  // invented mode names, one layer down.
  it('does not claim the command names are Claude Code\'s', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('renderer/src/modes.ts', 'utf8'));
    expect(src).toContain('THESE COMMAND NAMES ARE OURS');
    // /plan IS REAL AND THE OTHER FIVE ARE NOT. Read off the command table in
    // the installed 2.1.241, where it is {name:"plan", description:"Enable plan
    // mode or view the current session plan"}. A pass this session deleted this
    // fact on the strength of `grep -cx "/plan"` returning zero, which it always
    // would: the table stores the name without a slash. The wrong search is why
    // a true line was "corrected" into a false one and shipped.
    expect(MODE_COMMAND.plan).toBe('/plan');
    expect(src).toContain('`/plan` is theirs');
    // AND THE COPY MUST STILL RECORD WHAT /permissions REALLY IS, so nobody
    // rediscovers it as an obvious feature and wires it up again.
    expect(src).toContain('It manages RULES. It does not pick a mode.');
  });

  // THE COPY FOLLOWS THEIR COLUMN INSTEAD OF BEING WRITTEN, AND A TEST HOLDS IT.
  //
  // Four drafts of these sentences were each wrong in the DANGEROUS direction:
  // they promised that something stops and asks when Anthropic's own page says
  // it does not. The fix was to stop writing them and follow their "What runs
  // without asking" column. SEVERAL ARE REWORDED and none is a quotation;
  // modes.ts names which and says why no count belongs in a comment. This
  // test is the thing that fails the day somebody
  // decides to improve the wording again.
  it('follows Anthropic\'s own column rather than describing the modes', () => {
    for (const m of MODE_ORDER) {
      expect(MODE_SENTENCE[m], m).toMatch(/^Runs without asking:/);
    }
    expect(MODE_SENTENCE.default).toContain('reads only');
    expect(MODE_SENTENCE.auto).toContain('background safety checks');
    expect(MODE_SENTENCE.bypassPermissions).toContain('everything');
  });

  // THE HINTS SAY WHAT RUNS, NOT WHAT IS FORBIDDEN. Without the verb, "Manual —
  // reads only" under a menu headed "what this message may do" reads as a
  // ceiling on what an agent CAN do, and a permission mode is not that: Manual
  // is about being asked first for most things, not a ceiling. It still runs
  // reads unasked, an allow rule can pre-approve more, and what is possible is
  // bounded by deny rules and by the actions no mode auto-approves.
  it('writes every hint as what runs, never as what is allowed', () => {
    for (const m of MODE_ORDER) {
      expect(MODE_HINT[m], m).toMatch(/^runs /);
    }
    expect(MENU_TITLE).toContain('without asking');
  });

  // `/permissions` IS THEIRS AND WE DO NOT TAKE IT. It is a real Claude Code
  // command for managing allow and deny RULES, and it was briefly wired to this
  // mode menu. Giving their command a second meaning in our app is the same
  // fault this file exists for, in their vocabulary, so it is gone and this is
  // the test that stops it coming back.
  it('does not take over Claude Code\'s /permissions', () => {
    expect(modeMatches('permissions')).toEqual([]);
    expect(modeMatches('perm')).toEqual([]);
    expect(exactMode('permissions')).toBe(null);
  });

  // AND THE SHORT p PREFIXES ARE STILL PLAN, which is what they were before the
  // alias existed and after it was removed.
  it('leaves the short p prefixes on Plan', () => {
    expect(modeMatches('p')[0]).toBe('plan');
    expect(modeMatches('pl')).toEqual(['plan']);
  });

  it('never promises that a mode stops, blocks or asks', () => {
    // The whole class of mistake, in one grep. Every one of these was in a
    // draft, and every one of them was false for at least one mode.
    const copy = [...MODE_ORDER.map((m) => MODE_SENTENCE[m]), ...MODE_ORDER.map((m) => MODE_HINT[m])]
      .join(' ').toLowerCase();
    for (const promise of [
      'stops and asks', 'stop and ask', 'asks you before', 'every action',
      'nothing is checked', 'never run unasked',
    ]) {
      expect(copy, promise).not.toContain(promise);
    }
  });

  // And the caveat that carries what their column leaves out must exist and
  // must name the ALLOW direction, which is the dangerous one to omit.
  it('carries a caveat that names allow as well as deny', () => {
    expect(RULES_ALWAYS_APPLY).toContain('allow rule');
    // "auto-approved" TRACKS THEIR HEADING WITHOUT QUOTING IT. Theirs is
    // "Actions no mode auto-approves"; a draft saying "never run unasked"
    // promised more than they do, because in auto a critical-path removal goes
    // to the classifier rather than to a person.
    expect(RULES_ALWAYS_APPLY).toContain('auto-approved');
    // AND THE DENY HALF STAYS WEAKER THAN THEIR SENTENCE ON PURPOSE. Theirs,
    // "Deny rules block in every mode", is qualified one line later by the
    // EndConversation carve-out. Borrowing the strong half without its
    // qualification is the same overclaim in borrowed clothes, and the
    // qualification cannot go on this screen, so the claim is weakened instead.
    expect(RULES_ALWAYS_APPLY).toContain('deny rules still apply');
    expect(RULES_ALWAYS_APPLY.toLowerCase()).not.toContain('block in every mode');
  });

  it('has a word, a sentence, a hint, a status line and a command for every mode', () => {
    for (const m of MODE_ORDER) {
      expect(MODE_WORDS[m], m).toBeTruthy();
      expect(MODE_SENTENCE[m], m).toBeTruthy();
      expect(MODE_HINT[m], m).toBeTruthy();
      expect(MODE_STATUS[m], m).toBeTruthy();
      expect(MODE_COMMAND[m], m).toMatch(/^\/[a-z-]+$/);
    }
  });

  it('is the same vocabulary the settings screen prints', async () => {
    // The words used to live inside Settings.tsx, so anything else that wanted
    // to say them typed them again. A second copy is a second product: this
    // asserts the screen reads them from here.
    const src = await import('node:fs').then((fs) => fs.readFileSync('renderer/src/components/Settings.tsx', 'utf8'));
    expect(src).toContain("from '../modes'");
    expect(src).not.toMatch(/default: 'Manual',/);
  });

  /* The built thing was reviewed and this was overruled. Both sentences are kept here so the
     next session can see that this is a decision that was reversed rather than a rule somebody
     forgot. The cost is real and named where the chip stood: with nothing on the footer,
     the modes are discoverable in Settings and nowhere else in the reply flow.
  */
  it('draws no permissions control on the reply footer', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8'));
    expect(src).not.toContain('mode-chip');
    expect(src).not.toContain('mode-clear');
    expect(src).not.toContain('MODE_STATUS[running]');
    // And the rival hidden shape is still gone rather than left switchable.
    expect(src).not.toContain('FOOTER_MODE');
  });

  /* AND THE CSS WENT WITH IT, rather than being left switchable by a class. */
  it('has no chip left in the stylesheet', async () => {
    const css = await import('node:fs').then((fs) => fs.readFileSync('renderer/src/styles.css', 'utf8'));
    for (const rule of ['.mode-chip', '.mode-glyph', '.mode-kind', '.mode-scope', '.mode-clear', '.slash-menu.footer']) {
      expect(css, rule).not.toContain(`\n${rule}`);
    }
  });

  /*
   * THE TWO WAYS IN THAT SURVIVE ARE BOTH CLAUDE CODE'S OWN, and each one has
     to announce itself now that nothing is permanently on the screen. A key
     that changes what an agent may do on somebody's Mac and shows nothing is
     the defect this replaces, not a tidier version of it. */
  it('announces the change on the slash pick and on Shift+Tab', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8'));
    // One place builds the sentence, so the two routes cannot drift apart.
    expect(src.match(/const announce = /g)?.length).toBe(1);
    // The slash pick.
    expect(src).toMatch(/const pickMode = \(m: PermissionMode \| CodexModeId \| null\) => \{\s*setMode\(m\);\s*announce\(m\);/);
    // And Claude Code's own Shift+Tab.
    expect(src).toMatch(/const next = claudeCode \? nextMode\(running as PermissionMode\) : nextCodexMode\(running as CodexModeId\);\s*setMode\(next\);[\s\S]{0,400}?announce\(next\);/);
  });
});

/*
 * THE TOAST MUST NOT LAND ON THE THING IT IS ABOUT.
 *
 * The app's toast lives at the bottom centre of the window, which is exactly
 * where the reply card is, so a message raised BY the composer lands ON the
 * composer. Photographed at 900x900 on 2026-08-26: the mode toast sat across
 * the Send button for its whole 2.5 seconds, at the moment somebody has just
 * picked a mode and is reaching for the send key. That is a smaller copy of the
 * fault this whole round is fixing, so it is not shipped.
 *
 * TOP RATHER THAN A BIGGER BOTTOM, because the dock grows with the draft up to
 * 40% of the pane, so any lift computed off today's dock height is wrong the
 * moment somebody types a long message. */
describe('the toast gets out of the composer\'s way', () => {
  const app = fs.readFileSync('renderer/src/App.tsx', 'utf8');
  const css = fs.readFileSync('renderer/src/styles.css', 'utf8');

  it('marks the root while the reply box is open', () => {
    expect(app).toContain("${modal === 'reply' ? ' composing' : ''}");
  });

  it('moves the toast to the top, not merely further up from the bottom', () => {
    expect(css).toContain('.app.composing .toast { bottom: auto; top: 74px; }');
  });

  it('leaves the toast where it was for everything else', () => {
    // The unqualified rule still owns the bottom, so nothing outside the
    // composer moved.
    expect(css).toMatch(/\.toast \{[\s\S]{0,200}bottom: 58px;/);
  });
});

/*
 * THE WAY BACK TO THE PROJECT'S SETTING.
 *
 * The footer chip carried a small × beside it, and that × was the ONLY way back
 * from a mode set on one message to whatever the project itself is set to. The
 * chip was taken off the screen on 2026-08-26 and the × went with it.
 *
 * THAT MATTERS BECAUSE THE VALUE PERSISTS: answerMode is stored on the row and
 * Focus reads it back on every open, so a mode picked for one reply is still on
 * the next one. Without a way back, the first time somebody picks bypass for a
 * single message they are in bypass on that row until they notice.
 *
 * SO IT MOVED INTO THE MENU THAT SURVIVED, as null: not a seventh mode, the
 * ABSENCE of one, which is what null has always meant everywhere downstream. */
describe('the way back', () => {
  const focus = fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8');

  it('is not offered when there is nothing to come back from', async () => {
    const { menuRowsFor } = await import('../renderer/src/modes.ts');
    expect(menuRowsFor('', false)).toEqual(MODE_ORDER);
    expect(menuRowsFor('clear', false)).toEqual([]);
  });

  it('is the last row on the open menu, under all six modes', async () => {
    const { menuRowsFor } = await import('../renderer/src/modes.ts');
    const rows = menuRowsFor('', true);
    expect(rows.slice(0, 6)).toEqual(MODE_ORDER);
    expect(rows[6]).toBe(null);
    expect(rows).toHaveLength(7);
  });

  it('is reachable by typing, and does not crowd the modes when it is not', async () => {
    const { menuRowsFor } = await import('../renderer/src/modes.ts');
    expect(menuRowsFor('cl', true)).toEqual([null]);
    expect(menuRowsFor('reset', true)).toEqual([null]);
    // A query that is a mode does not drag the clear row along with it.
    expect(menuRowsFor('au', true)).toEqual(['auto']);
    // And a query that is nobody still opens nothing.
    expect(menuRowsFor('zzz', true)).toEqual([]);
  });

  it('is never a mode value, only the absence of one', async () => {
    const modes = await import('../renderer/src/modes.ts');
    // It must not have crept into the list handed to Claude Code.
    expect(MODE_ORDER).not.toContain(null);
    expect(MODE_ORDER).not.toContain('clear');
    // And its command is ours, like five of the six. Claude Code has no /clear
    // for permissions and this file must not imply it does.
    expect(modes.CLEAR_COMMAND).toBe('/clear');
    expect(Object.values(MODE_COMMAND)).not.toContain('/clear');
  });

  it('does not call itself Manual or Default, which are real modes above it', async () => {
    const { CLEAR_WORDS } = await import('../renderer/src/modes.ts');
    expect(CLEAR_WORDS.toLowerCase()).not.toContain('manual');
    expect(CLEAR_WORDS.toLowerCase()).not.toContain('default');
    expect(CLEAR_WORDS).toContain('project');
  });

  it('is typed straight through only while a mode is set', async () => {
    const { exactClear } = await import('../renderer/src/modes.ts');
    expect(exactClear('clear')).toBe(true);
    expect(exactClear('auto')).toBe(false);
    expect(exactClear(null)).toBe(false);
    // The guard is in the composer, not in the helper: with nothing set, the
    // word is ordinary text rather than a command that silently does nothing.
    expect(focus).toContain('if (mode !== null && exactClear(q)) { pickMode(null); return; }');
  });

  it('says what the message will run as now, not merely that it was undone', () => {
    // is not an answer to the question somebody is actually asking, which is
    // what THIS send will do.
    expect(focus).toContain("back to this project's setting");
    // The clear toast still names what the message will run as now; on a Codex
    // row that is Codex's default rather than Claude Code's.
    expect(focus).toContain("statusOf(claudeCode ? (runningMode ?? 'auto') : CODEX_DEFAULT_MODE)");
  });

  /*
   * ONE LIST, NOT TWO. The list that decides whether the menu is OPEN has to be
     the list it SHOWS, or Enter picks row three of something nobody is looking
     at. This was two expressions while the chip could open the menu on no query
     at all, and the clear row is exactly the case that would have broken it:
     `modeMatches('clear')` is empty, so the menu would never have opened on the
     word it is reached by.

     STILL ONE LIST after the menu grew a second half on 2026-08-27
     (w-23a7b3f568). `slashRows` is `menuRowsFor` plus Claude Code's own eight
     commands, and it is still the ONE expression that both `slashOpen` and the
     menu read. The last line below stays as it was: what it guards against is a
     SECOND local list beside this one, and `slashRows` here is the imported
     function rather than a variable.

     AND IT TAKES THE ROW'S ENGINE SINCE 2026-09-04, which is what makes the one
     expression true on both engines rather than only on the one this menu is
     written in. Everything in the list is Claude Code's, the six modes included,
     so on a Codex row it is empty and `slashOpen` is false. The argument is in
     renderer/src/slash-menu.ts and the cases are in
     tests/the-slash-menu-offers-nothing-codex-cannot-run.test.mjs; this line
     only pins that the two halves are still decided off ONE call.

     AND THE ENGINE ITSELF IS ONE CONST TOO, SINCE 2026-09-05. It was written
     inline on that line while `canSetMode` twelve lines above answered the same
     question as `!item.agent` with no engine in it, so the menu was correctly
     empty on a Codex row while Shift+Tab and `/plan ` typed straight through
     both set a permission mode there anyway. Same rule as the paragraph above,
     one level up: the list and the KEYS have to be decided off one answer. */
  it('decides open-or-shut off the same rows it draws', () => {
    expect(focus).toContain('const menuRows = slashRows(query, mode !== null, claudeCode, nativeNames);');
    expect(focus).toContain('const slashOpen = menuRows.length > 0;');
    expect(focus).not.toContain('const slashRows =');
  });

  it('decides the keys off that same answer', () => {
    expect(focus).toContain('const claudeCode = (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE;');
    // BOTH ENGINES SINCE 2026-09-23. The `&& claudeCode` was there because a
    // mode set on a Codex row was silently dropped by the run; it reaches
    // `thread/start` now, so the control is honest on either engine. An
    // external agent row still has none.
    expect(focus).toContain('const canSetMode = !item.agent;');
    expect(focus.match(/const claudeCode = /g)).toHaveLength(1);
  });
});
