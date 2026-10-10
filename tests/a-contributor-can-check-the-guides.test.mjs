// Contributor checks must reject broken local links and invalid issue forms before CI accepts them.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { checkRepository, checkMarkdown, checkForm } from '../scripts/check-contribution-files.mjs';
describe('contribution checks', () => {
  it('validates the committed contributor guides and forms', () => {
    expect(checkRepository(fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, ''))).toEqual([]);
  });
  it('reports a missing local guide', () => {
    expect(checkMarkdown('[guide](missing.md)', () => false)).toEqual(['missing.md']);
  });
  it('ignores remote links and fenced examples', () => {
    expect(checkMarkdown('[web](https://example.com)\n```\n[x](missing)\n```', () => false)).toEqual([]);
  });
  it('checks local files without their fragment', () => {
    expect(checkMarkdown('[guide](guide.md#setup)', p => p === 'guide.md')).toEqual([]);
  });
  it('rejects duplicate field identifiers', () => {
    expect(() => checkForm({name:'Bug',description:'Report',body:[{type:'input',id:'same',attributes:{label:'A'}},{type:'textarea',id:'same',attributes:{label:'B'}}]}, [])).toThrow(/duplicate/);
  });
  it('rejects labels that do not exist', () => {
    expect(() => checkForm({name:'Bug',description:'Report',labels:['missing'],body:[{type:'markdown',attributes:{value:'Help'}}]}, [])).toThrow(/label/);
  });
});
