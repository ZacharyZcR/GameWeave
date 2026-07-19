import { FixedClock } from "./clock.js";
import { World } from "./world.js";
import type { FixedClockOptions } from "./clock.js";
import type { SystemPhase } from "./types.js";
import type { WorldOptions } from "./world.js";
import type { GamePlugin } from "./plugin.js";

export interface GameOptions extends FixedClockOptions {
  readonly seed?: string | number;
  readonly development?: boolean;
  readonly fixedStep?: number;
  readonly renderer?: GamePlugin;
}

export class Game {
  readonly clock: FixedClock;
  readonly #options: GameOptions;
  #worlds = new Map<string, World>();
  #activeWorld?: World;
  #plugins = new Map<string, GamePlugin>();
  readonly services = new Map<string, unknown>();
  #paused = false;
  #timeScale = 1;
  #startedPlugins = new Set<string>();

  constructor(options: GameOptions = {}) {
    this.#options = options;
    const step = options.fixedStep ?? options.step;
    this.clock = new FixedClock({
      ...(step === undefined ? {} : { step }),
      ...(options.maxSubSteps === undefined ? {} : { maxSubSteps: options.maxSubSteps }),
    });
    if (options.renderer) this.use(options.renderer);
  }

  get activeWorld(): World | undefined {
    return this.#activeWorld;
  }

  get paused(): boolean { return this.#paused; }
  get timeScale(): number { return this.#timeScale; }
  pause(): void { this.#paused = true; }
  resume(): void { this.#paused = false; }
  setTimeScale(scale: number): void {
    if (scale < 0 || !Number.isFinite(scale)) throw new Error("Time scale must be non-negative and finite");
    this.#timeScale = scale;
  }

  async start(world?: World | string): Promise<void> {
    if (world) this.useWorld(world);
    this.#requireActiveWorld();
    for (const plugin of this.#plugins.values()) {
      if (this.#startedPlugins.has(plugin.id)) continue;
      await plugin.start?.(this);
      this.#startedPlugins.add(plugin.id);
    }
    this.resume();
  }

  createWorld(name: string, options: WorldOptions = {}): World {
    if (this.#worlds.has(name)) throw new Error(`Duplicate world: ${name}`);
    const world = new World(name, {
      seed: options.seed ?? this.#options.seed ?? name,
      development: options.development ?? this.#options.development ?? true,
      services: this.services,
    });
    this.#worlds.set(name, world);
    for (const plugin of this.#plugins.values()) plugin.setupWorld?.(world);
    this.#activeWorld ??= world;
    return world;
  }

  use(plugin: GamePlugin): this {
    if (this.#plugins.has(plugin.id)) {
      throw new Error(`Plugin already installed: ${plugin.id}`);
    }
    plugin.install?.(this);
    this.#plugins.set(plugin.id, plugin);
    for (const world of this.#worlds.values()) plugin.setupWorld?.(world);
    return this;
  }

  provide<T>(id: string, service: T): this {
    if (this.services.has(id)) throw new Error(`Service already provided: ${id}`);
    this.services.set(id, service);
    return this;
  }

  service<T>(id: string): T {
    if (!this.services.has(id)) throw new Error(`Unknown service: ${id}`);
    return this.services.get(id) as T;
  }

  useWorld(world: World | string): void {
    const resolved =
      typeof world === "string" ? this.#worlds.get(world) : world;
    if (!resolved) throw new Error(`Unknown world: ${String(world)}`);
    this.#activeWorld = resolved;
  }

  step(frames = 1): void {
    if (!Number.isInteger(frames) || frames < 1) {
      throw new Error("Step frames must be a positive integer");
    }
    const world = this.#requireActiveWorld();
    for (let frame = 0; frame < frames; frame += 1) {
      this.clock.stepOnce((dt, tick) => {
        world.runPhase("fixedUpdate", dt, tick);
      });
    }
  }

  advance(delta: number): number {
    if (this.#paused) return 0;
    delta *= this.#timeScale;
    const world = this.#requireActiveWorld();
    const framePhases: readonly SystemPhase[] = [
      "input",
      "preUpdate",
      "update",
      "lateUpdate",
      "render",
      "postRender",
    ];

    world.runPhase("input", delta);
    world.runPhase("preUpdate", delta);
    const steps = this.clock.advance(delta, (dt, tick) => {
      world.runPhase("fixedUpdate", dt, tick);
    });
    for (const phase of framePhases.slice(2)) {
      world.runPhase(phase, delta);
    }
    return steps;
  }

  #requireActiveWorld(): World {
    if (!this.#activeWorld) throw new Error("Game has no active world");
    return this.#activeWorld;
  }
}

export function createGame(options: GameOptions = {}): Game {
  return new Game(options);
}
