import { createGame } from "@gameweave/core";
import { Transform } from "@gameweave/three";
import { describe, expect, it } from "vitest";
import { BasicPhysicsAdapter, Collider, physics, RigidBody } from "./index.js";

describe("basic physics adapter", () => {
  it("integrates dynamic bodies on fixed steps", () => {
    const game = createGame({ step: 1 }).use(physics(new BasicPhysicsAdapter([0, -10, 0])));
    const world = game.createWorld("arena");
    const body = world.spawn().set(Transform, {}).set(RigidBody, {});

    game.step();

    expect(body.get(Transform)?.position).toEqual([0, -10, 0]);
    expect(body.get(RigidBody)?.velocity).toEqual([0, -10, 0]);
  });

  it("returns the nearest raycast target", () => {
    const adapter = new BasicPhysicsAdapter([0, 0, 0]);
    const game = createGame().use(physics(adapter));
    const world = game.createWorld("arena");
    world.spawn({ id: "far" }).set(Transform, { position: [0, 0, 10] }).set(Collider, { shape: "sphere", radius: 1 });
    world.spawn({ id: "near" }).set(Transform, { position: [0, 0, 5] }).set(Collider, { shape: "sphere", radius: 1 });

    expect(adapter.raycast(world, [0, 0, 0], [0, 0, 1], 20)?.entity).toBe("near");
  });
});
