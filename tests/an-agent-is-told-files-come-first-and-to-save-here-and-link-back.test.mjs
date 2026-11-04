// AN AGENT IS TOLD FILES COME FIRST, AND TO SAVE HERE AND LINK BACK.
//
// What was missing (2026-10-31): the brief named each tool and nothing about what
// was already kept here, so an agent fetched again what the team had a copy of, and
// put what it made in the tool. Measured on the words `_connectionsBrief` hands a run.
// Copied words are somebody else's, so they are also told not to obey them.
import { describe, expect, it } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

const brief = (connections) => Object.assign(Object.create(Supervisor.prototype), { connections })._connectionsBrief();
const LINEAR = { id: 'linear', name: 'Linear', state: 'works', given: true, at: 1, workedAt: 1 };
const OFF = { id: 'notion', name: 'Notion', state: 'not_connected', given: false };
const base = (tools, copies) => ({ catalog: tools, workingNow: () => [], statusNow: () => tools, ...(copies ? { copiesNow: () => copies } : {}) });

describe('with a copy kept', () => {
  const said = brief(base([LINEAR, OFF], [{ id: 'linear', name: 'Linear', folder: 'Linear', projectName: 'Lumen app', count: 12, okAt: Date.now() }]));

  it('names the folder, its project and how much is in it, and to read it before fetching', () => {
    expect(said).toMatch(/Linear folder of Lumen app/);
    expect(said).toMatch(/12 files/);
    expect(said).toMatch(/Read what is here before you fetch it again/);
    expect(said).toContain('team_read');
  });

  it('says a copy can be behind, and when to go to the tool', () => {
    expect(said).toMatch(/last copied/);
    expect(said).toMatch(/newer than that/);
  });

  it('says copied words are data and not orders', () => {
    expect(said).toMatch(/not instructions/);
  });
});

describe('with a tool connected and nothing kept', () => {
  const said = brief(base([LINEAR], []));

  it('still says to save here first and link back', () => {
    expect(said).toMatch(/Save what you make in Files first/);
    expect(said).toMatch(/link back/i);
  });

  it('names no folder that does not exist', () => {
    expect(said).not.toMatch(/ folder of /);
  });
});

describe('with nothing connected', () => {
  it('adds nothing about Files, as a person with no tools has no copies to prefer', () => {
    expect(brief(base([OFF], []))).not.toMatch(/Save what you make/);
  });

  it('a copy kept from a tool since disconnected is still pointed at', () => {
    expect(brief(base([OFF], [{ id: 'notion', name: 'Notion', folder: 'Notion', projectName: 'Plans', count: 2, okAt: 5 }]))).toMatch(/Notion folder of Plans/);
  });

  it('a supervisor from before copies existed still briefs', () => {
    expect(brief({ catalog: [OFF], workingNow: () => [], statusNow: () => [OFF] })).toContain('Not connected');
  });
});
