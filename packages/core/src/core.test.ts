import { describe, expect, it } from "vitest";
import {
  createGame,
  defineComponent,
  definePlugin,
  definePrefab,
  defineResource,
  defineSystem,
  EventBus,
  orderSystems,
  SeededRandom,
  World,
} from "./index.js";
import type { SystemDefinition } from "./index.js";

const Position = defineComponent("position", {
  defaults: { x: 0, y: 0 },
});

const Velocity = defineComponent("velocity", {
  defaults: { x: 0, y: 0 },
});

describe("components and entities", () => {
  it("creates component values from defaults without sharing state", () => {
    const world = new World("test").register(Position);
    const first = world.spawn({ components: { position: { x: 4 } } });
    const second = world.spawn({ components: { position: {} } });

    expect(first.get(Position)).toEqual({ x: 4, y: 0 });
    expect(second.get(Position)).toEqual({ x: 0, y: 0 });
    expect(first.get(Position)).not.toBe(second.get(Position));
  });

  it("invalidates an entity handle after despawn", () => {
    const world = new World("test");
    const entity = world.spawn();

    entity.despawn();

    expect(entity.isAlive()).toBe(false);
    expect(entity.get(Position)).toBeUndefined();
    expect(() => entity.set(Position, { x: 1 })).toThrow("not alive");
  });
});

describe("query and command buffer", () => {
  it("keeps iteration stable while applying structural changes at a boundary", () => {
    const world = new World("test").register(Position);
    const visited: string[] = [];
    world.spawn({ id: "first", components: { position: {} } });
    world.spawn({ id: "second", components: { position: {} } });

    world.addSystem({
      name: "remove-during-query",
      phase: "fixedUpdate",
      run: () => {
        for (const entity of world.query(Position)) {
          visited.push(entity.id);
          entity.despawn();
        }
      },
    });

    world.runPhase("fixedUpdate", 1 / 60, 1);

    expect(visited).toEqual(["first", "second"]);
    expect(world.query(Position).snapshot()).toHaveLength(0);
  });

  it("publishes structural changes only after the whole phase", () => {
    const world = new World("test").register(Position);
    const observedCounts: number[] = [];

    world.addSystem({
      name: "spawn",
      phase: "fixedUpdate",
      run: () => {
        world.spawn({ components: { position: {} } });
      },
    });
    world.addSystem({
      name: "observe",
      phase: "fixedUpdate",
      after: ["spawn"],
      run: () => {
        observedCounts.push(world.query(Position).snapshot().length);
      },
    });

    world.runPhase("fixedUpdate", 1 / 60, 1);

    expect(observedCounts).toEqual([0]);
    expect(world.query(Position).snapshot()).toHaveLength(1);
  });

  it("publishes value changes to later systems in the same phase", () => {
    const world = new World("test").register(Position);
    const entity = world.spawn({ components: { position: {} } });
    const observed: number[] = [];
    world.addSystem({
      name: "write",
      phase: "fixedUpdate",
      run: () => entity.set(Position, { x: 4 }),
    });
    world.addSystem({
      name: "read",
      phase: "fixedUpdate",
      after: ["write"],
      run: () => observed.push(entity.get(Position)?.x ?? -1),
    });

    world.runPhase("fixedUpdate", 1 / 60, 1);

    expect(observed).toEqual([4]);
  });
});

describe("system ordering", () => {
  it("orders systems by declared dependencies, not registration order", () => {
    const systems: SystemDefinition[] = [
      { name: "death", phase: "fixedUpdate", after: ["damage"], run() {} },
      { name: "physics", phase: "fixedUpdate", run() {} },
      {
        name: "damage",
        phase: "fixedUpdate",
        after: ["physics"],
        run() {},
      },
    ];

    expect(orderSystems(systems).get("fixedUpdate")?.map(({ name }) => name)).toEqual([
      "physics",
      "damage",
      "death",
    ]);
  });

  it("rejects dependency cycles", () => {
    const systems: SystemDefinition[] = [
      { name: "a", phase: "update", after: ["b"], run() {} },
      { name: "b", phase: "update", after: ["a"], run() {} },
    ];

    expect(() => orderSystems(systems)).toThrow("cycle");
  });

  it("does not retain a system when registration fails", () => {
    const world = new World("test");
    world.addSystem({ name: "valid", phase: "update", run() {} });

    expect(() =>
      world.addSystem({ name: "valid", phase: "update", run() {} }),
    ).toThrow("Duplicate system");
    expect(world.inspect().systems).toEqual([
      { name: "valid", phase: "update", durationMs: 0 },
    ]);
  });

  it("resolves optional dependencies when the target is registered later", () => {
    const world = new World("test");
    world.addSystem({ name: "move", phase: "fixedUpdate", optionalBefore: ["physics"], run() {} });
    world.addSystem({ name: "physics", phase: "fixedUpdate", run() {} });
    expect(world.inspect().systems.map(({ name }) => name)).toEqual(["move", "physics"]);
  });
});

describe("deterministic simulation", () => {
  it("produces the same random sequence for the same seed", () => {
    const first = new SeededRandom("battle");
    const second = new SeededRandom("battle");

    expect([first.next(), first.next(), first.integer(1, 10)]).toEqual([
      second.next(),
      second.next(),
      second.integer(1, 10),
    ]);
  });

  it("steps fixed systems exactly once per requested frame", () => {
    const game = createGame({ step: 1 / 60, seed: "test" });
    const world = game.createWorld("arena").register(Position).register(Velocity);
    const entity = world.spawn({
      components: {
        position: {},
        velocity: { x: 3 },
      },
    });

    world.addSystem({
      name: "movement",
      phase: "fixedUpdate",
      run: ({ dt }) => {
        for (const item of world.query(Position, Velocity)) {
          const position = item.get(Position);
          const velocity = item.get(Velocity);
          if (!position || !velocity) continue;
          item.set(Position, { x: position.x + velocity.x * dt });
        }
      },
    });

    game.step(60);

    expect(entity.get(Position)?.x).toBeCloseTo(3);
    expect(world.tick).toBe(60);
  });
});

describe("inspection", () => {
  it("returns detached structured state", () => {
    const world = new World("arena").register(Position);
    const entity = world.spawn({
      id: "player",
      name: "Player",
      components: { position: { x: 5 } },
    });

    const snapshot = world.inspect();
    const position = snapshot.entities[0]?.components.position as { x: number };
    position.x = 99;

    expect(entity.get(Position)?.x).toBe(5);
    expect(world.inspect().entities[0]).toMatchObject({
      id: "player",
      name: "Player",
      components: { position: { x: 5, y: 0 } },
    });
  });

  it("filters snapshots and queries by structured component values", () => {
    const world = new World("arena").register(Position);
    world.spawn({ id: "left", components: { position: { x: -1 } } });
    world.spawn({ id: "right", components: { position: { x: 2 } } });

    expect(world.query(Position).where({ position: { x: { $gt: 0 } } }).map(({ id }) => id)).toEqual(["right"]);
    expect(world.inspect({ with: [Position] }).entities).toHaveLength(2);
  });
});

describe("game controls and system factories", () => {
  it("supports setup systems, pause and time scale", () => {
    const game = createGame({ fixedStep: 1 });
    const world = game.createWorld("arena");
    const ticks: number[] = [];
    world.addSystem(defineSystem({
      name: "factory", phase: "fixedUpdate",
      setup: (owner) => ({ tick }) => { expect(owner).toBe(world); ticks.push(tick); },
    }));
    game.setTimeScale(2);
    game.advance(0.5);
    game.pause();
    game.advance(1);
    expect(ticks).toEqual([1]);
    expect(game.paused).toBe(true);
  });
});

describe("prefabs, resources, events and plugins", () => {
  it("instantiates prefab components with explicit overrides", () => {
    const world = new World("arena").register(Position).register(Velocity);
    const mover = definePrefab("mover", {
      name: "Mover",
      components: {
        position: { x: 2 },
        velocity: { x: 1 },
      },
    });

    const entity = world.spawn(mover, {
      id: "fast-mover",
      components: { velocity: { x: 5 } },
    });

    expect(entity.get(Position)).toEqual({ x: 2, y: 0 });
    expect(entity.get(Velocity)).toEqual({ x: 5, y: 0 });
  });

  it("lazily creates typed world resources", () => {
    const Navigation = defineResource("navigation", () => ({ builds: 0 }));
    const world = new World("arena");

    world.resources.get(Navigation).builds += 1;

    expect(world.resources.get(Navigation)).toEqual({ builds: 1 });
  });

  it("supports typed event subscriptions and unsubscription", () => {
    const events = new EventBus<{ damage: { amount: number } }>();
    const received: number[] = [];
    const unsubscribe = events.on("damage", ({ amount }) => received.push(amount));

    events.emit("damage", { amount: 12 });
    unsubscribe();
    events.emit("damage", { amount: 99 });

    expect(received).toEqual([12]);
  });

  it("installs plugins into existing and future worlds exactly once", () => {
    const game = createGame();
    const first = game.createWorld("first");
    const configured: string[] = [];
    const plugin = definePlugin({
      id: "test-plugin",
      install: (target) => target.provide("answer", 42),
      setupWorld: (world) => configured.push(world.name),
    });

    game.use(plugin);
    game.createWorld("second");

    expect(game.service<number>("answer")).toBe(42);
    expect(configured).toEqual([first.name, "second"]);
    expect(() => game.use(plugin)).toThrow("already installed");
  });
});

describe("serialization and scheduling", () => {
  it("round-trips world state through stable component ids", () => {
    const source = new World("arena").register(Position);
    source.spawn({
      id: "player",
      components: { position: { x: 7, y: 3 } },
    });
    source.runPhase("fixedUpdate", 1 / 60, 9);

    const target = new World("arena").register(Position);
    target.load(source.serialize());

    expect(target.tick).toBe(9);
    expect(target.entity("player").get(Position)).toEqual({ x: 7, y: 3 });
  });

  it("migrates old component data while loading", () => {
    const Score = defineComponent("score", {
      version: 2,
      defaults: { value: 0 },
      migrate: (value, from) => ({
        value: from === 1 ? Number(value) : 0,
      }),
    });
    const world = new World("arena").register(Score);

    world.load({
      $schema: "https://gameweave.dev/schema/world-0.1.json",
      version: 1,
      name: "arena",
      tick: 0,
      entities: [{
        id: "player",
        components: { score: { version: 1, data: 12 as never } },
      }],
    });

    expect(world.entity("player").get(Score)?.value).toBe(12);
  });

  it("preserves unknown tool data and omits runtime-only components", () => {
    const Runtime = defineComponent("runtime", { defaults: { handle: 1 }, runtimeOnly: true });
    const world = new World("arena").register(Runtime);
    world.load({
      $schema: "https://gameweave.dev/schema/world-0.1.json", version: 1, name: "arena", tick: 0,
      entities: [{ id: "entity", components: { future: { version: 3, data: { value: 7 } } } }],
    }, { unknownComponents: "preserve" });
    world.entity("entity").set(Runtime, { handle: 9 });
    const serialized = world.serialize();
    expect(serialized.entities[0]?.components.future).toEqual({ version: 3, data: { value: 7 } });
    expect(serialized.entities[0]?.components.runtime).toBeUndefined();
  });

  it("runs scheduled work from fixed simulation time", () => {
    const world = new World("arena");
    const calls: number[] = [];
    world.scheduler.after(0.5, () => calls.push(world.tick));

    for (let tick = 1; tick <= 30; tick += 1) {
      world.runPhase("fixedUpdate", 1 / 60, tick);
    }

    expect(calls).toEqual([30]);
  });
});
