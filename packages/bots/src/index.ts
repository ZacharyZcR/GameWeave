import { defineComponent, definePlugin, defineResource, type Entity, type EntityId, type World } from "@gameweave/core";
import { Faction, Health, fire, Weapon, Ammo } from "@gameweave/combat";
import { RigidBody } from "@gameweave/physics";
import { Transform } from "@gameweave/three";

export const Sensor = defineComponent("sensor", { defaults: { sight: 80, hearing: 30 } });
export const Targeting = defineComponent("targeting", { defaults: { target: "" } });
export const NavigationAgent = defineComponent("navigationAgent", { defaults: { speed: 3, stoppingDistance: 12 } });
export const StateMachine = defineComponent("stateMachine", { defaults: { state: "idle", previous: "" } });
export const BotController = defineComponent("botController", { defaults: { behavior: "assault", enabled: true } });
export const PerceptionMemory = defineComponent("perceptionMemory", { defaults: { lastHeard: "", position: [0, 0, 0] as [number, number, number] } });

export interface NoiseStimulus { source: EntityId; faction: string; position: [number, number, number]; radius: number; }
export const NoiseQueue = defineResource<NoiseStimulus[]>("bots.noises", () => []);

export interface NavigationAdapter {
  direction(from: readonly [number, number, number], to: readonly [number, number, number]): [number, number, number];
}

export class DirectNavigation implements NavigationAdapter {
  direction(from: readonly [number, number, number], to: readonly [number, number, number]): [number, number, number] {
    const dx = to[0] - from[0], dz = to[2] - from[2], length = Math.hypot(dx, dz) || 1;
    return [dx / length, 0, dz / length];
  }
}

export type BotBehavior = (bot: Entity, world: World) => void;

export class BehaviorRegistry {
  #behaviors = new Map<string, BotBehavior>();
  register(id: string, behavior: BotBehavior): this {
    if (this.#behaviors.has(id)) throw new Error(`Bot behavior already registered: ${id}`);
    this.#behaviors.set(id, behavior);
    return this;
  }
  get(id: string): BotBehavior {
    const behavior = this.#behaviors.get(id);
    if (!behavior) throw new Error(`Unknown bot behavior: ${id}`);
    return behavior;
  }
}

export interface BotsOptions { readonly registry?: BehaviorRegistry; readonly navigation?: NavigationAdapter; }

export function bots(options: BotsOptions | BehaviorRegistry = {}) {
  const registry = options instanceof BehaviorRegistry ? options : options.registry ?? new BehaviorRegistry();
  const navigation = options instanceof BehaviorRegistry ? new DirectNavigation() : options.navigation ?? new DirectNavigation();
  if (!safeHas(registry, "assault")) registry.register("assault", assault);
  return {
    ...definePlugin({
      id: "gameweave.bots",
      install: (game) => { game.provide("bots", registry); game.provide("navigation", navigation); },
      setupWorld: (world) => {
        world.register(Sensor).register(Targeting).register(NavigationAgent).register(StateMachine)
          .register(BotController).register(Transform).register(RigidBody).register(Faction)
          .register(Health).register(Weapon).register(Ammo).register(PerceptionMemory);
        world.addSystem({
          name: "bots.update", phase: "fixedUpdate",
          optionalBefore: ["physics.step"],
          run: () => {
            for (const entity of world.query(BotController)) {
              const controller = entity.get(BotController);
              if (controller?.enabled) registry.get(controller.behavior)(entity, world);
            }
          },
        });
        world.addSystem({ name: "bots.clearNoise", phase: "fixedUpdate", after: ["bots.update"], run: () => { world.resources.set(NoiseQueue, []); } });
      },
    }), registry,
  };
}

export function emitNoise(world: World, stimulus: NoiseStimulus): void {
  world.resources.get(NoiseQueue).push(structuredClone(stimulus));
}

function safeHas(registry: BehaviorRegistry, id: string): boolean {
  try { registry.get(id); return true; } catch { return false; }
}

function assault(bot: Entity, world: World): void {
  const transform = bot.get(Transform);
  const faction = bot.get(Faction);
  const sensor = bot.get(Sensor);
  if (!transform || !faction || !sensor) return;

  let target: Entity | undefined;
  let nearest = sensor.sight;
  for (const candidate of world.query(Transform, Faction, Health)) {
    if (candidate.id === bot.id || candidate.get(Faction)?.id === faction.id || (candidate.get(Health)?.current ?? 0) <= 0) continue;
    const position = candidate.get(Transform)?.position;
    if (!position) continue;
    const distance = Math.hypot(...position.map((value, index) => value - transform.position[index]!) as [number, number, number]);
    if (distance < nearest) { nearest = distance; target = candidate; }
  }

  if (!target) {
    for (const noise of world.resources.get(NoiseQueue)) {
      if (noise.faction === faction.id) continue;
      const distance = Math.hypot(...noise.position.map((value, index) => value - transform.position[index]!) as [number, number, number]);
      if (distance > Math.min(sensor.hearing, noise.radius)) continue;
      const source = world.hasEntity(noise.source) ? world.entity(noise.source) : undefined;
      if (source) { target = source; nearest = distance; bot.set(PerceptionMemory, { lastHeard: noise.source, position: noise.position }); }
    }
  }

  const state = bot.get(StateMachine);
  const navigation = bot.get(NavigationAgent);
  const body = bot.get(RigidBody);
  if (!target) {
    bot.set(Targeting, { target: "" });
    if (state) bot.set(StateMachine, { previous: state.state, state: "idle" });
    if (body) bot.set(RigidBody, { velocity: [0, body.velocity[1], 0] });
    return;
  }

  bot.set(Targeting, { target: target.id });
  if (nearest <= (navigation?.stoppingDistance ?? 12)) {
    if (state) bot.set(StateMachine, { previous: state.state, state: "attack" });
    if (body) bot.set(RigidBody, { velocity: [0, body.velocity[1], 0] });
    fire(bot, target, world);
    return;
  }

  if (state) bot.set(StateMachine, { previous: state.state, state: "chase" });
  if (body && navigation) {
    const targetPosition = target.get(Transform)!.position;
    const direction = world.service<NavigationAdapter>("navigation").direction(transform.position, targetPosition);
    bot.set(RigidBody, { velocity: [direction[0] * navigation.speed, body.velocity[1], direction[2] * navigation.speed] });
  }
}

export type BehaviorStatus = "success" | "failure" | "running";
export type BehaviorNode = (entity: Entity, world: World) => BehaviorStatus;
export const action = (run: BehaviorNode): BehaviorNode => run;
export const sequence = (...nodes: readonly BehaviorNode[]): BehaviorNode => (entity, world) => {
  for (const node of nodes) { const status = node(entity, world); if (status !== "success") return status; }
  return "success";
};
export const select = (...nodes: readonly BehaviorNode[]): BehaviorNode => (entity, world) => {
  for (const node of nodes) { const status = node(entity, world); if (status !== "failure") return status; }
  return "failure";
};
export const healthBelow = (ratio: number): BehaviorNode => (entity) => {
  const health = entity.get(Health);
  return health && health.current / health.max < ratio ? "success" : "failure";
};
