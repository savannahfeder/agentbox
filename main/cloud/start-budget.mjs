// HOW MANY CLOUD RUNS MAY BE STARTING AT ONCE, earned rather than fixed
// (tests/cloud-starts-speed-up-while-they-go-well-and-back-off-when-they-do-not).
//
// A start is packing and sending on whatever machine holds the store, so what it
// may cost depends on that machine and this moment. Each start that went well on
// a calm machine earns one more. A failure, memory short, or the app stalling
// halves it; one bad moment counts once. The ceiling is low until real packing
// has been measured at this rate: a stand-in with tiny files proved nothing about
// a 278 MB transcript.

const STALL_LIMIT_MS = 500;
const COOL_MS = 30_000;

export class StartBudget {
  constructor({ start = 2, floor = 1, ceiling = 8, stallLimitMs = STALL_LIMIT_MS, coolMs = COOL_MS, clock = Date.now } = {}) {
    Object.assign(this, { value: start, floor, ceiling, stallLimitMs, coolMs, clock });
    this.cutAt = -Infinity;
  }

  now() { return this.value; }

  started({ pressure, stallMs } = {}) {
    if (pressure === 'critical') { this.value = this.floor; this.cutAt = this.clock(); return; }
    if (pressure === 'tight' || (stallMs ?? 0) >= this.stallLimitMs) { this._cut(); return; }
    if (this.clock() - this.cutAt >= this.coolMs) this.value = Math.min(this.ceiling, this.value + 1);
  }

  failed() { this._cut(); }

  _cut() {
    const at = this.clock();
    if (at - this.cutAt < this.coolMs) return;
    this.cutAt = at;
    this.value = Math.max(this.floor, Math.floor(this.value / 2));
  }
}
