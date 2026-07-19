export interface ScheduledTask {
  readonly id: number;
  cancel(): void;
}

interface PendingTask {
  readonly id: number;
  at: number;
  readonly interval?: number;
  readonly run: () => void;
  cancelled: boolean;
}

export class Scheduler {
  #now = 0;
  #nextId = 1;
  #tasks: PendingTask[] = [];

  get now(): number {
    return this.#now;
  }

  after(seconds: number, run: () => void): ScheduledTask {
    return this.#schedule(seconds, undefined, run);
  }

  every(seconds: number, run: () => void): ScheduledTask {
    if (!(seconds > 0)) throw new Error("Interval must be positive");
    return this.#schedule(seconds, seconds, run);
  }

  advance(dt: number): void {
    if (dt < 0 || !Number.isFinite(dt)) {
      throw new Error("Scheduler delta must be a non-negative finite number");
    }
    this.#now += dt;
    const due = this.#tasks
      .filter((task) => !task.cancelled && task.at <= this.#now + 1e-12)
      .sort((a, b) => a.at - b.at || a.id - b.id);

    for (const task of due) {
      if (task.cancelled) continue;
      task.run();
      if (task.interval === undefined) {
        task.cancelled = true;
      } else {
        task.at += task.interval;
      }
    }
    this.#tasks = this.#tasks.filter((task) => !task.cancelled);
  }

  clear(): void {
    this.#tasks = [];
  }

  #schedule(
    delay: number,
    interval: number | undefined,
    run: () => void,
  ): ScheduledTask {
    if (delay < 0 || !Number.isFinite(delay)) {
      throw new Error("Delay must be a non-negative finite number");
    }
    const task: PendingTask = {
      id: this.#nextId++,
      at: this.#now + delay,
      run,
      cancelled: false,
      ...(interval === undefined ? {} : { interval }),
    };
    this.#tasks.push(task);
    return {
      id: task.id,
      cancel: () => {
        task.cancelled = true;
      },
    };
  }
}
