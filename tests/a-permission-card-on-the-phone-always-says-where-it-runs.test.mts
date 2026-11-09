// A PERMISSION CARD ON THE PHONE ALWAYS SAYS WHERE IT RUNS.
//
// What broke (phone tester, 2026-11-08): the first card in the preview read
// "Link this folder to the Expo project … asks to run" and named no place,
// while the card behind it said "in ~/dev/launch-film". A card whose ask came
// with a description and no folder lost the project too, since the description
// took the lede that names it. Read from approvalCard's `where`.
import { describe, it, expect } from 'vitest';
import { approvalCard } from '../mobile/src/lib/overlays';

const products = [{ slug: 'mac:alpha', name: 'Alpha' }];
const ask = (input: Record<string, unknown>) => ({ id: 'a1', at: 0, product: 'mac:alpha', item: 'w-1', tool: 'Bash', input });

describe('where a card says it runs', () => {
  it('a described ask with no folder names its project', () => {
    expect(approvalCard(ask({ command: 'npx eas-cli init', description: 'Link this folder to the Expo project' }), 0, products, []).where).toBe('asks to run in Alpha');
  });
  it('a folder, when the ask has one, wins over the project', () => {
    expect(approvalCard(ask({ command: 'ls', description: 'List it', cwd: '~/dev/film' }), 0, products, []).where).toBe('asks to run in ~/dev/film');
  });
  it('an undescribed ask already names the project in its lede, so says nothing twice', () => {
    const card = approvalCard(ask({ command: 'ls' }), 0, products, []);
    expect(card.lede).toMatch(/^Alpha /);
    expect(card.where).toBe('');
  });
});
