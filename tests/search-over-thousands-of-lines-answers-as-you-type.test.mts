// SEARCH MUST ANSWER AS YOU TYPE ON A STORE WITH THOUSANDS OF LINES.
//
// Reading every thread's lines would be useless if each keystroke paid for it.
// The finder reads a thread once into a folded copy and rebuilds only when its
// version changes. This builds 600 threads of 40 lines each (24,000 lines) with
// a markdown file on every tenth, and measures: the first read of everything,
// then a keystroke at a time, then a keystroke after one thread changed. The
// numbers are printed so a commit can quote them; the bounds are loose enough
// for a busy shared Mac.
import { describe, it, expect } from 'vitest';
import { createFinder } from '../main/everything-found.mts';

const THREADS = 600;
const PER_THREAD = 40;
const WORDS = 'ship plan review deploy clinic booking invoice render amber onboarding status launch pricing beta hero design copy fix test build'.split(' ');
const pick = (i, n) => Array.from({ length: n }, (_, k) => WORDS[(i * 7 + k * 13) % WORDS.length]).join(' ');

function fixture() {
  const versions = new Map();
  const lines = new Map();
  for (let t = 0; t < THREADS; t += 1) {
    const rows = [];
    for (let i = 0; i < PER_THREAD; i += 1) {
      rows.push({ id: `t${t}`, uid: `u${t}-${i}`, ts: 1000 + t * 100 + i, by: i % 3 ? 'p-maya' : 'p-dev', source: i % 5 ? 'founder' : 'agent', patch: i % 5 ? { answer: `${pick(t + i, 14)} number ${t}-${i}` } : { result: `${pick(t * i, 20)} done ${t}-${i}` } });
    }
    if (t % 10 === 0) rows.push({ id: `t${t}`, uid: `f${t}`, ts: 9000 + t, source: 'agent', patch: { result: `Wrote [the plan](plan-${t}.md).` } });
    versions.set(`t${t}`, 1);
    lines.set(`t${t}`, rows);
  }
  // One line only one thread has, to be found among the rest.
  lines.get('t417').push({ id: 't417', uid: 'needle', ts: 99999, by: 'p-dev', source: 'founder', patch: { answer: 'Dev posted the quokka status for the clinics.' } });
  const finder = createFinder({
    listThreads: () => [...versions].map(([key, version]) => ({ key, kind: 'thread', product: 'p', id: key, version, updatedAt: version })),
    loadThread: async (t) => ({ lines: lines.get(t.key), resolve: async (src) => `/virtual/${src}` }),
    readText: async (file) => `# ${file}\n\n${Array.from({ length: 300 }, (_, i) => `${pick(i, 10)} line ${i}`).join('\n')}\n`,
  });
  return { finder, versions, lines };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
// CPU time, not the clock: this Mac runs a dozen agents and its load average is
// often over 100, which turns a 15 ms scan into a 250 ms wait for a turn.
async function timed(fn) {
  const t0 = process.cpuUsage();
  const out = await fn();
  const used = process.cpuUsage(t0);
  return [(used.user + used.system) / 1000, out];
}

describe('searching 24,000 lines', () => {
  it('reads everything once, then answers each keystroke in a few milliseconds', async () => {
    const { finder } = fixture();
    const [first] = await timed(() => finder.warm());
    const typed = ['q', 'qu', 'quo', 'quok', 'quokk', 'quokka', 'quokka st', 'quokka status'];
    const times = [];
    let last;
    for (const q of typed) { const [ms, got] = await timed(() => finder.search(q)); times.push(ms); last = got; }
    const common = [];
    for (const q of ['review', 'plan', 'ship deploy', 'number 3']) { const [ms] = await timed(() => finder.search(q)); common.push(ms); }
    console.log(`find: read 24,000 lines in ${first.toFixed(0)} ms; a keystroke takes ${median(times).toFixed(1)} ms (worst ${Math.max(...times).toFixed(1)} ms); a word in many lines ${median(common).toFixed(1)} ms (worst ${Math.max(...common).toFixed(1)} ms)`);
    expect(last.lines[0]).toMatchObject({ id: 't417', uid: 'needle', by: 'p-dev' });
    expect(Math.max(...times)).toBeLessThan(250);
    expect(Math.max(...common)).toBeLessThan(250);
  });

  it('rereads only the thread that changed', async () => {
    const { finder, versions, lines } = fixture();
    await finder.warm();
    lines.get('t5').push({ id: 't5', uid: 'late', ts: 123456, by: 'p-dev', source: 'founder', patch: { answer: 'A brand new zanzibar line.' } });
    expect((await finder.search('zanzibar')).lines).toHaveLength(0);
    versions.set('t5', 2);
    const [ms, got] = await timed(() => finder.search('zanzibar'));
    console.log(`find: one thread changed, next keystroke ${ms.toFixed(1)} ms`);
    expect(got.lines[0]).toMatchObject({ id: 't5', uid: 'late' });
    expect(ms).toBeLessThan(250);
  });

  it('finds markdown by contents across sixty files', async () => {
    const { finder } = fixture();
    await finder.warm();
    const [ms, got] = await timed(() => finder.search('line 299'));
    console.log(`find: contents of 60 markdown files, ${ms.toFixed(1)} ms`);
    expect(got.total.files).toBe(60);
    expect(ms).toBeLessThan(250);
  });
});
