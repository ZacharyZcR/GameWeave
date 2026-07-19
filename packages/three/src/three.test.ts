import { createGame } from "@gameweave/core";
import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { ManualTransform, Renderable, three, Transform } from "./index.js";

describe("Three adapter", () => {
  it("syncs authoritative transforms and removes despawned objects", () => {
    const plugin = three();
    plugin.adapter.registerAsset("cube", () => new Object3D());
    const game = createGame().use(plugin);
    const world = game.createWorld("arena");
    const entity = world.spawn().set(Transform, {
      position: [1, 2, 3],
    }).set(Renderable, { asset: "cube" });

    game.advance(0);
    expect(plugin.adapter.object(entity.id)?.position.toArray()).toEqual([1, 2, 3]);

    entity.despawn();
    game.advance(0);
    expect(plugin.adapter.object(entity.id)).toBeUndefined();
  });

  it("allows explicit manual transform ownership", () => {
    const plugin = three();
    plugin.adapter.registerAsset("cube", () => new Object3D());
    const game = createGame().use(plugin);
    const world = game.createWorld("arena");
    const entity = world.spawn().set(Transform, {
      position: [1, 2, 3],
    }).set(Renderable, { asset: "cube" }).set(ManualTransform, {});

    game.advance(0);
    expect(plugin.adapter.object(entity.id)?.position.toArray()).toEqual([0, 0, 0]);
  });

  it("leaves manually attached objects alone during sync", () => {
    const plugin = three();
    const game = createGame().use(plugin);
    const world = game.createWorld("arena");
    const entity = world.spawn();
    const object = new Object3D();
    plugin.adapter.attach(entity.id, object);

    game.advance(0);
    expect(plugin.adapter.object(entity.id)).toBe(object);
    expect(object.parent).toBe(plugin.adapter.scene);
  });

  it("reports external writes to managed transforms in development", () => {
    const plugin = three();
    plugin.adapter.registerAsset("cube", () => new Object3D());
    const game = createGame().use(plugin);
    const world = game.createWorld("arena");
    const entity = world.spawn().set(Transform, {}).set(Renderable, { asset: "cube" });
    game.advance(0);
    plugin.adapter.object(entity.id)?.position.setX(99);
    expect(() => game.advance(0)).toThrow("modified outside GameWeave");
  });
});
