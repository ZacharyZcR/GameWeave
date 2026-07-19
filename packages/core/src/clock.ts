export interface FixedClockOptions {
  readonly step?: number;
  readonly maxSubSteps?: number;
}

export class FixedClock {
  readonly step: number;
  readonly maxSubSteps: number;
  #accumulator = 0;
  #tick = 0;

  constructor(options: FixedClockOptions = {}) {
    this.step = options.step ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 8;

    if (!(this.step > 0) || !Number.isFinite(this.step)) {
      throw new Error("Fixed clock step must be a positive finite number");
    }

    if (!Number.isInteger(this.maxSubSteps) || this.maxSubSteps < 1) {
      throw new Error("maxSubSteps must be a positive integer");
    }
  }

  get tick(): number {
    return this.#tick;
  }

  advance(delta: number, run: (dt: number, tick: number) => void): number {
    if (delta < 0 || !Number.isFinite(delta)) {
      throw new Error("Clock delta must be a non-negative finite number");
    }

    this.#accumulator += delta;
    let steps = 0;

    while (this.#accumulator >= this.step && steps < this.maxSubSteps) {
      this.#accumulator -= this.step;
      this.#tick += 1;
      steps += 1;
      run(this.step, this.#tick);
    }

    if (steps === this.maxSubSteps) {
      this.#accumulator = Math.min(this.#accumulator, this.step);
    }

    return steps;
  }

  stepOnce(run: (dt: number, tick: number) => void): void {
    this.#tick += 1;
    run(this.step, this.#tick);
  }
}
