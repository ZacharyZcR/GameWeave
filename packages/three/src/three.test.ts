import { createGame } from "@gameweave/core";
import { AnimationClip, BoxGeometry, Mesh, MeshStandardMaterial, Object3D, VectorKeyframeTrack } from "three";
import { describe, expect, it, vi } from "vitest";
import { DynamicMesh, ManualTransform, ModelAnimation, Renderable, three, Transform } from "./index.js";

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

describe("model pipeline", () => {
  const makeModel = () => {
    const scene = new Object3D();
    const clip = new AnimationClip("drift", 1, [
      new VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 4, 0, 0]),
    ]);
    return { scene, animations: [clip] };
  };

  it("registers models and lists their animation clips", () => {
    const plugin = three();
    plugin.adapter.registerModel("soldier", makeModel(), { scale: 2, offset: [0, -1, 0] });
    expect(plugin.adapter.animations("soldier")).toEqual(["drift"]);
    expect(plugin.adapter.animations("unknown")).toEqual([]);
  });

  it("drives animations from the ModelAnimation component", () => {
    const plugin = three();
    plugin.adapter.registerModel("soldier", makeModel());
    const game = createGame().use(plugin);
    const world = game.createWorld("arena");
    const entity = world.spawn().set(Transform, {})
      .set(Renderable, { asset: "soldier" })
      .set(ModelAnimation, { clip: "drift", transition: 0 });

    game.advance(.25);
    game.advance(.25);
    const object = plugin.adapter.object(entity.id);
    const inner = object?.children[0];
    expect(inner ? inner.position.x : 0).toBeGreaterThan(0);

    entity.set(ModelAnimation, { clip: "" });
    game.advance(.25);
    expect(plugin.adapter.animations("soldier")).toHaveLength(1);
  });

  it("keeps cloned model materials independent per instance", () => {
    const plugin = three();
    const scene = new Object3D();
    scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xffffff })));
    plugin.adapter.registerModel("crate", { scene });
    const game = createGame().use(plugin);
    const world = game.createWorld("arena");
    const first = world.spawn().set(Transform, {}).set(Renderable, { asset: "crate" });
    const second = world.spawn().set(Transform, {}).set(Renderable, { asset: "crate" });
    game.advance(0);
    const materialOf = (id: string) => {
      let found: MeshStandardMaterial | undefined;
      plugin.adapter.object(id)?.traverse((child) => {
        if (child instanceof Mesh) found = child.material as MeshStandardMaterial;
      });
      return found;
    };
    expect(materialOf(first.id)).toBeDefined();
    expect(materialOf(first.id)).not.toBe(materialOf(second.id));
  });

  it("keeps shared model geometry alive when one instance is removed", () => {
    const plugin = three();
    const geometry = new BoxGeometry(1, 1, 1);
    const dispose = vi.spyOn(geometry, "dispose");
    const scene = new Object3D();
    scene.add(new Mesh(geometry, new MeshStandardMaterial()));
    plugin.adapter.registerModel("crate", { scene });
    const game = createGame().use(plugin);
    const world = game.createWorld("arena");
    const first = world.spawn().set(Transform, {}).set(Renderable, { asset: "crate" });
    const second = world.spawn().set(Transform, {}).set(Renderable, { asset: "crate" });
    game.advance(0);

    first.despawn();
    game.advance(0);
    expect(dispose).not.toHaveBeenCalled();
    expect(plugin.adapter.object(second.id)).toBeDefined();

    plugin.adapter.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe("dynamic mesh", () => {
  const quad = () => ({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  });

  it("builds and rebuilds geometry driven by the version field", () => {
    const plugin = three();
    const game = createGame().use(plugin);
    const world = game.createWorld("voxel");
    const entity = world.spawn().set(Transform, {}).set(DynamicMesh, { ...quad(), version: 1 });
    game.advance(0);
    const mesh = plugin.adapter.object(entity.id) as Mesh;
    expect(mesh.geometry.getAttribute("position").count).toBe(3);
    const firstGeometry = mesh.geometry;

    // 未变更 version：不重建
    game.advance(0);
    expect((plugin.adapter.object(entity.id) as Mesh).geometry).toBe(firstGeometry);

    const bigger = quad();
    entity.set(DynamicMesh, {
      positions: new Float32Array([...bigger.positions, 0, 0, 1, 1, 0, 1, 0, 1, 1]),
      normals: new Float32Array([...bigger.normals, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([...bigger.uvs, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      version: 2,
    });
    game.advance(0);
    expect((plugin.adapter.object(entity.id) as Mesh).geometry.getAttribute("position").count).toBe(6);

    entity.despawn();
    game.advance(0);
    expect(plugin.adapter.object(entity.id)).toBeUndefined();
  });

  it("resolves registered materials and shares them across instances", () => {
    const plugin = three();
    const material = new MeshStandardMaterial({ color: 0x4a7 });
    plugin.adapter.registerMaterial("terrain", material);
    const game = createGame().use(plugin);
    const world = game.createWorld("voxel");
    const first = world.spawn().set(Transform, {}).set(DynamicMesh, { ...quad(), version: 1, material: "terrain" });
    const second = world.spawn().set(Transform, {}).set(DynamicMesh, { ...quad(), version: 1, material: "terrain" });
    game.advance(0);
    expect((plugin.adapter.object(first.id) as Mesh).material).toBe(material);
    expect((plugin.adapter.object(second.id) as Mesh).material).toBe(material);
  });
});
