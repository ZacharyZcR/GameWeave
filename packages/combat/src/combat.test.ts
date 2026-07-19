import { createGame } from "@gameweave/core";
import { physics } from "@gameweave/physics";
import { describe, expect, it } from "vitest";
import { Ammo, combat, DamageInbox, Dead, defineWeapon, equipWeapon, explode, fire, fireDirection, fireHitscan, Health, hitscan, Projectile, projectile, queueDamage, reload, Reloading, spawnProjectile, throwGrenade, Weapon } from "./index.js";
import { Collider, RigidBody } from "@gameweave/physics";
import { Transform } from "@gameweave/three";

it("settles queued weapon damage in fixed update", () => {
  const game = createGame().use(physics()).use(combat());
  const world = game.createWorld("arena");
  const shooter = world.spawn().set(Weapon, { id: "rifle", damage: 32 }).set(Ammo, {});
  const target = world.spawn().set(Health, {}).set(DamageInbox, {});
  expect(fire(shooter, target, world)).toBe(true);
  expect(target.get(Health)?.current).toBe(100);
  game.step();
  expect(target.get(Health)?.current).toBe(68);
  expect(shooter.get(Ammo)?.magazine).toBe(29);
});

it("supports weapon definitions, reload, hitscan and death", () => {
  const game = createGame().use(physics()).use(combat());
  const world = game.createWorld("arena");
  const rifle = defineWeapon("rifle", { magazineSize: 2, reserve: 4, delivery: hitscan({ range: 50 }), damage: { amount: 100, type: "ballistic" } });
  const shooter = equipWeapon(world.spawn({ id: "shooter" }).set(Transform, {}), rifle);
  const target = world.spawn({ id: "target" }).set(Transform, { position: [0, 0, 5] }).set(Collider, { shape: "sphere", radius: 1 })
    .set(Health, {}).set(DamageInbox, {});

  expect(fireHitscan(shooter, world, [0, 0, 0], [0, 0, 1])?.id).toBe("target");
  game.step();
  expect(target.has(Dead)).toBe(true);
  shooter.set(Ammo, { magazine: 0 });
  expect(reload(shooter, world)).toBe(true);
  expect(shooter.has(Reloading)).toBe(true);
  game.step(120);
  expect(shooter.get(Ammo)).toMatchObject({ magazine: 2, reserve: 2 });
});

it("advances and expires projectiles on fixed ticks", () => {
  const game = createGame({ fixedStep: 1 }).use(combat());
  const world = game.createWorld("arena");
  const projectile = spawnProjectile(world, { owner: "player", position: [0, 0, 0], direction: [0, 0, 1], speed: 2, lifetime: 2 });
  game.step();
  expect(projectile.get(Transform)?.position[2]).toBe(2);
  game.step();
  expect(projectile.isAlive()).toBe(false);
});

it("accumulates same-phase damage queued to a target without an inbox", () => {
  const game = createGame().use(physics()).use(combat());
  const world = game.createWorld("arena");
  const target = world.spawn().set(Health, {});
  world.addSystem({
    name: "test.attackers", phase: "fixedUpdate", before: ["combat.damage"],
    run: () => {
      if (world.tick !== 1) return;
      queueDamage(target, { amount: 10, type: "test" });
      queueDamage(target, { amount: 20, type: "test" });
    },
  });
  game.step(2);
  expect(target.get(Health)?.current).toBe(70);
});

it("keeps cooldown and reload working across a JSON save/load", () => {
  const game = createGame().use(physics()).use(combat());
  const world = game.createWorld("arena");
  const rifle = defineWeapon("rifle", { roundsPerMinute: 60, magazineSize: 2, reserve: 4, reloadTime: 1, damage: { amount: 32, type: "ballistic" } });
  const shooter = equipWeapon(world.spawn({ id: "shooter" }), rifle);
  const target = world.spawn({ id: "target" }).set(Health, {}).set(DamageInbox, {});
  game.step(120);
  expect(fire(shooter, target, world)).toBe(true);
  shooter.set(Ammo, { magazine: 0 });
  expect(reload(shooter, world)).toBe(true);

  const snapshot = JSON.parse(JSON.stringify(world.serialize()));
  const restored = createGame().use(physics()).use(combat());
  const world2 = restored.createWorld("arena2");
  world2.load(snapshot);
  const shooter2 = world2.entity("shooter");
  expect(shooter2.has(Reloading)).toBe(true);
  restored.step(120);
  expect(shooter2.has(Reloading)).toBe(false);
  expect(shooter2.get(Ammo)).toMatchObject({ magazine: 2, reserve: 2 });
  expect(fire(shooter2, world2.entity("target"), world2)).toBe(true);
});

it("emits reload start before reload completion", () => {
  const game = createGame().use(physics()).use(combat());
  const world = game.createWorld("reload");
  const entity = world.spawn({ id: "player" }).set(Weapon, { reloadTime: 1 }).set(Ammo, { magazine: 0, reserve: 12 });
  const events: unknown[] = [];
  world.events.on("combat:reloadStart", (event) => events.push(event));
  expect(reload(entity, world)).toBe(true);
  expect(events).toEqual([{ entity: "player", duration: 1 }]);
});

it("spawns configured projectiles from inside a fixed update system", () => {
  const game = createGame({ fixedStep: 1 }).use(combat());
  const world = game.createWorld("arena");
  world.addSystem({
    name: "test.launcher", phase: "fixedUpdate", before: ["combat.projectiles"],
    run: () => {
      if (world.tick !== 1) return;
      spawnProjectile(world, { owner: "player", position: [0, 0, 0], direction: [0, 0, 1], speed: 2, lifetime: 5 });
    },
  });
  game.step(2);
  const [projectile] = world.query(Projectile, Transform).snapshot();
  expect(projectile?.get(Transform)?.position[2]).toBe(2);
});

it("applies projectile damage only on impact and stops at obstacles", () => {
  const game = createGame({ fixedStep: .1 }).use(physics()).use(combat());
  const world = game.createWorld("range");
  const weapon = defineWeapon("launcher", {
    delivery: projectile({ speed: 10, range: 20 }), magazineSize: 2,
    damage: { amount: 40, type: "ballistic" },
  });
  const shooter = equipWeapon(world.spawn({ id: "shooter" }).set(Transform, {}), weapon);
  const barrier = world.spawn({ id: "barrier" }).set(Transform, { position: [0, 0, 2] })
    .set(Collider, { shape: "sphere", radius: .5 });
  const target = world.spawn({ id: "target" }).set(Transform, { position: [0, 0, 4] })
    .set(Collider, { shape: "sphere", radius: .5 }).set(Health, {}).set(DamageInbox, {});

  expect(fireDirection(shooter, world, [0, 0, .7], [0, 0, 1])).toBeDefined();
  expect(target.get(Health)?.current).toBe(100);
  game.step(4);
  expect(target.get(Health)?.current).toBe(100);

  barrier.despawn();
  shooter.set(Weapon, { cooldownRemaining: 0 });
  expect(fireDirection(shooter, world, [0, 0, .7], [0, 0, 1])).toBeDefined();
  game.step(6);
  expect(target.get(Health)?.current).toBe(60);
});

it("does not consume a projectile shot when its trajectory cannot be created", () => {
  const game = createGame().use(combat());
  const world = game.createWorld("range");
  const weapon = defineWeapon("launcher", { delivery: projectile({ speed: 10 }), magazineSize: 2, damage: { amount: 10, type: "ballistic" } });
  const shooter = equipWeapon(world.spawn({ id: "shooter" }), weapon);
  const target = world.spawn({ id: "target" }).set(Transform, { position: [0, 0, 4] });

  expect(fire(shooter, target, world)).toBe(false);
  expect(shooter.get(Ammo)?.magazine).toBe(2);
  expect(shooter.get(Weapon)?.cooldownRemaining).toBe(0);
});

it("explodes grenades on a deterministic fuse with distance falloff", () => {
  const game = createGame({ fixedStep: .1 }).use(physics()).use(combat());
  const world = game.createWorld("range");
  const near = world.spawn({ id: "near" }).set(Transform, { position: [1, 0, 0] }).set(Health, {}).set(DamageInbox, {});
  const far = world.spawn({ id: "far" }).set(Transform, { position: [4, 0, 0] }).set(Health, {}).set(DamageInbox, {});
  const outside = world.spawn({ id: "outside" }).set(Transform, { position: [9, 0, 0] }).set(Health, {}).set(DamageInbox, {});
  const events: unknown[] = [];
  world.events.on("combat:explosion", (event) => events.push(event));

  const grenade = throwGrenade(world, {
    owner: "player", position: [0, 0, 0], velocity: [0, 0, 0], damage: 60, radius: 6, fuse: .5,
  });
  grenade.set(RigidBody, { gravityScale: 0 });
  game.step(4);
  expect(grenade.isAlive()).toBe(true);
  expect(near.get(Health)?.current).toBe(100);
  game.step(2);
  expect(grenade.isAlive()).toBe(false);
  expect(near.get(Health)?.current).toBe(100 - Math.ceil(60 * (1 - 1 / 6)));
  expect(far.get(Health)?.current).toBe(100 - Math.ceil(60 * (1 - 4 / 6)));
  expect(outside.get(Health)?.current).toBe(100);
  expect(events).toHaveLength(1);
});

it("pushes dynamic bodies and destroys damageable props in the blast", () => {
  const game = createGame({ fixedStep: .1 }).use(physics()).use(combat());
  const world = game.createWorld("range");
  const crate = world.spawn({ id: "crate" }).set(Transform, { position: [2, 0, 0] })
    .set(RigidBody, { gravityScale: 0 }).set(Health, { current: 30, max: 30 }).set(DamageInbox, {});
  const deaths: unknown[] = [];
  world.events.on("combat:death", (event) => deaths.push(event));

  explode(world, [0, 0, 0], { damage: 80, radius: 6, impulse: 10 });
  game.step();
  expect(crate.get(Health)?.current).toBe(0);
  expect(deaths).toEqual([{ target: "crate" }]);
  expect(crate.get(RigidBody)?.velocity[0]).toBeGreaterThan(3);
});
