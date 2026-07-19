import type { EntityId, World } from "@gameweave/core";
import { Transform } from "@gameweave/three";
import {
  BasicPhysicsAdapter,
  Collider,
  RigidBody,
  type CharacterMoveResult,
  type CharacterPhysicsAdapter,
  type RaycastHit,
} from "./index.js";

// 游戏提供的体素查询：整数格坐标
export interface VoxelSource {
  isSolid(x: number, y: number, z: number): boolean;
  /** 命中方块归属的实体（通常是 chunk）；返回 undefined 时该格视为不可命中 */
  entityAt(x: number, y: number, z: number): EntityId | undefined;
}

export interface VoxelPhysicsOptions {
  readonly gravity?: readonly [number, number, number];
}

const EPS = 1e-5;

export class VoxelPhysicsAdapter implements CharacterPhysicsAdapter {
  readonly gravity: readonly [number, number, number];
  readonly #voxels: VoxelSource;
  readonly #entities: BasicPhysicsAdapter;

  constructor(voxels: VoxelSource, options: VoxelPhysicsOptions = {}) {
    this.#voxels = voxels;
    this.gravity = options.gravity ?? [0, -9.81, 0];
    this.#entities = new BasicPhysicsAdapter([0, 0, 0]);
  }

  step(world: World, dt: number): void {
    for (const entity of world.query(Transform, RigidBody, Collider)) {
      const transform = entity.get(Transform);
      const body = entity.get(RigidBody);
      const collider = entity.get(Collider);
      if (!transform || !body || !collider || body.type !== "dynamic") continue;

      const velocity: [number, number, number] = [
        body.velocity[0] + this.gravity[0] * body.gravityScale * dt,
        body.velocity[1] + this.gravity[1] * body.gravityScale * dt,
        body.velocity[2] + this.gravity[2] * body.gravityScale * dt,
      ];
      const half = halfExtents(collider);
      const position: [number, number, number] = [...transform.position];
      for (const axis of [0, 1, 2] as const) {
        const wanted = velocity[axis] * dt;
        const moved = this.#sweepAxis(position, half, axis, wanted);
        position[axis] += moved;
        if (moved !== wanted) velocity[axis] = 0;
      }
      entity.set(RigidBody, { velocity });
      entity.set(Transform, { position });
    }
  }

  moveCharacter(
    world: World,
    entity: EntityId,
    movement: readonly [number, number, number],
  ): CharacterMoveResult {
    const record = world.entity(entity);
    const transform = record.get(Transform);
    const collider = record.get(Collider);
    if (!transform || !collider) throw new Error(`Character requires Transform and Collider: ${entity}`);
    const half = halfExtents(collider);
    const position: [number, number, number] = [...transform.position];
    const corrected: [number, number, number] = [0, 0, 0];
    for (const axis of [0, 1, 2] as const) {
      corrected[axis] = this.#sweepAxis(position, half, axis, movement[axis]);
      position[axis] += corrected[axis];
    }
    const grounded = Math.abs(this.#sweepAxis(position, half, 1, -.06)) < .06 - EPS;
    record.set(Transform, { position });
    return { movement: corrected, grounded };
  }

  raycast(
    world: World,
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number,
    mask?: number,
  ): RaycastHit | undefined {
    const voxelHit = this.#raycastVoxels(origin, direction, maxDistance);
    const entityHit = this.#entities.raycast(world, origin, direction, maxDistance, mask);
    if (voxelHit && entityHit) return voxelHit.distance <= entityHit.distance ? voxelHit : entityHit;
    return voxelHit ?? entityHit;
  }

  // Amanatides & Woo 网格 DDA
  #raycastVoxels(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number,
  ): RaycastHit | undefined {
    const length = Math.hypot(...direction);
    if (length === 0) throw new Error("Ray direction must not be zero");
    const ray = direction.map((value) => value / length) as [number, number, number];

    const cell = origin.map(Math.floor) as [number, number, number];
    const step = ray.map(Math.sign) as [number, number, number];
    const tDelta = ray.map((value) => (value === 0 ? Infinity : Math.abs(1 / value))) as [number, number, number];
    const tMax = ray.map((value, axis) => {
      if (value === 0) return Infinity;
      const boundary = value > 0 ? cell[axis]! + 1 : cell[axis]!;
      return (boundary - origin[axis]!) / value;
    }) as [number, number, number];

    let traveled = 0;
    let enterAxis = 0;
    while (traveled <= maxDistance) {
      if (traveled > 0 && this.#voxels.isSolid(cell[0], cell[1], cell[2])) {
        const entity = this.#voxels.entityAt(cell[0], cell[1], cell[2]);
        if (entity !== undefined) {
          const normal: [number, number, number] = [0, 0, 0];
          normal[enterAxis] = -step[enterAxis]!;
          return {
            entity,
            distance: traveled,
            point: origin.map((value, axis) => value + ray[axis]! * traveled) as [number, number, number],
            normal,
            voxel: [...cell],
          };
        }
      }
      enterAxis = tMax[0] <= tMax[1] && tMax[0] <= tMax[2] ? 0 : tMax[1] <= tMax[2] ? 1 : 2;
      traveled = tMax[enterAxis]!;
      tMax[enterAxis]! += tDelta[enterAxis]!;
      cell[enterAxis]! += step[enterAxis]!;
    }
    return undefined;
  }

  // 分轴扫掠：返回该轴实际可移动距离；被方块阻挡时贴面
  #sweepAxis(
    position: readonly [number, number, number],
    half: readonly [number, number, number],
    axis: 0 | 1 | 2,
    delta: number,
  ): number {
    if (delta === 0) return 0;
    const sign = Math.sign(delta);
    const [sideA, sideB] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const minA = Math.floor(position[sideA]! - half[sideA]! + EPS);
    const maxA = Math.floor(position[sideA]! + half[sideA]! - EPS);
    const minB = Math.floor(position[sideB]! - half[sideB]! + EPS);
    const maxB = Math.floor(position[sideB]! + half[sideB]! - EPS);

    const leading = position[axis]! + sign * half[axis]!;
    const target = leading + delta;
    let cell = Math.floor(sign > 0 ? leading + EPS : leading - EPS);
    const lastCell = Math.floor(sign > 0 ? target : target);

    const coords: [number, number, number] = [0, 0, 0];
    while (sign > 0 ? cell <= lastCell : cell >= lastCell) {
      for (let a = minA; a <= maxA; a += 1) {
        for (let b = minB; b <= maxB; b += 1) {
          coords[axis] = cell;
          coords[sideA] = a;
          coords[sideB] = b;
          if (!this.#voxels.isSolid(coords[0], coords[1], coords[2])) continue;
          const face = sign > 0 ? cell : cell + 1;
          const allowed = face - sign * EPS - sign * half[axis]! - position[axis]!;
          return sign > 0 ? Math.max(0, Math.min(delta, allowed)) : Math.min(0, Math.max(delta, allowed));
        }
      }
      cell += sign;
    }
    return delta;
  }
}

function halfExtents(collider: ReturnType<typeof Collider.defaults>): [number, number, number] {
  if (collider.shape === "sphere") return [collider.radius, collider.radius, collider.radius];
  if (collider.shape === "capsule") {
    const height = collider.halfHeight + collider.radius;
    return [collider.radius, height, collider.radius];
  }
  return [collider.size[0] / 2, collider.size[1] / 2, collider.size[2] / 2];
}
