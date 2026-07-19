import { createGame } from "@gameweave/core";
import { Ammo, combat, DamageInbox, Faction, Health, Weapon } from "@gameweave/combat";
import { physics, RigidBody } from "@gameweave/physics";
import { Transform } from "@gameweave/three";
import { expect, it } from "vitest";
import { bots, BotController, emitNoise, NavigationAgent, PerceptionMemory, Sensor, StateMachine, Targeting } from "./index.js";

it("acquires and attacks the nearest hostile target", () => {
  const game = createGame().use(physics()).use(combat()).use(bots());
  const world = game.createWorld("arena");
  const bot = world.spawn().set(Transform, {}).set(RigidBody, { gravityScale: 0 }).set(Faction, { id: "red" })
    .set(Health, {}).set(Sensor, {}).set(Targeting, {}).set(NavigationAgent, { stoppingDistance: 20 })
    .set(StateMachine, {}).set(BotController, {}).set(Weapon, { id: "rifle", damage: 10 }).set(Ammo, {});
  const target = world.spawn({ id: "target" }).set(Transform, { position: [0, 0, 10] }).set(Faction, { id: "blue" })
    .set(Health, {}).set(DamageInbox, {});

  game.step();

  expect(bot.get(Targeting)?.target).toBe("target");
  expect(bot.get(StateMachine)?.state).toBe("attack");
  expect(target.get(Health)?.current).toBe(90);
});

it("reacts to hostile noise inside hearing range", () => {
  const game = createGame().use(physics()).use(combat()).use(bots());
  const world = game.createWorld("arena");
  const listener = world.spawn({ id: "listener" }).set(Transform, {}).set(RigidBody, { gravityScale: 0 }).set(Faction, { id: "red" })
    .set(Health, {}).set(Sensor, { sight: 1, hearing: 30 }).set(Targeting, {}).set(NavigationAgent, { stoppingDistance: 5 }).set(StateMachine, {})
    .set(PerceptionMemory, {}).set(BotController, {});
  world.spawn({ id: "noise-source" }).set(Transform, { position: [10, 0, 0] }).set(Faction, { id: "blue" }).set(Health, {});
  emitNoise(world, { source: "noise-source", faction: "blue", position: [10, 0, 0], radius: 20 });
  game.step();
  expect(listener.get(PerceptionMemory)?.lastHeard).toBe("noise-source");
  expect(listener.get(StateMachine)?.state).toBe("chase");
});
