// A NEW PROJECT LANDED ABOVE WORK THAT HAD BEEN THERE FOR WEEKS.
//
// Measured on the Linux box, 2026-10-23 (F-35): Settings > Projects held
// "My Workspace" at 01 and "Web Todo" at 02. Adding "Py Tempconv" drew it at
// 02 and pushed Web Todo to 03. Nothing had been dragged and no screen said
// why. The cause: projects nobody has placed in the running order followed the
// placed ones ALPHABETICALLY, and P sorts before W.
//
// A project is made far more often than it is dragged, so the list a person has
// learnt the shape of reshuffled every time. By age the new one goes where a
// new thing belongs, at the bottom, and nothing above it moves.
//
// The boundary either side: a project that IS placed keeps its place whatever
// its age, and a project with no `createdAt` (made before the field was
// written) reads as old rather than new, because it is.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rankProducts } from '../renderer/src/project-priority.ts';
import { Store } from '../main/store.mjs';

const day = (n) => Date.parse(`2026-10-${String(n).padStart(2, '0')}T00:00:00Z`);
const p = (slug, createdAt) => ({ slug, name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), createdAt });

describe('the running order over the projects', () => {
  // THE DEFECT, as the thing it did on her screen.
  it('puts a project made today under the ones already there', () => {
    const list = [p('my-workspace', day(1)), p('web-todo', day(5)), p('py-tempconv', day(23))];
    expect(rankProducts(list, ['my-workspace']).map((x) => x.slug))
      .toEqual(['my-workspace', 'web-todo', 'py-tempconv']);
  });

  // THE CASE THAT MUST NOT MATCH: age never moves a project somebody placed.
  it('leaves a placed project exactly where it was placed', () => {
    const list = [p('web-todo', day(5)), p('py-tempconv', day(23)), p('my-workspace', day(1))];
    expect(rankProducts(list, ['py-tempconv', 'my-workspace']).map((x) => x.slug))
      .toEqual(['py-tempconv', 'my-workspace', 'web-todo']);
  });

  // THE BOUNDARY: one made before `createdAt` was written reads as the oldest,
  // and the name settles a tie, so the order is still the same every render.
  it('reads a project with no date as older than the dated ones, name breaking ties', () => {
    const list = [p('zeta', day(9)), p('older', null), p('alpha', null)];
    expect(rankProducts(list, []).map((x) => x.slug)).toEqual(['alpha', 'older', 'zeta']);
  });

  it('answers an empty order with the whole list and an empty list with nothing', () => {
    expect(rankProducts([], ['gone'])).toEqual([]);
    expect(rankProducts([p('one', day(1))], ['gone']).map((x) => x.slug)).toEqual(['one']);
  });
});

describe('the date the order reads', () => {
  // The rule above is only as good as the fact under it, and `listProducts`
  // did not carry one.
  it('comes off project.json, as epoch ms, and is null when there is none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-store-'));
    const write = (slug, project) => {
      fs.mkdirSync(path.join(root, slug), { recursive: true });
      fs.writeFileSync(path.join(root, slug, 'project.json'), JSON.stringify(project));
    };
    write('dated', { id: 'dated', name: 'Dated', createdAt: '2026-10-23T18:04:00.000Z' });
    write('undated', { id: 'undated', name: 'Undated' });
    const store = new Store({ accountRoot: root, storeRoot: root, products: [] });
    const by = Object.fromEntries(store.listProducts().map((x) => [x.slug, x.createdAt]));
    expect(by.dated).toBe(Date.parse('2026-10-23T18:04:00.000Z'));
    expect(by.undated).toBe(null);
  });
});
