import { createGame } from "@gameweave/core";
import { Collider, physics, RapierPhysicsAdapter, RigidBody } from "@gameweave/physics";
import { Transform } from "@gameweave/three";
import { describe, expect, it } from "vitest";
import { character, CharacterMotor, Controller, InputManager } from "./index.js";

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
});
