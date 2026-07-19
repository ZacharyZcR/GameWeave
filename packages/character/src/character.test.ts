import { createGame } from "@gameweave/core";
import { Collider, physics, RapierPhysicsAdapter, RigidBody } from "@gameweave/physics";
import { Transform } from "@gameweave/three";
import { describe, expect, it } from "vitest";
import { activateRagdoll, character, CharacterMotor, Controller, findInteractable, InputManager, interact, Interactable, Ragdoll } from "./index.js";

describe("character controller", () => {
  it("converts a captured input snapshot into body velocity", () => {
    const input = new InputManager().register("test", () => ({
      move: [1, 0], look: [0, 0], jump: false, sprint: true, fire: false,
    }));
    const game = createGame({ step: 1 }).use(physics()).use(character(input));
    const world = game.createWorld("arena");
    const player = world.spawn().set(Transform, {}).set(RigidBody, { gravityScale: 0 })
      .set(CharacterMotor, { speed: 2, sprintSpeed: 4 }).set(Controller, { input: "test" });

    game.advance(1);

    expect(player.get(RigidBody)?.velocity[0]).toBe(4);
    expect(player.get(Transform)?.position[0]).toBe(4);
  });

  it("keeps character-before-physics ordering regardless of plugin install order", () => {
    const first = createGame().use(character(new InputManager())).use(physics()).createWorld("first");
    const second = createGame().use(physics()).use(character(new InputManager())).createWorld("second");
    const names = (world: typeof first) => world.inspect().systems.filter(({ phase }) => phase === "fixedUpdate").map(({ name }) => name);
    expect(names(first)).toEqual(names(second));
    expect(names(first).indexOf("character.move")).toBeLessThan(names(first).indexOf("physics.step"));
  });

  it("uses Rapier capsule movement and updates grounded state", async () => {
    const input = new InputManager().register("test", () => ({
      move: [0, 0], look: [0, 0], jump: false, sprint: false, fire: false,
    }));
    const adapter = new RapierPhysicsAdapter();
    const game = createGame({ step: 1 / 60 }).use(physics(adapter)).use(character(input));
    const world = game.createWorld("controller");
    world.spawn().set(Transform, { position: [0, -.5, 0] })
      .set(RigidBody, { type: "static" }).set(Collider, { size: [10, 1, 10] });
    const player = world.spawn().set(Transform, { position: [0, 2, 0] })
      .set(RigidBody, { type: "kinematic", gravityScale: 0 })
      .set(Collider, { shape: "capsule", halfHeight: .5, radius: .5 })
      .set(CharacterMotor, {}).set(Controller, { input: "test" });

    await game.start();
    game.step(120);

    expect(player.get(CharacterMotor)?.grounded).toBe(true);
    expect(player.get(Transform)?.position[1]).toBeCloseTo(1.01, 1);
    adapter.dispose();
  });

  it("advances serializable ragdoll state and disables character movement", () => {
    const input = new InputManager().register("test", () => ({
      move: [1, 0], look: [0, 0], jump: false, sprint: false, fire: false,
    }));
    const game = createGame({ step: .5 }).use(physics()).use(character(input));
    const world = game.createWorld("ragdoll");
    const player = world.spawn().set(Transform, {}).set(RigidBody, { gravityScale: 0 })
      .set(CharacterMotor, {}).set(Controller, { input: "test" }).set(Ragdoll, {});
    activateRagdoll(player, { duration: 1, impulse: [1, 2, 3] });

    game.step();

    expect(player.get(Ragdoll)).toMatchObject({ active: true, elapsed: .5, impulse: [1, 2, 3] });
    expect(player.get(RigidBody)?.velocity).toEqual([0, 0, 0]);
  });
});

describe("interactables", () => {
  it("finds enabled interactables through a physics raycast and emits interact:use", () => {
    const game = createGame().use(physics()).use(character());
    const world = game.createWorld("room");
    const crate = world.spawn({ id: "supply" }).set(Transform, { position: [0, 0, 3] })
      .set(Collider, { shape: "sphere", radius: .8 }).set(Interactable, { prompt: "RESUPPLY" });
    const events: unknown[] = [];
    world.events.on("interact:use", (event) => events.push(event));

    expect(findInteractable(world, [0, 0, 0], [0, 0, 1])?.id).toBe("supply");
    expect(interact(world, crate)).toBe(true);
    expect(events).toEqual([{ entity: "supply" }]);

    crate.set(Interactable, { enabled: false });
    expect(findInteractable(world, [0, 0, 0], [0, 0, 1])).toBeUndefined();
    expect(interact(world, crate)).toBe(false);
  });

  it("rejects hits beyond the interactable radius", () => {
    const game = createGame().use(physics()).use(character());
    const world = game.createWorld("room");
    world.spawn({ id: "far" }).set(Transform, { position: [0, 0, 3.5] })
      .set(Collider, { shape: "sphere", radius: .5 }).set(Interactable, { radius: 2 });
    expect(findInteractable(world, [0, 0, 0], [0, 0, 1], 6)).toBeUndefined();
  });
});
