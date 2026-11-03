// A SHARED FILE NAMES THE PERSON OR AGENT WHO SHARED IT.
//
// Sofia's copywriter wrote the shot list and her approval sent it to
// Maya and Dev. The page said "Shared by you" to Sofia, who did not write it,
// and Maya read "Shared by you" on a document Sofia's agent had written: "a
// reader would blame me for the document". Measured: the byline read only the
// line's writer, and an agent's line on its owner's own Mac has none, so it
// read as "you".
import { describe, it, expect } from 'vitest';
import { filesInLines, sharedByWords, threadFiles } from '../shared/artifact-marks.mjs';

const SOFIA = 'p-sofia';
const MAYA = 'p-maya';
const names = { [SOFIA]: 'Sofia', [MAYA]: 'Maya' };
const nameOf = (id) => names[id] ?? 'A teammate';
const versionOf = (line) => threadFiles(filesInLines([line]))[0].versions[0];
const said = (line, me) => sharedByWords(versionOf(line), { me, nameOf });

const agentLine = { source: 'agent', ts: 1, patch: { result: 'Saved `launch-film-shot-list.md`.' } };
const sentByHerAgent = { source: 'founder', by: SOFIA, ts: 2, patch: { answer: 'The shot list: [launch-film-shot-list.md](attachments/k-launch-film-shot-list.md)', voice: { name: 'Lumen copywriter' } } };
const hers = { source: 'founder', by: SOFIA, ts: 3, patch: { answer: '[cut.mp4](attachments/k-cut.mp4)' } };

describe('who a file says shared it', () => {
  it('her own agent\'s file, on her Mac, is not hers', () => {
    expect(said(agentLine, SOFIA)).toBe('Shared by your agent');
  });

  it('a named agent\'s file names the agent, and who it works for', () => {
    expect(said(sentByHerAgent, SOFIA)).toBe('Shared by Lumen copywriter for you');
    expect(said(sentByHerAgent, MAYA)).toBe('Shared by Lumen copywriter for Sofia');
  });

  it('a teammate\'s agent with no name says whose it is', () => {
    expect(said({ ...agentLine, by: SOFIA }, MAYA)).toBe("Shared by Sofia's agent");
    // A plain thread speaks as "Agent", which is not a name.
    const plain = { ...sentByHerAgent, patch: { ...sentByHerAgent.patch, voice: { name: 'Agent' } } };
    expect(said(plain, MAYA)).toBe("Shared by Sofia's agent");
    expect(said(plain, SOFIA)).toBe('Shared by your agent');
  });

  it('a person\'s own file still says you to them and their name to others', () => {
    expect(said(hers, SOFIA)).toBe('Shared by you');
    expect(said(hers, MAYA)).toBe('Shared by Sofia');
  });
});
