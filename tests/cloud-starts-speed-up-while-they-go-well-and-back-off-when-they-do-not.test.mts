// CLOUD STARTS SPEED UP WHILE THEY GO WELL AND BACK OFF WHEN THEY DO NOT.
//
// At most two cloud runs could be packing and sending at once, a fixed number. On
// 285 real starts on a 16 GB Mac (2026-10-30) a start took a median of 9.3 s, so
// 200 agents would take about 15 minutes just to begin. Turning the number up
// flatly is what the two was for: Everything once started ten together on a Mac
// already short. So the number is earned, the way the memory check judges a
// command by what it measured and not by its name.
import { describe, it, expect } from 'vitest';
import { StartBudget } from '../main/cloud/start-budget.mts';

const calm = { pressure: 'normal', stallMs: 0 };

describe('how many cloud runs may start at once', () => {
  it('begins where it always has, at two', () => {
    expect(new StartBudget().now()).toBe(2);
  });

  it('a start that went well earns one more', () => {
    const b = new StartBudget();
    b.started(calm);
    expect(b.now()).toBe(3);
    b.started(calm);
    expect(b.now()).toBe(4);
  });

  it('never above its ceiling, however well they go', () => {
    const b = new StartBudget({ ceiling: 5 });
    for (let i = 0; i < 50; i++) b.started(calm);
    expect(b.now()).toBe(5);
    const usual = new StartBudget();
    for (let i = 0; i < 50; i++) usual.started(calm);
    expect(usual.now()).toBe(8);
  });

  it('a start that failed halves it, and never to nothing', () => {
    let at = 0;
    const b = new StartBudget({ start: 16, clock: () => at, coolMs: 10 });
    b.failed();
    expect(b.now()).toBe(8);
    for (let i = 0; i < 10; i++) { at += 10; b.failed(); }
    expect(b.now()).toBe(1);
  });

  it('memory reading tight halves it and earns nothing while it stays tight', () => {
    const b = new StartBudget({ start: 16 });
    b.started({ pressure: 'tight', stallMs: 0 });
    expect(b.now()).toBe(8);
  });

  it('critical memory drops it to one at once', () => {
    const b = new StartBudget({ start: 16 });
    b.started({ pressure: 'critical', stallMs: 0 });
    expect(b.now()).toBe(1);
  });

  it('the app stalling halves it; a stall just under the line does not', () => {
    const b = new StartBudget({ start: 16, ceiling: 32, stallLimitMs: 500 });
    b.started({ pressure: 'normal', stallMs: 499 });
    expect(b.now()).toBe(17);
    b.started({ pressure: 'normal', stallMs: 500 });
    expect(b.now()).toBe(8);
  });

  it('one bad moment halves it once, not once per start landing in that moment', () => {
    let at = 1000;
    const b = new StartBudget({ start: 16, clock: () => at, coolMs: 10_000 });
    b.failed();
    b.failed();
    b.started({ pressure: 'tight', stallMs: 0 });
    expect(b.now()).toBe(8);
    at += 10_000;
    b.failed();
    expect(b.now()).toBe(4);
  });

  it('after backing off it earns nothing until the cool-off has passed', () => {
    let at = 1000;
    const b = new StartBudget({ start: 16, ceiling: 32, clock: () => at, coolMs: 10_000 });
    b.failed();
    b.started(calm);
    expect(b.now()).toBe(8);
    at += 10_000;
    b.started(calm);
    expect(b.now()).toBe(9);
  });

  it('with no reading to go on it neither earns nor loses', () => {
    const b = new StartBudget();
    b.started({});
    expect(b.now()).toBe(3);
  });
});
