// The phone parity audit of 2026-11-21 read every Settings page in both apps
// and found the phone still on older desktop wording: the desktop shortened
// five rows on 2026-11-21 (793a88a18), renamed "Show in your inbox" and the
// project's "Any account" in October, and gave Rooms a line under its title.
// The phone's Running page also kept Pause and Resume rows the desktop moved
// to ⌘K, showed "Something felt slow" when the count was set by hand, and
// labelled Automatic with today's count instead of Automatic's own number
// (the desktop fixed that in cd0d70694). Its theme tiles were square with a
// 2px orange frame where the desktop's are rounded, with a 1px edge and a tick.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const desk = fs.readFileSync('renderer/src/components/Settings.tsx', 'utf8');
const pages = fs.readFileSync('mobile/src/ui/SettingsPages.tsx', 'utf8');
const project = fs.readFileSync('mobile/src/app/settings/project/[slug].tsx', 'utf8');
const running = pages.slice(pages.indexOf('function Running('), pages.indexOf('function OutsideAgents('));
const appearance = pages.slice(pages.indexOf('<Group label="Theme">'), pages.indexOf('</Group>', pages.indexOf('<Group label="Theme">')));

const SAME = [
  ['Stop programs agents leave behind', pages, 'Dev servers and test runs an agent started stop when you close its task or memory runs short. Your own apps never do.'],
  ['Bring in new chats', pages, 'A Claude Code or Codex chat in one of your projects comes in after ten quiet minutes.'],
  ['Terminal sessions', pages, 'label="Show while they run"'],
  ['Terminal sessions, Never', pages, "off: 'Each is still in its project’s sidebar.'"],
  ['Let agents start the tasks they file here', project, 'A task an agent writes here starts at once instead of waiting for your yes. Questions and reviews still wait.'],
  ['Archive this project, while agents run', project, "', and the agents running now finish'"],
  ['Claude account', project, "label: 'The account in use'"],
  ['Rooms', pages, 'What people in your rooms see of you. Private threads never show.'],
] as const;

describe("the phone's Settings say what the desktop's Settings say", () => {
  for (const [row, phone, words] of SAME) {
    it(`${row}: the desktop says it, and so does the phone`, () => {
      expect(desk).toContain(words);
      expect(phone).toContain(words);
    });
  }
  it('says Archive in the desktop words, and that only the computer brings a project back, since the phone cannot', () => {
    expect(desk).toContain('. Its files stay, and Projects can bring it back.');
    expect(project).toContain('. Its files stay, and Projects on your computer can bring it back.');
  });
  it('keeps none of the older words', () => {
    expect(pages).not.toMatch(/Apps installed on your computer are never stopped/);
    expect(pages).not.toMatch(/Waiting ones go to Needs you, finished ones to Done/);
    expect(pages).not.toMatch(/label="Show in your inbox"/);
    expect(pages).not.toMatch(/None reach your inbox/);
    expect(project).not.toMatch(/gets a session straight away/);
    expect(project).not.toMatch(/you can bring it back from Projects on your computer/);
    expect(project).not.toMatch(/label: 'Any account'/);
  });
});

describe("the phone's Running page", () => {
  it('has no Pause or Resume rows, which the desktop keeps on ⌘K', () => {
    expect(desk).toMatch(/PAUSING IS A COMMAND, NOT A SETTING/);
    expect(running).not.toMatch(/Pause agents|Unpause agents|Resume interrupted agents/);
  });
  it('offers "Something felt slow" only while the count is automatic, as the desktop does', () => {
    expect(desk).toMatch(/\{w\.agentsAuto && \(\s*<Row\s*label="Something felt slow"/);
    expect(running).toMatch(/\{isAutoNow\(s, w\) \? \(\s*<Row label="Something felt slow"/);
  });
  it("labels Automatic with Automatic's own number once a number is set by hand", () => {
    expect(desk).toContain('(w.agentsAuto === false ? w.agentsAutoTotal : undefined) ?? w.agentsTotal');
    expect(pages).toMatch(/Automatic \(\$\{say\(\(isAuto \? undefined : w\.agentsAutoTotal\) \?\? w\.agentsTotal\)\}\)/);
  });
});

describe("the phone's theme tiles", () => {
  it('are rounded with a 1px edge, accent only when picked, as the desktop draws them', () => {
    expect(appearance).toMatch(/borderRadius: corner\.small/);
    expect(appearance).toMatch(/borderWidth: 1, borderColor: on \? color\.accent : color\.line/);
    expect(appearance).not.toMatch(/borderWidth: on \? 2 : 1/);
  });
  it('wear a tick on the picked one', () => {
    expect(desk).toMatch(/className="look-tick"/);
    expect(appearance).toMatch(/\{on && <LookTick \/>\}/);
  });
});
