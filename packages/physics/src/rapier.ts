import RAPIER from "@dimforge/rapier3d-compat";
import type { EntityId, World as GameWorld } from "@gameweave/core";
import { Transform } from "@gameweave/three";
import {
  Collider,
  RigidBody,
  type CharacterMoveResult,
  type CharacterPhysicsAdapter,
  type RaycastHit,
} from "./index.js";

export interface RapierPhysicsOptions {
  readonly gravity?: readonly [number, number, number];
  readonly characterOffset?: number;
  readonly maxSlopeAngle?: number;
  readonly snapToGround?: number;
  readonly autostep?: { readonly height: number; readonly width: number };
}

interface NativeBody {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
}

export class RapierPhysicsAdapter implements CharacterPhysicsAdapter {
  readonly #options: RapierPhysicsOptions;
  #native?: RAPIER.World;
  #events?: RAPIER.EventQueue;
  #controller?: RAPIER.KinematicCharacterController;
  #bodies = new Map<EntityId, NativeBody>();
  #entities = new Map<number, EntityId>();

  constructor(options: RapierPhysicsOptions = {}) {
    this.#options = options;
  }

  async initialize(): Promise<void> {
    if (this.#native) return;
    await RAPIER.init();
    const [x, y, z] = this.#options.gravity ?? [0, -9.81, 0];
    this.#native = new RAPIER.World({ x, y, z });
    this.#events = new RAPIER.EventQueue(true);
    this.#controller = this.#native.createCharacterController(this.#options.characterOffset ?? 0.01);
    this.#controller.setMaxSlopeClimbAngle(this.#options.maxSlopeAngle ?? Math.PI / 4);
    this.#controller.enableSnapToGround(this.#options.snapToGround ?? 0.2);
    const step = this.#options.autostep;
    if (step) this.#controller.enableAutostep(step.height, step.width, false);
  }

  step(world: GameWorld, dt: number): void {
    const native = this.#requireNative();
    this.#syncScene(world);
    native.timestep = dt;
    native.step(this.#events);
    this.#events?.drainCollisionEvents((first: number, second: number, started: boolean) => {
      const a = this.#entities.get(first), b = this.#entities.get(second);
      if (a && b) world.events.emit(started ? "physics:collisionStart" : "physics:collisionEnd", { a, b });
    });
    for (const [id, { body }] of this.#bodies) {
      if (!world.hasEntity(id)) continue;
      const entity = world.entity(id), bodyData = entity.get(RigidBody);
      if (!bodyData || bodyData.type === "static") continue;
      const position = body.translation(), rotation = body.rotation(), velocity = body.linvel();
      entity.set(Transform, {
        position: [position.x, position.y, position.z],
        quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
      });
      entity.set(RigidBody, { velocity: [velocity.x, velocity.y, velocity.z] });
    }
  }

  moveCharacter(
    world: GameWorld,
    entity: EntityId,
    movement: readonly [number, number, number],
  ): CharacterMoveResult {
    this.#syncScene(world);
    const native = this.#bodies.get(entity);
    const controller = this.#controller;
    if (!native || !controller) throw new Error(`Character requires a Rapier body and collider: ${entity}`);
    controller.computeColliderMovement(
      native.collider,
      { x: movement[0], y: movement[1], z: movement[2] },
      undefined,
      undefined,
      (candidate: RAPIER.Collider) => candidate.handle !== native.collider.handle,
    );
    const corrected = controller.computedMovement();
    const position = native.body.translation();
    native.body.setNextKinematicTranslation({
      x: position.x + corrected.x,
      y: position.y + corrected.y,
      z: position.z + corrected.z,
    });
    return { movement: [corrected.x, corrected.y, corrected.z], grounded: controller.computedGrounded() };
  }

  raycast(
    world: GameWorld,
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number,
    mask = 0xffff_ffff,
  ): RaycastHit | undefined {
    this.#syncScene(world);
    const native = this.#requireNative();
    const length = Math.hypot(...direction);
    if (length === 0) throw new Error("Ray direction must not be zero");
    const ray = new RAPIER.Ray(
      { x: origin[0], y: origin[1], z: origin[2] },
      { x: direction[0] / length, y: direction[1] / length, z: direction[2] / length },
    );
    const hit = native.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, undefined, undefined,
      (candidate: RAPIER.Collider) => {
        const id = this.#entities.get(candidate.handle);
        const collider = id && world.hasEntity(id) ? world.entity(id).get(Collider) : undefined;
        return !!collider && (collider.layer & mask) !== 0;
      });
    if (!hit) return undefined;
    const entity = this.#entities.get(hit.collider.handle);
    if (!entity) return undefined;
    const point = ray.pointAt(hit.timeOfImpact);
    return {
      entity,
      distance: hit.timeOfImpact,
      point: [point.x, point.y, point.z],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z],
    };
  }

  dispose(): void {
    this.#native?.free();
    this.#native = undefined;
    this.#events?.free();
    this.#events = undefined;
    this.#controller = undefined;
    this.#bodies.clear();
    this.#entities.clear();
  }

  #syncScene(world: GameWorld): void {
    const native = this.#requireNative();
    const alive = new Set<EntityId>();
    for (const entity of world.query(Transform, RigidBody, Collider)) {
      alive.add(entity.id);
      const transform = entity.get(Transform), bodyData = entity.get(RigidBody), colliderData = entity.get(Collider);
      if (!transform || !bodyData || !colliderData) continue;
      let entry = this.#bodies.get(entity.id);
      if (!entry) {
        const desc = bodyData.type === "dynamic" ? RAPIER.RigidBodyDesc.dynamic()
          : bodyData.type === "static" ? RAPIER.RigidBodyDesc.fixed()
          : RAPIER.RigidBodyDesc.kinematicPositionBased();
        desc.setTranslation(...transform.position).setRotation({
          x: transform.quaternion[0], y: transform.quaternion[1], z: transform.quaternion[2], w: transform.quaternion[3],
        }).setLinvel(...bodyData.velocity).setGravityScale(bodyData.gravityScale).lockRotations(bodyData.lockRotations);
        const body = native.createRigidBody(desc);
        const colliderDesc = colliderData.shape === "sphere"
          ? RAPIER.ColliderDesc.ball(colliderData.radius)
          : colliderData.shape === "capsule"
            ? RAPIER.ColliderDesc.capsule(colliderData.halfHeight, colliderData.radius)
            : RAPIER.ColliderDesc.cuboid(colliderData.size[0] / 2, colliderData.size[1] / 2, colliderData.size[2] / 2);
        colliderDesc.setSensor(colliderData.trigger)
          .setCollisionGroups(((colliderData.layer & 0xffff) << 16) | (colliderData.mask & 0xffff))
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        const collider = native.createCollider(colliderDesc, body);
        entry = { body, collider };
        this.#bodies.set(entity.id, entry);
        this.#entities.set(collider.handle, entity.id);
      }
      entry.body.setGravityScale(bodyData.gravityScale, true);
      entry.body.lockRotations(bodyData.lockRotations, true);
      if (bodyData.type === "dynamic") entry.body.setLinvel({ x: bodyData.velocity[0], y: bodyData.velocity[1], z: bodyData.velocity[2] }, true);
      if (bodyData.type === "static") {
        entry.body.setTranslation({ x: transform.position[0], y: transform.position[1], z: transform.position[2] }, false);
        entry.body.setRotation({ x: transform.quaternion[0], y: transform.quaternion[1], z: transform.quaternion[2], w: transform.quaternion[3] }, false);
      }
    }
    for (const [id, entry] of [...this.#bodies]) {
      if (alive.has(id) && world.hasEntity(id)) continue;
      this.#entities.delete(entry.collider.handle);
      native.removeRigidBody(entry.body);
      this.#bodies.delete(id);
    }
  }

  #requireNative(): RAPIER.World {
    if (!this.#native) throw new Error("RapierPhysicsAdapter is not initialized; await game.start() first");
    return this.#native;
  }
}
