import { BehaviorRegistry, bots, BotController, NavigationAgent, Sensor, StateMachine, Targeting } from "@gameweave/bots";
import { CameraRig, CharacterMotor, InputManager } from "@gameweave/character";
import { Ammo, combat, DamageInbox, defineWeapon, equipWeapon, Faction, fire, Health, hitscan } from "@gameweave/combat";
import { createGame, defineComponent, definePrefab, Scheduler, World } from "@gameweave/core";
import { physics, RigidBody } from "@gameweave/physics";
import { ManualTransform, Object3D, Renderable, three, Transform } from "@gameweave/three";
import { UIManager } from "@gameweave/ui";
import { describe, expect, it } from "vitest";

describe("AI modification task set", () => {
  it("01 expands a rifle magazine without changing reserve", () => {
    const rifle = defineWeapon("rifle", { magazineSize: 45, reserve: 90, damage: { amount: 32, type: "ballistic" } });
    expect(rifle.ammo).toMatchObject({ magazine: 45, capacity: 45, reserve: 90 });
  });

  it("02 defines an 80 damage semi-automatic weapon with 1.2s cooldown", () => {
    const weapon = defineWeapon("heavy", { fireMode: "semi", roundsPerMinute: 50, damage: { amount: 80, type: "ballistic" } });
    expect(weapon.weapon).toMatchObject({ damage: 80, cooldown: 1.2, fireMode: "semi" });
  });

  it("03 never selects a same-faction target", () => {
    const game = createGame().use(physics()).use(combat()).use(bots());
    const world = game.createWorld("arena");
    const bot = spawnBot(world, "bot", "red", [0, 0, 0]);
    spawnTarget(world, "friend", "red", [1, 0, 0]);
    spawnTarget(world, "enemy", "blue", [2, 0, 0]);
    game.step();
    expect(bot.get(Targeting)?.target).toBe("enemy");
  });

  it("04 supports a retreat behavior below 20 percent health", () => {
    const registry = new BehaviorRegistry().register("retreat-low", (entity) => {
      const health = entity.get(Health), state = entity.get(StateMachine);
      if (health && state && health.current / health.max < .2) entity.set(StateMachine, { previous: state.state, state: "retreat" });
    });
    const game = createGame().use(physics()).use(combat()).use(bots(registry));
    const world = game.createWorld("arena");
    const bot = spawnBot(world, "bot", "red", [0, 0, 0]).set(BotController, { behavior: "retreat-low" }).set(Health, { current: 19 });
    game.step();
    expect(bot.get(StateMachine)?.state).toBe("retreat");
  });

  it("05 changes sprint speed without changing normal speed", () => {
    const world = new World("arena").register(CharacterMotor);
    const player = world.spawn().set(CharacterMotor, { speed: 5, sprintSpeed: 12 });
    expect(player.get(CharacterMotor)).toMatchObject({ speed: 5, sprintSpeed: 12 });
  });

  it("06 creates a reusable 150 HP heavy enemy prefab", () => {
    const world = new World("arena").register(Health);
    const heavy = definePrefab("heavy-enemy", { components: { health: { current: 150, max: 150 } } });
    expect(world.spawn(heavy).get(Health)?.max).toBe(150);
  });

  it("07 avoids duplicate DOM writes for unchanged enemy count", () => {
    let writes = 0, count = 3;
    const target = { get textContent() { return ""; }, set textContent(_: string | null) { writes += 1; } };
    const ui = new UIManager(); ui.bind(target, () => count); ui.update(); ui.update(); count = 2; ui.update();
    expect(writes).toBe(2);
  });

  it("08 records and replays 120 fixed input ticks", () => {
    let frame = 0;
    const input = new InputManager().register("player", () => ({ move: [frame++, 0], look: [0, 0], jump: false, sprint: false, fire: false }));
    input.startRecording(); for (let tick = 0; tick < 120; tick += 1) input.capture();
    const recording = input.stopRecording(); input.play(recording); input.capture();
    expect(recording.sources.player).toHaveLength(120);
    expect(input.get("player").move[0]).toBe(0);
  });

  it("09 migrates an old score component", () => {
    const Score = defineComponent("score", { version: 2, defaults: { value: 0 }, migrate: (value) => ({ value: Number(value) }) });
    const world = new World("arena").register(Score);
    world.load({ $schema: "https://gameweave.dev/schema/world-0.1.json", version: 1, name: "arena", tick: 0, entities: [{ id: "p", components: { score: { version: 1, data: 7 as never } } }] });
    expect(world.entity("p").get(Score)?.value).toBe(7);
  });

  it("10 deterministically applies one 32 damage shot", () => {
    const game = createGame().use(combat()); const world = game.createWorld("arena");
    const shooter = equipWeapon(world.spawn(), defineWeapon("rifle", { damage: { amount: 32, type: "ballistic" } }));
    const target = world.spawn().set(Health, {}).set(DamageInbox, {});
    fire(shooter, target, world); game.step(); expect(target.get(Health)?.current).toBe(68);
  });

  it("11 preserves external position for ManualTransform", () => {
    const plugin = three(); plugin.adapter.registerAsset("box", () => new Object3D());
    const game = createGame().use(plugin); const world = game.createWorld("arena");
    const entity = world.spawn().set(Transform, { position: [1, 2, 3] }).set(Renderable, { asset: "box" }).set(ManualTransform, {});
    game.advance(0); expect(plugin.adapter.object(entity.id)?.position.toArray()).toEqual([0, 0, 0]);
  });

  it("12 fires a scheduled event after three seconds", () => {
    const scheduler = new Scheduler(); let fired = false; scheduler.after(3, () => fired = true);
    scheduler.advance(2.9); expect(fired).toBe(false); scheduler.advance(.1); expect(fired).toBe(true);
  });
});

function spawnBot(world: World, id: string, faction: string, position: [number, number, number]) {
  return world.spawn({ id }).set(Transform, { position }).set(RigidBody, { gravityScale: 0 }).set(Faction, { id: faction })
    .set(Health, {}).set(Sensor, {}).set(Targeting, {}).set(NavigationAgent, {}).set(StateMachine, {}).set(BotController, {});
}
function spawnTarget(world: World, id: string, faction: string, position: [number, number, number]) {
  return world.spawn({ id }).set(Transform, { position }).set(Faction, { id: faction }).set(Health, {}).set(DamageInbox, {});
}
