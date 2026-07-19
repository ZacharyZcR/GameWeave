import { defineComponent, definePlugin, type EntityId, type World } from "@gameweave/core";
import { Transform } from "@gameweave/three";

export const Collider = defineComponent("collider", {
  defaults: {
    shape: "box" as "box" | "sphere" | "capsule",
    size: [1, 1, 1] as [number, number, number],
    radius: 0.5,
    halfHeight: 0.5,
    trigger: false,
    layer: 1,
    mask: 0xffff_ffff,
  },
});

export const RigidBody = defineComponent("rigidBody", {
  defaults: {
    type: "dynamic" as "dynamic" | "kinematic" | "static",
    velocity: [0, 0, 0] as [number, number, number],
    gravityScale: 1,
  },
});

export interface RaycastHit {
  readonly entity: EntityId;
  readonly distance: number;
  readonly point: [number, number, number];
  readonly normal: [number, number, number];
}

export interface PhysicsAdapter {
  initialize?(): void | Promise<void>;
  dispose?(): void;
  step(world: World, dt: number): void;
  raycast(
    world: World,
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number,
    mask?: number,
  ): RaycastHit | undefined;
}

export interface CharacterMoveResult {
  readonly movement: [number, number, number];
  readonly grounded: boolean;
}

export interface CharacterPhysicsAdapter extends PhysicsAdapter {
  moveCharacter(
    world: World,
    entity: EntityId,
    movement: readonly [number, number, number],
  ): CharacterMoveResult;
}

export function supportsCharacterMovement(adapter: PhysicsAdapter): adapter is CharacterPhysicsAdapter {
  return "moveCharacter" in adapter && typeof adapter.moveCharacter === "function";
}

export class BasicPhysicsAdapter implements PhysicsAdapter {
  readonly gravity: [number, number, number];

  constructor(gravity: [number, number, number] = [0, -9.81, 0]) {
    this.gravity = gravity;
  }

  step(world: World, dt: number): void {
    for (const entity of world.query(Transform, RigidBody)) {
      const transform = entity.get(Transform);
      const body = entity.get(RigidBody);
      if (!transform || !body || body.type !== "dynamic") continue;
      const velocity: [number, number, number] = [
        body.velocity[0] + this.gravity[0] * body.gravityScale * dt,
        body.velocity[1] + this.gravity[1] * body.gravityScale * dt,
        body.velocity[2] + this.gravity[2] * body.gravityScale * dt,
      ];
      entity.set(RigidBody, { velocity });
      entity.set(Transform, {
        position: [
          transform.position[0] + velocity[0] * dt,
          transform.position[1] + velocity[1] * dt,
          transform.position[2] + velocity[2] * dt,
        ],
      });
    }
  }

  raycast(
    world: World,
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number,
    mask = 0xffff_ffff,
  ): RaycastHit | undefined {
    const length = Math.hypot(...direction);
    if (length === 0) throw new Error("Ray direction must not be zero");
    const ray = direction.map((value) => value / length) as [number, number, number];
    let nearest: RaycastHit | undefined;

    for (const entity of world.query(Transform, Collider)) {
      const transform = entity.get(Transform);
      const collider = entity.get(Collider);
      if (!transform || !collider || (collider.layer & mask) === 0) continue;
      const radius = collider.shape === "sphere"
        ? collider.radius
        : Math.hypot(...collider.size) / 2;
      const offset = transform.position.map((value, index) => value - origin[index]!) as [number, number, number];
      const projection = offset[0] * ray[0] + offset[1] * ray[1] + offset[2] * ray[2];
      if (projection < 0 || projection > maxDistance) continue;
      const closest = origin.map((value, index) => value + ray[index]! * projection) as [number, number, number];
      const distanceToCenter = Math.hypot(
        closest[0] - transform.position[0],
        closest[1] - transform.position[1],
        closest[2] - transform.position[2],
      );
      if (distanceToCenter > radius) continue;
      const hitDistance = projection - Math.sqrt(radius ** 2 - distanceToCenter ** 2);
      if (hitDistance < 0 || hitDistance > maxDistance || (nearest && nearest.distance <= hitDistance)) continue;
      const point = origin.map((value, index) => value + ray[index]! * hitDistance) as [number, number, number];
      const normal = point.map((value, index) => (value - transform.position[index]!) / radius) as [number, number, number];
      nearest = { entity: entity.id, distance: hitDistance, point, normal };
    }
    return nearest;
  }
}

export function physics(adapter: PhysicsAdapter = new BasicPhysicsAdapter()) {
  return {
    ...definePlugin({
      id: "gameweave.physics",
      install: (game) => game.provide("physics", adapter),
      start: () => adapter.initialize?.(),
      setupWorld: (world) => {
        world.register(Transform).register(Collider).register(RigidBody);
        world.addSystem({
          name: "physics.step",
          phase: "fixedUpdate",
          run: ({ dt }) => adapter.step(world, dt),
        });
      },
    }),
    adapter,
  };
}

export { RapierPhysicsAdapter, type RapierPhysicsOptions } from "./rapier.js";
