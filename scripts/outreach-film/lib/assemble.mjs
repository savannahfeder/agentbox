// Builds the film's whole world from a brief that passed checkBrief. Everything
// that is the same in every film is fixed here, not written by a model: who the
// teammates are, how busy their week was, which thread plays which part in her
// words, the priorities, and the options she presses.

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const AVATAR = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23c9c3bd'/%3E%3Cstop offset='1' stop-color='%23928b85'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' fill='url(%23g)'/%3E%3C/svg%3E";
export const MIGRATION_OPTIONS = ['Run it on staging', 'Run it on a copy first', 'Make changes'];

export function filmFromBrief(b, files) {
  const P = (name) => { if (!b.projects.includes(name)) throw new Error(`"${name}" is not one of the projects`); return slug(name); };
  const thread = (t, extra) => ({ project: P(t.project), title: t.title, ask: t.ask, summary: t.summary, progress: t.progress ?? [], context: t.context ?? [], options: t.options ?? [], ...extra });
  const change = {
    plus: 0, minus: 0, editCount: b.migration.change.files.length, committed: false, uncommitted: true,
    files: b.migration.change.files.map((f) => ({
      path: f.path, plus: f.rows.filter((r) => r[0] === '+').length, minus: f.rows.filter((r) => r[0] === '-').length, hunks: [{ said: f.said, rows: f.rows }],
    })),
  };
  change.plus = change.files.reduce((a, f) => a + f.plus, 0);
  change.minus = change.files.reduce((a, f) => a + f.minus, 0);
  const firstCloud = b.running.findIndex((x) => x.cloud);
  return {
    company: { name: b.company.name, domain: b.company.domain, oneLiner: b.company.oneLiner, logoFile: files.logo, siteFile: files.site },
    headlinesFile: files.headlines,
    projects: b.projects.map((name) => ({ slug: slug(name), name, shared: true })),
    needsYou: [
      thread(b.bug, { key: 'bug', priority: 9 }),
      thread(b.migration, { key: 'migration', priority: 8, options: MIGRATION_OPTIONS }),
      { key: 'headlines', project: P(b.headlines.project), priority: 7, title: `Try new headlines for ${b.company.domain}`, ask: 'Three headlines, each on the real homepage. Pick one.',
        summary: 'Three new headlines for the homepage hero, each drawn on the live page so you can see it in place. Nothing is published.',
        progress: ['Read the homepage and the docs', 'Wrote three headlines', 'Drew each one on the live page'], context: [b.headlines.why],
        picture: { file: 'headlines.png', alt: 'Three headlines on the homepage' }, options: ['The first one', 'The second one', 'The third one'] },
      thread(b.fourth, { priority: 5 }),
      thread(b.jordan, { key: 'jordan', priority: 4, engine: 'codex', comment: b.jordan.comment }),
      thread(b.sixth, { priority: 3, engine: 'codex' }),
      { key: 'maya', project: P(b.maya.project), priority: 8, from: 'maya', title: b.maya.title, ask: b.maya.ask, summary: b.maya.summary, context: [b.maya.context], options: [],
        assignee: 'me', people: ['maya', 'me'], body: b.maya.body, comment: b.maya.comment, reply: b.maya.reply },
    ],
    running: b.running.map((r, i) => ({ project: P(r.project), title: r.title, activity: r.activity, ...(r.cloud ? { cloud: true } : {}), ...(i === firstCloud ? { key: 'cloud' } : {}) })),
    done: b.done.map((d) => ({ project: P(d.project), title: d.title, result: d.result })),
    team: {
      me: { id: 'me', name: ' ', role: 'owner', avatar: AVATAR },
      people: [
        { id: 'maya', name: 'Maya Chen', threads: [{ title: b.maya.title, project: b.maya.project, state: 'waiting', problem: b.maya.summary }, { ...b.team.maya.working, state: 'running' }], week: [3, 5, 2, 6, 4, 0, 3], doneProject: b.team.maya.doneProject, doneTitles: b.team.maya.done },
        { id: 'jordan', name: 'Jordan Lee', threads: b.team.jordan.working.map((t) => ({ ...t, state: 'running' })), week: [2, 3, 4, 1, 5, 0, 2], doneProject: b.team.jordan.doneProject, doneTitles: b.team.jordan.done },
        { id: 'sam', name: 'Sam Patel', threads: b.team.sam.working.map((t, i) => ({ ...t, state: i ? 'done' : 'running' })), week: [1, 2, 2, 3, 2, 0, 1], doneProject: b.team.sam.doneProject, doneTitles: b.team.sam.done },
      ],
    },
    change,
  };
}
