import { createGame } from "@gameweave/core";
import { physics } from "@gameweave/physics";
import { describe, expect, it } from "vitest";
import { Ammo, combat, DamageInbox, Dead, defineWeapon, equipWeapon, fire, fireHitscan, Health, hitscan, reload, Reloading, spawnProjectile, Weapon } from "./index.js";
import { Collider } from "@gameweave/physics";
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
