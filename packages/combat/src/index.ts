import { defineComponent, definePlugin, type Entity, type EntityId, type World } from "@gameweave/core";
import type { PhysicsAdapter } from "@gameweave/physics";
import { RigidBody } from "@gameweave/physics";
import { Transform } from "@gameweave/three";

export interface DamageMessage extends Record<string, unknown> {
  amount: number;
  type: string;
  source?: EntityId;
  instigator?: EntityId;
  weapon?: string;
  tags: string[];
  point?: [number, number, number];
  normal?: [number, number, number];
}

export const Health = defineComponent("health", { defaults: { current: 100, max: 100 } });
export const Damageable = defineComponent("damageable", { defaults: { enabled: true } });
export const DamageInbox = defineComponent<{ messages: DamageMessage[] }>("damageInbox", { defaults: () => ({ messages: [] }) });
export const Faction = defineComponent("faction", { defaults: { id: "neutral" } });
export const Ammo = defineComponent("ammo", { defaults: { magazine: 30, reserve: 90, capacity: 30 } });
export const Weapon = defineComponent("weapon", { defaults: {
  id: "", fireMode: "semi" as "semi" | "automatic", damage: 10, damageType: "generic",
  cooldown: 0.2, cooldownRemaining: 0, reloadTime: 2, range: 300, spread: 0,
  delivery: "hitscan" as "hitscan" | "projectile", projectileSpeed: 32,
} });
export const Inventory = defineComponent("inventory", { defaults: { items: [] as string[], equipped: "" } });
export const Projectile = defineComponent("projectile", { defaults: {
  damage: 10, damageType: "generic", speed: 20, owner: "", lifetime: 5,
  direction: [0, 0, 1] as [number, number, number],
} });
export const Dead = defineComponent("dead", { defaults: { atTick: 0 } });
export const Reloading = defineComponent("reloading", { defaults: { remaining: 0 } });

export interface WeaponDefinition {
  readonly id: string;
  readonly weapon: Partial<ReturnType<typeof Weapon.defaults>>;
  readonly ammo: Partial<ReturnType<typeof Ammo.defaults>>;
}

export function hitscan(options: { range?: number; spread?: number } = {}) {
  return { type: "hitscan" as const, range: options.range ?? 300, spread: options.spread ?? 0 };
}

export function projectile(options: { speed?: number; range?: number } = {}) {
  return { type: "projectile" as const, speed: options.speed ?? 32, range: options.range ?? 300 };
}

export function defineWeapon(id: string, options: {
  fireMode?: "semi" | "automatic";
  roundsPerMinute?: number;
  magazineSize?: number;
  reserve?: number;
  reloadTime?: number;
  delivery?: ReturnType<typeof hitscan> | ReturnType<typeof projectile>;
  damage: { amount: number; type: string };
}): WeaponDefinition {
  if (!id.trim()) throw new Error("Weapon id must not be empty");
  return Object.freeze({
    id,
    weapon: {
      id, fireMode: options.fireMode ?? "semi", damage: options.damage.amount,
      damageType: options.damage.type, cooldown: 60 / (options.roundsPerMinute ?? 300),
      reloadTime: options.reloadTime ?? 2, range: options.delivery?.range ?? 300,
      spread: options.delivery?.type === "hitscan" ? options.delivery.spread : 0,
      delivery: options.delivery?.type ?? "hitscan",
      projectileSpeed: options.delivery?.type === "projectile" ? options.delivery.speed : 32,
    },
    ammo: { magazine: options.magazineSize ?? 30, capacity: options.magazineSize ?? 30, reserve: options.reserve ?? 90 },
  });
}

export function equipWeapon(entity: Entity, definition: WeaponDefinition): Entity {
  return entity.set(Weapon, definition.weapon).set(Ammo, definition.ammo);
}

export type DamageInput = {
  amount: number;
  type: string;
  source?: EntityId;
  instigator?: EntityId;
  weapon?: string;
  tags?: string[];
  point?: [number, number, number];
  normal?: [number, number, number];
};

export function queueDamage(target: Entity, message: DamageInput): void {
  const inbox = target.get(DamageInbox);
  const messages = inbox?.messages ?? [];
  target.set(DamageInbox, { messages: [...messages, { ...message, tags: [...(message.tags ?? [])] }] });
}

export function fire(shooter: Entity, target: Entity, world: World): boolean {
  const weapon = consumeShot(shooter);
  if (!weapon) return false;
  let projectileEntity: Entity | undefined;
  if (weapon.delivery === "projectile") {
    const from = shooter.get(Transform)?.position, to = target.get(Transform)?.position;
    if (!from || !to) return false;
    const direction = normalize(to.map((value, index) => value - from[index]!) as [number, number, number]);
    const position = from.map((value, index) => value + direction[index]! * .7) as [number, number, number];
    position[1] += .4;
    projectileEntity = spawnProjectile(world, {
      owner: shooter.id, position, direction, speed: weapon.projectileSpeed,
      damage: weapon.damage, damageType: weapon.damageType, lifetime: weapon.range / weapon.projectileSpeed,
    });
  } else {
    queueDamage(target, { amount: weapon.damage, type: weapon.damageType, source: shooter.id, instigator: shooter.id, weapon: weapon.id });
  }
  world.events.emit("combat:fire", {
    shooter: shooter.id, target: target.id, weapon: weapon.id,
    ...(projectileEntity ? { projectile: projectileEntity.id } : {}),
  });
  return true;
}

export function fireDirection(
  shooter: Entity,
  world: World,
  origin: [number, number, number],
  direction: [number, number, number],
): Entity | undefined {
  const weapon = consumeShot(shooter);
  if (!weapon) return undefined;
  const projectileEntity = spawnProjectile(world, {
    owner: shooter.id, position: origin, direction: normalize(direction),
    speed: weapon.projectileSpeed, damage: weapon.damage, damageType: weapon.damageType,
    lifetime: weapon.range / weapon.projectileSpeed,
  });
  world.events.emit("combat:fire", { shooter: shooter.id, weapon: weapon.id, projectile: projectileEntity.id });
  return projectileEntity;
}

export function fireHitscan(
  shooter: Entity,
  world: World,
  origin: [number, number, number],
  direction: [number, number, number],
): Entity | undefined {
  const weapon = shooter.get(Weapon);
  if (!weapon) return undefined;
  const physics = worldPhysics(world);
  const hit = physics.raycast(world, origin, direction, weapon.range);
  if (!hit || hit.entity === shooter.id) return undefined;
  const target = world.entity(hit.entity);
  if (!fire(shooter, target, world)) return undefined;
  return target;
}

export function reload(entity: Entity, world: World): boolean {
  const ammo = entity.get(Ammo);
  const weapon = entity.get(Weapon);
  if (!ammo || !weapon || entity.has(Reloading) || ammo.magazine >= ammo.capacity || ammo.reserve <= 0) return false;
  entity.set(Reloading, { remaining: weapon.reloadTime });
  return true;
}

export function spawnProjectile(world: World, options: {
  owner: EntityId;
  position: [number, number, number];
  direction: [number, number, number];
  speed?: number;
  damage?: number;
  damageType?: string;
  lifetime?: number;
}): Entity {
  const speed = options.speed ?? 20;
  return world.spawn().set(Transform, { position: options.position }).set(Projectile, {
    owner: options.owner, direction: options.direction, speed,
    damage: options.damage ?? 10, damageType: options.damageType ?? "generic", lifetime: options.lifetime ?? 5,
  }).set(RigidBody, {
    type: "kinematic",
    velocity: options.direction.map((value) => value * speed) as [number, number, number],
    gravityScale: 0,
  });
}

function worldPhysics(world: World): PhysicsAdapter {
  return world.service<PhysicsAdapter>("physics");
}

export function combat() {
  return definePlugin({
    id: "gameweave.combat",
    setupWorld: (world) => {
      world.register(Health).register(Damageable).register(DamageInbox).register(Faction)
        .register(Ammo).register(Weapon).register(Inventory).register(Projectile).register(Dead)
        .register(Reloading).register(Transform).register(RigidBody);
      world.addSystem({
        name: "combat.timers", phase: "fixedUpdate",
        before: ["combat.damage"],
        run: ({ dt }) => {
          const epsilon = 1e-9;
          for (const entity of world.query(Weapon)) {
            const weapon = entity.get(Weapon);
            if (!weapon || weapon.cooldownRemaining <= 0) continue;
            const remaining = weapon.cooldownRemaining - dt;
            entity.set(Weapon, { cooldownRemaining: remaining > epsilon ? remaining : 0 });
          }
          for (const entity of world.query(Reloading, Ammo)) {
            const reloading = entity.get(Reloading);
            const ammo = entity.get(Ammo);
            if (!reloading || !ammo) continue;
            const remaining = reloading.remaining - dt;
            if (remaining > epsilon) { entity.set(Reloading, { remaining }); continue; }
            const count = Math.min(ammo.capacity - ammo.magazine, ammo.reserve);
            entity.set(Ammo, { magazine: ammo.magazine + count, reserve: ammo.reserve - count });
            entity.remove(Reloading);
            world.events.emit("combat:reload", { entity: entity.id, count });
          }
        },
      });
      world.addSystem({
        name: "combat.damage", phase: "fixedUpdate",
        optionalAfter: ["physics.step"],
        run: () => {
          for (const entity of world.query(Health, DamageInbox)) {
            const health = entity.get(Health);
            const inbox = entity.get(DamageInbox);
            if (!health || !inbox || inbox.messages.length === 0) continue;
            const amount = inbox.messages.reduce((sum, message) => sum + Math.max(0, message.amount), 0);
            const current = Math.max(0, health.current - amount);
            entity.set(Health, { current });
            entity.set(DamageInbox, { messages: [] });
            world.events.emit("combat:damage", { target: entity.id, amount, current });
            if (current === 0) world.events.emit("combat:death", { target: entity.id });
            if (current === 0 && !entity.has(Dead)) entity.set(Dead, { atTick: world.tick });
          }
        },
      });
      world.addSystem({
        name: "combat.projectiles", phase: "fixedUpdate",
        optionalBefore: ["physics.step"],
        run: ({ dt }) => {
          const physics = world.services.get("physics") as PhysicsAdapter | undefined;
          for (const entity of world.query(Projectile, Transform)) {
            const projectile = entity.get(Projectile), transform = entity.get(Transform);
            if (!projectile || !transform) continue;
            const lifetime = projectile.lifetime - dt;
            if (lifetime <= 0) { entity.despawn(); continue; }
            const distance = projectile.speed * dt;
            const hit = physics?.raycast(world, transform.position, projectile.direction, distance);
            if (hit && hit.entity !== projectile.owner) {
              const target = world.entity(hit.entity);
              if (target.has(Health) && target.has(DamageInbox)) {
                queueDamage(target, {
                  amount: projectile.damage, type: projectile.damageType, source: entity.id,
                  instigator: projectile.owner, tags: ["projectile"], point: hit.point, normal: hit.normal,
                });
              }
              world.events.emit("combat:projectileHit", {
                projectile: entity.id, owner: projectile.owner, target: hit.entity,
                point: hit.point, normal: hit.normal,
              });
              entity.despawn();
              continue;
            }
            entity.set(Projectile, { lifetime });
            entity.set(Transform, { position: transform.position.map((value, index) => value + projectile.direction[index]! * projectile.speed * dt) as [number, number, number] });
          }
        },
      });
    },
  });
}

function consumeShot(shooter: Entity): ReturnType<typeof Weapon.defaults> | undefined {
  const weapon = shooter.get(Weapon), ammo = shooter.get(Ammo);
  if (!weapon || !ammo || shooter.has(Reloading) || ammo.magazine <= 0 || weapon.cooldownRemaining > 0) return undefined;
  shooter.set(Weapon, { cooldownRemaining: weapon.cooldown });
  shooter.set(Ammo, { magazine: ammo.magazine - 1 });
  return weapon;
}

function normalize(direction: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...direction);
  if (length === 0) throw new Error("Projectile direction must not be zero");
  return direction.map((value) => value / length) as [number, number, number];
}
