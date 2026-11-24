// A RECENT CHAT IN SETUP SAYS WHERE IT CAME FROM AND OPENS (w-6235a4e92a, 2026-11-24).
//
// On the Nov 23 onboarding call a new person met "Add your recent agents" with
// a chat from his own Claude Code titled "Handle suspected heart attack", and
// could not tell where it came from or what it was: each row was a title and
// an age, and a press only ticked it. The founder picked the drawing
// designs/w-6235a4e92a/chats-1-where-it-came-from-and-open-beside.png: each
// chat names its agent and folder under its title, and a press opens it beside
// the list with what you asked and the agent's last reply.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { chatFrom, chatOpened, chatReplyLabel } from '../renderer/src/setup-split.ts';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');

describe('where a recent chat came from', () => {
  it('names the agent and the folder', () => {
    expect(chatFrom({ source: 'terminal', short: '~/code/dosewise' })).toBe('Claude Code · ~/code/dosewise');
    expect(chatFrom({ source: 'codex', short: '~/code/payments-api' })).toBe('Codex · ~/code/payments-api');
  });
  it('says which Claude it was when it was not the terminal', () => {
    expect(chatFrom({ source: 'editor', short: '~/code/web' })).toBe('Claude Code in your editor · ~/code/web');
    expect(chatFrom({ source: 'desktop', short: '~/code/web' })).toBe('Claude app · ~/code/web');
  });
  it('leaves out a folder it does not know, rather than a dangling dot', () => {
    expect(chatFrom({ source: 'desktop', short: '' })).toBe('Claude app');
    expect(chatFrom({ source: 'terminal' })).toBe('Claude Code');
  });
  it('keeps the end of a long folder, which names it, and the whole folder when opened', () => {
    const deep = '~/Desktop/dev/clients/northwind/peptide-app';
    expect(chatFrom({ source: 'terminal', short: deep })).toBe('Claude Code · …/northwind/peptide-app');
    expect(chatFrom({ source: 'terminal', short: deep }, { whole: true })).toBe(`Claude Code · ${deep}`);
    const fits = `~/code/${'a'.repeat(25)}`;
    expect(fits).toHaveLength(32);
    expect(chatFrom({ source: 'terminal', short: fits })).toBe(`Claude Code · ${fits}`);
    expect(chatFrom({ source: 'terminal', short: `${fits}b` })).toBe(`Claude Code · …/code/${'a'.repeat(25)}b`);
  });
  it('labels the last reply by its agent', () => {
    expect(chatReplyLabel('codex')).toBe('Codex, last reply');
    expect(chatReplyLabel('terminal')).toBe('Claude Code, last reply');
    expect(chatReplyLabel('desktop')).toBe('Claude, last reply');
  });
});

describe('what an opened chat shows', () => {
  it('is what you asked first and what the agent said last', () => {
    expect(chatOpened({ firstSaid: '  Add a dose reminder.\n', lastSaid: 'Done.  ' })).toEqual({ asked: 'Add a dose reminder.', said: 'Done.' });
  });
  it('is empty where the chat end was never read, not a made-up line', () => {
    expect(chatOpened({ firstSaid: 'Fix the login test', endUnknown: true })).toEqual({ asked: 'Fix the login test', said: '' });
    expect(chatOpened({})).toEqual({ asked: '', said: '' });
  });
});

describe('the chats step', () => {
  it('draws the line under each title and the agent logo beside it', () => {
    expect(split).toMatch(/<span className="ss-sub">\{chatFrom\(t\)\}<\/span>/);
    expect(split).toMatch(/<EngineLogo engine=\{t\.source === 'codex' \? 'codex' : 'claude'\}/);
  });
  it('opens a chat on a press of its row, and ticks it only on its box', () => {
    expect(split).toMatch(/onClick=\{\(\) => setOpenChat\(\(was\) => \(was === t\.id \? null : t\.id\)\)\}/);
    expect(split).toMatch(/className="ss-tick"[^>]*onClick=\{\(e\) => \{ e\.stopPropagation\(\); p\.onToggle\(t\.id\); \}\}/);
  });
  it('closes the open chat on Escape', () => {
    expect(split).toMatch(/if \(e\.key === 'Escape' && openChat\) \{ e\.preventDefault\(\); setOpenChat\(null\); return; \}/);
  });
  it('shows the open chat beside the list, as a dialog people can read', () => {
    expect(split).toMatch(/className="ss-chat-open" role="dialog"/);
    expect(split).toMatch(/chatFrom\(chat, \{ whole: true \}\)/);
    // The app is drawn above the setup, so the open chat is portalled above both, as the folder picker is.
    expect(split).toMatch(/createPortal\(<ChatOpen /);
    const z = (sel: string) => Number(css.match(new RegExp(`${sel} \\{[^}]*z-index: (\\d+)`))?.[1]);
    expect(z('\\.ss-chat-open')).toBeGreaterThan(z(':root\\[data-setup\\] #root'));
  });
});
