// AN AGENT MENTIONED IN A CHAT WORKS IN A PROJECT, AND THE MESSAGE KNOWS WHICH
// TASK ANSWERS IT.
//
// Approved on w-2e8aa16f0f (2026-10-05) and built on w-7b9cb8636a. The @ menu
// ("I like this"), the mention that carries its own project, model and effort
// ("Way 2 ... is def the winner"), and the rule that came with it: "one thing we
// do need is to make sure the agents work in particular projects when we do
// deploy them in chat." Before this, a conversation with a teammate could not
// reach an agent at all: the reply box offered nothing about one, and "Hand it
// to an agent" turned the whole conversation into a single task.
//
// These are the rules the reply box and the send step stand on: where the @
// menu opens, what counts as a mention and its project, when Send must wait,
// and how a sent message carries its agents to every copy of the conversation.
import { describe, it, expect } from 'vitest';
import {
  agentLinks, chatProjects, chatTranscript, encodeMentions, findMentions, mentionQuery, plainWords, sendBlock, taskBrief, taskTitle, withProject, withTask,
} from '../renderer/src/team/agent-mentions.ts';

const PROJECTS = [{ slug: 'agentbox', name: 'Agentbox' }, { slug: 'agentbox-team', name: 'Agentbox Team' }, { slug: 'video', name: 'Astral Video' }];

describe('where the @ menu opens', () => {
  it('opens on an @ that starts a word, with what was typed after it', () => {
    expect(mentionQuery('ask @co', 7)).toEqual({ start: 4, query: 'co' });
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('does not open inside an email address or once a space follows the word', () => {
    expect(mentionQuery('mail me at sam@co', 17)).toBeNull();
    expect(mentionQuery('ask @codex now', 14)).toBeNull();
  });
});

describe('what counts as an agent mention', () => {
  it('reads the agent and, when it names one of yours, its project', () => {
    const [m] = findMentions('@Codex in Agentbox Team find out why', PROJECTS);
    expect(m).toMatchObject({ engine: 'codex', label: 'Codex', start: 0, end: 23 });
    expect(m.project).toEqual(PROJECTS[1]);
  });

  it('takes the longest project name, never half of one', () => {
    expect(findMentions('@Codex in Agentbox please', PROJECTS)[0].project).toEqual(PROJECTS[0]);
    expect(findMentions('@Codex in Agentbox Team please', PROJECTS)[0].project).toEqual(PROJECTS[1]);
  });

  it('reads a mention with no project as one still waiting for it', () => {
    expect(findMentions('hey @Claude Code can you look', PROJECTS)).toEqual([
      { start: 4, end: 16, engine: 'claude', label: 'Claude Code', project: null },
    ]);
  });

  it('does not read an agent’s name without the @, or an @ inside a word', () => {
    expect(findMentions('Codex in Agentbox Team', PROJECTS)).toEqual([]);
    expect(findMentions('me@Codex', PROJECTS)).toEqual([]);
    expect(findMentions('@Codexes', PROJECTS)).toEqual([]);
  });
});

describe('when Send has to wait', () => {
  it('waits, and says why, while an agent has no project', () => {
    expect(sendBlock(findMentions('@Codex look at this', PROJECTS))).toBe('Pick a project for @Codex: click it to choose.');
  });

  it('does not wait once every agent has one, or when there is no agent', () => {
    expect(sendBlock(findMentions('@Codex in Astral Video look', PROJECTS))).toBeNull();
    expect(sendBlock(findMentions('thanks Maya', PROJECTS))).toBeNull();
  });

  it('sets a project by rewriting the mention in place', () => {
    const text = 'please @Codex look';
    const [m] = findMentions(text, PROJECTS);
    expect(withProject(text, m, PROJECTS[2])).toBe('please @Codex in Astral Video look');
  });
});

describe('a sent message carries its agents', () => {
  const text = '@Codex in Agentbox Team find out why, and @Claude Code in Astral Video check the render';
  const mentions = findMentions(text, PROJECTS);
  const sent = encodeMentions(text, mentions, [{ model: 'gpt-5.5', effort: 'medium' }, { model: 'opus', effort: 'high' }]);

  it('as links whose words are the mention and whose address holds the settings', () => {
    expect(sent).toBe('[@Codex in Agentbox Team](agentbox-agent:codex?project=agentbox-team&model=gpt-5.5&effort=medium) find out why, and '
      + '[@Claude Code in Astral Video](agentbox-agent:claude?project=video&model=opus&effort=high) check the render');
  });

  it('which read back to the same agents, projects and settings', () => {
    expect(agentLinks(sent).map(({ raw, ...l }) => l)).toEqual([
      { engine: 'codex', label: 'Codex', project: 'agentbox-team', model: 'gpt-5.5', effort: 'medium', task: null },
      { engine: 'claude', label: 'Claude Code', project: 'video', model: 'opus', effort: 'high', task: null },
    ]);
  });

  it('and point at the task that answers each one, once it exists', () => {
    const [codex] = agentLinks(sent);
    const pointed = withTask(sent, codex, 'w-1234567890');
    expect(agentLinks(pointed)[0].task).toBe('w-1234567890');
    expect(agentLinks(pointed)[1].task).toBeNull();
  });

  it('read as plain words wherever links are not drawn', () => {
    expect(plainWords(sent)).toBe('@Codex in Agentbox Team find out why, and @Claude Code in Astral Video check the render');
  });

  it('leave an ordinary link alone', () => {
    expect(agentLinks('see [the doc](https://example.com)')).toEqual([]);
  });
});

describe('the task an agent mention becomes', () => {
  it('is titled with what was asked, without the mention', () => {
    const sent = encodeMentions('@Codex in Agentbox Team find out why a reply does not reach the list', findMentions('@Codex in Agentbox Team find out why a reply does not reach the list', PROJECTS));
    expect(taskTitle(sent)).toBe('Find out why a reply does not reach the list');
  });

  it('cuts a long ask at a word near eighty characters', () => {
    const long = `@Codex in Agentbox ${'look at every single thing in the settings page '.repeat(4)}`;
    const title = taskTitle(encodeMentions(long, findMentions(long, PROJECTS)));
    expect(title.length).toBeLessThanOrEqual(81);
    expect(title.endsWith('…')).toBe(true);
  });

  it('is briefed with the ask, who asked, and the conversation so far, newest last', () => {
    const brief = taskBrief({
      sent: '[@Codex in Agentbox Team](agentbox-agent:codex?project=agentbox-team) find out why',
      asker: 'Sam Rivera', others: ['Maya Chen'],
      transcript: [{ who: 'Maya Chen', text: 'Replies never show in my list.' }, { who: 'Sam Rivera', text: '@Codex in Agentbox Team find out why' }],
    });
    expect(brief.startsWith('@Codex in Agentbox Team find out why')).toBe(true);
    expect(brief).toContain('Asked by Sam Rivera in a conversation with Maya Chen.');
    expect(brief.indexOf('**Maya Chen:** Replies never show in my list.')).toBeLessThan(brief.indexOf('**Sam Rivera:**'));
  });

  it('keeps only the latest part of a long conversation', () => {
    const transcript = Array.from({ length: 40 }, (_, i) => ({ who: 'Maya Chen', text: `message ${i} ${'x'.repeat(400)}` }));
    const brief = taskBrief({ sent: 'go', asker: 'Sam Rivera', others: ['Maya Chen'], transcript });
    expect(brief).toContain('message 39');
    expect(brief).not.toContain('message 0 ');
    expect(brief.length).toBeLessThan(9000);
  });
});

describe('the projects an agent can be sent to', () => {
  const products = [
    { slug: 'video', name: 'Astral Video' }, { slug: 'zeta', name: 'Zeta' }, { slug: 'agentbox-team', name: 'Agentbox Team' },
    { slug: 'direct-1', name: 'Direct', team: { direct: true } }, { slug: 'practice', name: 'Practice', practice: true }, { slug: 'old', name: 'Old thing' },
  ];

  it('are your projects in your running order, then by name', () => {
    expect(chatProjects(products, ['agentbox-team', 'video']).map((p) => p.slug)).toEqual(['agentbox-team', 'video', 'old', 'zeta']);
  });

  it('never include a conversation, the practice project or a hidden one', () => {
    const slugs = chatProjects(products, [], ['old']).map((p) => p.slug);
    expect(slugs).not.toContain('direct-1');
    expect(slugs).not.toContain('practice');
    expect(slugs).not.toContain('old');
  });
});

describe('the conversation an agent is briefed with', () => {
  it('is the opening message and every reply, oldest first, with who wrote each', () => {
    const lines = [
      { ts: 3, by: 'p-me', patch: { answer: 'Got them, thanks.' } },
      { ts: 1, by: 'p-maya', patch: { title: 'Findings', body: 'Sending my findings.' } },
      { ts: 2, by: 'p-maya', patch: { answer: 'One more.' } },
      { ts: 4, by: 'p-me', patch: { status: 'open' } },
    ];
    const names = { 'p-me': 'Sam Rivera', 'p-maya': 'Maya Chen' };
    expect(chatTranscript(lines, (by) => names[by])).toEqual([
      { who: 'Maya Chen', text: 'Sending my findings.' }, { who: 'Maya Chen', text: 'One more.' }, { who: 'Sam Rivera', text: 'Got them, thanks.' },
    ]);
  });

  it('leaves out a reply that was taken back', () => {
    expect(chatTranscript([{ ts: 1, by: 'p-me', patch: { answer: '(withdrawn)' } }], () => 'Sam')).toEqual([]);
  });
});
