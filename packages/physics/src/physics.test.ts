import { createGame } from "@gameweave/core";
import { Transform } from "@gameweave/three";
import { describe, expect, it } from "vitest";
import { BasicPhysicsAdapter, Collider, physics, RapierPhysicsAdapter, RigidBody, VoxelPhysicsAdapter, type VoxelSource } from "./index.js";

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

describe("rapier physics adapter", () => {
  it("initializes through game.start and resolves contacts", async () => {
    const adapter = new RapierPhysicsAdapter({ gravity: [0, -10, 0] });
    const game = createGame({ step: 1 / 60 }).use(physics(adapter));
    const world = game.createWorld("rapier");
    world.spawn({ id: "ground" }).set(Transform, { position: [0, -0.5, 0] })
      .set(RigidBody, { type: "static" }).set(Collider, { size: [10, 1, 10] });
    const body = world.spawn({ id: "body" }).set(Transform, { position: [0, 2, 0] })
      .set(RigidBody, {}).set(Collider, { shape: "sphere", radius: 0.5 });
    const collisions: unknown[] = [];
    world.events.on("physics:collisionStart", (event) => collisions.push(event));

    await game.start();
    game.step(120);

    expect(body.get(Transform)?.position[1]).toBeCloseTo(0.5, 1);
    expect(adapter.raycast(world, [0, 3, 0], [0, -1, 0], 10)?.entity).toBe("body");
    expect(collisions).toContainEqual({ a: "ground", b: "body" });
    adapter.dispose();
  });
});

describe("voxel physics", () => {
  // 平坦地面：y < 0 全实心，(2,0,2) 处一根 1 格高的柱子
  const flat: VoxelSource = {
    isSolid: (x, y, z) => y < 0 || (x === 2 && y === 0 && z === 2),
    entityAt: () => "terrain",
  };

  const makeWorld = (adapter: VoxelPhysicsAdapter) => {
    const game = createGame({ fixedStep: .05 }).use(physics(adapter));
    return { game, world: game.createWorld("voxel") };
  };

  it("keeps a dynamic body on the voxel floor", () => {
    const adapter = new VoxelPhysicsAdapter(flat, { gravity: [0, -10, 0] });
    const { game, world } = makeWorld(adapter);
    const crate = world.spawn().set(Transform, { position: [8.5, 3, 8.5] })
      .set(RigidBody, {}).set(Collider, { size: [1, 1, 1] });
    game.step(60);
    expect(crate.get(Transform)!.position[1]).toBeCloseTo(.5, 1);
    expect(crate.get(RigidBody)!.velocity[1]).toBe(0);
  });

  it("moves a character with wall blocking and grounding", () => {
    const adapter = new VoxelPhysicsAdapter(flat, { gravity: [0, -10, 0] });
    const { world } = makeWorld(adapter);
    const player = world.spawn({ id: "walker" }).set(Transform, { position: [.5, .9, 2.5] })
      .set(RigidBody, { type: "kinematic" }).set(Collider, { shape: "capsule", halfHeight: .4, radius: .45 });

    const free = adapter.moveCharacter(world, "walker", [.6, 0, 0]);
    expect(free.movement[0]).toBeCloseTo(.6, 5);
    expect(free.grounded).toBe(true);

    // 继续向 +x 走会撞到 (2,0,2) 的柱子
    const blocked = adapter.moveCharacter(world, "walker", [1.2, 0, 0]);
    expect(blocked.movement[0]).toBeLessThan(1.2 - .01);
    const x = player.get(Transform)!.position[0];
    expect(x).toBeLessThanOrEqual(2 - .45);
  });

  it("raycasts voxels with DDA and prefers nearer entity hits", () => {
    const adapter = new VoxelPhysicsAdapter(flat);
    const { world } = makeWorld(adapter);
    const hit = adapter.raycast(world, [2.5, 3.5, 2.5], [0, -1, 0], 10);
    expect(hit).toMatchObject({ entity: "terrain", voxel: [2, 0, 2], normal: [0, 1, 0] });
    expect(hit!.distance).toBeCloseTo(2.5, 5);

    world.spawn({ id: "target" }).set(Transform, { position: [2.5, 2, 2.5] })
      .set(Collider, { shape: "sphere", radius: .4 });
    const nearer = adapter.raycast(world, [2.5, 3.5, 2.5], [0, -1, 0], 10);
    expect(nearer!.entity).toBe("target");
  });
});
