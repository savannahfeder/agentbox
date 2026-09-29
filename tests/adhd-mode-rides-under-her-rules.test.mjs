// ADHD MODE (w-5737fe67cf). Turning the mode on appends its extra
// instructions, and turning it off removes them. So: a switch in the config,
// and its rules in their own file, riding under the message rules only while
// the switch is on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { readInstruction, writeInstruction } from '../main/instruction-settings.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

const make = (config = {}) => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhd-app-'));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhd-user-'));
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'briefs'))) {
    fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(appDir, 'briefs', f));
  }
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  const s = new Supervisor({ storeRoot: userDir, maxConcurrentSessions: 1, ...config }, store, appDir, appDir, userDir);
  return { s, userDir };
};

describe('ADHD mode rides under her rules only while it is on', () => {
  it('is off out of the box and adds nothing', () => {
    expect(make().s.adhdRules()).toBeNull();
  });

  it('adds the shipped rules when she turns it on', () => {
    const rules = make({ adhdMode: true }).s.adhdRules();
    expect(rules).toContain('ADHD mode is on');
    expect(rules).toContain('The first line is the thing to do or answer, in bold.');
  });

  it('uses her edited copy, and an emptied box adds nothing', () => {
    const { s, userDir } = make({ adhdMode: true });
    writeInstruction(userDir, 'adhd', '- Keep it to three lines.\n');
    expect(s.adhdRules()).toContain('Keep it to three lines.');
    expect(s.adhdRules()).not.toContain('in bold');
    writeInstruction(userDir, 'adhd', '');
    expect(s.adhdRules()).toBeNull();
  });

  it('keeps her edits while it is off', () => {
    const { s, userDir } = make({ adhdMode: true });
    writeInstruction(userDir, 'adhd', '- Mine.\n');
    s.config.adhdMode = false;
    expect(s.adhdRules()).toBeNull();
    expect(readInstruction(userDir, 'adhd').text).toBe('- Mine.\n');
    s.config.adhdMode = true;
    expect(s.adhdRules()).toContain('Mine.');
  });

  it('goes into the system prompt directly after the message rules', () => {
    const src = read('main/supervisor.mjs');
    expect(src).toContain('[standing, project, messages, adhd]');
  });

  it('ships a default that is the brief file, so Reset puts it back', () => {
    const defaults = JSON.parse(read('shared/instruction-defaults.json'));
    expect(defaults.adhd).toBe(read('briefs/adhd-mode.md'));
    expect(readInstruction(fs.mkdtempSync(path.join(os.tmpdir(), 'adhd-empty-')), 'adhd').text).toBe(defaults.adhd);
  });
});
